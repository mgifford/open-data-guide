import { describe, expect, it } from "vitest";
import { confirmAxisFromValues, describePointGeography, editDistance, inferPointFields } from "../src/data/geo-inference.js";

// A few California groundwater-station-shaped rows (values, not headers, carry
// the meaning here).
const CA_ROWS = [
  { site: "A", LATITUDE: 38.58, LONGITUDE: -121.49 },
  { site: "B", LATITUDE: 34.05, LONGITUDE: -118.24 },
  { site: "C", LATITUDE: 37.77, LONGITUDE: -122.42 },
  { site: "D", LATITUDE: 36.74, LONGITUDE: -119.77 },
];

const fieldsFor = (row) => Object.keys(row).map((name) => ({ name, type: typeof row[name] === "number" ? "DOUBLE" : "VARCHAR" }));

describe("value-based coordinate inference", () => {
  it("confirms a latitude column from its values", () => {
    const result = confirmAxisFromValues(CA_ROWS, "LATITUDE", "latitude");
    expect(result.ok).toBe(true);
    expect(result.inRange).toBe(4);
  });

  it("rejects a column whose values fall outside the coordinate range", () => {
    const rows = [{ pop: 100000 }, { pop: 250000 }, { pop: 90000 }];
    expect(confirmAxisFromValues(rows, "pop", "latitude").ok).toBe(false);
  });

  it("rejects a constant column even if it is technically in range", () => {
    const rows = [{ z: 5 }, { z: 5 }, { z: 5 }];
    expect(confirmAxisFromValues(rows, "z", "latitude").ok).toBe(false);
  });

  it("finds the latitude/longitude pair when headers are spelled correctly", () => {
    const inferred = inferPointFields(fieldsFor(CA_ROWS[0]), CA_ROWS);
    expect(inferred?.latitude.name).toBe("LATITUDE");
    expect(inferred?.longitude.name).toBe("LONGITUDE");
    expect(inferred?.method).toBe("header");
  });

  it("recognises a MISSPELLED latitude header via its values", () => {
    const rows = CA_ROWS.map((row) => ({ site: row.site, lattitude: row.LATITUDE, longitde: row.LONGITUDE }));
    const inferred = inferPointFields(fieldsFor(rows[0]), rows);
    expect(inferred).not.toBeNull();
    expect(inferred.latitude.name).toBe("lattitude");
    expect(inferred.longitude.name).toBe("longitde");
    expect(inferred.method).toBe("fuzzy-header");
  });

  it("recognises coordinates from values even with a cryptic header", () => {
    const rows = CA_ROWS.map((row) => ({ id: row.site, field_7: row.LATITUDE, field_8: row.LONGITUDE }));
    const inferred = inferPointFields(fieldsFor(rows[0]), rows);
    expect(inferred).not.toBeNull();
    expect(inferred.method).toBe("values");
  });

  it("returns null when no coordinate-like columns exist", () => {
    const rows = [{ county: "Kern", count: 12 }, { county: "Inyo", count: 4 }, { county: "Mono", count: 7 }];
    expect(inferPointFields(fieldsFor(rows[0]), rows)).toBeNull();
  });
});

describe("point geography summary", () => {
  it("reports a bounding box, centroid, and California as the containing region", () => {
    const summary = describePointGeography("LATITUDE", "LONGITUDE", CA_ROWS);
    expect(summary.count).toBe(4);
    expect(summary.matchedRegions.map((region) => region.id)).toContain("california");
    expect(summary.matchedRegions[0].id).toBe("california");
    expect(summary.text).toMatch(/California/);
  });

  it("asserts no place when points fall outside every bundled extent", () => {
    const rows = [{ lat: 51.5, lon: -0.12 }, { lat: 48.85, lon: 2.35 }, { lat: 41.9, lon: 12.5 }];
    const summary = describePointGeography("lat", "lon", rows);
    expect(summary.matchedRegions).toHaveLength(0);
    expect(summary.text).toMatch(/no place name is asserted/);
  });
});

describe("edit distance", () => {
  it("scores small typos within threshold and unrelated words above it", () => {
    expect(editDistance("lattitude", "latitude")).toBeLessThanOrEqual(2);
    expect(editDistance("county", "latitude")).toBeGreaterThan(2);
  });
});
