import { test, expect } from "@playwright/test";
import { BUILTIN_CATALOGS } from "../../src/catalog/catalogs.js";

// Live, network-dependent browser-side health check. It is excluded from the
// deterministic gate (see grepInvert /@health/ in playwright.config.js) and is
// run on demand with `npm run test:catalog-health`. It verifies each built-in
// catalog's documented API endpoint responds to a real cross-origin browser
// request, which is the only sufficient evidence for setting `lastVerified`.
test.describe("built-in catalog live browser access @health", () => {
  for (const catalog of BUILTIN_CATALOGS) {
    test(`${catalog.name} answers a browser CORS API request`, async ({ page }) => {
      await page.goto("/");
      const endpoint = catalog.platform === "DKAN"
        ? new URL("/api/1/metastore/schemas/dataset/items?page-size=1", catalog.baseUrl).href
        : new URL("/api/3/action/package_search?rows=0", catalog.baseUrl).href;
      const result = await page.evaluate(async (url) => {
        try {
          const response = await fetch(url, { headers: { Accept: "application/json" } });
          return { ok: response.ok, status: response.status };
        } catch (error) {
          return { ok: false, error: String(error) };
        }
      }, endpoint);
      expect(result.ok, `${catalog.name} at ${endpoint} => ${JSON.stringify(result)}`).toBe(true);
    });
  }
});
