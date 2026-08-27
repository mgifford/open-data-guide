# Phase 8B Evidence

Phase 8B adds optional AI-assisted result summaries (Track A) and bounded
deterministic multi-dataset comparison (Track B). Both keep the deterministic,
local-first guarantees: AI never computes values, and joins never run on full
data or through arbitrary SQL.

## Track A — AI-assisted result summaries

### Implemented

- An optional "Summarize this result with AI" control appears under the always-present deterministic summary, only for a complete (non-truncated) result.
- The model receives only the computed result rows and the validated plan, with an untrusted-data framing that forbids calculating, ranking beyond the given values, causal claims, and advice (`src/ai/summary.js`).
- A number-grounding guardrail rejects any summary that introduces a number not already present in the result rows, filter values, limit, or row count.
- Browser-provided AI and the approved local Hugging Face model expose a `summarize()` path; no summary is produced without the existing capability probe and explicit approval.
- The AI summary is rendered in a clearly labelled region that names the backend and states the deterministic summary and table remain the source of truth. A rejected or unavailable summary changes nothing else.

### Acceptance criteria

- Deterministic summary always shown; the AI summary is additive and labelled — met.
- No AI summary without the capability probe and explicit approval — met.
- The model is given only the computed rows and plan and cannot introduce ungrounded numbers — met (grounding guardrail).
- Works with browser-provided AI, the approved local model, or not at all — met.
- Unit tests for the prompt and grounding, plus a browser test for the labelled, approval-gated flow — met.

## Track B — Bounded deterministic multi-dataset comparison

### Implemented

- After a confirmed join review, `joinComparison` (`src/catalog/relationships.js`) computes a deterministic inner join of the two saved preview snapshots on the confirmed key.
- The comparison is bounded: emitted rows are capped (default 50) so a one-to-many match cannot expand without limit, and truncation is reported.
- Rows with a missing normalized key are skipped, matching the join-key policy used elsewhere.
- The confirmed result renders an accessible comparison table and a note stating it is a preview join of saved preview rows, not a full-data join. The bounded comparison preview, matched-pair count, and truncation flag are stored in the relationship record.
- No arbitrary SQL is generated; the comparison is pure JavaScript over bounded snapshots, and blocked or unconfirmed joins never reach it.

### Constraints preserved

- Many-to-many and type-incompatible joins remain blocked before any comparison.
- The comparison never implies a full-data join or a validated combined dataset.

## Verification

- Unit gate: 162 tests pass across 19 files (`npm test`), including summary grounding and `joinComparison` bounds/truncation/missing-key cases.
- Browser gate: 74 Playwright tests pass across Chromium and Firefox (`npm run test:browser`), including the AI-summary labelled/rejection flow (with an injected fake `LanguageModel`) and the confirmed-join comparison table.

### Acceptance-test mapping

| Item | Test |
| --- | --- |
| Grounded AI summary is labelled and additive | `tests/browser/ai-summary.spec.js` |
| A hallucinated number is rejected; deterministic summary intact | `tests/browser/ai-summary.spec.js` |
| Summary prompt framing and number grounding | `tests/summary.test.js` |
| Bounded comparison from confirmed preview snapshots | `tests/related.test.js` |
| One-to-many comparison capped and flagged truncated | `tests/related.test.js` |
| Missing join keys skipped in the comparison | `tests/related.test.js` |
| Confirmed join renders the bounded comparison table | `tests/browser/workspace.spec.js` |

## Known limits

- Browser-provided AI summaries cannot be exercised against a real browser model in CI; the browser test injects a fake `LanguageModel`, and live model behavior is environment-specific.
- The comparison operates only on the saved preview snapshots (bounded row previews), not full resources; it is review evidence, not a computed combined dataset.
- The grounding guardrail restricts introduced numbers; it does not police non-numeric claims such as category names, which remain drawn from the provided rows.
