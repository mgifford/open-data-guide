# ADR 0001: Local Deterministic Calculation Boundary

- Status: Accepted
- Date: 2026-08-25

## Decision

DuckDB-Wasm, or a supported catalog DataStore request where appropriate, calculates all result values. Browser AI may interpret a question or suggest a constrained plan, but it cannot calculate, estimate, rewrite source numbers, or emit executable JavaScript or arbitrary SQL.

The application validates every field, operator, aggregation, limit, and chart intent against an explicit allowlist before compilation. Vega-Lite receives controlled templates and calculated results.

## Consequences

This keeps the default workflow local, reproducible, and inspectable. It requires deliberate handling for mixed types, missing values, date interpretation, large resources, and unsupported questions. A model failure must leave the deterministic workflow usable.
