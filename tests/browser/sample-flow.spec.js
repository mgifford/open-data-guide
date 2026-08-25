import { test, expect } from "@playwright/test";

test("sample dataset reaches quality profile, table, chart, and SQL", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the included sample" }).click();
  await expect(page.getByRole("heading", { name: "payments-sample.csv" })).toBeVisible();
  await expect(page.getByText("Direct file")).toBeVisible();

  await page.getByRole("button", { name: "Load selected resource" }).click();
  await expect(page.getByRole("heading", { name: "Data quality before analysis" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Profile for fields used in analysis" })).toBeVisible();

  const question = page.getByRole("textbox", { name: "Question" });
  await question.fill("count by state");
  await page.getByRole("button", { name: "Interpret question" }).click();
  await page.getByRole("button", { name: "Run verified query" }).click();

  await expect(page.getByRole("table", { name: "Result for: count by state" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Result for: count by state" })).toContainText("CA");
  await expect(page.getByRole("table", { name: "Result for: count by state" })).toContainText("NY");
  await expect(page.locator("#chart svg.marks")).toBeVisible();
  const describedBy = await page.locator("#chart .chart-host").getAttribute("aria-describedby");
  await expect(page.locator(`#${describedBy}`)).toContainText("chart of count by state");
  await page.getByText("Query and provenance").first().click();
  await expect(page.locator("#sql-output")).toContainText("GROUP BY");
});
