# Phase 4A Evidence

Status: PASS for the inherited correctness and accessibility repair gate. Prepared: 2026-08-25.

## Repairs

- Moved catalog-prefill logic into `renderDataset(dataset)` and removed the startup ReferenceError.
- Corrected numeric inference so ordinary text is numeric only when every non-missing value is a strict finite numeric token.
- Treats whitespace-only values and case-insensitive configured sentinels as missing.
- Rejects empty and duplicate CSV headers and reports malformed row widths.
- Restores the original dataset URL, resource ID, validated plan, and field snapshot for new history records.
- Reopens history through a user-mediated sequence: open metadata, select the original resource, explicitly load it, compare schema/source, review the plan, then run.
- Legacy history without source metadata produces a useful recovery message and never calls `trim()` on an absent URL.
- Staleness is dataset-aware and selected-resource-aware; unrelated history is labeled as a different dataset.
- Schema comparison reports added, removed, and retyped fields and disables Run when repair is required.
- Catalog pagination advances by raw remote result count, while local deduplication and current-dataset exclusion remain separate.
- Chart descriptions remain outside Vega's replaced host, connect through `aria-describedby`, and chart width is constrained by the measured host without a hard minimum that forces page overflow.
- Added a same-origin browser migration fixture for a real v1-to-current IndexedDB upgrade.
- Added explicit import record/key/count/size validation before workspace writes.
- Enforced Census ACS vintage/digest and estimate/MOE pairing where applicable.
- Phase 4B browser AI planning has not been started.

## Acceptance evidence

- `npm ci`: passed previously on the same dependency tree.
- `npm test`: 60 passing tests across 10 files.
- `npm run test:browser`: 18 passing tests: 9 Chromium and 9 Firefox, including sample correctness, all three CNRA fixtures, postal/FIPS preservation, history reload/export, saved-plan restoration, narrow 320px layout, and v1 IndexedDB migration.
- `npm run build`: passed. Existing Vite warning remains for DuckDB-Wasm chunks over 500 kB.
- `npm audit --omit=optional --audit-level=moderate`: 0 vulnerabilities.
- `get_errors`: no diagnostics in touched source, tests, configuration, or evidence documents.

## Boundaries and known limits

- Browser tests cover 320px layout but do not yet automate 400% zoom, reduced-motion screenshots, or forced-colors rendering assertions.
- IndexedDB migration coverage currently exercises v1 in a real browser; v2 and v3 fixtures remain a follow-up because v3 is the current schema and v2 is an intermediate release shape.
- History restoration requires the user to load the selected resource and review controls; it never reruns historical SQL automatically.
- No new generative AI, model download, external postal/Census/geocoding/MCP call, telemetry, or automatic join was introduced.

Phase 4B must not begin until this document and commit have been independently reviewed.
