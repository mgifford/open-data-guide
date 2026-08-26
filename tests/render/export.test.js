import { describe, expect, it } from "vitest";
import { resultsToCsv, resultsToJson } from "../../src/render/export.js";

describe("result exports", () => {
  it("returns empty CSV for empty results", () => {
    expect(resultsToCsv([])).toBe("");
  });

  it("serializes headers and rows as CSV", () => {
    expect(resultsToCsv([{ state: "CA", value: 3 }, { state: "NY", value: 2 }]))
      .toBe("state,value\nCA,3\nNY,2");
  });

  it("quotes commas, quotes, and newlines in CSV cells", () => {
    expect(resultsToCsv([{ label: 'A, "quoted"\nlabel', value: null }]))
      .toBe('label,value\n"A, ""quoted""\nlabel",');
  });

  it("prefixes spreadsheet formula characters", () => {
    expect(resultsToCsv([{ value: "=SUM(A1:A2)" }, { value: "@user" }, { value: "+1" }]))
      .toBe("value\n'=SUM(A1:A2)\n'@user\n'+1");
  });

  it("preserves all result columns from the first row", () => {
    expect(resultsToCsv([{ a: 1, b: 2 }])).toContain("a,b");
  });

  it("creates structured JSON with metadata and query", () => {
    const json = resultsToJson({
      metadata: { dataset: "Sample", sourceUrl: "https://example.test/data.csv" },
      plan: { aggregation: "count", dimension: "state" },
      sql: "SELECT state, COUNT(*) FROM data GROUP BY state",
      rows: [{ state: "CA", value: 3 }],
      vegaLiteSpec: { mark: "bar" },
      remoteProvenance: { catalogOrigin: "https://catalog.example.gov", resourceId: "r1", requests: [{ offset: 0, limit: 1000, returned: 3 }] },
      incomplete: false,
    });
    const payload = JSON.parse(json);
    expect(payload.metadata.dataset).toBe("Sample");
    expect(payload.plan.dimension).toBe("state");
    expect(payload.query).toContain("GROUP BY");
    expect(payload.results).toEqual([{ state: "CA", value: 3 }]);
    expect(payload.vegaLiteSpec).toEqual({ mark: "bar" });
    expect(payload.remoteProvenance.requests[0].limit).toBe(1000);
    expect(payload.incomplete).toBe(false);
  });

  it("handles omitted JSON sections with stable defaults", () => {
    expect(JSON.parse(resultsToJson())).toEqual({ metadata: {}, plan: {}, query: "", results: [], vegaLiteSpec: null, incomplete: false, remoteProvenance: null });
  });
});
