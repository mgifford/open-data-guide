# Geographic Reference Data Boundary

Phase 3.5 follows the local research workspace and precedes any browser AI planning. It defines a registry and approval contract, not a default enrichment service.

Registered source records include authority, licensing notes, source kind (`api`, `static-resource`, or `http-mcp`), supported geography roles, status, and provenance notes. Compatibility checks validate protocol and documented role support without making a network request.

Any future enrichment must be explicitly approved by the user, use unique values rather than full dataset rows, preserve source vintage and digest, and remain deterministic in DuckDB-Wasm. ACS estimates must stay paired with their margin of error and vintage. ZIP-to-ZCTA matches are approximations; a ZCTA centroid is not an address location and a ZCTA is not a USPS ZIP code.

Safeguards include minimum group sizes, sensitive-data review, no automatic joins, no assumptions from postal-code formatting, and no demographic claim inferred by an AI system. The AI may interpret a verified enrichment result, but it cannot decide what a postal code means or infer a demographic pattern from it.

The current registry contains reference contracts for a versioned Census ACS static extract, a user-configured Census API, and an explicitly configured local HTTP-MCP endpoint. None is called automatically, and no postal code is sent to a third party by the default application.
