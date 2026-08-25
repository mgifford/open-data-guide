# Open Data Guide

Open Data Guide is a local-first research workspace for helping non-specialists explore public datasets. Paste a direct CSV, JSON, or Parquet URL, or a dataset page from a public data catalog or data repository. The application retrieves catalog metadata, lets the user save dataset markers and bounded analysis history in the browser, profiles a selected resource with DuckDB-Wasm, builds a constrained query, and renders both an HTML table and a Vega-Lite chart.

The core application does not require a model or application server. Optional semantic matching downloads a small embedding model only after the user requests it.

## Try it locally

Requirements: Node.js 22.12 or newer and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Select **Try the included sample** for a small, reliable first test.

Other commands:

```bash
npm test
npm run build
npm run preview
```

## What works in this draft

- Direct `.csv`, `.json`, and `.parquet` URLs.
- Dataset URLs from catalogs using supported metastore or catalog APIs.
- Data catalog search through the supported catalog search API.
- Authoritative data dictionary retrieval when a distribution supplies `describedBy`.
- Dataset markers stored in IndexedDB.
- Local CSV, JSON, and Parquet querying with DuckDB-Wasm.
- Deterministic delimiter parsing, textual-null detection, field profiling, date display, and large-resource refusal.
- Postal, ZIP+4, ZCTA, FIPS, latitude, and longitude role detection with leading-zero preservation and country-aware validation.
- Current-catalog search with bounded pagination and explainable subject, geography, temporal, publisher, and field evidence.
- Playwright Chromium acceptance coverage for the sample, CNRA fixtures, and postal/FIPS preservation.
- Versioned local query history with source-digest staleness checks and a bounded geographic reference-data registry contract.
- Field and row previews.
- A deliberately small natural-language interpreter for count, sum, average, minimum, and maximum questions.
- Field validation before SQL generation.
- Accessible HTML results plus optional Vega-Lite charts.
- Transparent lexical related-dataset matching.
- A no-download capability probe for browser-provided Prompt, Summarizer, Writer, Rewriter, Translator, and Language Detector APIs.
- Optional in-browser semantic matching with `Xenova/all-MiniLM-L6-v2`.
- A GitHub Pages deployment workflow.

## Important limits

- Browser requests still depend on the publisher allowing cross-origin access. A static site cannot bypass CORS.
- Large CSV files can exceed practical browser memory or take a long time to scan. The app warns when a publisher or `Content-Length` header identifies a large file.
- The question interpreter is deterministic, not a general AI analyst. It handles a narrow grammar and requires the user to review the selected fields.
- The chart is never the only answer. The result table and generated SQL are the primary reproducibility artifacts.
- Related means similar metadata or field language. It does not mean two datasets can safely be joined.
- The sample data is synthetic and exists only to test the interface.
- Optional semantic matching loads a pinned Transformers.js browser module from jsDelivr and model files from Hugging Face. The core application does not contact either service. A production deployment can self-host these files.
- Browser capability detection checks `availability()` but does not call `create()`. A `downloadable` result is shown to the user without starting the browser-managed model download.

## Why this is a new project

`openapi-reference` began with API documentation and tried to make OpenAPI easier than Swagger. Open Data Guide begins with a person, a dataset, and a question. Catalog API variants are adapters behind that experience, not the interface itself.

See [RESEARCH.md](RESEARCH.md) for projects worth learning from, [ARCHITECTURE.md](ARCHITECTURE.md) for the system boundaries, [BASELINE.md](BASELINE.md) for Phase 0 evidence, and [ACCESSIBILITY.md](ACCESSIBILITY.md) for the initial accessibility contract.

## GitHub Pages

1. Create a new repository and copy these files to its root.
2. Commit `package-lock.json` after running `npm install`.
3. In repository settings, set Pages to **GitHub Actions**.
4. Push to `main`.

The Vite base path is relative, so the build works for both a user site and a project site.

## License

MIT. Model and upstream library licenses remain their own.
