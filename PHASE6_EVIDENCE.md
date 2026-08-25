# Phase 6 Evidence

## Scope

The optional MiniLM reranker compares catalog titles, descriptions, and field descriptions locally. Deterministic CKAN search and relationship scoring remain the default and continue to work without model consent.

## Verified

- Opening browser capability checks does not import or download the app-provided model.
- Full unit gate: 104 project tests passed across 13 files.
- Full browser gate: 24 tests passed across Chromium and Firefox.
- MiniLM disclosure appears before the approval action and identifies the model, source, Apache-2.0 license, approximate transfer size, purpose, local metadata-only processing, cache behavior, and browser-managed removal path.
- Browser request monitoring confirmed no Transformers.js or Hugging Face request occurs before consent.
- Embedding cache keys contain a SHA-256 digest of the canonical embedded metadata document, model identifier, and runtime/dtype version. Changed metadata produces a different key, including for catalog records without loaded source files.
- Semantic results retain deterministic relationship evidence and explicitly mark join compatibility as requiring separate review.
- Unit coverage verifies cache-key invalidation and semantic evidence composition.
- Chromium interaction coverage verifies disclosure and no-download status before consent.

## Known release-gate limits

- The Hugging Face runtime and model download are intentionally not exercised in the default automated suite because they are external, large, and browser-managed.
- A human-labelled CNRA relevance set, reranker quality comparison, and measured latency/memory budget are still required before claiming that semantic reranking improves recommendations.
- The model is pinned to Hugging Face revision `751bff37182d3f1213fa05d7196b954e230abad9`; q8 transfer and runtime overhead are disclosed separately.
- VoiceOver, forced-colors, Chrome Canary Prompt API, Edge, and live DKAN remain separate manual checks.
