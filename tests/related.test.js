import { describe, expect, it } from "vitest";
import { catalogSearchTerms, cosineSimilarity, explainRelatedDataset, relatedDatasets } from "../src/catalog/related.js";
import { analyzeJoinCandidate, validateJoinCandidate } from "../src/catalog/relationships.js";
import { chartKindFor, chartRowsFor } from "../src/render/chart.js";

describe("related dataset matching", () => {
  it("reports transparent shared terms", () => {
    const current = { key: "a", title: "County hospital payments", description: "Payments by state" };
    const results = relatedDatasets(current, [
      current,
      { key: "b", title: "State physician payments", description: "Annual public payments" },
      { key: "c", title: "Forest boundaries", description: "GIS polygons" },
    ]);
    expect(results[0].dataset.key).toBe("b");
    expect(results[0].shared).toContain("payments");
    expect(results[0].evidence.some((item) => item.type === "subject")).toBe(true);
  });

  it("explains geography without implying join compatibility", () => {
    const result = explainRelatedDataset(
      { title: "Groundwater levels", spatial: "California counties", fields: [{ name: "county", type: "VARCHAR" }] },
      { title: "Dry well reports", spatial: "California counties", fields: [{ name: "county", type: "VARCHAR" }] },
    );
    expect(result.reasons).toContain("geographic overlap");
    expect(result.evidence.find((item) => item.type === "geography").label).toBe("shared geography terms");
    expect(result.joinCandidate).toBe(false);
  });

  it("derives bounded catalog terms without using publisher as a subject term", () => {
    const terms = catalogSearchTerms({ title: "Groundwater levels", publisher: "Secret publisher", keywords: ["aquifer"] }, 4);
    expect(terms).toContain("groundwater");
    expect(terms).not.toContain("secret");
    expect(terms.split(" ").length).toBeLessThanOrEqual(4);
  });

  it("calculates cosine similarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("profiles join evidence without declaring a join safe", () => {
    const evidence = analyzeJoinCandidate(
      { fields: [{ name: "county", type: "VARCHAR" }], rows: [{ county: "Alameda" }, { county: "Alameda" }] },
      { fields: [{ name: "county_name", type: "VARCHAR" }], rows: [{ county_name: " Alameda " }, { county_name: "Contra Costa" }] },
      "county", "county_name",
    );
    expect(evidence.normalizedOverlap).toBe(1);
    expect(evidence.expectedCardinality).toBe("needs-review");
    expect(evidence.requiresUserConfirmation).toBe(true);
    expect(evidence.reasons).toContain("1 normalized key values overlap");
  });

  it("blocks many-to-many joins even when confirmation is requested", () => {
    const evidence = analyzeJoinCandidate(
      { fields: [{ name: "key", type: "VARCHAR" }], rows: [{ key: "a" }, { key: "a" }] },
      { fields: [{ name: "key", type: "VARCHAR" }], rows: [{ key: "a" }, { key: "a" }] },
      "key", "key",
    );
    expect(evidence.expectedCardinality).toBe("many-to-many-risk");
    expect(() => validateJoinCandidate(evidence, { confirmed: true })).toThrow(/Many-to-many/);
  });

  it("requires confirmation for non-many-to-many joins", () => {
    const evidence = analyzeJoinCandidate(
      { fields: [{ name: "key", type: "VARCHAR" }], rows: [{ key: "a" }, { key: "b" }] },
      { fields: [{ name: "key", type: "VARCHAR" }], rows: [{ key: "a" }, { key: "b" }] },
      "key", "key",
    );
    expect(() => validateJoinCandidate(evidence)).toThrow(/confirmation/);
    expect(validateJoinCandidate(evidence, { confirmed: true })).toBe(true);
  });

  it("blocks joins with no bounded key overlap", () => {
    const evidence = analyzeJoinCandidate(
      { fields: [{ name: "key", type: "VARCHAR" }], rows: [{ key: "a" }] },
      { fields: [{ name: "key", type: "VARCHAR" }], rows: [{ key: "b" }] },
      "key", "key",
    );
    expect(() => validateJoinCandidate(evidence, { confirmed: true })).toThrow(/no overlapping/);
  });

  it("accepts compatible text families and ignores missing join keys", () => {
    const evidence = analyzeJoinCandidate(
      { fields: [{ name: "key", type: "text" }], rows: [{ key: " A " }, { key: "N/A" }, { key: "  " }] },
      { fields: [{ name: "key", type: "VARCHAR" }], rows: [{ key: "a" }, { key: "N/A" }, { key: "" }] },
      "key", "key",
    );
    expect(evidence.compatibleTypes).toBe(true);
    expect(evidence.normalizedOverlap).toBe(1);
  });

  it("limits dense chart display while retaining the full result list", () => {
    const rows = Array.from({ length: 80 }, (_, index) => ({ category: `Project ${index}`, value: index }));
    expect(chartRowsFor(rows)).toHaveLength(15);
    expect(rows).toHaveLength(80);
  });

  it("selects line charts only for explicit temporal dimensions", () => {
    expect(chartKindFor({ dimension: "date", timeField: "date" }, [{ name: "date", type: "DATE" }])).toBe("line");
    expect(chartKindFor({ dimension: "ZIP", timeField: "" }, [{ name: "ZIP", type: "VARCHAR", semanticRole: "zip-code" }])).toBe("bar");
    expect(chartKindFor({ dimension: "identifier", timeField: "" }, [{ name: "identifier", type: "DOUBLE", likelyIdentifier: true }])).toBe("bar");
  });
});
