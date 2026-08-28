// Byte-weighted aggregate download progress.
//
// A model is several files (config, tokenizer, ONNX weights) and Transformers.js
// reports progress per file, so any single file's percent snaps back to 0 when
// the next file starts. This reducer tracks loaded/total bytes across every
// in-flight file and reports one byte-weighted overall percent. It can still
// dip when a new file's total is first revealed (Hugging Face only sends a
// file's size once its download begins), but it never collapses to 0 the way a
// single file's percent does, and it climbs smoothly once all sizes are known.
// Kept free of any worker globals so it can be unit tested; the worker passes
// its own `postMessage`-style `post`.
export function createAggregateReporter(id, post) {
  const files = new Map();
  return (event) => {
    if (event?.status === "progress" && event.file) {
      files.set(event.file, { loaded: Number(event.loaded) || 0, total: Number(event.total) || 0 });
      let loaded = 0;
      let total = 0;
      for (const file of files.values()) {
        loaded += file.loaded;
        total += file.total;
      }
      const aggregateProgress = total > 0 ? Math.min(100, (loaded / total) * 100) : Number(event.progress) || 0;
      post({ id, type: "progress", event: { ...event, aggregateProgress, aggregateLoaded: loaded, aggregateTotal: total, fileCount: files.size } });
      return;
    }
    post({ id, type: "progress", event });
  };
}
