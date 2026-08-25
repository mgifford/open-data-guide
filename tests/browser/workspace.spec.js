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
  await page.getByRole("button", { name: "Try the included sample" }).click();
  await page.getByRole("button", { name: "Load selected resource" }).click();
  await expect(page.getByRole("heading", { name: "Data quality before analysis" })).toBeVisible();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("count by state");
  await page.getByRole("button", { name: "Interpret question" }).click();
  await page.getByRole("button", { name: "Run verified query" }).click();
  await expect(page.getByRole("table", { name: "Result for: count by state" })).toContainText("CA");
  await expect(page.locator("#chart .chart-host")).toHaveAttribute("aria-describedby", /chart-description-/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("discloses MiniLM before requiring consent", async ({ page }) => {
  await page.goto("/");
  const modelRequests = [];
  page.on("request", (request) => {
    if (/huggingface|transformers/i.test(request.url())) modelRequests.push(request.url());
  });
  await page.getByRole("button", { name: "Check browser AI support" }).click();
  const details = page.getByText("Use app-provided MiniLM matching", { exact: true });
  await expect(details).toBeVisible();
  await details.click();
  await expect(page.getByText(/Xenova\/all-MiniLM-L6-v2/)).toBeVisible();
  await expect(page.getByText(/raw dataset rows are not sent/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve local semantic matching" })).toBeVisible();
  await expect(page.locator("#status")).toContainText("No model was downloaded");
  expect(modelRequests).toHaveLength(0);
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

test("migrates a version-two dataset and query with current properties", async ({ page }) => {
  await page.goto("/migration-seed.html");
  await page.evaluate(() => new Promise((resolve, reject) => {
    const deletion = indexedDB.deleteDatabase("open-data-guide");
    deletion.onerror = () => reject(deletion.error);
    deletion.onsuccess = () => {
      const request = indexedDB.open("open-data-guide", 2);
      request.onupgradeneeded = () => {
        const database = request.result;
        ["datasets", "resources", "fields", "relationships", "queries", "embeddings", "preferences"].forEach((name) => database.createObjectStore(name, { keyPath: name === "datasets" || name === "preferences" ? "key" : "id" }));
      };
      request.onsuccess = () => {
        const transaction = request.result.transaction(["datasets", "queries"], "readwrite");
        transaction.objectStore("datasets").put({ key: "v2:dataset", title: "Version two dataset", platform: "CKAN" });
        transaction.objectStore("queries").put({ id: "v2:query", question: "count rows" });
        transaction.oncomplete = () => { request.result.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    };
  }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Version two dataset" })).toBeVisible();
  await page.reload();
  const migrated = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("open-data-guide");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const transaction = request.result.transaction(["datasets", "queries"], "readonly");
      const datasetRequest = transaction.objectStore("datasets").get("v2:dataset");
      const queryRequest = transaction.objectStore("queries").get("v2:query");
      transaction.oncomplete = () => { request.result.close(); resolve({ dataset: datasetRequest.result, query: queryRequest.result }); };
    };
  }));
  expect(migrated.dataset.schemaVersion).toBe(3);
  expect(migrated.dataset.connectorId).toBe("ckan");
  expect(migrated.dataset.resources).toEqual([]);
  expect(migrated.dataset.fields).toEqual([]);
  expect(migrated.query.version).toBe(1);
  expect(migrated.query.stale).toBe(false);
});

test("recovers a legacy query without exposing unusable controls", async ({ page }) => {
  await page.goto("/migration-seed.html");
  await page.evaluate(() => new Promise((resolve, reject) => {
    const deletion = indexedDB.deleteDatabase("open-data-guide");
    deletion.onerror = () => reject(deletion.error);
    deletion.onsuccess = () => {
      const request = indexedDB.open("open-data-guide", 3);
      request.onupgradeneeded = () => {
        const database = request.result;
        ["datasets", "resources", "fields", "relationships", "queries", "embeddings", "preferences"].forEach((name) => database.createObjectStore(name, { keyPath: name === "datasets" || name === "preferences" ? "key" : "id" }));
      };
      request.onsuccess = () => {
        const transaction = request.result.transaction("queries", "readwrite");
        transaction.objectStore("queries").put({ id: "legacy:query", question: "count by state", normalizedQuestion: "count by state", rowCountReturned: 4, createdAt: new Date().toISOString() });
        transaction.oncomplete = () => { request.result.close(); resolve(); };
      };
      request.onerror = () => reject(request.error);
    };
  }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "count by state" }).last()).toBeVisible();
  await page.getByRole("button", { name: "Reuse question" }).last().click();
  await expect(page.getByRole("textbox", { name: "Question", exact: true })).toHaveValue("count by state");
  await expect(page.getByRole("button", { name: "Interpret question" })).toBeDisabled();
  await expect(page.getByText("has no original source URL")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run verified query" })).toBeHidden();
});
