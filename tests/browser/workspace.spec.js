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

test("restores the saved plan controls after reopening its dataset", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the included sample" }).click();
  await page.getByRole("button", { name: "Load selected resource" }).click();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("count by state");
  await page.getByRole("button", { name: "Interpret question" }).click();
  await page.getByRole("button", { name: "Run verified query" }).click();
  await page.getByRole("button", { name: "Review stale question" }).or(page.getByRole("button", { name: "Reuse question" })).click();
  await page.getByRole("button", { name: "Load selected resource" }).click();
  await expect(page.locator("#dimension")).toHaveValue("state");
  await expect(page.getByRole("button", { name: "Run verified query" })).toBeEnabled();
});

test("keeps the page within a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("migrates a legacy version-one dataset marker", async ({ page }) => {
  await page.goto("/migration-seed.html");
  await page.evaluate(() => new Promise((resolve, reject) => {
    const deletion = indexedDB.deleteDatabase("open-data-guide");
    deletion.onerror = () => reject(deletion.error);
    deletion.onsuccess = () => {
      const request = indexedDB.open("open-data-guide", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("datasets", { keyPath: "key" });
      request.onsuccess = () => {
        const transaction = request.result.transaction("datasets", "readwrite");
        transaction.objectStore("datasets").put({ key: "legacy:dataset", title: "Legacy dataset", sourceUrl: "https://example.test/dataset/legacy" });
        transaction.oncomplete = () => { request.result.close(); resolve(); };
      };
      request.onerror = () => reject(request.error);
    };
  }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Legacy dataset" })).toBeVisible();
  await expect(page.locator("#storage-summary")).toContainText("1 saved dataset");
});
