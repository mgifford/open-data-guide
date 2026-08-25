import { describe, expect, it } from "vitest";
import { validateWorkspace, workspaceStoreNames } from "../src/catalog/storage.js";

describe("versioned workspace contract", () => {
  it("defines all version 3 workspace stores", () => {
    expect(workspaceStoreNames()).toEqual(["datasets", "resources", "fields", "relationships", "queries", "embeddings", "preferences"]);
  });

  it("validates a complete current workspace export", () => {
    const records = Object.fromEntries(workspaceStoreNames().map((name) => [name, []]));
    expect(validateWorkspace({ version: 3, records })).toBe(true);
  });

  it("rejects incomplete or older workspace exports", () => {
    expect(() => validateWorkspace({ version: 2, records: {} })).toThrow(/version 3/);
    expect(() => validateWorkspace({ version: 3, records: { datasets: [] } })).toThrow(/resources/);
  });
});
