import { test, expect } from "@playwright/test";

// A CSV whose coordinate headers are misspelled ("lattitude", "longitde") to
// prove the map is driven by value-based inference, not header spelling.
const CSV = [
  "site,lattitude,longitde",
  "Sacramento,38.58,-121.49",
  "Los Angeles,34.05,-118.24",
  "San Francisco,37.77,-122.42",
  "Fresno,36.74,-119.77",
].join("\n");

test.describe("Tile-less station map from inferred coordinates", () => {
  test("draws a coordinate map and names California even with misspelled headers", async ({ page }) => {
    const tileRequests = [];
    page.on("request", (request) => {
      if (/tile|openstreetmap|basemaps|arcgisonline|mapbox|carto/i.test(request.url())) tileRequests.push(request.url());
    });

    await page.goto("/");
    await page.getByLabel("Load a CSV file from this computer").setInputFiles({
      name: "wells.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(CSV),
    });
    await page.getByRole("button", { name: "Load selected resource" }).click();

    await expect(page.getByRole("heading", { name: "Station location map" })).toBeVisible();
    await expect(page.getByText(/looks like it is about California/)).toBeVisible();
    await expect(page.locator("#geo-map .chart-host svg").first()).toBeVisible();

    // Local-first: no external map tiles are ever requested.
    expect(tileRequests).toEqual([]);
  });
});
