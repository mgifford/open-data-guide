# Phase 0 Baseline

Prepared: 2026-08-25
Branch: `main`
Baseline commit before Phase 0: `c5a2882` (`Fix project page asset paths`)

## Commands

- Node requirement: `>=22.12.0` from `package.json`
- Install: `npm ci`
- Unit tests: `npm test`
- Production build: `npm run build`
- Local server: `npm run dev`

The baseline suite before Phase 0 contained 19 passing tests across 4 test files. The Phase 0 fixture suite adds four passing fixture assertions and five explicit TODO regression harness cases.

## Baseline build output

Recorded from `npm run build` before Phase 0 fixture additions:

| Artifact | Size | Gzip |
| --- | ---: | ---: |
| Main JavaScript | 1,079.00 kB | 348.26 kB |
| CSS | 5.43 kB | 1.89 kB |
| DuckDB MVP WASM | 39,362.65 kB | 8,863.96 kB |
| DuckDB EH WASM | 34,242.58 kB | 7,781.60 kB |
| DuckDB MVP worker | 844.64 kB | not reported |
| DuckDB EH worker | 772.75 kB | not reported |

Vite reported one existing warning: chunks larger than 500 kB, with code splitting suggested. No new production dependency was added for Phase 0.

## Deployed behavior

- URL: <https://mgifford.github.io/open-data-guide/>
- Deployment uses GitHub Actions and Vite's relative asset paths.
- The deployed page was verified to serve `./assets/index-...js` and `./assets/index-...css` with the stylesheet returning HTTP 200.
- The local page runs at <http://localhost:5173/>.
- The included synthetic sample resolves, loads, profiles five fields, and reaches the constrained question review flow.

## Known observations carried into Phase 1

- Mixed textual null sentinels such as `None` can cause numeric inference or later conversion failures.
- Date values can appear as epoch milliseconds rather than human-readable dates.
- Bobcat exploration produced 80 `project_name` categories, too many for a useful default bar chart.
- Dry-well exploration produced 51 `County` categories and a `Not supplied` category that must be treated as missing data, not an ordinary geography.
- A dry-well question about change over time is underspecified when multiple date fields are present.

Phase 0 records these observations and local reproduction inputs. Phase 1 owns the ingestion, profiling, and disclosure fixes.
