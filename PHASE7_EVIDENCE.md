# Phase 7 Evidence

## Implemented

- CKAN resources preserve `datastore_active`, resource ID, and declared size metadata.
- DataStore-enabled resources use the documented `datastore_search` endpoint with bounded page size, explicit resource ID, selected fields, exact-match filters, sort order, and pagination.
- Short server-capped pages continue until the reported total or row budget, and each page records its exact request receipt.
- Remote empty, whitespace-only, and configured sentinel values follow the local missing-value policy for numeric and distinct aggregations.
- Remote pages are aggregated by deterministic JavaScript code using the same allow-listed calculations as local plans.
- JSON result exports include remote pagination provenance and incomplete-result state.
- CSV, JSON, Parquet, data-dictionary, DataStore preview, and remote-query cancellation paths accept abort signals; canceled loads do not commit completed profiles.
- Direct-file loading enforces the existing 500 MB browser transfer budget before and after buffering and accepts an abort signal.
- Join candidates with incompatible types or many-to-many risk are blocked; other joins require explicit user confirmation.
- No arbitrary remote SQL is generated or accepted.

## Verification

- Focused Phase 7 tests: 41 passed across the directly affected DataStore, resolver, relationship, activity, and export suites.
- Full project unit gate: 123 tests passed across 15 files.
- Full Chromium/Firefox browser gate: 36 tests passed.
- Production build passed with the existing DuckDB/Vega large-chunk warning.

## Known limits

- Parquet range-efficient reads are not yet implemented.
- Join confirmation and unmatched-row reporting are limited to bounded preview evidence; no full-data join is implied.
- DataStore remote aggregation is bounded by the configured row budget; incomplete results are labelled and cannot be charted or exported.
