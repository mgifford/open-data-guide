const SAFE_PROTOCOLS = new Set(["https:", "http:"]);

export const CATALOG_REGISTRY_VERSION = 1;

// Built-in catalogs are defined here and kept separate from user-saved catalogs.
// `lastVerified` is null until a real browser-side API + CORS health check confirms
// the endpoint responds. A loading website is not sufficient evidence.
export const BUILTIN_CATALOGS = [
  {
    id: "cnra-ckan",
    name: "California Natural Resources Agency",
    platform: "CKAN",
    apiVersion: "3",
    baseUrl: "https://data.cnra.ca.gov",
    jurisdiction: "California, United States",
    description: "State environmental and natural-resource datasets covering water, groundwater, infrastructure, and wildlife.",
    subjects: ["water", "groundwater", "environment", "wildlife", "infrastructure"],
    inclusionReason: "Already covered by the application's automated tests and used as the default exploration starting point.",
    lastVerified: null,
    knownLimitations: "Some resources are large or lack CORS headers for direct browser download; DataStore availability varies by resource.",
    publisherUrl: "https://data.cnra.ca.gov",
    apiDocsUrl: "https://docs.ckan.org/en/latest/api/",
  },
  {
    id: "chhs-ckan",
    name: "California Health and Human Services",
    platform: "CKAN",
    apiVersion: "3",
    baseUrl: "https://data.chhs.ca.gov",
    jurisdiction: "California, United States",
    description: "State health and human-services open data, including public health, licensing, and demographic datasets.",
    subjects: ["health", "public health", "demographics", "human services"],
    inclusionReason: "Broadens coverage to health and human-services data from a second California CKAN catalog.",
    lastVerified: null,
    knownLimitations: "Cross-origin access and DataStore availability vary by resource; verify each resource before assuming browser access.",
    publisherUrl: "https://data.chhs.ca.gov",
    apiDocsUrl: "https://docs.ckan.org/en/latest/api/",
  },
  {
    id: "cms-open-payments-dkan",
    name: "CMS Open Payments",
    platform: "DKAN",
    apiVersion: "1",
    baseUrl: "https://openpaymentsdata.cms.gov",
    jurisdiction: "United States (federal)",
    description: "Payments and transfers of value from drug and device companies to physicians and teaching hospitals.",
    subjects: ["health", "payments", "conflicts of interest", "transparency"],
    inclusionReason: "Provides a current federal DKAN catalog to exercise DKAN metastore search alongside CKAN catalogs.",
    lastVerified: null,
    knownLimitations: "Large national datasets; browser download and cross-origin access are not guaranteed for every resource.",
    publisherUrl: "https://openpaymentsdata.cms.gov",
    apiDocsUrl: "https://openpaymentsdata.cms.gov/about/api",
  },
  {
    id: "data-gov-ckan",
    name: "Data.gov",
    platform: "CKAN",
    apiVersion: "3",
    baseUrl: "https://catalog.data.gov",
    jurisdiction: "United States (federal aggregator)",
    description: "The United States federal open-data aggregator, indexing datasets from many federal agencies.",
    subjects: ["federal", "aggregator", "multi-agency", "cross-domain"],
    inclusionReason: "Federal aggregator giving broad cross-agency coverage through a single CKAN API.",
    lastVerified: null,
    knownLimitations: "Indexes external resources hosted elsewhere; catalog metadata retrieval does not imply a resource is browser-accessible.",
    publisherUrl: "https://data.gov",
    apiDocsUrl: "https://docs.ckan.org/en/latest/api/",
  },
];

export function listBuiltinCatalogs() {
  return BUILTIN_CATALOGS.map((catalog) => ({ ...catalog, source: "builtin" }));
}

export function getBuiltinCatalog(id) {
  const catalog = BUILTIN_CATALOGS.find((entry) => entry.id === id);
  return catalog ? { ...catalog, source: "builtin" } : null;
}

export const DEFAULT_CATALOG_ID = "cnra-ckan";

export function isSafeCatalogUrl(url) {
  try {
    return SAFE_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

// Detect whether a catalog URL exposes a supported CKAN or DKAN API. This never
// trusts the website loading; it requires a supported API endpoint to respond.
export async function detectCatalog(catalogUrl, { fetchImpl = fetch, signal } = {}) {
  if (!isSafeCatalogUrl(catalogUrl)) {
    return { supported: false, platform: null, reason: "Enter a public HTTP or HTTPS catalog URL." };
  }
  const origin = new URL(catalogUrl).origin;

  const ckanEndpoint = new URL("/api/3/action/package_search", origin);
  ckanEndpoint.searchParams.set("rows", "0");
  try {
    const response = await fetchImpl(ckanEndpoint.href, { headers: { Accept: "application/json" }, signal });
    if (response.ok) {
      const data = await response.json();
      if (data && data.success === true && data.result) {
        return { supported: true, platform: "CKAN", apiVersion: "3", origin, baseUrl: origin };
      }
    }
  } catch (error) {
    if (error?.name === "AbortError") throw error;
  }

  const dkanEndpoint = new URL("/api/1/metastore/schemas/dataset/items", origin);
  dkanEndpoint.searchParams.set("page-size", "1");
  try {
    const response = await fetchImpl(dkanEndpoint.href, { headers: { Accept: "application/json" }, signal });
    if (response.ok) {
      const data = await response.json();
      const items = Array.isArray(data) ? data : data?.items || data?.data;
      if (Array.isArray(items)) {
        return { supported: true, platform: "DKAN", apiVersion: "1", origin, baseUrl: origin };
      }
    }
  } catch (error) {
    if (error?.name === "AbortError") throw error;
  }

  return {
    supported: false,
    platform: null,
    origin,
    reason: "No supported CKAN or DKAN API responded from this URL in the browser. It may be an ordinary website, block cross-origin requests, or use an unsupported platform.",
  };
}

export function normalizeCustomCatalog({ url, name = "", platform, apiVersion }) {
  const origin = new URL(url).origin;
  return {
    id: `custom:${origin}`,
    key: `catalog:custom:${origin}`,
    source: "custom",
    name: name.trim() || origin,
    platform,
    apiVersion,
    baseUrl: origin,
    jurisdiction: "User-provided",
    description: "A catalog you added and verified in this browser.",
    subjects: [],
    inclusionReason: "Added by the user.",
    lastVerified: new Date().toISOString(),
    knownLimitations: "Browser access to individual resources still depends on the catalog's CORS and hosting.",
    publisherUrl: origin,
    apiDocsUrl: "",
  };
}
