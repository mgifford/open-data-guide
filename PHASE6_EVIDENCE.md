# Phase 6 Evidence

## Scope

The optional MiniLM reranker compares catalog titles, descriptions, and field descriptions locally. Deterministic CKAN search and relationship scoring remain the default and continue to work without model consent.

## Verified

- Opening browser capability checks does not import or download the app-provided model.
- Full unit gate: 102 project tests passed across 13 files.
- Full browser gate: 24 tests passed across Chromium and Firefox.
- MiniLM disclosure appears before the approval action and identifies the model, source, Apache-2.0 license, approximate transfer size, purpose, local metadata-only processing, cache behavior, and browser-managed removal path.
- Browser request monitoring confirmed no Transformers.js or Hugging Face request occurs before consent.
- Embedding cache keys contain source digest, model identifier, and model version. A changed digest produces a different key.
- Semantic results retain deterministic relationship evidence and explicitly mark join compatibility as requiring separate review.
- Unit coverage verifies cache-key invalidation and semantic evidence composition.
- Chromium interaction coverage verifies disclosure and no-download status before consent.

## Known release-gate limits

- The Hugging Face runtime and model download are intentionally not exercised in the default automated suite because they are external, large, and browser-managed.
- A human-labelled CNRA relevance set, reranker quality comparison, and measured latency/memory budget are still required before claiming that semantic reranking improves recommendations.
- VoiceOver, forced-colors, Chrome Canary Prompt API, Edge, and live DKAN remain separate manual checks.
