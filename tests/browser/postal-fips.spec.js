import { test, expect } from "@playwright/test";

test("preserves postal and FIPS leading zeros through DuckDB and display", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Dataset URL").fill(`${await page.evaluate(() => location.origin)}/sample/postal-fips.csv`);
  await page.getByRole("button", { name: "Inspect dataset" }).click();
  await page.getByRole("button", { name: "Load selected resource" }).click();
  await expect(page.getByRole("heading", { name: "Data quality before analysis" })).toBeVisible();
  await expect(page.locator("#quality-summary").getByRole("cell", { name: "ZIP", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("count by ZIP");
  await page.getByRole("button", { name: "Interpret question" }).click();
  await page.getByRole("button", { name: "Run verified query" }).click();
  await expect(page.getByRole("table", { name: "Result for: count by ZIP" })).toContainText("00501");
  await expect(page.getByRole("table", { name: "Result for: count by ZIP" })).toContainText("90210-1234");
});
