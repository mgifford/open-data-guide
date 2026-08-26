# Roadmap

## Implemented

- Static vanilla JavaScript application with direct-resource and catalog resolution.
- Local DuckDB-Wasm querying, accessible result tables, constrained SQL compilation, chart rendering, browser AI capability probing, saved dataset markers, versioned workspace storage, bounded query history, catalog search, export/import, and join evidence profiling.
- Review-UI filter controls and date-grouping (date-grain) controls over the validated query plan.
- Typed relationship records with reviewed, bounded comparison provenance.
- On-demand code splitting for the DuckDB and chart modules, and cancellable local and remote queries.
- Browser-side catalog health check (`npm run test:catalog-health`) that records verified dates in `lastVerified`.
- Optional AI-assisted result summaries that narrate an already-computed result, with a number-grounding guardrail; the deterministic summary always remains.
- CNRA data-catalog exploration matrix.

## Next

- Phase 8B Track B: bounded, deterministic multi-dataset comparison computed from confirmed join reviews (no arbitrary SQL, no full-data join).
- Add deeper Playwright keyboard/reflow/forced-colors checks and manual browser AI verification.
- Restore Data.gov browser access once a CORS-enabled endpoint or proxy is available; it is currently CORS-blocked for browser API requests.


## Phase 3.5: Geographic reference-data connectors

Implement the registered-source approval workflow only after the local research workspace is stable. Add versioned authority/licensing records, compatibility checks, user-approved unique-value lookup, source vintage/digest tracking, ACS estimate and margin-of-error pairing, ZIP-to-ZCTA approximation disclosure, minimum group-size and sensitive-data safeguards, deterministic DuckDB-Wasm joins, and browser-compatible fallbacks. No default third-party lookup or automatic enrichment is permitted.

## Phase 4B: Capability-driven browser planning

The provider boundary and deterministic fallback are complete. Browser-managed downloadable/downloading/cancelled states, response-constraint compatibility fallback, and the executable 40-case plan evaluation are covered. Manual Chrome/Edge capability verification remains environment-specific. No provider may calculate values or emit executable SQL/JavaScript.

## Phase 5: Deterministic visualization and result exports

- Select bounded table, bar, or line presentations from validated plans and field metadata.
- Keep geographic identifiers textual until reviewed reference geometry is available.
- Bound high-cardinality charts with aggregation-aware `Other` handling while preserving the full result table.
- Show dataset field roles, missingness ratios, and date ranges in the Data Schematic.
- Export complete results as CSV or JSON, including plan, SQL, provenance, and the Vega-Lite specification when a chart is rendered.

## Phase 7: Large sources and safe multi-dataset analysis

- Use documented CKAN DataStore requests when they avoid large file downloads.
- Keep transfer, memory, pagination, cancellation, and refusal limits visible and reproducible.
- Verify join keys, types, uniqueness, null rates, cardinality, geography, and time grain before any confirmed comparison.

## Phase 8A: Guided dataset-discovery journey

- Present a persistent six-step journey (Choose data, Understand the dataset, Choose a question, Analyze the data, Review and refine, Connect related data) that mirrors the analysis flow.
- Track the current and furthest-reached step so completed steps link back to their section and the current step is marked with `aria-current="step"`.
- Disclose not-yet-available steps as upcoming rather than silently disabling them, keeping the sequence understandable to assistive technology.
- Version the journey definition so future step changes remain explicit.
