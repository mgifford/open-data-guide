const SUPPORTED_FORMATS = new Set(["csv", "json", "parquet"]);
const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

function valueOf(value) {
  if (Array.isArray(value)) return value[0];
  if (value && typeof value === "object") return value.name || value.title || value.identifier || "";
  return value || "";
}

export function inferFormat(url, declared = "") {
  const normalized = String(declared).toLowerCase().replace(/^\./, "");
  if (SUPPORTED_FORMATS.has(normalized)) return normalized;
  const path = new URL(url, "https://placeholder.invalid").pathname.toLowerCase();
  return [...SUPPORTED_FORMATS].find((format) => path.endsWith(`.${format}`)) || "";
}

function normalizeResource(resource, index = 0) {
  const url = valueOf(resource.downloadURL || resource.accessURL || resource.url);
  const format = inferFormat(url, valueOf(resource.format || resource.mediaType).split("/").pop());
  return {
    id: valueOf(resource.identifier || resource.id) || `resource-${index + 1}`,
    title: valueOf(resource.title || resource.name) || `Resource ${index + 1}`,
    url,
    format,
    mediaType: valueOf(resource.mediaType || resource.mimetype),
    dataDictionaryUrl: valueOf(resource.describedBy),
  };
}

function normalizedDataset(values) {
  return {
    themes: values.themes || [],
    keywords: values.keywords || [],
    issued: values.issued || "",
    modified: values.modified || "",
    temporal: values.temporal || "",
    spatial: values.spatial || "",
    fields: values.fields || [],
    documentationUrls: values.documentationUrls || [],
    retrievedAt: values.retrievedAt || new Date().toISOString(),
    connectorId: values.connectorId || "unknown",
    catalogUrl: values.catalogUrl || values.sourceUrl || "",
  };
}

export function normalizeDkan(data, sourceUrl) {
  const resources = (data.distribution || []).map(normalizeResource).filter((item) => item.url);
  return {
    ...normalizedDataset({ connectorId: "dkan", catalogUrl: new URL(sourceUrl).origin, modified: data.modified }),
    key: `dkan:${data.identifier || sourceUrl}`,
    platform: "DKAN",
    id: data.identifier || sourceUrl,
    sourceUrl,
    title: valueOf(data.title) || "Untitled DKAN dataset",
    description: valueOf(data.description),
    publisher: valueOf(data.publisher),
    license: valueOf(data.license),
    modified: valueOf(data.modified),
    resources,
  };
}

export function normalizeCkan(data, sourceUrl) {
  const resources = (data.resources || []).map(normalizeResource).filter((item) => item.url);
  return {
    ...normalizedDataset({ connectorId: "ckan", catalogUrl: new URL(sourceUrl).origin, modified: data.metadata_modified }),
    key: `ckan:${data.id || data.name || sourceUrl}`,
    platform: "CKAN",
    id: data.id || data.name || sourceUrl,
    sourceUrl,
    title: data.title || data.name || "Untitled CKAN dataset",
    description: data.notes || "",
    publisher: valueOf(data.organization),
    license: data.license_title || data.license_url || "",
    modified: data.metadata_modified || data.revision_timestamp || "",
    resources,
  };
}

export function normalizeDcat(data, sourceUrl) {
  const distributions = data.distribution || data.distributions || [];
  const dataset = {
    ...normalizedDataset({
      connectorId: "dcat-us",
      catalogUrl: sourceUrl,
      themes: data.theme || data.themes,
      keywords: data.keyword,
      issued: data.issued,
      modified: data.modified,
      temporal: data.temporal,
      spatial: data.spatial,
      documentationUrls: data.landingPage ? [data.landingPage] : [],
    }),
    key: `dcat:${data.identifier || data.id || sourceUrl}`,
    platform: "DCAT-US",
    id: data.identifier || data.id || sourceUrl,
    sourceUrl,
    title: valueOf(data.title) || "Untitled DCAT dataset",
    description: valueOf(data.description),
    publisher: valueOf(data.publisher),
    license: valueOf(data.license),
    resources: distributions.map(normalizeResource).filter((item) => item.url),
  };
  return dataset;
}

export function normalizeGithubRepository(data, sourceUrl) {
  const resources = (data.resources || []).map(normalizeResource).filter((item) => item.url);
  return {
    ...normalizedDataset({ connectorId: "github", catalogUrl: sourceUrl, documentationUrls: data.documentationUrls }),
    key: `github:${data.full_name || sourceUrl}`,
    platform: "GitHub",
    id: data.full_name || sourceUrl,
    sourceUrl,
    title: data.title || data.full_name || "GitHub data repository",
    description: data.description || "A public GitHub repository opened by the user.",
    publisher: data.owner || "",
    license: data.license || "",
    resources,
  };
}

function directDataset(url) {
  const parsed = new URL(url);
  const title = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname);
  return {
    ...normalizedDataset({ connectorId: "direct", catalogUrl: url.origin }),
    key: `direct:${url}`,
    platform: "Direct file",
    id: url,
    sourceUrl: url,
    title,
    description: "A directly linked data resource. Publisher metadata was not supplied by a catalog API.",
    publisher: parsed.hostname,
    license: "",
    modified: "",
    resources: [{ id: url, title, url, format: inferFormat(url), mediaType: "", dataDictionaryUrl: "" }],
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

export async function resolveDataset(input) {
  const url = new URL(input.trim());
  if (!SAFE_PROTOCOLS.has(url.protocol)) throw new Error("Only public HTTP or HTTPS URLs are supported.");
  const format = inferFormat(url.href);
  if (format) return directDataset(url.href);

  const match = url.pathname.match(/\/dataset\/([^/?#]+)/i);
  if (!match) {
    throw new Error("Use a direct CSV, JSON, or Parquet URL, or a dataset page from a public data catalog.");
  }

  const id = decodeURIComponent(match[1]);
  const attempts = [];
  const dkanUrl = `${url.origin}/api/1/metastore/schemas/dataset/items/${encodeURIComponent(id)}`;
  try {
    const data = await fetchJson(dkanUrl);
    return normalizeDkan(data, url.href);
  } catch (error) {
    attempts.push(`DKAN: ${error.message}`);
  }

  const ckanUrl = `${url.origin}/api/3/action/package_show?id=${encodeURIComponent(id)}`;
  try {
    const response = await fetchJson(ckanUrl);
    if (!response.success || !response.result) throw new Error("API returned no dataset");
    return normalizeCkan(response.result, url.href);
  } catch (error) {
    attempts.push(`CKAN: ${error.message}`);
  }

  throw new Error(`The data catalog could not be resolved from this browser. ${attempts.join("; ")}. The catalog may block cross-origin requests.`);
}

export function connectorFor(url) {
  const parsed = new URL(url);
  if (inferFormat(parsed.href)) return "direct";
  if (parsed.hostname === "github.com") return "github";
  if (parsed.pathname.includes("/dataset/")) return "dkan-or-ckan";
  if (parsed.pathname.endsWith("data.json")) return "dcat-us";
  return "unknown";
}

export async function searchCkanCatalog(catalogUrl, query) {
  const base = new URL(catalogUrl);
  const endpoint = new URL("/api/3/action/package_search", base.origin);
  endpoint.searchParams.set("q", query);
  const response = await fetchJson(endpoint.href);
  if (!response.success) throw new Error("The CKAN catalog did not return search results.");
  return (response.result?.results || []).map((item) => normalizeCkan(item, `${base.origin}/dataset/${item.name || item.id}`));
}

export async function loadDataDictionary(resource) {
  if (!resource.dataDictionaryUrl) return [];
  try {
    const response = await fetchJson(resource.dataDictionaryUrl);
    return response.data?.fields || response.fields || [];
  } catch {
    return [];
  }
}
