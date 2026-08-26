import { test, expect } from "@playwright/test";

async function mockDataStore(page, { delayed = false, incomplete = false } = {}) {
  let fileRequests = 0;
  await page.route("https://files.example.net/**", async (route) => {
    fileRequests += 1;
    await route.fulfill({ status: 200, body: "state,amount\nCA,1\n" });
  });
  await page.route("https://catalog.example.gov/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/1/metastore/")) return route.fulfill({ status: 404, body: "not found" });
    if (url.pathname === "/api/3/action/package_show") return route.fulfill({ json: { success: true, result: { id: "large", title: "Large DataStore resource", resources: [{ id: "resource-1", name: "Large CSV", format: "CSV", url: "https://files.example.net/large.csv", datastore_active: true, size: 900_000_000 }] } } });
    if (url.pathname === "/api/3/action/datastore_search") {
      if (delayed) await new Promise((resolve) => setTimeout(resolve, 1000));
      return route.fulfill({ json: { success: true, result: { records: [{ state: "CA", amount: 1 }, { state: "NY", amount: 2 }], total: incomplete ? 100_001 : 2, fields: [{ id: "state", type: "text" }, { id: "amount", type: "numeric" }] } } });
    }
    return route.fulfill({ status: 404, body: "not found" });
  });
  return () => fileRequests;
}

test("uses the catalog origin and bypasses a large download", async ({ page }) => {
  const fileRequests = await mockDataStore(page);
  await page.goto("/");
  await page.getByLabel("Dataset URL").fill("https://catalog.example.gov/dataset/large");
  await page.getByRole("button", { name: "Inspect dataset" }).click();
  await expect(page.getByText(/bounded API pages/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Load selected resource" })).toBeEnabled();
  await page.getByRole("button", { name: "Load selected resource" }).click();
  await expect(page.locator("#resource-status")).toContainText("Resource loaded");
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("count by state");
  await page.getByRole("button", { name: "Interpret question" }).click();
  await page.getByRole("button", { name: "Run verified query" }).click();
  await expect(page.getByRole("table", { name: "Result for: count by state" })).toBeVisible();
  await page.getByText("Query and provenance").click();
  await expect(page.locator("#sql-output")).toContainText("catalog.example.gov");
  expect(fileRequests()).toBe(0);
});

test("cancels a DataStore resource load", async ({ page }) => {
  await mockDataStore(page, { delayed: true });
  await page.goto("/");
  await page.getByLabel("Dataset URL").fill("https://catalog.example.gov/dataset/large");
  await page.getByRole("button", { name: "Inspect dataset" }).click();
  await page.getByRole("button", { name: "Load selected resource" }).click();
  await expect(page.getByRole("button", { name: "Cancel resource loading" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel resource loading" }).click();
  await expect(page.locator("#resource-status")).toContainText("cancelled", { timeout: 4000 });
});

test("cancels an in-flight remote query", async ({ page }) => {
  await mockDataStore(page, { delayed: true });
  await page.goto("/");
  await page.getByLabel("Dataset URL").fill("https://catalog.example.gov/dataset/large");
  await page.getByRole("button", { name: "Inspect dataset" }).click();
  await page.getByRole("button", { name: "Load selected resource" }).click();
  await expect(page.locator("#resource-status")).toContainText("Resource loaded", { timeout: 4000 });
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("count by state");
  await page.getByRole("button", { name: "Interpret question" }).click();
  await page.getByRole("button", { name: "Run verified query" }).click();
  await expect(page.getByRole("button", { name: "Cancel remote query" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel remote query" }).click();
  await expect(page.locator("#query-status")).toContainText("cancelled", { timeout: 4000 });
});

test("withholds presentation and exports for incomplete remote aggregates", async ({ page }) => {
  await mockDataStore(page, { incomplete: true });
  await page.goto("/");
  await page.getByLabel("Dataset URL").fill("https://catalog.example.gov/dataset/large");
  await page.getByRole("button", { name: "Inspect dataset" }).click();
  await page.getByRole("button", { name: "Load selected resource" }).click();
  await expect(page.locator("#resource-status")).toContainText("Resource loaded", { timeout: 4000 });
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("count by state");
  await page.getByRole("button", { name: "Interpret question" }).click();
  await page.getByRole("button", { name: "Run verified query" }).click();
  await expect(page.locator("#query-status")).toContainText("Charting and exports are disabled", { timeout: 4000 });
  await expect(page.locator("#chart .chart-host")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download CSV" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Download JSON" })).toBeDisabled();
});
