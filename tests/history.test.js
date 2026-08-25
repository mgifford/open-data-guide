import { describe, expect, it } from "vitest";
import { boundedPreview, digestText, fieldMapping, sourceChanged } from "../src/catalog/history.js";

describe("local query history safeguards", () => {
  it("bounds stored previews", () => {
    expect(boundedPreview(Array.from({ length: 30 }, (_, index) => ({ index })))).toHaveLength(20);
  });

  it("detects changed source digests and resource URLs", () => {
    const record = { sourceDigests: ["old"], resourceUrls: ["https://example.test/a.csv"] };
    expect(sourceChanged({ sourceDigest: "new" }, record)).toBe(true);
    expect(sourceChanged({ sourceDigest: "old", resources: [{ url: "https://example.test/b.csv" }] }, record)).toBe(true);
    expect(sourceChanged({ sourceDigest: "old", resources: [{ url: "https://example.test/a.csv" }] }, record)).toBe(false);
  });

  it("requires review for renamed or missing fields", () => {
    expect(fieldMapping([{ name: "ZIP" }, { name: "amount" }], [{ name: "zip" }])).toEqual([
      { from: "ZIP", candidates: ["zip"], status: "suggested", requiresReview: true },
      { from: "amount", candidates: [], status: "missing", requiresReview: true },
    ]);
  });

  it("creates a stable digest for unchanged source text", async () => {
    expect(await digestText("a,b\n1,2\n")).toBe(await digestText("a,b\n1,2\n"));
    expect(await digestText("a,b\n1,3\n")).not.toBe(await digestText("a,b\n1,2\n"));
  });
});