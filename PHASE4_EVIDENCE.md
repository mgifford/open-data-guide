# Phase 4 Evidence

Status: Phase 4B implementation complete for the local-browser provider contract and acceptance suite. Prepared: 2026-08-25.

## Implemented

- Added a provider-independent analysis-plan interface in `src/ai/providers.js`.
- Added `deterministicProvider` as the complete no-AI fallback.
- Added `createChromePromptProvider` for page-accessible browser Prompt API implementations without browser-brand routing.
- Capability detection remains side-effect-free: it calls availability only and never calls `LanguageModel.create()`.
- Browser session creation happens only from the explicit capability-panel action and only when availability is ready.
- Browser planning uses a strict versioned JSON Schema, passes only normalized metadata and bounded field summaries, validates the returned plan with the existing deterministic validator, and rejects invented fields.
- Added a 40-case planning evaluation fixture covering valid operations, ambiguity, geography, missing/suppressed values, prompt-injection text, causal claims, unsupported joins/SQL, invalid fields, provider failure states, and exact expected plan fields for ranked/time-shaped cases.
- Added compatibility fallback when a browser implementation does not accept `responseConstraint`; returned JSON still passes the same validator before use.
- Result provenance records the planning backend and model identity where exposed, while never claiming a browser-managed model name the API does not reveal.
- Browser sessions expose explicit disposal through `close()`.
- Downloadable and unavailable states preserve the deterministic workflow. Browser-managed downloads have explicit approval, progress, cancellation, failure, and retry paths; Hugging Face model downloads have explicit approval, progress, cancellation, immutable revision pinning, and failure recovery.
- No cloud inference service is configured or required. The application remains deployable as a static GitHub Pages site.

## Verification

- `npm test`: 104 passing project tests across 13 files, including provider lifecycle and exact-plan evaluation tests.
- `npm run test:browser`: 22 passing tests across Chromium and Firefox.
- `npm run build`: passed. Existing Vite warning remains for DuckDB-Wasm chunks over 500 kB.
- `get_errors` on provider source, tests, and browser-facing main module: no errors.

## Known limits

- The real browser Prompt API cannot be provisioned reliably in automated browsers here, so availability, download, timeout, cancellation, and response-constraint behavior are unit-tested with mocks. Manual Chrome/Edge verification remains an environment-specific follow-up.
- Browser planning exposes cancellation through `AbortController`; browser-managed download progress is surfaced when the implementation emits `downloadprogress`.
- The provider does not execute SQL or calculate results; it only returns a validated plan. DuckDB-Wasm remains the calculation engine.
- No app-provided generative fallback, cloud model, embeddings change, external service, telemetry, or automatic join was added.

Phase 4B is complete for the implemented scope. The 40-case evaluation is executable and checks selected plan semantics, not only status. Phase 5 visualization and result-export work is documented in `PHASE5_EVIDENCE.md`; reviewed multi-dataset relationships remain future work.
