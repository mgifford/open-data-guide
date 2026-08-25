import { tokensFor, cosineSimilarity, explainRelatedDataset } from "../catalog/related.js";
import { listRecords, putRecord } from "../catalog/storage.js";

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const TRANSFORMERS_JS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
export const EMBEDDING_MODEL_VERSION = "3.8.1:q8";
let extractorPromise;

export function embeddingCacheKey(dataset) {
  return dataset?.sourceDigest ? `${dataset.sourceDigest}:${EMBEDDING_MODEL}:${EMBEDDING_MODEL_VERSION}` : "";
}

export function semanticMatch(current, dataset, score) {
  return {
    ...explainRelatedDataset(current, dataset),
    dataset,
    score,
    semantic: true,
  };
}

function textFor(dataset) {
  return [...tokensFor(dataset)].join(" ").slice(0, 6000);
}

async function getExtractor(progressCallback) {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      // The runtime is browser-only and optional. Keeping it out of the npm
      // dependency graph avoids installing unused native Node packages such
      // as Sharp. A production deployment may self-host this pinned module.
      const { pipeline } = await import(/* @vite-ignore */ TRANSFORMERS_JS_URL);
      return pipeline("feature-extraction", EMBEDDING_MODEL, {
        dtype: "q8",
        progress_callback: progressCallback,
      });
    })();
  }
  return extractorPromise;
}

export async function semanticRelated(current, candidates, progressCallback) {
  const all = [current, ...candidates.filter((candidate) => candidate.key !== current.key)];
  const cached = new Map((await listRecords("embeddings")).map((record) => [record.id, record]));
  const vectorsByKey = new Map(all.map((dataset) => [dataset.key, cached.get(embeddingCacheKey(dataset))?.vector]));
  const missing = all.filter((dataset) => !cached.has(embeddingCacheKey(dataset)) || !embeddingCacheKey(dataset));
  if (missing.length) {
    const extractor = await getExtractor(progressCallback);
    const tensor = await extractor(missing.map(textFor), { pooling: "mean", normalize: true });
    await Promise.all(tensor.tolist().map(async (vector, index) => {
      const dataset = missing[index];
      vectorsByKey.set(dataset.key, vector);
      const key = embeddingCacheKey(dataset);
      if (key) {
        cached.set(key, { id: key, sourceDigest: dataset.sourceDigest, model: EMBEDDING_MODEL, modelVersion: EMBEDDING_MODEL_VERSION, vector, createdAt: new Date().toISOString() });
        await putRecord("embeddings", cached.get(key));
      }
    }));
  }
  const currentVector = vectorsByKey.get(current.key);
  return all.slice(1).map((dataset) => semanticMatch(current, dataset, cosineSimilarity(currentVector, vectorsByKey.get(dataset.key))))
    .sort((a, b) => b.score - a.score);
}
