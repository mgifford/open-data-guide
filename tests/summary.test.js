import { describe, expect, it } from "vitest";
import { buildFactPacket, validateFactSummary, summarizeResult } from "../src/ai/summary.js";

const plan = { aggregation: "count", dimension: "state", filters: [], dateGrain: null };
const result = { rows: [{ category: "CA", value: 1250 }, { category: "NY", value: 84 }], total: null, scanned: null, truncated: false };
const packet = buildFactPacket(plan, result);

function sentences(...texts) {
  return { sentences: texts.map((text) => ({ text, factIds: [] })) };
}

describe("deterministic fact packet", () => {
  it("computes largest, smallest, and row count over the full result", () => {
    expect(packet.facts.largest).toEqual({ category: "CA", value: 1250 });
    expect(packet.facts.smallest).toEqual({ category: "NY", value: 84 });
    expect(packet.facts.rowCount).toBe(2);
    expect(packet.scope.coversCompleteResult).toBe(true);
  });

  it("marks a large grouped result as partial and warns", () => {
    const rows = Array.from({ length: 150 }, (_, index) => ({ category: `c${index}`, value: index }));
    const big = buildFactPacket(plan, { rows, truncated: false });
    expect(big.scope.coversCompleteResult).toBe(false);
    expect(big.pairs).toHaveLength(100);
    expect(big.facts.largest.value).toBe(149);
    expect(big.warnings.join(" ")).toMatch(/first 100 of 150/);
  });
});

describe("fact summary validation", () => {
  it("accepts a grounded, correctly attributed summary", () => {
    expect(validateFactSummary(sentences("CA has the largest value at 1,250 and NY the smallest at 84."), packet)).toMatch(/CA has the largest/);
  });

  it("rejects a new number", () => {
    expect(() => validateFactSummary(sentences("The total across states is 1334."), packet)).toThrow(/number that is not in the result/);
  });

  it("rejects an existing number attached to the wrong category", () => {
    expect(() => validateFactSummary(sentences("NY has 1,250 records."), packet)).toThrow(/wrong category/);
  });

  it("rejects a reversed ranking", () => {
    expect(() => validateFactSummary(sentences("NY is the highest state."), packet)).toThrow(/reversed the deterministic ranking/);
  });

  it("rejects a trend claim without an ordered time dimension", () => {
    expect(() => validateFactSummary(sentences("The count increased across the states."), packet)).toThrow(/trend without an ordered time/);
  });

  it("rejects a causal claim", () => {
    expect(() => validateFactSummary(sentences("There are more records because of population."), packet)).toThrow(/causation/);
  });

  it("rejects advice", () => {
    expect(() => validateFactSummary(sentences("You should focus on CA."), packet)).toThrow(/advice/);
  });

  it("rejects a percentage not in the packet", () => {
    expect(() => validateFactSummary(sentences("CA holds 94% of the records."), packet)).toThrow(/percentage/);
  });

  it("rejects a fabricated fact reference", () => {
    expect(() => validateFactSummary({ sentences: [{ text: "CA is 1250.", factIds: ["fact:invented"] }] }, packet)).toThrow(/fact that does not exist/);
  });

  it("allows a trend claim when a date grain orders the result", () => {
    const timed = buildFactPacket({ aggregation: "count", dimension: "paid_on", dateGrain: "month" }, { rows: [{ category: "2025-01", value: 5 }, { category: "2025-02", value: 9 }] });
    expect(validateFactSummary(sentences("The count increased from 5 to 9."), timed)).toMatch(/increased/);
  });
});

describe("summarizeResult orchestration", () => {
  it("passes through a grounded structured response", async () => {
    const generate = async () => JSON.stringify({ sentences: [{ text: "There are 2 rows; CA is 1250.", factIds: ["fact:rowCount", "pair:0"] }] });
    const summary = await summarizeResult({ packet, generate });
    expect(summary.text).toMatch(/2 rows/);
    expect(summary.schemaVersion).toBe(1);
  });

  it("rejects a hallucinated statistic from the model", async () => {
    const generate = async () => JSON.stringify({ sentences: [{ text: "The average payment was 667.", factIds: [] }] });
    await expect(summarizeResult({ packet, generate })).rejects.toThrow(/number that is not in the result/);
  });

  it("refuses an incomplete (truncated) result", async () => {
    const incomplete = buildFactPacket(plan, { rows: [{ category: "CA", value: 1250 }], truncated: true, total: 9000, scanned: 100 });
    await expect(summarizeResult({ packet: incomplete, generate: async () => "x" })).rejects.toThrow(/incomplete result/i);
  });

  it("refuses when there is no result", async () => {
    const empty = buildFactPacket(plan, { rows: [] });
    await expect(summarizeResult({ packet: empty, generate: async () => "x" })).rejects.toThrow(/no result/);
  });
});
