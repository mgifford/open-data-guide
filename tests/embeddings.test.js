import { describe, expect, it } from "vitest";
import { EMBEDDING_MODEL, EMBEDDING_MODEL_VERSION, embeddingCacheKey, semanticMatch } from "../src/ai/embeddings.js";

describe("semantic embedding cache", () => {
  it("includes source digest, model, and version in cache keys", () => {
    const key = embeddingCacheKey({ sourceDigest: "digest-a" });
    expect(key).toContain("digest-a");
    expect(key).toContain(EMBEDDING_MODEL);
    expect(key).toContain(EMBEDDING_MODEL_VERSION);
  });

  it("does not cache datasets without a source digest", () => {
    expect(embeddingCacheKey({ key: "dataset-a" })).toBe("");
  });

  it("invalidates a cached key when the source digest changes", () => {
    expect(embeddingCacheKey({ sourceDigest: "digest-a" })).not.toBe(embeddingCacheKey({ sourceDigest: "digest-b" }));
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
