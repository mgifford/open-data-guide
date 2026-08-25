# Roadmap

## Implemented

- Static vanilla JavaScript application with direct-resource and catalog resolution.
- Local DuckDB-Wasm querying, accessible result tables, constrained SQL compilation, chart rendering, browser AI capability probing, saved dataset markers, versioned workspace storage, bounded query history, catalog search, export/import, and join evidence profiling.
- CNRA data-catalog exploration matrix.

## Next

- Add complete filter and date-grouping controls to the review UI.
- Store typed relationship records and expose reviewed comparison workflows.
- Add downloadable result CSV and Vega-Lite JSON.
- Add local catalog fixtures, 40+ query-planning cases, deeper Playwright keyboard/reflow/forced-colors checks, and manual browser AI verification.
- Improve code splitting for DuckDB assets and add explicit timeout/cancellation recovery.

## Phase 3.5: Geographic reference-data connectors

Implement the registered-source approval workflow only after the local research workspace is stable. Add versioned authority/licensing records, compatibility checks, user-approved unique-value lookup, source vintage/digest tracking, ACS estimate and margin-of-error pairing, ZIP-to-ZCTA approximation disclosure, minimum group-size and sensitive-data safeguards, deterministic DuckDB-Wasm joins, and browser-compatible fallbacks. No default third-party lookup or automatic enrichment is permitted.

## Phase 4B: Capability-driven browser planning

The provider boundary and deterministic fallback are complete. Browser-managed downloadable/downloading/cancelled states, response-constraint compatibility fallback, and the executable 40-case plan evaluation are covered. Manual Chrome/Edge capability verification remains environment-specific. No provider may calculate values or emit executable SQL/JavaScript.
