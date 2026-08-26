# Phase 8A Evidence

Phase 8A replaces the flat panel layout with a visible six-step dataset-discovery
journey and a curated catalog picker. AI summaries and multi-dataset joins are
intentionally out of scope for this phase.

## Implemented

### Dataset-discovery journey

- A persistent six-step journey (Choose data, Understand the dataset, Choose a question, Analyze the data, Review and refine, Connect related data) is rendered from a versioned definition in `src/ui/journey.js`.
- The current step is programmatically identified with `aria-current="step"`; completed steps remain revisitable links.
- Future steps are disclosed as "Not available yet" rather than being silently disabled.
- History, saved workspace, storage, AI settings, and diagnostics are grouped in a secondary Workspace and settings region.

### Step one and starters

- A plain-language introduction explains that the guide helps non-specialists explore public CKAN and DKAN datasets.
- The catalog section is titled "Search open data catalogs" and discloses that searches go directly from the browser to the selected catalog.
- Real remote starters (CKAN groundwater and dry-well datasets, a CMS Open Payments DKAN starter) open inside the guide, each with a separate "View publisher page" link.
- Direct CSV, JSON, and Parquet URLs and catalog dataset pages remain supported, plus local CSV upload processed entirely in the browser.
- Failure states classify CORS, unsupported format, network failure, and size refusal separately (`src/ui/errors.js`).

### Curated catalog registry and picker

- A versioned built-in catalog registry (`src/catalog/catalogs.js`) records id, name, platform and API version, base URL, jurisdiction, description, subjects, inclusion reason, last verified date, known browser limitations, and publisher and API-documentation URLs.
- Verified entries: California Natural Resources Agency (CKAN), California Health and Human Services (CKAN), CMS Open Payments (DKAN), and Data.gov (CKAN).
- CNRA is selected by default. The base catalog URL stays out of the main flow and only appears inside the "Add another catalog" disclosure.
- Custom catalogs are detected through a supported CKAN or DKAN API response before they can be saved, and can be renamed, retested, and removed. Built-in definitions are kept separate from user-saved records.
- Search results preserve catalog origin and report failures without discarding successful results. Catalog metadata retrieval never implies a resource is browser-accessible.

### Catalog verification

- A browser-side CORS health check (`npm run test:catalog-health`, excluded from the default gate) confirms real cross-origin browser access.
- The 2026-08-26 run verified CNRA, CHHS, and CMS Open Payments. Data.gov's CKAN API rejects cross-origin browser requests, so it remains unverified and is labelled accordingly.

## Verification

- Unit gate: 151 tests pass across 18 files (`npm test`).
- Browser gate: 70 Playwright tests pass across Chromium and Firefox (`npm run test:browser`).
- Live catalog health check: 6 of 8 browser checks pass; the two Data.gov checks fail with a confirmed CORS block (`npm run test:catalog-health`).

### Acceptance-test mapping

| Acceptance criterion | Test |
| --- | --- |
| Open a working remote CKAN starter without a URL | `tests/browser/cnra-fixtures.spec.js` |
| Open a working DKAN starter | `tests/browser/phase8a-acceptance.spec.js` |
| Starter activation does not navigate away | starter specs assert the URL stays local |
| A direct CSV URL works | `tests/browser/sample-flow.spec.js` |
| A local CSV file works without a network upload | `tests/browser/journey.spec.js` |
| Failure states identify CORS, unsupported format, network, and size separately | `tests/errors.test.js` |
| Journey usable at 400% zoom and 320px | `tests/browser/journey.spec.js`, `tests/browser/phase8a-acceptance.spec.js` |
| CNRA selected by default; search without a base URL; no network on open | `tests/browser/catalog-picker.spec.js` |
| Switch to another built-in catalog | `tests/browser/phase8a-acceptance.spec.js` |
| Custom CKAN catalog detected and saved | `tests/browser/phase8a-acceptance.spec.js` |
| Custom DKAN catalog detected and saved | `tests/browser/phase8a-acceptance.spec.js` |
| Non-catalog website rejected with an explanation | `tests/browser/catalog-picker.spec.js` |
| Saved custom catalog persists across reload | `tests/browser/phase8a-acceptance.spec.js` |
| Removing a custom catalog does not affect built-ins | `tests/browser/phase8a-acceptance.spec.js` |
| Keyboard and screen-reader users can identify the selected catalog and its description | `tests/browser/phase8a-acceptance.spec.js` |
| Catalog selection usable at 400% zoom | `tests/browser/phase8a-acceptance.spec.js` |

## Known limits

- "400% zoom" is automated through the WCAG 1.4.10 reflow equivalent of a 320 CSS-pixel width; true browser-zoom rendering and forced-colors assertions are not yet automated.
- Data.gov cannot be offered as a working starter because its API blocks cross-origin browser requests.
- "Search several catalogs at once" is deferred; it needs bounded concurrency, per-catalog failure handling, deduplication using documented identifiers, and explainable cross-catalog ranking.
- The DKAN starter and custom-catalog acceptance tests use deterministic mocked API responses; live browser access is covered separately by the catalog health check.
