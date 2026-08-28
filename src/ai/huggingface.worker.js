// Runs the optional local Hugging Face text-generation model off the main thread
// so inference and the ~500 MB model download never block or freeze the UI. The
// main thread talks to this worker with a small request/response protocol keyed
// by a per-call id. Transformers.js is imported from the same pinned CDN URL the
// main thread would have used, so it stays out of the core application bundle.
//
// Messages in:  { id, type: "generate", cdnUrl, modelId, revision, device, dtype, prompt, options }
// Messages out: { id, type: "progress", event }   during model download
//               { id, type: "result", text }      on success
//               { id, type: "error", message, name } on failure
//
// The model is several files (config, tokenizer, ONNX weights). Transformers.js
// reports progress per file, so a single file's percent lurches back to 0 each
// time a new file starts. We aggregate by bytes across every in-flight file so
// the reported percent advances monotonically over the whole download.

import { createAggregateReporter } from "./progress.js";

let pipelinePromise = null;
let loadedKey = "";

async function getGenerator({ cdnUrl, modelId, revision, device, dtype }, onProgress) {
  const key = `${modelId}@${revision}:${device}:${dtype}`;
  // Reuse the pipeline only when the exact model configuration matches.
  if (pipelinePromise && loadedKey === key) return pipelinePromise;
  loadedKey = key;
  pipelinePromise = (async () => {
    const { pipeline } = await import(/* @vite-ignore */ cdnUrl);
    return pipeline("text-generation", modelId, { revision, dtype, device, progress_callback: onProgress });
  })();
  return pipelinePromise;
}

self.addEventListener("message", async (message) => {
  const { id, type } = message.data || {};
  if (type !== "generate") return;
  const { cdnUrl, modelId, revision, device, dtype, prompt, options } = message.data;
  try {
    const generator = await getGenerator(
      { cdnUrl, modelId, revision, device, dtype },
      createAggregateReporter(id, (message) => self.postMessage(message)),
    );
    const output = await generator(prompt, options);
    const text = Array.isArray(output) ? output[0]?.generated_text || "" : String(output || "");
    self.postMessage({ id, type: "result", text });
  } catch (error) {
    // A failed load must not poison later attempts (e.g. a transient CDN error).
    pipelinePromise = null;
    loadedKey = "";
    self.postMessage({ id, type: "error", message: error?.message || String(error), name: error?.name || "Error" });
  }
});
