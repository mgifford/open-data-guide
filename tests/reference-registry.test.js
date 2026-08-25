import { describe, expect, it } from "vitest";
import { checkReferenceCompatibility, planUniqueLookup } from "../src/reference/registry.js";

describe("bounded geographic reference registry", () => {
  it("requires approval and sends unique values rather than rows", () => {
    const plan = planUniqueLookup({ sourceId: "census-acs-static", role: "zcta", values: ["00501", "00501"], country: "US" });
    expect(plan.values).toEqual(["00501"]);
    expect(plan.approved).toBe(false);
    expect(plan.sendsUniqueValuesOnly).toBe(true);
    expect(plan.safeguards).toContain("ACS estimate and margin of error must remain paired");
  });

  it("checks compatibility without making a network request", () => {
    expect(checkReferenceCompatibility("census-acs-static", "https://example.test/acs.parquet").compatible).toBe(true);
    expect(checkReferenceCompatibility("census-acs-static", "file:///tmp/acs.parquet").compatible).toBe(false);
  });
});