import { test, expect } from "@playwright/test";

async function runSampleQuery(page) {
  await page.getByRole("button", { name: "Try the included sample" }).click();
  await page.getByRole("button", { name: "Load selected resource" }).click();
  await expect(page.getByRole("heading", { name: "Data quality before analysis" })).toBeVisible();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("count by state");
  await page.getByRole("button", { name: "Interpret question" }).click();
  await page.getByRole("button", { name: "Run verified query" }).click();
  await expect(page.getByRole("table", { name: "Result for: count by state" })).toBeVisible();
  // Wait for the query handler's trailing status so it cannot overwrite the summary status.
  await expect(page.locator("#query-status")).toContainText("Query complete");
}

test.describe("AI-assisted result summary", () => {
  test("adds a labelled, grounded AI summary while keeping the deterministic summary", async ({ page }) => {
    // Inject a ready browser-provided AI that returns a number-free (grounded) summary.
    await page.addInitScript(() => {
      window.LanguageModel = {
        availability: async () => "available",
        create: async () => ({
          prompt: async () => JSON.stringify({ summary: "California appears with the largest count and other states follow." }),
          destroy() {},
        }),
      };
    });
    await page.goto("/");
    await runSampleQuery(page);

    const deterministic = await page.locator("#story-text").textContent();
    expect(deterministic?.trim()).toBeTruthy();

    await page.getByRole("button", { name: "Summarize this result with AI" }).click();
    await expect(page.locator("#ai-summary")).toBeVisible();
    await expect(page.locator("#ai-summary-text")).toContainText("California appears with the largest count");
    await expect(page.locator("#ai-summary-note")).toContainText("Browser-provided AI");
    await expect(page.locator("#ai-summary-note")).toContainText("source of truth");
    // The deterministic summary is unchanged.
    await expect(page.locator("#story-text")).toHaveText(deterministic);
  });

  test("rejects a hallucinated number and leaves the deterministic summary intact", async ({ page }) => {
    await page.addInitScript(() => {
      window.LanguageModel = {
        availability: async () => "available",
        create: async () => ({
          prompt: async () => JSON.stringify({ summary: "The invented total across all states is 987654321." }),
          destroy() {},
        }),
      };
    });
    await page.goto("/");
    await runSampleQuery(page);

    const deterministic = await page.locator("#story-text").textContent();
    await page.getByRole("button", { name: "Summarize this result with AI" }).click();
    await expect(page.locator("#query-status")).toContainText("not added");
    await expect(page.locator("#ai-summary")).toBeHidden();
    await expect(page.locator("#story-text")).toHaveText(deterministic);
  });
});
