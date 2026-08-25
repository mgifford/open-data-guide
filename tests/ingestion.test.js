import { describe, expect, it } from "vitest";
import { decodeUtf8, detectDelimiter, formatDisplayValue, parseDelimited, profileRows, shouldRefuseResource } from "../src/data/ingestion.js";
import reservoirCsv from "./fixtures/cnra-reservoir.csv?raw";

const dryWell = "Report Date;County;Note\n2024-01-01;Alameda;\"well; repaired\"\n2024-02-01;None;\"line one\nline two\"\n";

describe("deterministic ingestion and profiling", () => {
  it("detects delimiters and preserves quoted newlines", () => {
    expect(detectDelimiter(dryWell)).toBe(";");
    expect(parseDelimited(dryWell)).toHaveLength(3);
    expect(parseDelimited(dryWell)[2][2]).toBe("line one\nline two");
  });

  it("normalizes sentinels while retaining raw values", () => {
    const profile = profileRows(reservoirCsv);
    expect(profile.rawRows[1]["Elevation Feet"]).toBe("None");
    expect(profile.normalizedRows[1]["Elevation Feet"]).toBeNull();
    expect(profile.fields.find((field) => field.name === "Elevation Feet")).toMatchObject({ sentinelCount: 1, inferredType: "number", minimum: 700.5, maximum: 702.1 });
  });

  it("reports date ranges and formats epoch display values", () => {
    const profile = profileRows(reservoirCsv);
    expect(profile.fields.find((field) => field.name === "Observation Date").dateRange).toEqual(["2025-01-01T00:00:00.000Z", "2025-01-03T00:00:00.000Z"]);
    expect(formatDisplayValue(Date.parse("2025-01-01T00:00:00Z"), "Observation Date")).toBe("2025-01-01T00:00:00.000Z");
  });

  it("rejects invalid UTF-8 instead of silently decoding it", () => {
    expect(() => decodeUtf8(new Uint8Array([0xc3, 0x28]))).toThrow(/UTF-8/);
  });

  it("refuses resources above the browser memory budget", () => {
    expect(shouldRefuseResource(500_000_001)).toBe(true);
    expect(shouldRefuseResource(500_000_000)).toBe(false);
  });
});
