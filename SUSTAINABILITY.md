# Sustainability

Deterministic parsing, metadata matching, and DuckDB-Wasm calculations run before optional models. Large resources are warned about and are not downloaded during catalog inspection. Profiling remains an explicit action rather than an automatic full scan.

Embedding work is user initiated and should be cached by source digest and model version. Browser-managed model downloads are distinguished from app-managed downloads, and the application provides separate local-data deletion controls; browser cache removal remains browser-managed.

The current production build includes large DuckDB-Wasm assets. Code splitting and more selective runtime loading are future optimization work.
