# Phase 2 Evidence

Status: implementation complete for the bounded catalog-search and related-dataset evidence slice. Prepared: 2026-08-25.

## Implemented behavior

- The current catalog can be searched through its supported catalog search API. When a dataset supplies a catalog URL, the search form is prefilled; otherwise users can explicitly provide a catalog URL.
- Search results are normalized into dataset records and include bounded pagination with a visible result count.
- Optional catalog metadata is handled defensively when tags, groups, or resources are malformed or missing.
- Deterministic relevance evidence is separated into subject wording, publisher, themes, geography, temporal terms, and shared fields. Generic terms such as `data`, `state`, `public`, and `report` are excluded or down-weighted.
- Recommendations show reasons and evidence rather than an unexplained confidence percentage. Text similarity never creates a join-compatible relationship.
- Catalog candidates can be opened or saved locally. Saved-dataset recommendations can be dismissed and the dismissal is retained in local preferences for later review.
- Geographic roles from Phase 1 remain strings. ZIP and ZIP+4 are not treated as Census ZCTAs, and matching five-digit formats do not create joins.
- Census or ZCTA wording carries a caution to confirm geography, vintage, estimate, and margin of error; area estimates do not describe individuals.

## CNRA exploration route

The first live catalog target is <https://data.cnra.ca.gov/>. The selected Phase 2 records are:

- State Water Project Monthly Report of Operations
- Bobcat Camera Trap Detections
- Dry Well Reporting System Data

Search terms such as `water`, `groundwater`, `reservoir`, `dry well`, or `bobcat` should return catalog candidates even when they are not already saved locally. Live requests remain subject to CORS, catalog availability, rate limits, and changing records.

## Explicit non-goals

- No embeddings or generative AI.
- No postal, Census, geocoding, MCP, or third-party enrichment calls.
- No postal or Census dataset is automatically joined.
- No claim of join compatibility from matching names, formats, ZIP codes, or textual similarity.
- No external catalog crawling beyond the catalog URL explicitly supplied or associated with the current dataset.
- Geographic reference-data work is deliberately deferred to the bounded registry contract in [REFERENCE_DATA.md](REFERENCE_DATA.md); Phase 2 performs no enrichment, postal lookup, Census lookup, or automatic join.

## Verification

- `npm test`: 56 passing tests across 10 files.
- `npm run test:browser`: 12 passing tests across Chromium and Firefox, covering the sample, three CNRA fixture flows, postal/FIPS display, and workspace reload/export.
- `npm run build`: passed; existing Vite warning remains for DuckDB-Wasm chunks over 500 kB.
- `get_errors` on touched Phase 2 source and test files: no errors.
- GitHub Actions runs the browser smoke suite after `npm run build` and before Pages deployment.
- The critical browser suite runs in Chromium and Firefox; catalog and geography behavior remains deterministic.
