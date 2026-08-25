import { describe, expect, it } from "vitest";
import { boundedPreview, digestText, fieldMapping, historyStatus, sourceChanged } from "../src/catalog/history.js";

describe("local query history safeguards", () => {
  it("bounds stored previews", () => {
    expect(boundedPreview(Array.from({ length: 30 }, (_, index) => ({ index })))).toHaveLength(20);
  });

  it("detects changed source digests and resource URLs", () => {
    const record = { datasetKeys: ["dataset-a"], sourceDigests: ["old"], resourceIds: ["resource-a"], resourceUrls: ["https://example.test/a.csv"] };
    expect(sourceChanged({ key: "dataset-a", sourceDigest: "new" }, record)).toBe(true);
    expect(sourceChanged({ key: "dataset-a", sourceDigest: "old", resources: [{ id: "resource-a", url: "https://example.test/b.csv" }] }, record)).toBe(true);
    expect(sourceChanged({ key: "other-dataset", sourceDigest: "new", resources: [{ id: "resource-b", url: "https://example.test/b.csv" }] }, record)).toBe(false);
    expect(sourceChanged({ key: "dataset-a", sourceDigest: "old", selectedResource: { id: "resource-a", url: "https://example.test/a.csv" } }, record)).toBe(false);
    expect(historyStatus({ key: "other-dataset", sourceDigest: "new" }, record)).toBe("different-dataset");
    expect(historyStatus({ key: "dataset-a", sourceDigest: "new" }, record)).toBe("stale");
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