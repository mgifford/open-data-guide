import { describe, expect, it } from "vitest";
import { cosineSimilarity, relatedDatasets } from "../src/catalog/related.js";
import { analyzeJoinCandidate } from "../src/catalog/relationships.js";
import { chartRowsFor } from "../src/render/chart.js";

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

  it("limits dense chart display while retaining the full result list", () => {
    const rows = Array.from({ length: 80 }, (_, index) => ({ category: `Project ${index}`, value: index }));
    expect(chartRowsFor(rows)).toHaveLength(15);
    expect(rows).toHaveLength(80);
  });
});
