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

test.describe("station map from inferred coordinates", () => {
  test("draws a Leaflet map on an OpenStreetMap basemap and names California even with misspelled headers", async ({ page }) => {
    const tileRequests = [];
    page.on("request", (request) => {
      if (/tile\.openstreetmap\.org/i.test(request.url())) tileRequests.push(request.url());
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

    // A Leaflet map renders with one circle marker per unique point.
    await expect(page.locator("#geo-map .leaflet-container")).toBeVisible();
    await expect(page.locator("#geo-map path.leaflet-interactive")).toHaveCount(4);
    // Required OpenStreetMap attribution is present.
    await expect(page.locator("#geo-map .leaflet-control-attribution")).toContainText("OpenStreetMap");

    // The basemap requests tiles from OpenStreetMap (the documented trade-off);
    // the request fires even if the environment blocks the response.
    await expect.poll(() => tileRequests.length).toBeGreaterThan(0);
  });
});
