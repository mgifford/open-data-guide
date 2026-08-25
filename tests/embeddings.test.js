import { describe, expect, it } from "vitest";
import { EMBEDDING_MODEL, EMBEDDING_MODEL_REVISION, EMBEDDING_MODEL_VERSION, embeddingCacheKey, semanticMatch } from "../src/ai/embeddings.js";

describe("semantic embedding cache", () => {
  it("includes canonical metadata text, model, and version in cache keys", async () => {
    const key = await embeddingCacheKey({ title: "Groundwater", fields: [{ name: "county", description: "County name" }] });
    expect(key).toMatch(/^[a-f0-9]{64}:/);
    expect(key).toContain(EMBEDDING_MODEL);
    expect(key).toContain(EMBEDDING_MODEL_REVISION);
    expect(key).toContain(EMBEDDING_MODEL_VERSION);
  });

  it("can cache catalog records without a source-file digest", async () => {
    expect(await embeddingCacheKey({ key: "dataset-a", title: "Groundwater" })).not.toBe("");
  });

  it("invalidates a cached key when embedded metadata changes", async () => {
    expect(await embeddingCacheKey({ title: "Groundwater" })).not.toBe(await embeddingCacheKey({ title: "Dry wells" }));
  });

  it("keeps deterministic evidence separate from semantic similarity", () => {
    const result = semanticMatch(
      { title: "County groundwater levels", publisher: "CNRA", fields: [{ name: "county", type: "VARCHAR" }] },
      { title: "County dry well reports", publisher: "CNRA", fields: [{ name: "county", type: "VARCHAR" }] },
      0.82,
    );
    expect(result.semantic).toBe(true);
    expect(result.score).toBe(0.82);
    expect(result.reasons).toEqual(expect.arrayContaining(["same publisher", "similar subject wording", "shared field names"]));
    expect(result.joinCandidate).toBe(false);
  });
});
