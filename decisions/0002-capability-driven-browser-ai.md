# ADR 0002: Capability-Driven Browser AI Routing

- Status: Accepted
- Date: 2026-08-25

## Decision

Browser brand is never used to select an AI route. The application probes page-accessible capabilities and records the current session result only. A ready browser Prompt API may be offered after user action; a downloadable or downloading state is disclosed and never started silently; unavailable capability preserves the deterministic workflow.

The application does not assume a particular browser-managed model identity. Chrome's Prompt API currently uses Gemini Nano, while other browsers may expose different implementations or none. WebGPU and WebNN indicate compute capacity, not model readiness.

The existing AI Browser Capability Demo is a design reference only. Open Data Guide implements a small separately tested adapter and does not reproduce that project's UI. qsv patterns inform future profiling, but qsv is not bundled in the browser runtime.

## Consequences

The product works in Firefox and in browsers without AI APIs. Capability behavior can change independently of the application. Model download provenance and user consent must remain visible when optional local inference is offered.
