# CNRA Catalog Test Matrix

The California Natural Resources Agency catalog at <https://data.cnra.ca.gov/dataset> is a useful public test source. The application calls it a data catalog; its current implementation details remain behind the catalog adapter.

These records were selected on 2026-08-24 from the catalog listing. They are exploration targets, not bundled data fixtures, so tests must mock catalog responses and use local files for deterministic execution.

| Dataset | URL | Why it is useful | Suggested exploration |
| --- | --- | --- | --- |
| Periodic Groundwater Level Measurements | <https://data.cnra.ca.gov/dataset/periodic-groundwater-level-measurements> | Time-series measurements with CSV resources and likely site/geography fields | Count measurements by county or site; inspect date range and missing values |
| Water Quality Data | <https://data.cnra.ca.gov/dataset/water-quality-data> | Chemical and physical measurements with a CSV resource | Compare measurements by analyte and location; inspect units before aggregating |
| Daily SWP Reservoir Elevation and Storage Data | <https://data.cnra.ca.gov/dataset/state-water-project-monthly-report-of-operations> | Daily temporal data with numeric elevation and storage measures | Plot storage or elevation over time; verify date grouping and units |
| Dry Well Reporting System Data | <https://data.cnra.ca.gov/dataset/dry-well-reporting-system-data> | Reports with geography, dates, and sparse real-world records | Count reports by county and year; profile missing and suppression-like values |
| Bobcat Camera Trap Detections | <https://data.cnra.ca.gov/dataset/bobcat-camera-trap-detections-cdfw-ds3402> | Wildlife observations with CSV and geospatial resources | Count detections by study area; keep map-like resources visible but unsupported |

## Local test scenarios

1. Resolve each dataset URL with a mocked catalog response and assert a normalized dataset record with a catalog URL, identifier, publisher, and resources.
2. Search the configured catalog with `water quality` and assert that results remain normalized and source URLs point back to the catalog dataset pages.
3. Load a small local fixture shaped like the reservoir data and ask for a sum by date or category. Assert the generated SQL uses only validated identifiers and the result table remains available without a chart.
4. Load a small local fixture shaped like groundwater observations and ask `count by county`. Assert deterministic grouping and a transparent related-dataset reason for shared geography or field names.
5. Treat the CNRA catalog pages as live exploratory checks only. Do not make unit or integration tests depend on network availability, CORS, current records, or resource sizes.

## Live exploration notes

- The catalog listing reports more than 21,000 datasets and includes CSV, GeoJSON, ZIP, ArcGIS service, and other resources.
- The application should avoid opening ZIP, service, or very large resources automatically. A user should choose a supported resource explicitly.
- Publisher descriptions and field definitions are evidence to review, not guarantees that fields share units or join safely.
