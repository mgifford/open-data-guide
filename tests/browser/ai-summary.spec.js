import { test, expect } from "@playwright/test";

// A fake browser-provided AI (LanguageModel) that returns a fixed structured summary.
function injectLanguageModel(page, summaryText) {
  return page.addInitScript((text) => {
    window.__aiPrompts = 0;
    window.LanguageModel = {
      availability: async () => "available",
      create: async () => ({
        prompt: async () => {
          window.__aiPrompts += 1;
          return JSON.stringify({ sentences: [{ text, factIds: ["fact:largest"] }] });
        },
        destroy() {},
      }),
    };
  }, summaryText);
}

async function runSampleQuery(page) {
  await page.getByRole("button", { name: "Try the included sample" }).click();
  await page.getByRole("button", { name: "Load selected resource" }).click();
  await expect(page.getByRole("heading", { name: "Data quality before analysis" })).toBeVisible();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("count by state");
  await page.getByRole("button", { name: "Interpret question" }).click();
  await page.getByRole("button", { name: "Run verified query" }).click();
  await expect(page.getByRole("table", { name: "Result for: count by state" })).toBeVisible();
  await expect(page.locator("#query-status")).toContainText("Query complete");
}

test.describe("AI-assisted result explanation", () => {
  test("no model download occurs during capability detection", async ({ page }) => {
    await injectLanguageModel(page, "California has the largest count of the states shown.");
    await page.goto("/");
    await runSampleQuery(page);
    await page.getByRole("button", { name: "Explain this result with AI" }).click();
    // The inline approval panel appears; no prompt call happened yet.
    await expect(page.getByRole("group", { name: "Approve an AI model" })).toBeVisible();
    await expect(page.locator("#ai-approval-details")).toContainText("Browser-provided AI");
    expect(await page.evaluate(() => window.__aiPrompts)).toBe(0);
  });

  test("approval generates a grounded, scoped, labelled explanation and stores provenance", async ({ page }) => {
    await injectLanguageModel(page, "California has the largest count of the states shown.");
    await page.goto("/");
    await runSampleQuery(page);
    const deterministic = await page.locator("#story-text").textContent();

    await page.getByRole("button", { name: "Explain this result with AI" }).click();
    await page.getByRole("button", { name: "Approve and generate" }).click();

    await expect(page.locator("#ai-summary")).toBeVisible();
    await expect(page.locator("#ai-summary-text")).toContainText("California has the largest count");
    await expect(page.locator("#ai-summary-scope")).toContainText("covers the complete result");
    await expect(page.locator("#ai-summary-note")).toContainText("Browser-provided AI");
    await expect(page.locator("#story-text")).toHaveText(deterministic);

    // Provenance survives reload.
    await page.reload();
    const stored = await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open("open-data-guide");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const tx = request.result.transaction(["queries"], "readonly");
        const all = tx.objectStore("queries").getAll();
        all.onsuccess = () => resolve(all.result.map((record) => record.aiSummary).filter(Boolean));
      };
    }));
    expect(stored.length).toBe(1);
    expect(stored[0].provider).toBe("browser-prompt");
    expect(stored[0].validation).toBe("passed");
    expect(stored[0].text).toContain("California has the largest count");
  });

  test("a hallucinated number is rejected and the deterministic summary is intact", async ({ page }) => {
    await injectLanguageModel(page, "The invented total across all states is 987654321.");
    await page.goto("/");
    await runSampleQuery(page);
    const deterministic = await page.locator("#story-text").textContent();

    await page.getByRole("button", { name: "Explain this result with AI" }).click();
    await page.getByRole("button", { name: "Approve and generate" }).click();

    await expect(page.locator("#ai-approval-progress")).toContainText("Not generated");
    await expect(page.locator("#ai-summary")).toBeHidden();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.locator("#story-text")).toHaveText(deterministic);
  });

  test("Remove summary clears the explanation while keeping the deterministic summary", async ({ page }) => {
    await injectLanguageModel(page, "California has the largest count of the states shown.");
    await page.goto("/");
    await runSampleQuery(page);
    await page.getByRole("button", { name: "Explain this result with AI" }).click();
    await page.getByRole("button", { name: "Approve and generate" }).click();
    await expect(page.locator("#ai-summary")).toBeVisible();

    await page.getByRole("button", { name: "Remove summary" }).click();
    await expect(page.locator("#ai-summary")).toBeHidden();
    await expect(page.locator("#story-text")).not.toHaveText("");
  });

  test("offers bounded follow-up actions after a result", async ({ page }) => {
    await page.goto("/");
    await runSampleQuery(page);
    const followups = page.getByRole("group", { name: "Bounded next steps" });
    await expect(followups.getByRole("button", { name: "Ask another question" })).toBeVisible();
    await expect(followups.getByRole("button", { name: "Compare with a saved dataset" })).toBeVisible();
  });
});
