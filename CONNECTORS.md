# Connectors

The application uses normalized connector records so the interface refers to data catalogs and repositories rather than portal brands.

Supported paths currently include direct CSV, JSON, and Parquet resources; catalog dataset pages resolved through supported metastore or package APIs; DCAT `data.json` records; and the normalized shape reserved for explicitly opened public GitHub repositories. Catalog search currently supports the catalog search endpoint exposed by the configured catalog.

Requests are browser requests. CORS, rate limits, authentication, robots policies, resource size, and publisher availability can prevent resolution. The application does not bypass those controls or request credentials in the first release.

CNRA exploratory targets and deterministic local test scenarios are recorded in [CNRA_TEST_MATRIX.md](CNRA_TEST_MATRIX.md). Live catalog pages are not test fixtures.
