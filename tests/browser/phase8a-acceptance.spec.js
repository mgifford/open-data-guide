import { test, expect } from "@playwright/test";

// Phase 8A acceptance coverage for gaps not exercised by the other specs:
// switching built-in catalogs, custom-catalog lifecycle, a DKAN starter, and
// reflow at the 400%-zoom-equivalent 320px viewport.

test.describe("Phase 8A acceptance gaps", () => {
  test("switches between built-in catalogs and exposes the selection to assistive tech", async ({ page }) => {
    await page.goto("/");
    const select = page.getByLabel("Built-in catalogs");
    await expect(select).toHaveValue("cnra-ckan");
    await expect(page.locator("#catalog-details")).toContainText("natural-resource datasets");

    await select.selectOption("cms-open-payments-dkan");
    await expect(select).toHaveValue("cms-open-payments-dkan");
    await expect(page.locator("#catalog-details")).toContainText("Payments and transfers of value");
    await expect(page.locator("#catalog-details")).toContainText("DKAN");
  });

  test("detects, saves, persists, and removes a custom CKAN catalog without affecting built-ins", async ({ page }) => {
    await page.route(/\/api\/3\/action\/package_search/, (route) => route.fulfill({ json: { success: true, result: { count: 0, results: [] } } }));
    await page.route(/\/api\/1\/metastore\//, (route) => route.fulfill({ status: 404, body: "no" }));

    await page.goto("/");
    await page.getByText("Add another catalog", { exact: true }).click();
    await page.getByLabel("Catalog URL").fill("https://data.example.gov");
    await page.getByLabel("Name shown to you (optional)").fill("Example CKAN");
    await page.getByRole("button", { name: "Test catalog" }).click();
    await expect(page.locator("#catalog-detection")).toContainText("Detected a CKAN catalog");

    const save = page.getByRole("button", { name: "Save in this browser" });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.locator("#catalog-detection")).toContainText("Saved Example CKAN");
    await expect(page.getByText(/Example CKAN — https:\/\/data\.example\.gov/)).toBeVisible();

    await page.reload();
    await page.getByText("Add another catalog", { exact: true }).click();
    await expect(page.getByText(/Example CKAN — https:\/\/data\.example\.gov/)).toBeVisible();
    await expect(page.getByLabel("Built-in catalogs")).toContainText("California Natural Resources Agency");

    await page.getByRole("button", { name: "Remove" }).first().click();
    await expect(page.getByText(/Example CKAN — https:\/\/data\.example\.gov/)).toHaveCount(0);
    await expect(page.getByLabel("Built-in catalogs")).toContainText("California Natural Resources Agency");
  });

  test("detects and saves a custom DKAN catalog", async ({ page }) => {
    await page.route(/\/api\/3\/action\//, (route) => route.fulfill({ status: 404, body: "no" }));
    await page.route(/\/api\/1\/metastore\//, (route) => route.fulfill({ json: [{ identifier: "one", title: "Example DKAN dataset" }] }));

    await page.goto("/");
    await page.getByText("Add another catalog", { exact: true }).click();
    await page.getByLabel("Catalog URL").fill("https://payments.example.gov");
    await page.getByLabel("Name shown to you (optional)").fill("Example DKAN");
    await page.getByRole("button", { name: "Test catalog" }).click();
    await expect(page.locator("#catalog-detection")).toContainText("Detected a DKAN catalog");
    await page.getByRole("button", { name: "Save in this browser" }).click();
    await expect(page.locator("#catalog-detection")).toContainText("Saved Example DKAN");
  });

  test("opens a DKAN starter inside the guide without navigating away", async ({ page }) => {
    await page.route(/\/api\/1\/metastore\/schemas\/dataset\/items\/summary/, (route) => route.fulfill({
      json: {
        identifier: "summary",
        title: "CMS Open Payments Summary",
        description: "Summary of payments to physicians and teaching hospitals.",
        distribution: [{ identifier: "d1", title: "Summary CSV", downloadURL: "https://openpaymentsdata.cms.gov/summary.csv", format: "csv" }],
      },
    }));

    await page.goto("/");
    await page.getByRole("link", { name: "CMS Open Payments Summary" }).click();
    await expect(page.getByRole("heading", { name: /CMS Open Payments Summary/ })).toBeVisible();
    await expect(page).toHaveURL(/127\.0\.0\.1/);
  });

  // 400% zoom of a 1280px reference viewport reflows to a 320 CSS-pixel width
  // (WCAG 1.4.10). This verifies the catalog picker at that reflow width.
  test("keeps catalog selection usable at the 400%-zoom-equivalent 320px width", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/");
    const select = page.getByLabel("Built-in catalogs");
    await expect(select).toBeVisible();
    await select.selectOption("chhs-ckan");
    await expect(page.locator("#catalog-details")).toContainText("health and human-services");
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(noOverflow).toBe(true);
  });
});
