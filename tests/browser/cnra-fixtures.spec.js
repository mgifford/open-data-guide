import { test, expect } from "@playwright/test";

const fixtures = [
  ["reservoir", "cnra-reservoir.csv", "Elevation Feet"],
  ["bobcat", "cnra-bobcat.csv", "project_name"],
  ["dry well", "cnra-dry-well.csv", "County"],
];

for (const [label, filename, expectedField] of fixtures) {
  test(`loads the ${label} fixture through production ingestion`, async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Dataset URL").fill(`${await page.evaluate(() => location.origin)}/sample/${filename}`);
    await page.getByRole("button", { name: "Inspect dataset" }).click();
    await page.getByRole("button", { name: "Load selected resource" }).click();
    await expect(page.getByRole("heading", { name: "Data quality before analysis" })).toBeVisible();
    await expect(page.getByRole("cell", { name: expectedField, exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Question", exact: true }).fill(`count by ${expectedField}`);
    await page.getByRole("button", { name: "Interpret question" }).click();
    await page.getByRole("button", { name: "Run verified query" }).click();
    await expect(page.getByRole("heading", { name: "Dataset Overview" })).toBeVisible();
    await expect(page.getByRole("table", { name: `Result for: count by ${expectedField}` })).toBeVisible();
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
