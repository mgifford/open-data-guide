import { describe, expect, it } from "vitest";
import { connectorFor, inferFormat, loadDataDictionary, normalizeCkan, normalizeDcat, normalizeDkan, searchCkanCatalogPage, searchDkanCatalogPage } from "../src/adapters/resolver.js";

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
    expect(dataset.resources[0].catalogUrl).toBe("https://example.gov");
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

  it("normalizes catalog tags and supports bounded pagination", async () => {
    globalThis.fetch = async (url) => {
      expect(url).toContain("rows=10");
      expect(url).toContain("start=20");
      return new Response(JSON.stringify({ success: true, result: { count: 21, results: [{ id: "water", title: "Water quality", tags: [{ name: "water" }], groups: [{ name: "water" }], resources: [] }] } }), { status: 200 });
    };
    const result = await searchCkanCatalogPage("https://catalog.example.gov", "water", { start: 20, rows: 10 });
    expect(result.total).toBe(21);
    expect(result.datasets[0].keywords).toContain("water");
    expect(result.datasets[0].themes).toContain("water");
  });

  it("does not fail on malformed optional catalog metadata", () => {
    const dataset = normalizeCkan({ id: "incomplete", title: "Incomplete record", tags: null, groups: {}, resources: null }, "https://catalog.example.gov/dataset/incomplete");
    expect(dataset.keywords).toEqual([]);
    expect(dataset.themes).toEqual([]);
    expect(dataset.resources).toEqual([]);
  });

  it("keeps DKAN search behind the same normalized catalog result shape", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ total: 1, items: [{ identifier: "water", title: "Water", distribution: [] }] }), { status: 200 });
    const result = await searchDkanCatalogPage("https://catalog.example.gov", "water", { rows: 10 });
    expect(result.datasets[0]).toMatchObject({ connectorId: "dkan", title: "Water", platform: "DKAN" });
  });

  it("forwards cancellation through data-dictionary loading", async () => {
    const controller = new AbortController();
    controller.abort();
    globalThis.fetch = async (_url, options) => {
      expect(options.signal).toBe(controller.signal);
      throw new DOMException("cancelled", "AbortError");
    };
    await expect(loadDataDictionary({ dataDictionaryUrl: "https://example.gov/dictionary.json" }, { signal: controller.signal })).rejects.toThrow(/cancelled/);
  });

  it("preserves CKAN DataStore capability metadata", () => {
    const dataset = normalizeCkan({ id: "store", resources: [{ id: "r1", format: "CSV", url: "https://example.gov/r.csv", datastore_active: true, size: 1234 }] }, "https://catalog.example.gov/dataset/store");
    expect(dataset.resources[0]).toMatchObject({ datastoreActive: true, datastoreId: "r1", sizeBytes: 1234 });
  });
});
