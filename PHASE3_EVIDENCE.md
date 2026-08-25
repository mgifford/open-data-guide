# Phase 3 Evidence

Status: bounded local-workspace implementation complete; prepared 2026-08-25.

## Implemented

- IndexedDB schema version 3 preserves prior dataset markers and enriches records with schema version, connector identity, resource/field arrays, and retrieval metadata.
- Query history stores bounded previews, validated plans, SQL provenance, dataset/resource keys, source digests, source modification metadata, and model provenance fields.
- CSV loads compute a SHA-256 source digest. History entries are marked stale when the current source digest, modification metadata, or resource URL differs.
- Stale entries require review before reuse; the application never silently reruns historical SQL.
- Workspace export/import remains version validated and stores records without complete remote datasets. Browser storage usage is displayed when the Storage API provides an estimate.
- Delete-one and delete-all controls remain separate and keyboard accessible. Browser-managed model cache is not claimed to be deleted by IndexedDB cleanup.
- Geographic reference-data registry contracts are documented in [REFERENCE_DATA.md](REFERENCE_DATA.md). Sources record authority, licensing notes, kind, role support, and status. Lookup plans require explicit approval, unique-value inputs, minimum group size, source-vintage/digest handling fields, ACS estimate/MOE pairing, and ZIP-to-ZCTA disclosure.

## Verification

- `npm audit --omit=optional --audit-level=moderate`: 0 vulnerabilities after upgrading Playwright to 1.55.1.
- `npm test`: 55 passing tests across 10 files.
- `npm run test:browser`: 5 passing Chromium tests, including the sample, three CNRA fixtures, and postal/FIPS preservation.
- `npm run test:browser`: 5 passing Chromium tests.
- `npm run build`: passed; existing Vite warning remains for DuckDB-Wasm chunks over 500 kB.
- No external postal, Census, geocoding, MCP, cloud inference, telemetry, or automatic join behavior was added.
- `npm audit --omit=optional --audit-level=moderate`: 0 vulnerabilities after upgrading Playwright to 1.55.1.

## Known limits

- Complete IndexedDB browser migration tests require a browser fixture such as fake-indexeddb; current unit tests cover export validation and pure history logic, while Playwright covers the live browser workspace.
- The reference registry does not call sources or perform enrichment in this phase. Deterministic DuckDB enrichment joins are a future gated implementation after user approval and profiling.
- Static export/import merges records into the current workspace; it does not replace existing records or provide account sync.
