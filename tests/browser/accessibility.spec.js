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
});
