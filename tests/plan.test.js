import { describe, expect, it } from "vitest";
import { compilePlan, interpretQuestion, quoteIdentifier, quoteLiteral } from "../src/query/plan.js";
import evaluationCases from "./query-planning-evaluation.json";
import { evaluatePlanningCases } from "../src/ai/evaluation.js";

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

  it("rejects averages over categorical fields", () => {
    expect(() => compilePlan({ aggregation: "avg", measure: "state", dimension: "" }, fields)).toThrow(/numeric measure/);
  });

  it("compiles ranked queries with explicit direction and limit", () => {
    const sql = compilePlan({ aggregation: "count", dimension: "state", order: "asc", limit: 5 }, fields);
    expect(sql).toContain('ORDER BY value ASC, category ASC');
    expect(sql).toContain("LIMIT 5");
  });

  it("requires a date choice when change questions have multiple date fields", () => {
    const result = interpretQuestion("How have dry well reports changed over time?", [
      { name: "Report Date", type: "DATE" },
      { name: "Create Date", type: "DATE" },
    ]);
    expect(result.status).toBe("needs-clarification");
    expect(result.clarification.choices).toEqual(["Report Date", "Create Date"]);
  });

  it("proposes the only date field without silently hiding the choice", () => {
    const result = interpretQuestion("How did storage change over time?", [
      { name: "Observation Date", type: "DATE" },
      { name: "Storage", type: "DOUBLE" },
    ]);
    expect(result.timeField).toBe("Observation Date");
    expect(result.assumptions[0]).toMatch(/review/);
  });

  it("executes the bounded planning evaluation set", async () => {
    expect(evaluationCases).toHaveLength(40);
    expect(new Set(evaluationCases.map((item) => item.kind))).toEqual(new Set(["ready", "clarification", "rejection"]));
    const results = await evaluatePlanningCases(evaluationCases, [
      { name: "state", type: "VARCHAR" }, { name: "amount_usd", type: "DOUBLE" }, { name: "payment_date", type: "DATE" }, { name: "county", type: "VARCHAR" }, { name: "site", type: "VARCHAR" },
      { name: "ZIP", type: "VARCHAR", semanticRole: "zip-code" }, { name: "FIPS", type: "VARCHAR", semanticRole: "fips" },
    ]);
    expect(results.every((result) => result.passed)).toBe(true);
  });
});
