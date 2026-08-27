import { describe, expect, it } from "vitest";
import { decodeUtf8, describeFieldObservations, detectDelimiter, formatDisplayValue, parseDelimited, profileRows, shouldRefuseResource, validateHeaders } from "../src/data/ingestion.js";
import { detectSemanticRole, normalizeGeographicValue, validateGeographicValue } from "../src/data/geography.js";
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

  it("does not infer ordinary text as numeric when Number returns null", () => {
    const profile = profileRows("state,payment_category,payment_date\nCA,Food,2025-01-01\nNY,Travel,2025-01-02\n");
    expect(profile.fields.map((field) => field.inferredType)).toEqual(["text", "text", "date"]);
  });

  it("treats whitespace and case variants of sentinels as missing", () => {
    const profile = profileRows("amount,label\n , none\n12,NULL\n");
    expect(profile.fields[0]).toMatchObject({ inferredType: "number", nullCount: 1, sentinelCount: 1 });
    expect(profile.fields[1]).toMatchObject({ inferredType: "text", nullCount: 2, sentinelCount: 2 });
  });

  it("rejects empty and duplicate headers instead of dropping columns", () => {
    expect(() => validateHeaders(["state", " "])).toThrow(/empty/);
    expect(() => profileRows("State,state\nCA,CA\n")).toThrow(/duplicate/);
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

  it("detects geographic roles and preserves postal strings", () => {
    expect(detectSemanticRole("ZIP")).toBe("zip-code");
    expect(detectSemanticRole("postal_code")).toBe("postal-code");
    expect(detectSemanticRole("ZIP Plus 4")).toBe("zip-plus-four");
    expect(detectSemanticRole("zcta_code")).toBe("zcta");
    expect(detectSemanticRole("county_fips")).toBe("fips");
    expect(detectSemanticRole("latitude")).toBe("latitude");
    expect(detectSemanticRole("longitude")).toBe("longitude");
    expect(profileRows("ZIP\n00501\n02108\n90210\n90210-1234\nK1P 5G4\nNot supplied\n").fields[0]).toMatchObject({ semanticRole: "zip-code", inferredType: "text", sentinelCount: 1 });
    expect(normalizeGeographicValue("00501", "zip-code")).toEqual({ rawValue: "00501", normalizedValue: "00501" });
    expect(normalizeGeographicValue("90210-1234", "zip-plus-four").normalizedValue).toBe("90210-1234");
  });

  it("requires country context and distinguishes USPS formats from ZCTA", () => {
    expect(validateGeographicValue("00501", "zip-code").status).toBe("country-required");
    expect(validateGeographicValue("00501", "zip-code", "US").status).toBe("valid-format");
    expect(validateGeographicValue("90210-1234", "zip-plus-four", "US").status).toBe("valid-format");
    expect(validateGeographicValue("K1P 5G4", "postal-code", "CA").status).toBe("valid-format");
    expect(validateGeographicValue("90210", "zcta", "US").status).toBe("not-a-postal-validation");
    expect(validateGeographicValue("Not supplied", "postal-code", "US").status).toBe("missing");
  });
});

describe("deterministic field observations", () => {
  it("infers a unit from trailing marks without asserting it as a definition", () => {
    const field = { name: "Well Depth", inferredType: "text", distinctCount: 4, nullCount: 0 };
    const notes = describeFieldObservations(field, ["45'", "47'", "85'", "44'"], 4);
    expect(notes.join(" ")).toMatch(/feet/);
  });

  it("flags comparison markers as approximate values", () => {
    const field = { name: "Well to Water Depth", inferredType: "text", distinctCount: 3, nullCount: 0 };
    const notes = describeFieldObservations(field, [">45'", "44'", ">85'"], 3);
    expect(notes.join(" ")).toMatch(/approximate/);
    expect(notes.join(" ")).toMatch(/feet/);
  });

  it("recognizes a small controlled vocabulary as categorical", () => {
    const field = { name: "Shortage Type", inferredType: "text", distinctCount: 2, nullCount: 0 };
    const notes = describeFieldObservations(field, ["Dry well (groundwater)", "Dry well (groundwater)", "Reduced flow"], 3);
    expect(notes.join(" ")).toMatch(/categorical: 2 distinct/);
  });

  it("recognizes an all-distinct column as a likely identifier", () => {
    const field = { name: "ID", inferredType: "text", distinctCount: 3, nullCount: 0, likelyIdentifier: true };
    const notes = describeFieldObservations(field, ["3102", "3103", "3105"], 3);
    expect(notes.join(" ")).toMatch(/identifier/);
  });

  it("reports numeric range and missing counts, and stays quiet on plain columns", () => {
    const numeric = { name: "Cost", inferredType: "number", minimum: 100, maximum: 900, nullCount: 1 };
    const numericNotes = describeFieldObservations(numeric, ["100", "500", "900"], 4);
    expect(numericNotes.join(" ")).toMatch(/range 100 to 900/);
    expect(numericNotes.join(" ")).toMatch(/1 of 4/);
    expect(describeFieldObservations(null)).toEqual([]);
  });

  it("surfaces a geographic role as a plain observation", () => {
    const field = { name: "LATITUDE", semanticRole: "latitude", inferredType: "number", minimum: 37.5, maximum: 37.7, nullCount: 0 };
    expect(describeFieldObservations(field, ["37.65", "37.63"], 2).join(" ")).toMatch(/latitude/i);
  });
});
