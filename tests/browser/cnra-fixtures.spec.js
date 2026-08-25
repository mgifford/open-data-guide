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
  });
}
