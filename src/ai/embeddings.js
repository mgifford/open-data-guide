import { tokensFor, cosineSimilarity } from "../catalog/related.js";

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const TRANSFORMERS_JS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
let extractorPromise;

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
  const extractor = await getExtractor(progressCallback);
  const all = [current, ...candidates.filter((candidate) => candidate.key !== current.key)];
  const tensor = await extractor(all.map(textFor), { pooling: "mean", normalize: true });
  const vectors = tensor.tolist();
  return all.slice(1).map((dataset, index) => ({
    dataset,
    score: cosineSimilarity(vectors[0], vectors[index + 1]),
    shared: [],
  })).sort((a, b) => b.score - a.score);
}
