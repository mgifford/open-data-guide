# Phase 7 Evidence

## Implemented

- CKAN resources preserve `datastore_active`, resource ID, and declared size metadata.
- DataStore-enabled resources require the preserved catalog origin; requests no longer fall back to an arbitrary download URL.
- DataStore requests use the documented `datastore_search` endpoint with bounded page size, explicit resource ID, selected fields, exact-match filters, sort order, and pagination.
- Short server-capped pages continue until the reported total or row budget, and each page records its exact request receipt.
- Remote empty, whitespace-only, and configured sentinel values follow the local missing-value policy for numeric and distinct aggregations.
- Remote pages are aggregated by deterministic JavaScript code using the same allow-listed calculations as local plans.
- JSON result exports include remote pagination provenance and incomplete-result state.
- CSV, JSON, Parquet, data-dictionary, DataStore preview, and remote-query cancellation paths accept abort signals; canceled loads do not commit completed profiles.
- Direct-file loading enforces the existing 500 MB browser transfer budget before and after buffering and accepts an abort signal.
- Join candidates with incompatible types or many-to-many risk are blocked; other joins require explicit user confirmation.
- Map rendering is triggered only for result rows that include explicit latitude and longitude values in the validated output contract; grouped `{category, value}` aggregates remain bars, lines, or tables.
- Incomplete remote aggregates remain unchartable and unexportable until the query is narrowed.
- Saved markers may keep up to 100 preview rows, saved analyses may keep bounded preview rows, and workspace exports include those previews.
- No arbitrary remote SQL is generated or accepted.

## Verification

- Unit gate: 125 tests passed across 15 files (`npm test`).
- Production build: passed (`npm run build`) with the existing DuckDB/Vega large-chunk warning.
- Browser gate: this environment did not successfully execute the Playwright specs because the browser runtime could not install or run under the current sandbox permissions, so Chromium/Firefox evidence remains pending until the host environment allows browser installation and execution.

## Known limits

- Local DuckDB execution cannot currently be interrupted once synchronous parsing or a query has begun.
- Parquet range-efficient reads are not yet implemented.
- Join confirmation and unmatched-row reporting are limited to bounded preview evidence; no full-data join is implied.
- DataStore remote aggregation is bounded by the configured row budget; incomplete results are labelled and cannot be charted or exported.
- The Pages workflow is not claimable as green without the GitHub Actions run result for the current repository state.
