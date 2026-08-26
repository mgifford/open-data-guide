import { test, expect } from "@playwright/test";

test.describe("Phase 8A dataset-discovery journey", () => {
  test("shows the six-step journey with step one current and future steps unavailable, not silently disabled", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Dataset discovery journey" });
    await expect(nav).toBeVisible();
    await expect(nav.getByText("Choose data")).toBeVisible();
    await expect(nav.getByText("Connect related data")).toBeVisible();

    // Current step is programmatically identified.
    const current = nav.locator("[aria-current='step']");
    await expect(current).toHaveCount(1);
    await expect(current).toContainText("Choose data");

    // Future steps are marked unavailable with an explanation rather than just disabled.
    await expect(nav.locator("[aria-disabled='true']").first()).toBeVisible();
    await expect(nav).toContainText("Not available yet");

    // Plain-language intro for non-specialists.
    await expect(page.getByText(/people who are not data specialists/)).toBeVisible();
  });

  test("advances the current step and keeps completed steps revisitable", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Try the included sample" }).click();
    const nav = page.getByRole("navigation", { name: "Dataset discovery journey" });
    await expect(nav.locator("[aria-current='step']")).toContainText("Understand the dataset");

    await page.getByRole("button", { name: "Load selected resource" }).click();
    await expect(page.getByRole("heading", { name: "Data quality before analysis" })).toBeVisible();
    await expect(nav.locator("[aria-current='step']")).toContainText("Choose a question");

    // Completed step one remains a link (revisitable).
    await expect(nav.getByRole("link", { name: /Choose data/ })).toBeVisible();
  });

  test("moves History, Storage and diagnostics into a secondary workspace and settings area", async ({ page }) => {
    await page.goto("/");
    const settings = page.getByRole("region", { name: "Workspace and settings" });
    await expect(settings).toBeVisible();
    await expect(settings.getByRole("heading", { name: "Analysis history" })).toBeVisible();
    await expect(settings.getByRole("heading", { name: "Storage and AI settings" })).toBeVisible();
    await expect(settings.getByRole("heading", { name: "Processing and AI" })).toBeVisible();
    // Documented multi-catalog future work.
    await expect(settings.getByText(/Search several catalogs at once/)).toBeVisible();
  });

  test("offers real CKAN and DKAN starters with separate publisher links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Starter datasets" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Periodic Groundwater Level Measurements" })).toBeVisible();
    await expect(page.getByText(/DKAN . Centers for Medicare/)).toBeVisible();
    await expect(page.getByRole("link", { name: "View publisher page" }).first()).toBeVisible();
  });

  test("loads a local CSV file without any network upload", async ({ page }) => {
    const uploads = [];
    page.on("request", (request) => {
      if (["POST", "PUT", "PATCH"].includes(request.method())) uploads.push(request.url());
    });

    await page.goto("/");
    await page.getByLabel("Load a CSV file from this computer").setInputFiles({
      name: "local-people.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("state,count\nCA,3\nNY,2\n"),
    });
    await expect(page.getByRole("heading", { name: "local-people.csv" })).toBeVisible();
    await page.getByRole("button", { name: "Load selected resource" }).click();
    await expect(page.getByRole("heading", { name: "Data quality before analysis" })).toBeVisible();
    expect(uploads).toEqual([]);
  });

  test("remains usable at a 320px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Dataset discovery journey" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choose data" })).toBeVisible();
    // No horizontal overflow at the narrow viewport.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(overflow).toBe(true);
  });
});
