# AI Model Policy

The capability order is deterministic parsing and matching, a ready page-accessible browser API, a browser-managed downloadable model after user approval, and finally an explicitly requested app-managed local model. There is no cloud inference fallback.

Capability detection calls availability checks only. It does not call `create()` and does not start downloads. WebGPU and WebNN indicate compute interfaces, not installed models.

The optional MiniLM embedding path is user initiated and model-derived artifacts must be associated with a source digest and model version. Model input is normalized metadata, not an automatic upload of complete datasets. Models may suggest intent or relevance but deterministic code validates plans and DuckDB-Wasm calculates values.

The optional local Hugging Face text-generation model runs in a dedicated Web Worker so its download and inference never block the main thread. It is offered only when the browser exposes WebGPU; without WebGPU a CPU-only model would run slowly enough to appear as a frozen page, so the local option is withheld and the deterministic path remains the answer.
