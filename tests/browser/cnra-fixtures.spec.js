import { test, expect } from "@playwright/test";

const fixtures = [
  ["reservoir", "cnra-reservoir.csv", "Elevation Feet"],
  ["bobcat", "cnra-bobcat.csv", "project_name"],
  ["dry well", "cnra-dry-well.csv", "County"],
];

test("opens a CNRA starter inside the guide", async ({ page }) => {
  // Resolve the starter deterministically instead of depending on the live CNRA API.
  await page.route(/\/api\/1\/metastore\//, (route) => route.fulfill({ status: 404, body: "not found" }));
  await page.route(/\/api\/3\/action\/package_show/, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      result: {
        id: "pgwl",
        name: "periodic-groundwater-level-measurements",
        title: "Periodic Groundwater Level Measurements",
        notes: "Groundwater level measurements from monitoring stations.",
        organization: { title: "California Natural Resources Agency" },
        resources: [{ id: "stations", name: "Stations", url: "https://data.cnra.ca.gov/dataset/pgwl/stations.csv", format: "CSV" }],
      },
    }),
  }));

  await page.goto("/");
  await page.getByRole("link", { name: "Periodic Groundwater Level Measurements" }).click();
  await expect(page.getByRole("heading", { name: /Periodic Groundwater Level Measurements/ })).toBeVisible();
  await expect(page).toHaveURL(/127\.0\.0\.1/);
});

for (const [label, filename, expectedField] of fixtures) {
  test(`loads the ${label} fixture through production ingestion`, async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Dataset URL").fill(`${await page.evaluate(() => location.origin)}/sample/${filename}`);
    await page.getByRole("button", { name: "Inspect dataset" }).click();
    await page.getByRole("button", { name: "Load selected resource" }).click();
    await expect(page.getByRole("heading", { name: "Data quality before analysis" })).toBeVisible();
    await expect(page.locator("#quality-summary").getByRole("cell", { name: expectedField, exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Question", exact: true }).fill(`count by ${expectedField}`);
    await page.getByRole("button", { name: "Interpret question" }).click();
    await page.getByRole("button", { name: "Run verified query" }).click();
    await expect(page.getByRole("heading", { name: "Dataset Overview" })).toBeVisible();
    await expect(page.getByRole("table", { name: `Result for: count by ${expectedField}` })).toBeVisible();
    if (label === "bobcat") await expect(page.locator("#schematic-view")).toContainText("Location point");
    if (label === "bobcat") {
      // Grouped "count by project_name" has no coordinate rows, so it must render as a bar chart, not a map.
      const describedBy = await page.locator("#chart .chart-host").getAttribute("aria-describedby");
      await expect(page.locator(`#${describedBy}`)).toContainText("chart of count by project_name");
      await expect(page.locator("#chart .chart-host")).not.toHaveAttribute("aria-label", /Point map/);
    }
    await expect(page.getByRole("button", { name: "Download CSV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download JSON" })).toBeVisible();
    if (label === "bobcat" || label === "dry well") {
      await expect(page.locator("#chart svg.marks")).toBeVisible();
    }
    if (label === "dry well") {
      await page.getByRole("textbox", { name: "Question", exact: true }).fill("How have dry well reports changed over time?");
      await page.getByRole("button", { name: "Interpret question" }).click();
      await expect(page.locator("#clarification-output")).toContainText("Date field to use");
      await expect(page.locator("#clarification-choice")).toContainText("Report Date");
    }
  });
}
