# Phase 4 Evidence

Status: Phase 4B provider-boundary slice started; browser AI execution remains opt-in and incomplete. Prepared: 2026-08-25.

## Implemented

- Added a provider-independent analysis-plan interface in `src/ai/providers.js`.
- Added `deterministicProvider` as the complete no-AI fallback.
- Added `createChromePromptProvider` for page-accessible browser Prompt API implementations without browser-brand routing.
- Capability detection remains side-effect-free: it calls availability only and never calls `LanguageModel.create()`.
- Browser session creation happens only from the explicit capability-panel action and only when availability is ready.
- Browser planning uses a strict versioned JSON Schema, passes only normalized metadata and bounded field summaries, validates the returned plan with the existing deterministic validator, and rejects invented fields.
- Added a 40-case planning evaluation fixture covering valid operations, ambiguity, geography, missing/suppressed values, prompt-injection text, causal claims, unsupported joins/SQL, invalid fields, and provider failure states.
- Added compatibility fallback when a browser implementation does not accept `responseConstraint`; returned JSON still passes the same validator before use.
- Result provenance records the planning backend and model identity where exposed, while never claiming a browser-managed model name the API does not reveal.
- Browser sessions expose explicit disposal through `close()`.
- Downloadable and unavailable states continue to preserve the deterministic workflow; no automatic browser-managed or app-managed model download was added.

## Verification

- `npm test`: 67 passing tests across 12 files, including 6 provider/evaluation tests.
- `npm run test:browser`: 22 passing tests across Chromium and Firefox.
- `npm run build`: passed. Existing Vite warning remains for DuckDB-Wasm chunks over 500 kB.
- `get_errors` on provider source, tests, and browser-facing main module: no errors.

## Known limits

- The real browser Prompt API cannot be provisioned reliably in automated browsers here, so availability, download, timeout, cancellation, and response-constraint behavior are unit-tested with mocks. Manual Chrome/Edge verification remains required.
- Browser planning exposes cancellation through `AbortController`; browser-managed download progress remains implementation-dependent and is not started automatically.
- The provider does not execute SQL or calculate results; it only returns a validated plan. DuckDB-Wasm remains the calculation engine.
- No app-provided generative fallback, cloud model, embeddings change, external service, telemetry, or automatic join was added.

Phase 4B next work is manual Chrome/Edge capability evidence and scored execution of the 40-case evaluation set. No cloud provider is planned or required.
