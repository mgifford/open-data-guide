import { describe, expect, it } from "vitest";
import { compilePlan, interpretQuestion, quoteIdentifier, quoteLiteral } from "../src/query/plan.js";

const fields = [
  { name: "state", type: "VARCHAR" },
  { name: "amount_usd", type: "DOUBLE" },
];

describe("constrained query plans", () => {
  it("interprets an average grouped by a named field", () => {
    expect(interpretQuestion("average amount usd by state", fields)).toMatchObject({
      version: 1, status: "ready", aggregation: "avg", measure: "amount_usd", dimension: "state",
    });
  });

  it("compiles only validated fields", () => {
    const sql = compilePlan({ aggregation: "sum", measure: "amount_usd", dimension: "state" }, fields);
    expect(sql).toContain('sum("amount_usd")');
    expect(sql).toContain('GROUP BY "state"');
  });

  it("escapes SQL identifiers", () => {
    expect(quoteIdentifier('a"b')).toBe('"a""b"');
  });

  it("rejects invented fields", () => {
    expect(() => compilePlan({ aggregation: "sum", measure: "invented", dimension: "" }, fields)).toThrow(/measure field/);
  });

  it("compiles escaped filters and distinct counts", () => {
    const sql = compilePlan({
      aggregation: "distinct_count", measure: "state", dimension: "", limit: 25,
      filters: [{ field: "state", operator: "equals", value: "O'Reilly" }],
    }, fields);
    expect(sql).toContain('count(DISTINCT "state")');
    expect(sql).toContain("WHERE \"state\" = 'O''Reilly'");
    expect(sql).toContain("LIMIT 25");
    expect(quoteLiteral("a'b")).toBe("'a''b'");
  });

  it("returns a clarification for causal questions", () => {
    expect(interpretQuestion("how did payments change by state", fields)).toMatchObject({
      status: "needs-clarification",
      clarification: { choices: expect.arrayContaining(["Compare a numeric measure"]) },
    });
  });

  it("rejects unbounded result limits", () => {
    expect(() => compilePlan({ aggregation: "count", limit: 5000 }, fields)).toThrow(/limit/);
  });

  it("does not reference a grouping alias for an overall result", () => {
    const sql = compilePlan({ aggregation: "count", dimension: "" }, fields);
    expect(sql).toContain("ORDER BY value DESC");
    expect(sql).not.toContain("category ASC");
  });

  it("rejects numeric calculations over postal and Census geography codes", () => {
    expect(() => compilePlan({ aggregation: "avg", measure: "state", dimension: "" }, [{ name: "state", type: "VARCHAR", semanticRole: "zip-code" }])).toThrow(/labels/);
    expect(() => compilePlan({ aggregation: "distinct_count", measure: "state", dimension: "" }, [{ name: "state", type: "VARCHAR", semanticRole: "zip-code" }])).not.toThrow();
  });
});
