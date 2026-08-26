import { test, expect } from "@playwright/test";

function catalogApiRequests(page) {
  const requests = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/\/api\/3\/action\/|\/api\/1\/metastore\//.test(url)) requests.push(url);
  });
  return requests;
}

test.describe("curated catalog picker", () => {
  test("selects CNRA by default and shows its details without a base URL field in the main flow", async ({ page }) => {
    const catalogRequests = catalogApiRequests(page);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Search open data catalogs" })).toBeVisible();
    await expect(page.locator("#catalog-heading + p")).toContainText("directly from your browser");

    const select = page.getByLabel("Built-in catalogs");
    await expect(select).toBeVisible();
    await expect(select).toHaveValue("cnra-ckan");
    await expect(select).toContainText("California Natural Resources Agency");
    await expect(page.locator("#catalog-details")).toContainText("natural-resource datasets");
    await expect(page.locator("#catalog-details")).toContainText("CKAN");
    await expect(page.locator("#catalog-details")).toContainText("California");
    await expect(page.locator("#catalog-details")).toContainText("Why included");
    await expect(page.locator("#catalog-details")).toContainText("API type");
    await expect(page.locator("#catalog-details")).toContainText("Not yet verified");
    await expect(page.getByRole("link", { name: /catalog website/ })).toBeVisible();

    // The base catalog URL is only inside the "Add another catalog" disclosure, not the main search flow.
    await expect(page.locator("#catalog-url")).toBeHidden();

    // No catalog network request happens merely from opening the page.
    expect(catalogRequests).toEqual([]);
  });

  test("rejects an ordinary non-catalog website in the add flow", async ({ page }) => {
    await page.route(/\/api\/(3\/action|1\/metastore)\//, (route) => route.fulfill({ status: 404, body: "not found" }));

    await page.goto("/");
    await page.getByText("Add another catalog", { exact: true }).click();
    await page.getByLabel("Catalog URL").fill("https://example.com");
    await page.getByRole("button", { name: "Test catalog" }).click();
    await expect(page.locator("#catalog-detection")).toContainText("Not a supported catalog");
    await expect(page.getByRole("button", { name: "Save in this browser" })).toBeDisabled();
  });
});
