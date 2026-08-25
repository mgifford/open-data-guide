import { cosineSimilarity, explainRelatedDataset } from "../catalog/related.js";
import { listRecords, putRecord } from "../catalog/storage.js";
import { digestText } from "../catalog/history.js";

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_MODEL_REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";
export const TRANSFORMERS_JS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
export const EMBEDDING_MODEL_VERSION = `${EMBEDDING_MODEL_REVISION}:3.8.1:q8`;
let extractorPromise;

export function semanticDocument(dataset) {
  return `${dataset?.title || ""}\n${dataset?.description || ""}\n${(dataset?.fields || []).map((field) => `${field.name || ""}: ${field.description || ""}`).join("\n")}`.slice(0, 6000);
}

export async function embeddingCacheKey(dataset) {
  if (!dataset) return "";
  const documentDigest = await digestText(semanticDocument(dataset));
  return `${documentDigest}:${EMBEDDING_MODEL}:${EMBEDDING_MODEL_VERSION}`;
}

export function semanticMatch(current, dataset, score) {
  return {
    ...explainRelatedDataset(current, dataset),
    dataset,
    score,
    semantic: true,
  };
}

async function getExtractor(progressCallback, signal) {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      // The runtime is browser-only and optional. Keeping it out of the npm
      // dependency graph avoids installing unused native Node packages such
      // as Sharp. A production deployment may self-host this pinned module.
      const { pipeline } = await import(/* @vite-ignore */ TRANSFORMERS_JS_URL);
      return pipeline("feature-extraction", EMBEDDING_MODEL, {
        revision: EMBEDDING_MODEL_REVISION,
        dtype: "q8",
        progress_callback: progressCallback,
        signal,
      });
    })();
  }
  try {
    return await extractorPromise;
  } catch (error) {
    extractorPromise = null;
    throw error;
  }
}

export async function semanticRelated(current, candidates, progressCallback, signal) {
  const all = [current, ...candidates.filter((candidate) => candidate.key !== current.key)];
  const cacheKeys = await Promise.all(all.map(embeddingCacheKey));
  const cached = new Map((await listRecords("embeddings")).map((record) => [record.id, record]));
  const vectorsByKey = new Map(all.map((dataset, index) => [dataset.key, cached.get(cacheKeys[index])?.vector]));
  const missing = all.filter((dataset, index) => !cached.has(cacheKeys[index]));
  if (missing.length) {
    const extractor = await getExtractor(progressCallback, signal);
    const tensor = await extractor(missing.map(semanticDocument), { pooling: "mean", normalize: true, signal });
    await Promise.all(tensor.tolist().map(async (vector, index) => {
      const dataset = missing[index];
      vectorsByKey.set(dataset.key, vector);
      const key = await embeddingCacheKey(dataset);
      if (key) {
        cached.set(key, { id: key, model: EMBEDDING_MODEL, modelRevision: EMBEDDING_MODEL_REVISION, modelVersion: EMBEDDING_MODEL_VERSION, vector, createdAt: new Date().toISOString() });
        await putRecord("embeddings", cached.get(key));
      }
    }));
  }
  const currentVector = vectorsByKey.get(current.key);
  return all.slice(1).map((dataset) => semanticMatch(current, dataset, cosineSimilarity(currentVector, vectorsByKey.get(dataset.key))))
    .sort((a, b) => b.score - a.score);
}
