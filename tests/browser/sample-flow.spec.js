import { test, expect } from "@playwright/test";

test("sample dataset reaches quality profile, table, chart, and SQL", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Processing and AI" })).toBeVisible();
  await expect(page.locator("#processing")).toContainText("deterministic JavaScript and DuckDB-Wasm run the calculations locally");
  await expect(page.locator("#processing")).toContainText("AI is never required");
  await page.getByRole("button", { name: "Try the included sample" }).click();
  await expect(page.getByRole("heading", { name: "payments-sample.csv" })).toBeVisible();
  await expect(page.getByText("Direct file", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Load selected resource" }).click();
  await expect(page.getByRole("heading", { name: "Data quality before analysis" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Profile for fields used in analysis" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dataset Overview" })).toBeVisible();
  await expect(page.getByText("How many records are in this dataset?", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Apply suggestion" }).first().click();
  await expect(page.getByRole("button", { name: "Run verified query" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Result for: count by state" })).toHaveCount(0);

  const question = page.getByRole("textbox", { name: "Question" });
  await question.fill("count by state");
  await page.getByRole("button", { name: "Interpret question" }).click();
  await page.getByRole("button", { name: "Run verified query" }).click();

  await expect(page.getByRole("table", { name: "Result for: count by state" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Result for: count by state" })).toContainText("CA");
  await expect(page.getByRole("table", { name: "Result for: count by state" })).toContainText("NY");
  await expect(page.locator("#schematic-view")).toContainText(/payment_date:.*2025.*2025/);
  await expect(page.locator("#chart svg.marks")).toBeVisible();
  const describedBy = await page.locator("#chart .chart-host").getAttribute("aria-describedby");
  await expect(page.locator(`#${describedBy}`)).toContainText("chart of count by state");
  await page.getByText("Query and provenance").first().click();
  await expect(page.locator("#sql-output")).toContainText("GROUP BY");

  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  await expect((await csvDownload).suggestedFilename()).toBe("open-data-guide-results.csv");
  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  await expect((await jsonDownload).suggestedFilename()).toBe("open-data-guide-results.json");
});

test("groups a date field by month using the date-grain control", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the included sample" }).click();
  await page.getByRole("button", { name: "Load selected resource" }).click();
  await expect(page.getByRole("heading", { name: "Data quality before analysis" })).toBeVisible();

  const question = page.getByRole("textbox", { name: "Question" });
  await question.fill("count by payment_date");
  await page.getByRole("button", { name: "Interpret question" }).click();

  const grain = page.getByLabel("Date grain");
  await expect(grain).toBeEnabled();
  await grain.selectOption("month");

  await page.getByRole("button", { name: "Run verified query" }).click();
  await expect(page.getByRole("table", { name: /Result for:/ })).toBeVisible();
  await page.getByText("Query and provenance").first().click();
  await expect(page.locator("#sql-output")).toContainText("date_trunc('month', \"payment_date\")");
});

test("applies a user-added numeric filter to the query", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the included sample" }).click();
  await page.getByRole("button", { name: "Load selected resource" }).click();
  await expect(page.getByRole("heading", { name: "Data quality before analysis" })).toBeVisible();

  const question = page.getByRole("textbox", { name: "Question" });
  await question.fill("count by state");
  await page.getByRole("button", { name: "Interpret question" }).click();

  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByLabel("Filter field").selectOption("amount_usd");
  await page.getByLabel("Filter comparison").selectOption("greater_than");
  await page.getByLabel("Filter value").fill("1000");

  await page.getByRole("button", { name: "Run verified query" }).click();
  await expect(page.getByRole("table", { name: /Result for:/ })).toBeVisible();
  await page.getByText("Query and provenance").first().click();
  // Numeric fields are compared numerically, not as quoted strings.
  await expect(page.locator("#sql-output")).toContainText('WHERE "amount_usd" > 1000');
});
