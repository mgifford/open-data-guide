# Phase 4 Evidence

Status: Phase 4B provider-boundary slice started; browser AI execution remains opt-in and incomplete. Prepared: 2026-08-25.

## Implemented

- Added a provider-independent analysis-plan interface in `src/ai/providers.js`.
- Added `deterministicProvider` as the complete no-AI fallback.
- Added `createChromePromptProvider` for page-accessible browser Prompt API implementations without browser-brand routing.
- Capability detection remains side-effect-free: it calls availability only and never calls `LanguageModel.create()`.
- Browser session creation happens only from the explicit capability-panel action and only when availability is ready.
- Browser planning uses a strict versioned JSON Schema, passes only normalized metadata and bounded field summaries, validates the returned plan with the existing deterministic validator, and rejects invented fields.
- Browser sessions expose explicit disposal through `close()`.
- Downloadable and unavailable states continue to preserve the deterministic workflow; no automatic browser-managed or app-managed model download was added.

## Verification

- `npm test`: 65 passing tests across 11 files, including 5 provider tests.
- `npm run test:browser`: 22 passing tests across Chromium and Firefox.
- `npm run build`: passed. Existing Vite warning remains for DuckDB-Wasm chunks over 500 kB.
- `get_errors` on provider source, tests, and browser-facing main module: no errors.

## Known limits

- The real browser Prompt API cannot be provisioned reliably in automated browsers here, so availability, download, timeout, cancellation, and response-constraint behavior are unit-tested with mocks. Manual Chrome/Edge verification remains required.
- The UI does not yet expose browser download progress or cancellation controls because no browser-managed download is started by this slice.
- The provider does not execute SQL or calculate results; it only returns a validated plan. DuckDB-Wasm remains the calculation engine.
- No app-provided generative fallback, cloud model, embeddings change, external service, telemetry, or automatic join was added.

Phase 4B next work should add explicit capability-state UI and manual-browser evidence before expanding the prompt schema or provider surface.
