# Projects and models reviewed

Research date: 2026-08-24.

No reviewed project combines CKAN/DKAN discovery, browser-local dataset memory, local query execution, explainable related-dataset matching, and an accessible non-specialist interface. The recommendation is to build on focused libraries and tested interaction patterns, rather than fork a complete data-chat product.

| Project | What is reusable | Why it is not the whole foundation |
|---|---|---|
| [SQLRooms](https://github.com/sqlrooms/sqlrooms) | Browser-only DuckDB analytics, local-first architecture, modular data application patterns, and local AI experiments | It is a React framework and analytics toolkit. Open Data Guide is initially framework-free and needs CKAN/DKAN semantics and a simpler public interface. Revisit SQLRooms if the workspace becomes substantially more complex. |
| [Datasette Lite](https://github.com/simonw/datasette-lite) | Strong proof that URL-loaded CSV, JSON, Parquet, SQL, and multi-file exploration can work from a static site | It runs Python and Datasette through Pyodide, is SQL-first, and does not supply the public-data guidance or model layer required here. |
| [Microsoft Data Formulator](https://github.com/microsoft/data-formulator) | Conversational exploration, persistent relationships between sources, branching analysis threads, and editable visual results | It is a broader Python application using external or local model providers. Its interaction model is useful, but it is not a small GitHub Pages base. |
| [Perspective](https://github.com/perspective-dev/perspective) | A mature Web Component for large or streaming data, configurable grids, and many interactive visualizations | It is closer to an analyst workbench. The initial product needs constrained, accessible output rather than a dense dashboard. It remains a credible future alternative to Vega-Lite. |
| [Vega-Lite](https://github.com/vega/vega-lite) | Declarative, inspectable, validated visualization specifications | Adopted for charts. Tables and textual explanations remain primary. |
| [DuckDB-Wasm](https://github.com/duckdb/duckdb-wasm) | Deterministic browser-side querying for CSV, JSON, Parquet, and Arrow | Adopted as the calculation engine. It requires CORS and remains subject to browser memory constraints. |
| [WebLLM](https://github.com/mlc-ai/web-llm) | Browser-local WebGPU inference and structured JSON generation | A strong candidate for a later query planner, but model downloads and WebGPU requirements are too expensive for the default first release. |
| [AI Browser Capability Demo](https://github.com/mgifford/ai-browser-test) | Runtime-first probing, separation of API exposure from model readiness, timeouts for experimental APIs, and clear browser comparison | Adopted as a design reference. Its AGPL-3.0 implementation was not copied into this MIT prototype. The capability module was independently implemented from browser API documentation. |
| [WrenAI](https://github.com/Canner/WrenAI) | Semantic modelling and natural-language-to-SQL design ideas | Server-heavy and aimed at organizational databases rather than zero-backend public datasets. |
| [Vanna](https://github.com/vanna-ai/vanna) | Retrieval-assisted text-to-SQL patterns and evaluation ideas | The searched repository is archived and the approach is generally service-oriented. It should be treated as research, not a dependency. |

## Hugging Face findings

Several Spaces advertise “chat with CSV” or natural-language SQL, but the reviewed examples were sleeping, failed, or conventional hosted agent applications. They are demonstrations of demand, not stable browser-side foundations.

Two web-ready models are relevant:

- [`Xenova/all-MiniLM-L6-v2`](https://huggingface.co/Xenova/all-MiniLM-L6-v2), Apache-2.0, Transformers.js-compatible feature extraction. This draft uses it only after explicit user action to compare saved dataset descriptions and fields. The pinned browser runtime is loaded from jsDelivr to avoid Transformers.js pulling unused native Node image dependencies into local installation.
- [`onnx-community/Qwen2.5-0.5B-Instruct`](https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct), Transformers.js-compatible text generation. It is a candidate for constrained query-plan JSON, but it is intentionally not wired into query execution yet.

## Recommendation

Use this combination for the initial project:

1. CKAN and DKAN adapters owned by Open Data Guide.
2. IndexedDB for saved dataset markers and explicit relationship records.
3. DuckDB-Wasm for all calculations.
4. Vega-Lite for validated charts.
5. Deterministic question templates and field validation first.
6. MiniLM embeddings as an optional enhancement for related dataset discovery.
7. A small generative model only after a real evaluation suite demonstrates reliable schema selection and clarification behaviour.

## Browser-provided models

Browser-provided AI changes the fallback order but does not eliminate application models for every task.

- Chrome exposes the Prompt API as `LanguageModel` on supported current desktop configurations, with availability states that distinguish ready, downloadable, downloading, and unavailable models.
- Edge exposes compatible Prompt and writing assistance APIs in developer channels and provides browser-managed on-device models. Its task-specific language detection and translation APIs are broader than its general prompt availability.
- Firefox has a substantial internal inference engine based on Transformers.js, ONNX, and llama.cpp. Its documented `createEngine` interface uses privileged `ChromeUtils` browser code and is not callable from an ordinary website.
- None of the reviewed page APIs exposes a general embedding interface. A ready Prompt API can support future constrained query planning, but MiniLM remains useful for vector-based related-dataset discovery.

Borrow Data Formulator’s analysis-history idea and Datasette Lite’s URL-first simplicity. Do not inherit their complete runtime architecture.
