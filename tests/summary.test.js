import { describe, expect, it } from "vitest";
import { buildSummaryPrompt, groundedNumbers, validateSummary, summarizeResult } from "../src/ai/summary.js";

const plan = { question: "count by state", aggregation: "count", dimension: "state", filters: [], limit: 100 };
const rows = [
  { category: "CA", value: 1250 },
  { category: "NY", value: 84 },
];

describe("AI result summary grounding", () => {
  it("frames the source data as untrusted and forbids new numbers", () => {
    const prompt = buildSummaryPrompt(plan, rows);
    expect(prompt).toMatch(/untrusted quoted data/);
    expect(prompt).toMatch(/never calculate/i);
    expect(prompt).toContain('"summary"');
  });

  it("grounds numbers present in the rows, plan filters, limit, and row count", () => {
    const grounded = groundedNumbers(rows, plan);
    expect(grounded.has(1250)).toBe(true);
    expect(grounded.has(84)).toBe(true);
    expect(grounded.has(100)).toBe(true);
    expect(grounded.has(rows.length)).toBe(true);
  });

  it("accepts a summary that only uses numbers from the result", () => {
    expect(validateSummary("CA has the largest value at 1,250 and NY the smallest at 84.", rows, plan)).toMatch(/CA has the largest/);
  });

  it("rejects a summary that introduces a number not in the result", () => {
    expect(() => validateSummary("The total across all states is 1334.", rows, plan)).toThrow(/introduced a number/);
  });

  it("rejects an empty summary", () => {
    expect(() => validateSummary("   ", rows, plan)).toThrow(/empty/);
  });

  it("summarizeResult passes through a grounded model response", async () => {
    const generate = async () => JSON.stringify({ summary: "There are 2 categories; CA is 1250 and NY is 84." });
    expect(await summarizeResult({ plan, rows, generate })).toMatch(/2 categories/);
  });

  it("summarizeResult rejects a hallucinated statistic from the model", async () => {
    const generate = async () => JSON.stringify({ summary: "The average payment was 667 dollars." });
    await expect(summarizeResult({ plan, rows, generate })).rejects.toThrow(/introduced a number/);
  });

  it("summarizeResult refuses when there is no result", async () => {
    await expect(summarizeResult({ plan, rows: [], generate: async () => "x" })).rejects.toThrow(/no result/);
  });
});
