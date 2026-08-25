import { test, expect } from "@playwright/test";

test("persists a completed analysis across reload and reports export", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the included sample" }).click();
  await page.getByRole("button", { name: "Load selected resource" }).click();
  await expect(page.getByRole("heading", { name: "Data quality before analysis" })).toBeVisible();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("count by state");
  await page.getByRole("button", { name: "Interpret question" }).click();
  await page.getByRole("button", { name: "Run verified query" }).click();
  await expect(page.getByRole("heading", { name: "What this result says" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "count by state" })).toBeVisible();
  await expect(page.locator("#storage-summary")).toContainText("1 saved query");

  await page.reload();
  await expect(page.getByRole("heading", { name: "count by state" })).toBeVisible();
  await expect(page.locator("#storage-summary")).toContainText("1 saved query");
  await page.getByRole("button", { name: "Export workspace" }).click();
  await expect(page.locator("#export-receipt")).toContainText("open-data-guide-workspace.json");
});
