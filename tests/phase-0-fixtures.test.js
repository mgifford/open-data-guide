import { describe, expect, it } from "vitest";
import fixtureManifest from "./fixtures/cnra-fixtures.json";
import reservoirCsv from "./fixtures/cnra-reservoir.csv?raw";
import bobcatCsv from "./fixtures/cnra-bobcat.csv?raw";
import dryWellCsv from "./fixtures/cnra-dry-well.csv?raw";

const fixtureText = {
  "cnra-reservoir.csv": reservoirCsv,
  "cnra-bobcat.csv": bobcatCsv,
  "cnra-dry-well.csv": dryWellCsv,
};

describe("Phase 0 CNRA integration fixtures", () => {
  it("keeps the three live exploration targets local and inspectable", () => {
    expect(fixtureManifest.version).toBe(1);
    expect(fixtureManifest.datasets).toHaveLength(3);
    fixtureManifest.datasets.forEach((dataset) => {
      expect(dataset.url).toMatch(/^https:\/\/data\.cnra\.ca\.gov\/dataset\//);
      expect(fixtureText[dataset.localFile]).toContain("\n");
    });
  });

  it("contains the reservoir mixed-type sentinel observed in live data", () => {
    expect(reservoirCsv).toContain("None");
    expect(reservoirCsv).toContain("Elevation Feet");
  });

  it("contains multiple dry-well date candidates and an explicit missing label", () => {
    expect(dryWellCsv).toContain("Report Date,Create Date,Approximate Issue Start Date");
    expect(dryWellCsv).toContain("Not supplied");
  });

  it("records the high-cardinality chart cases without downloading live data", () => {
    expect(fixtureManifest.datasets[1].observed).toContain("80 project_name categories in live exploration");
    expect(fixtureManifest.datasets[2].observed).toContain("51 County categories in live exploration");
  });

  it.todo("reproduce the reservoir None conversion failure through the DuckDB resource harness");
  it.todo("reproduce epoch-millisecond date display in the rendered preview");
  it.todo("reproduce the 80-category bobcat chart and assert the dense default");
  it.todo("reproduce the 51-category dry-well chart and missing-value category");
  it.todo("reproduce an underspecified dry-well time question requiring clarification");
});
