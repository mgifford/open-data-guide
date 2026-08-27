import { describe, expect, it } from "vitest";
import {
  listBuiltinCatalogs,
  getBuiltinCatalog,
  DEFAULT_CATALOG_ID,
  detectCatalog,
  normalizeCustomCatalog,
  isSafeCatalogUrl,
  catalogBrowserBlocked,
  browserBlockedOrigin,
} from "../src/catalog/catalogs.js";

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

describe("built-in catalog registry", () => {
  it("defaults to the California Natural Resources Agency", () => {
    expect(DEFAULT_CATALOG_ID).toBe("cnra-ckan");
    expect(getBuiltinCatalog(DEFAULT_CATALOG_ID)?.name).toBe("California Natural Resources Agency");
  });

  it("includes the four verified-target catalogs with required fields", () => {
    const ids = listBuiltinCatalogs().map((catalog) => catalog.id);
    expect(ids).toEqual(expect.arrayContaining(["cnra-ckan", "chhs-ckan", "cms-open-payments-dkan", "data-gov-ckan"]));
    for (const catalog of listBuiltinCatalogs()) {
      for (const field of ["id", "name", "platform", "apiVersion", "baseUrl", "jurisdiction", "description", "subjects", "inclusionReason", "knownLimitations", "publisherUrl", "apiDocsUrl"]) {
        expect(catalog[field]).toBeDefined();
      }
      expect(catalog).toHaveProperty("lastVerified");
    }
  });

  it("only records a verification date when a health check has confirmed browser access", () => {
    for (const catalog of listBuiltinCatalogs()) {
      if (catalog.lastVerified !== null) {
        expect(catalog.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
    // Data.gov's CKAN API rejects cross-origin browser requests, so it must stay unverified.
    expect(getBuiltinCatalog("data-gov-ckan").lastVerified).toBeNull();
  });

  it("marks the CORS-blocked catalog so the UI can refuse it, but not the accessible ones", () => {
    expect(catalogBrowserBlocked(getBuiltinCatalog("data-gov-ckan"))).toBe(true);
    expect(catalogBrowserBlocked(getBuiltinCatalog("cnra-ckan"))).toBe(false);
    expect(catalogBrowserBlocked(undefined)).toBe(false);
  });

  it("recognizes a blocked catalog origin from a direct dataset URL", () => {
    expect(browserBlockedOrigin("https://catalog.data.gov/dataset/medicaid-spending-by-drug")?.id).toBe("data-gov-ckan");
    expect(browserBlockedOrigin("https://data.cnra.ca.gov/dataset/anything")).toBeNull();
    expect(browserBlockedOrigin("not a url")).toBeNull();
  });
});

describe("custom catalog detection", () => {
  it("detects a working CKAN catalog", async () => {
    const fetchImpl = async () => jsonResponse({ success: true, result: { count: 0, results: [] } });
    const result = await detectCatalog("https://data.example.gov", { fetchImpl });
    expect(result).toMatchObject({ supported: true, platform: "CKAN" });
  });

  it("detects a working DKAN catalog when CKAN fails", async () => {
    const fetchImpl = async (url) => {
      if (url.includes("/api/3/action/package_search")) return jsonResponse({}, false);
      return jsonResponse([{ identifier: "abc" }]);
    };
    const result = await detectCatalog("https://payments.example.gov", { fetchImpl });
    expect(result).toMatchObject({ supported: true, platform: "DKAN" });
  });

  it("rejects an ordinary website with a useful explanation", async () => {
    const fetchImpl = async () => jsonResponse("<html></html>", true);
    const result = await detectCatalog("https://example.com", { fetchImpl });
    expect(result.supported).toBe(false);
    expect(result.reason).toMatch(/supported CKAN or DKAN API/i);
  });

  it("rejects unsafe protocols before any request", async () => {
    expect(isSafeCatalogUrl("file:///etc/passwd")).toBe(false);
    const result = await detectCatalog("file:///etc/passwd");
    expect(result.supported).toBe(false);
  });
});

describe("custom catalog normalization", () => {
  it("keeps custom catalogs under a reserved key separate from built-ins", () => {
    const catalog = normalizeCustomCatalog({ url: "https://data.example.gov/dataset/x", name: " Example ", platform: "CKAN", apiVersion: "3" });
    expect(catalog.key).toBe("catalog:custom:https://data.example.gov");
    expect(catalog.source).toBe("custom");
    expect(catalog.name).toBe("Example");
    expect(catalog.baseUrl).toBe("https://data.example.gov");
    expect(catalog.lastVerified).toEqual(expect.any(String));
  });
});
