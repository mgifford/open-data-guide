import { describe, it, expect } from "vitest";
import { adviseChartKind, normalizeResults, fieldMetadata, describeResult, chartDescription } from "../../src/render/advisor.js";

const basicFields = [
  { name: "state", type: "VARCHAR" },
  { name: "amount_usd", type: "DOUBLE" },
  { name: "date", type: "DATE" },
];

const geoFields = [
  { name: "county", type: "VARCHAR", semanticRole: "fips" },
  { name: "value", type: "INTEGER" },
];

describe("visualization advisor", () => {
  it("recommends line chart for temporal dimension", () => {
    const plan = { aggregation: "count", dimension: "date", timeField: "date" };
    const advice = adviseChartKind(plan, basicFields, [{ category: "2024-01", value: 10 }]);
    expect(advice.kind).toBe("line");
    expect(advice.reason).toContain("Time series");
  });

  it("recommends bar chart for small categorical dimension", () => {
    const rows = [
      { category: "CA", value: 100 },
      { category: "TX", value: 80 },
      { category: "FL", value: 60 },
    ];
    const plan = { aggregation: "count", dimension: "state" };
    const advice = adviseChartKind(plan, basicFields, rows);
    expect(advice.kind).toBe("bar");
    expect(advice.reason).toContain("3 values");
  });

  it("recommends top-N bar chart for high-cardinality dimension", () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({
      category: `Item-${i}`,
      value: 100 - i,
    }));
    const plan = { aggregation: "count", dimension: "item_id" };
    const advice = adviseChartKind(plan, basicFields, rows);
    expect(advice.kind).toBe("bar");
    expect(advice.topN).toBe(15);
    expect(advice.otherCategory).toBe(true);
    expect(advice.warnings.length).toBeGreaterThan(0);
    expect(advice.warnings[0]).toContain("Showing top 15");
  });

  it("does not render 80-bar chart for bobcat-like dataset", () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({
      category: `Project-${String(i).padStart(3, "0")}`,
      value: Math.floor(Math.random() * 100),
    }));
    const plan = { aggregation: "count", dimension: "project_name" };
    const advice = adviseChartKind(plan, basicFields, rows);
    expect(advice.kind).toBe("bar");
    expect(advice.topN).toBe(15);
    
    const normalized = normalizeResults(rows, plan, advice);
    expect(normalized.length).toBeLessThanOrEqual(16); // 15 + Other
  });

  it("does not render 51-bar chart for dry-well-like dataset", () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      category: `County-${i}`,
      value: Math.floor(Math.random() * 100),
    }));
    const plan = { aggregation: "count", dimension: "county" };
    const advice = adviseChartKind(plan, basicFields, rows);
    expect(advice.kind).toBe("bar");
    expect(advice.topN).toBe(15);
    
    const normalized = normalizeResults(rows, plan, advice);
    expect(normalized.length).toBeLessThanOrEqual(16);
  });

  it("uses a labeled bar fallback for geographic identifiers", () => {
    const plan = { aggregation: "count", dimension: "county" };
    const advice = adviseChartKind(plan, geoFields, [{ category: "Alameda", value: 10 }]);
    expect(advice.kind).toBe("bar");
    expect(advice.geographicFallback).toBe(true);
    expect(advice.warnings[0]).toContain("reference geometry");
  });

  it("recommends a point map only for explicit coordinate results", () => {
    const plan = { aggregation: "count", dimension: "site_code" };
    const fields = [
      { name: "site_code", type: "VARCHAR" },
      { name: "latitude", type: "DOUBLE", semanticRole: "latitude" },
      { name: "longitude", type: "DOUBLE", semanticRole: "longitude" },
    ];
    const rows = [
      { category: "A-01", value: 1, latitude: 36.78, longitude: -119.42 },
      { category: "A-02", value: 1, latitude: 36.84, longitude: -119.31 },
    ];
    const advice = adviseChartKind(plan, fields, rows);
    expect(advice.kind).toBe("map");
    expect(advice.reason.toLowerCase()).toContain("point map");
    expect(advice.warnings[0].toLowerCase()).toContain("accessible");
  });

  it("does not recommend a map for grouped aggregate rows without coordinate values", () => {
    const plan = { aggregation: "count", dimension: "site_code" };
    const fields = [
      { name: "site_code", type: "VARCHAR" },
      { name: "latitude", type: "DOUBLE", semanticRole: "latitude" },
      { name: "longitude", type: "DOUBLE", semanticRole: "longitude" },
    ];
    const rows = [
      { category: "A-01", value: 1 },
      { category: "A-02", value: 1 },
    ];
    const advice = adviseChartKind(plan, fields, rows);
    expect(advice.kind).toBe("bar");
    expect(advice.reason.toLowerCase()).toContain("categorical");
  });

  it("returns table for no dimension", () => {
    const plan = { aggregation: "count" };
    const advice = adviseChartKind(plan, basicFields, [{ value: 1000 }]);
    expect(advice.kind).toBe("table");
    expect(advice.reason).toContain("table");
  });

  it("returns table for empty results", () => {
    const plan = { aggregation: "count", dimension: "state" };
    const advice = adviseChartKind(plan, basicFields, []);
    expect(advice.kind).toBe("table");
  });

  it("aggregates remaining rows into Other category", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      category: `Item-${i}`,
      value: 100 - i,
    }));
    const plan = { aggregation: "count", dimension: "item_id" };
    const advice = { kind: "bar", topN: 15, otherCategory: true };
    const normalized = normalizeResults(rows, plan, advice);
    
    expect(normalized.length).toBe(16);
    const otherRow = normalized.find((r) => r._isOtherCategory);
    expect(otherRow).toBeDefined();
    expect(otherRow.category).toBe("Other");
    expect(otherRow.value).toBeGreaterThan(0);
  });

  it("includes assumption notes for temporal fields", () => {
    const plan = { aggregation: "count", dimension: "date", timeField: "date" };
    const advice = adviseChartKind(plan, basicFields, [{ category: "2024-01", value: 10 }]);
    expect(advice.assumptions.length).toBeGreaterThan(0);
    expect(advice.assumptions[0]).toContain("time");
  });

  it("includes assumption notes for geographic fields", () => {
    const plan = { aggregation: "count", dimension: "county" };
    const advice = adviseChartKind(plan, geoFields, [{ category: "Alameda", value: 10 }]);
    expect(advice.assumptions.length).toBeGreaterThan(0);
    expect(advice.assumptions[0]).toContain("labeled data");
  });

  it("includes assumption notes for top-N truncation", () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({
      category: `Item-${i}`,
      value: 100 - i,
    }));
    const plan = { aggregation: "count", dimension: "item_id" };
    const advice = adviseChartKind(plan, basicFields, rows);
    expect(advice.assumptions.length).toBeGreaterThan(0);
  });

  it("classifies fields correctly", () => {
    const metadata = fieldMetadata(basicFields);
    expect(metadata.date.isTemporal).toBe(true);
    expect(metadata.amount_usd.isNumeric).toBe(true);
    expect(metadata.state.isGeographic).toBeFalsy();
  });

  it("classifies geographic fields correctly", () => {
    const metadata = fieldMetadata(geoFields);
    expect(metadata.county.isGeographic).toBe(true);
  });

  it("generates result description for count by dimension", () => {
    const plan = { aggregation: "count", dimension: "state" };
    const desc = describeResult(plan, { kind: "bar" }, 5, 5);
    expect(desc).toContain("Count of records");
    expect(desc).toContain("grouped by state");
  });

  it("generates result description for time-series", () => {
    const plan = { aggregation: "count", dimension: "date", timeField: "date" };
    const desc = describeResult(plan, { kind: "line" }, 12, 12);
    expect(desc).toContain("over time");
  });

  it("generates result description with filters", () => {
    const plan = {
      aggregation: "sum",
      measure: "amount_usd",
      dimension: "state",
      filters: [{ field: "state", operator: "equals", value: "CA" }],
    };
    const desc = describeResult(plan, { kind: "bar" }, 1, 1);
    expect(desc).toContain("sum of amount_usd");
    expect(desc).toContain("filters");
  });

  it("generates chart description for bar chart", () => {
    const rows = [
      { category: "CA", value: 100 },
      { category: "TX", value: 80 },
    ];
    const plan = { aggregation: "count", dimension: "state" };
    const desc = chartDescription(plan, { kind: "bar" }, rows);
    expect(desc).toContain("Bar chart");
    expect(desc).toContain("2 categories");
  });

  it("generates chart description for line chart", () => {
    const rows = [
      { category: "2024-01", value: 10 },
      { category: "2024-02", value: 20 },
    ];
    const plan = { aggregation: "count", dimension: "date" };
    const desc = chartDescription(plan, { kind: "line" }, rows);
    expect(desc).toContain("Line chart");
  });

  it("includes chart warnings in description", () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({
      category: `Item-${i}`,
      value: 100 - i,
    }));
    const plan = { aggregation: "count", dimension: "item_id" };
    const advice = adviseChartKind(plan, basicFields, rows);
    const desc = chartDescription(plan, advice, rows);
    expect(desc).toContain("Note:");
  });

  it("does not combine non-additive high-cardinality values into Other", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ category: `Item-${i}`, value: 100 - i }));
    const advice = adviseChartKind({ aggregation: "avg", dimension: "item_id" }, basicFields, rows);
    expect(advice.otherCategory).toBe(false);
    expect(normalizeResults(rows, { aggregation: "avg", dimension: "item_id" }, advice)).toHaveLength(15);
    expect(advice.assumptions[0]).toContain("not combined");
  });

  it("keeps Other in the chart row limit", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ category: `Item-${i}`, value: 1 }));
    const advice = adviseChartKind({ aggregation: "count", dimension: "item_id" }, basicFields, rows);
    const normalized = normalizeResults(rows, { aggregation: "count", dimension: "item_id" }, advice);
    expect(normalized.at(-1)._isOtherCategory).toBe(true);
    expect(normalized).toHaveLength(16);
  });

  it("retains all top 15 categories plus Other", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ category: `Item-${i}`, value: i + 1 }));
    const advice = adviseChartKind({ aggregation: "count", dimension: "item_id" }, basicFields, rows);
    const normalized = normalizeResults(rows, { aggregation: "count", dimension: "item_id" }, advice);
    expect(normalized.slice(0, 15).map((row) => row.category)).toEqual(rows.slice(0, 15).map((row) => row.category));
    expect(normalized[15]._isOtherCategory).toBe(true);
  });
});
