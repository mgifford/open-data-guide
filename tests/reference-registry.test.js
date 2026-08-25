import { describe, expect, it } from "vitest";
import { checkReferenceCompatibility, planUniqueLookup } from "../src/reference/registry.js";

describe("bounded geographic reference registry", () => {
  it("requires approval and sends unique values rather than rows", () => {
    const plan = planUniqueLookup({ sourceId: "census-acs-static", role: "zcta", values: ["00501", "00501"], country: "US", sourceVintage: "2023 ACS 5-year", sourceDigest: "abc", estimateField: "B01001_001E", marginOfErrorField: "B01001_001M" });
    expect(plan.values).toEqual(["00501"]);
    expect(plan.approved).toBe(false);
    expect(plan.sendsUniqueValuesOnly).toBe(true);
    expect(plan.sourceVintage).toBe("2023 ACS 5-year");
    expect(plan.estimateField).toBe("B01001_001E");
    expect(plan.safeguards).toContain("ACS estimate and margin of error must remain paired");
  });

  it("checks compatibility without making a network request", () => {
    expect(checkReferenceCompatibility("census-acs-static", "https://example.test/acs.parquet").compatible).toBe(true);
    expect(checkReferenceCompatibility("census-acs-static", "file:///tmp/acs.parquet").compatible).toBe(false);
    expect(checkReferenceCompatibility("local-http-mcp", "https://example.test/lookup").compatible).toBe(false);
    expect(checkReferenceCompatibility("local-http-mcp", "http://localhost:8787/lookup").compatible).toBe(true);
  });
});