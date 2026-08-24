# Contributor guidance

- Keep the core experience useful without AI.
- Probe browser-provided AI before offering an app-provided model. Do not create a browser model session during capability detection.
- Run all calculations in deterministic code, currently DuckDB-Wasm.
- Do not execute arbitrary model-generated SQL.
- Validate generated plans against an explicit schema and operator allow-list.
- Keep CKAN and DKAN details behind normalized adapters.
- Treat publisher metadata as authoritative but not necessarily complete.
- Preserve an accessible HTML table, textual interpretation, source URL, and query for every result.
- Add tests for adapters, plan validation, and relationship logic before expanding features.
- Avoid frameworks until application complexity demonstrates a clear need.
