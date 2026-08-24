import { describe, expect, it } from "vitest";
import { connectorFor, inferFormat, normalizeCkan, normalizeDcat, normalizeDkan } from "../src/adapters/resolver.js";

describe("dataset adapters", () => {
  it("infers supported formats without trusting query parameters", () => {
    expect(inferFormat("https://example.gov/data.csv?download=1")).toBe("csv");
    expect(inferFormat("https://example.gov/resource", "PARQUET")).toBe("parquet");
  });

  it("normalizes a DKAN dataset and data dictionary", () => {
    const dataset = normalizeDkan({
      identifier: "abc",
      title: "Payments",
      publisher: { name: "Public agency" },
      distribution: [{ title: "CSV", format: "csv", downloadURL: "https://example.gov/payments.csv", describedBy: "https://example.gov/dictionary" }],
    }, "https://example.gov/dataset/abc");
    expect(dataset.platform).toBe("DKAN");
    expect(dataset.publisher).toBe("Public agency");
    expect(dataset.resources[0].dataDictionaryUrl).toBe("https://example.gov/dictionary");
  });

  it("normalizes CKAN package_show output", () => {
    const dataset = normalizeCkan({
      id: "abc",
      title: "Facilities",
      organization: { title: "Health department" },
      resources: [{ id: "r1", name: "Download", format: "CSV", url: "https://example.gov/facilities.csv" }],
    }, "https://example.gov/dataset/abc");
    expect(dataset.platform).toBe("CKAN");
    expect(dataset.resources[0].format).toBe("csv");
  });

  it("keeps catalog implementation details behind normalized records", () => {
    const dataset = normalizeDcat({
      identifier: "groundwater",
      title: "Periodic Groundwater Level Measurements",
      publisher: { name: "Department of Water Resources" },
      keyword: ["groundwater", "California"],
      distribution: [{ title: "Measurements CSV", format: "text/csv", downloadURL: "https://example.gov/levels.csv" }],
    }, "https://catalog.example.gov/data.json");
    expect(dataset.connectorId).toBe("dcat-us");
    expect(dataset.resources[0].format).toBe("csv");
    expect(dataset.keywords).toContain("groundwater");
  });

  it("selects a neutral connector identity from an opened source", () => {
    expect(connectorFor("https://data.cnra.ca.gov/dataset/gspar")).toBe("dkan-or-ckan");
    expect(connectorFor("https://example.gov/data.csv")).toBe("direct");
    expect(connectorFor("https://github.com/example/public-data")).toBe("github");
  });
});
