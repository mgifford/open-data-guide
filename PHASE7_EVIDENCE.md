# Phase 7 Evidence

## Implemented

- CKAN resources preserve `datastore_active`, resource ID, and declared size metadata.
- DataStore-enabled resources use the documented `datastore_search` endpoint with bounded page size, explicit resource ID, selected fields, exact-match filters, sort order, and pagination.
- Remote pages are aggregated by deterministic JavaScript code using the same allow-listed calculations as local plans.
- Direct-file loading enforces the existing 500 MB browser transfer budget before and after buffering and accepts an abort signal.
- Join candidates with incompatible types or many-to-many risk are blocked; other joins require explicit user confirmation.
- No arbitrary remote SQL is generated or accepted.

## Verification

- Focused Phase 7 tests: 34 passed, covering resource normalization, bounded DataStore requests, exact filters, deterministic aggregation, cancellation, file budgets, and join gates.
- Full project unit gate: 113 tests passed across 14 files.
- Full Chromium/Firefox browser gate: 24 tests passed.
- Production build passed with the existing DuckDB/Vega large-chunk warning.

## Known limits

- A controlled fixture comparison between DataStore and file-query paths is still needed for release evidence.
- Parquet range-efficient reads are not yet implemented.
- Join UI confirmation and unmatched-row reporting are not yet exposed as a complete user workflow.
- DataStore remote aggregation is bounded by the configured row budget; truncated results must be disclosed before release.
