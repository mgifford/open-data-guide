# Phase 1 Evidence

Status: implementation complete for the bounded Phase 1 slice. Prepared: 2026-08-25.

## Implemented behavior

- CSV loading configures DuckDB with explicit textual null sentinels: empty value, `None`, `NULL`, `null`, `N/A`, and `NA`.
- The local ingestion pipeline retains raw rows for audit, returns normalized rows separately, reports sentinel counts, and rejects invalid UTF-8 rather than silently decoding it.
- Field profiles report inferred type, null count, sentinel count, distinct count, sample values, numeric range, date range, likely identifiers, and warnings.
- The resource profile appears before the question workflow with row, missing-value, distinct-value, and warning columns.
- Date-like epoch millisecond values are displayed as ISO timestamps in HTML tables.
- Resources above 500 MB are refused after a known `Content-Length`; 200 MB resources receive a warning. Unknown sizes remain subject to the existing explicit-load action.
- Grouped charts display at most 15 categories while the accessible HTML table retains all returned rows and the chart description discloses truncation.
- Query ordering uses value descending and category ascending for deterministic ties.
- Chart containers have an accessible name and persistent textual description. Forced-colors support uses system colors for controls and focus.
- Postal and geography roles are detected for postal code, ZIP, ZIP+4, ZCTA, FIPS, latitude, and longitude fields. Postal and Census codes stay text, exact raw values remain separate from normalization, and country-aware validation is opt-in. ZCTAs are explicitly described as Census statistical areas rather than USPS ZIP codes or address locations.
- Postal and Census geography codes cannot be used as numeric measures; distinct counts and grouping remain available. No Census or geocoding service, API key, demographic enrichment, or cloud lookup was added.

## CNRA fixture checks

- Reservoir fixture: `None` in `Elevation Feet` is detected as one textual sentinel, normalized to `null` in the explicit pipeline, and the remaining numeric values profile as 700.5 to 702.1.
- Bobcat fixture: the fixture manifest records the live 80-category `project_name` case; the chart helper limits a result to 15 displayed categories while preserving all rows.
- Dry-well fixture: multiple date fields and `Not supplied` are retained as distinct evidence for later clarification and missing-value handling.
- Postal fixture cases: `00501`, `02108`, `90210`, `90210-1234`, `K1P 5G4`, and `Not supplied` cover leading-zero preservation, ZIP+4 retention, Canadian context, and missing values.

## Deliberate limits

- Phase 1 does not add AI, embeddings, joins, or new repository search.
- CSV loading now exposes a queryable `dataset_raw` all-string view alongside the typed `dataset` projection. Parquet and JSON continue to use DuckDB's native readers; raw-value guarantees are limited to CSV in this phase.
- Full invalid-encoding recovery, cancellation, and streaming profiling remain future work; invalid UTF-8 is rejected explicitly.

## Verification

- `npm ci`: passed.
- `npm test`: 56 passing tests across 10 files.
- `npm run test:browser`: 12 passing tests across Chromium and Firefox, covering the sample, three CNRA fixture flows, postal/FIPS display, and workspace reload/export.
- CI installs Chromium before running the browser suite; local smoke testing uses installed Chrome when available.
- CI also runs the critical browser suite in Firefox; no browser-provided AI is required for the workflow.
- `npm run build`: passed; existing Vite warning remains for chunks over 500 kB because of DuckDB-Wasm.
- `get_errors` on touched source files: no errors.
