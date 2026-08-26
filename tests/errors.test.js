import { describe, expect, it } from "vitest";
import { classifyLoadError, classifyResourceError } from "../src/ui/errors.js";

describe("dataset resolution failures", () => {
  it("identifies a CORS block", () => {
    expect(classifyLoadError(new Error("The catalog may block cross-origin requests."))).toMatch(/Cross-origin \(CORS\) block/);
  });

  it("identifies an unsupported format or address", () => {
    expect(classifyLoadError(new Error("Only public HTTP or HTTPS URLs are supported."))).toMatch(/Unsupported format or address/);
  });

  it("identifies a network failure", () => {
    expect(classifyLoadError(new Error("Failed to fetch"))).toMatch(/Network failure/);
  });
});

describe("resource load failures", () => {
  it("identifies a size refusal separately from other errors", () => {
    expect(classifyResourceError(new Error("Automatic browser loading is refused above 500 MB."))).toMatch(/Size refusal/);
  });

  it("identifies an unsupported or unreadable format", () => {
    expect(classifyResourceError(new Error("read_parquet failed: Invalid file"))).toMatch(/Unsupported or unreadable format/);
  });

  it("identifies a network or CORS failure", () => {
    expect(classifyResourceError(new Error("Failed to fetch"))).toMatch(/Network or CORS failure/);
  });

  it("keeps the four resource-load categories distinct", () => {
    const size = classifyResourceError(new Error("refused: 500 MB memory budget"));
    const format = classifyResourceError(new Error("unsupported format"));
    const network = classifyResourceError(new Error("load failed"));
    const other = classifyResourceError(new Error("something else"));
    expect(new Set([size, format, network, other]).size).toBe(4);
  });
});
