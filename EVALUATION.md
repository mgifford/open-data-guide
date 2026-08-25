# Evaluation

The current deterministic evaluation surface covers connector normalization, catalog connector selection, related-term matching, join evidence, browser AI capability states, field validation, SQL identifier escaping, filter literal escaping, aggregation selection, typed clarification responses, ranked limits and order, embedding cache keys, and semantic evidence composition.

Current automated result: 23 tests pass across 5 files, with 5 explicit Phase 0 TODO regression harness cases. The requested 40-question query-planning evaluation set and Chromium/Firefox browser matrix remain planned work. CNRA live exploration is intentionally separated from deterministic tests because catalog records, CORS, resource sizes, and availability change.

Success metrics for the next evaluation slice are exact field selection, aggregation correctness, filter correctness, clarification precision, rejection of unsupported or causal claims, reproducibility of generated SQL, and a human-labelled CNRA comparison of lexical versus semantic related-dataset ranking.
