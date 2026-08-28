import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// A small CSV with coordinates so the Dataset Overview renders the map, tables,
// and question builder — the richest dynamic state to scan.
const CSV = [
  "county,latitude,longitude,wells",
  "Sacramento,38.58,-121.49,12",
  "Fresno,36.74,-119.77,8",
  "San Diego,32.72,-117.16,5",
].join("\n");

async function loadOverview(page) {
  await page.goto("/");
  await page.getByLabel("Load a CSV file from this computer").setInputFiles({ name: "wells.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await page.getByRole("button", { name: "Load selected resource" }).click();
  await page.getByRole("heading", { name: "Data quality before analysis" }).waitFor();
}

function summarize(results, label) {
  if (!results.violations.length) return;
  const lines = results.violations.map((v) => `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n    ")}`);
  console.log(`\nAXE VIOLATIONS — ${label} (${results.violations.length}):\n${lines.join("\n")}`);
}

test.describe("accessibility (axe)", () => {
  test("landing page has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    summarize(results, "landing");
    expect(results.violations).toEqual([]);
  });

  test("dataset overview has no WCAG A/AA violations", async ({ page }) => {
    await loadOverview(page);
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    summarize(results, "dataset overview");
    expect(results.violations).toEqual([]);
  });

  test("query result with a chart has no WCAG A/AA violations", async ({ page }) => {
    await loadOverview(page);
    await page.getByRole("textbox", { name: "Question" }).fill("count by county");
    await page.getByRole("button", { name: "Interpret question" }).click();
    await page.getByRole("button", { name: "Run verified query" }).click();
    await expect(page.getByRole("table", { name: /Result for:/ })).toBeVisible();
    await expect(page.locator("#chart svg.marks")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    summarize(results, "query result");
    expect(results.violations).toEqual([]);
  });

  test("catalog search results have no WCAG A/AA violations", async ({ page }) => {
    // Mock the CKAN search so the results list renders deterministically offline.
    await page.route(/\/api\/3\/action\/package_search/, (route) => route.fulfill({
      json: {
        success: true,
        result: {
          count: 2,
          results: [
            { name: "groundwater-levels", title: "Periodic Groundwater Level Measurements", notes: "Depth-to-water measurements by station.", organization: { title: "CA DWR" }, groups: [{ name: "water" }], resources: [{ id: "r1", name: "measurements.csv", url: "https://data.cnra.ca.gov/dataset/gw/resource/r1/download/measurements.csv", format: "CSV" }] },
            { name: "dry-wells", title: "Dry Well Reports", notes: "Household dry well reports by county.", organization: { title: "CA DWR" }, groups: [{ name: "water" }], resources: [{ id: "r2", name: "reports.csv", url: "https://data.cnra.ca.gov/dataset/dw/resource/r2/download/reports.csv", format: "CSV" }] },
          ],
        },
      },
    }));

    await page.goto("/");
    await page.getByLabel("Search terms").fill("groundwater");
    await page.getByRole("button", { name: "Search catalog" }).click();
    await expect(page.locator("#catalog-results")).toContainText("Periodic Groundwater Level Measurements");

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    summarize(results, "catalog search results");
    expect(results.violations).toEqual([]);
  });

  test("join review flow has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Try the included sample" }).click();
    await page.getByRole("button", { name: "Load selected resource" }).click();
    await page.getByRole("button", { name: "Save marker in this browser" }).click();
    // Seed a second saved dataset with a join snapshot so a comparison is offered.
    await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open("open-data-guide");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(["datasets"], "readwrite");
        tx.objectStore("datasets").put({
          key: "join-a11y-target", connectorId: "ckan", sourceUrl: "https://example.gov/target.csv",
          catalogUrl: "https://catalog.example.gov/dataset/target", title: "Saved join target",
          description: "Comparison dataset", publisher: "Example Publisher", schemaVersion: 3, savedAt: new Date().toISOString(),
          joinSnapshot: { fields: [{ name: "state", type: "VARCHAR" }, { name: "amount", type: "DOUBLE" }], rows: [{ state: "CA", amount: 15 }, { state: "WA", amount: 6 }], rowLimit: 100, totalRows: 2, resourceId: "target-resource", resourceUrl: "https://example.gov/target.csv", capturedAt: new Date().toISOString() },
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    }));
    await page.reload();
    await page.getByRole("button", { name: "Try the included sample" }).click();
    await page.getByRole("button", { name: "Load selected resource" }).click();
    await page.getByRole("button", { name: "Review possible join" }).click();
    await page.getByRole("button", { name: "Review join keys" }).click();
    await page.getByRole("checkbox", { name: /I reviewed the key evidence/i }).check();
    await page.getByRole("button", { name: "Confirm bounded join review" }).click();
    await expect(page.locator("#join-result")).toContainText("Bounded comparison of the saved preview rows");

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    summarize(results, "join review");
    expect(results.violations).toEqual([]);
  });

  test("populated workspace and settings area has no WCAG A/AA violations", async ({ page }) => {
    // Run a query (records history and activity), then expand the collapsed
    // details in the settings area so their content is scanned, not just summaries.
    await loadOverview(page);
    await page.getByRole("textbox", { name: "Question" }).fill("count by county");
    await page.getByRole("button", { name: "Interpret question" }).click();
    await page.getByRole("button", { name: "Run verified query" }).click();
    await expect(page.getByRole("table", { name: /Result for:/ })).toBeVisible();
    for (const summary of await page.locator("#workspace-settings details > summary").all()) {
      await summary.click();
    }
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    summarize(results, "workspace and settings");
    expect(results.violations).toEqual([]);
  });
});
