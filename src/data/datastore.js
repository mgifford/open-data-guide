// Remote CKAN pages default to a conservative size to keep browser memory,
// network usage, and aggregation responsiveness bounded. This is a safe
// default policy for partial remote analysis, not a universal requirement.
// Larger pages may be allowed only in explicit user-approved throughput modes
// with total-scan caps and provenance for any incomplete results.
export const DATASTORE_PAGE_SIZE = 1000;
const REMOTE_MISSING_VALUES = new Set(["none", "null", "n/a", "na", "not supplied"]);

export function datastoreResource(resource) {
  return Boolean(resource?.datastoreActive && resource.datastoreId);
}

export function datastoreRequest(resource, plan = {}, offset = 0, limit = DATASTORE_PAGE_SIZE) {
  if (!datastoreResource(resource)) throw new Error("This resource does not expose a CKAN DataStore.");
  const endpoint = new URL("/api/3/action/datastore_search", resource.catalogUrl || resource.url);
  endpoint.searchParams.set("resource_id", resource.datastoreId);
  endpoint.searchParams.set("limit", String(Math.min(Math.max(Number(limit) || DATASTORE_PAGE_SIZE, 1), DATASTORE_PAGE_SIZE)));
  endpoint.searchParams.set("offset", String(Math.max(Number(offset) || 0, 0)));
  const fields = [...new Set([plan.dimension, plan.measure, plan.timeField].filter(Boolean))];
  if (fields.length) endpoint.searchParams.set("fields", fields.join(","));
  if (plan.filters?.length) {
    const filters = {};
    plan.filters.forEach((filter) => {
      if (!filter || !filter.field || filter.operator !== "equals" || !("value" in filter)) throw new Error("CKAN DataStore supports only exact-match filters through this adapter.");
      filters[filter.field] = filter.value;
    });
    endpoint.searchParams.set("filters", JSON.stringify(filters));
  }
  if (plan.dimension) endpoint.searchParams.set("sort", `${plan.dimension} ${plan.order === "asc" ? "asc" : "desc"}`);
  return endpoint;
}

export async function queryDataStore(resource, plan = {}, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || DATASTORE_PAGE_SIZE, 1), DATASTORE_PAGE_SIZE);
  const request = datastoreRequest(resource, plan, options.offset, limit);
  const response = await fetch(request, { signal: options.signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`CKAN DataStore returned ${response.status} ${response.statusText}`);
  const payload = await response.json();
  if (!payload.success || !payload.result) throw new Error("CKAN DataStore returned no result.");
  return { rows: payload.result.records || [], total: Number(payload.result.total || 0), fields: payload.result.fields || [], offset: Number(options.offset) || 0, limit, requestUrl: request.href };
}

function isMissing(value) {
  return value === null || value === undefined || String(value).trim() === "" || REMOTE_MISSING_VALUES.has(String(value).trim().toLowerCase());
}

function numeric(value) {
  if (isMissing(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function runDataStorePlan(resource, plan = {}, options = {}) {
  const maxRows = Math.min(Math.max(Number(options.maxRows) || 100_000, 1), 1_000_000);
  const groups = new Map();
  let offset = 0;
  let scanned = 0;
  let total = 0;
  const requests = [];
  let pageNumber = 0;
  while (scanned < maxRows) {
    if (options.signal?.aborted) throw new DOMException("The DataStore query was cancelled.", "AbortError");
    const previousOffset = offset;
    const page = await queryDataStore(resource, plan, { ...options, offset, limit: Math.min(DATASTORE_PAGE_SIZE, maxRows - scanned) });
    pageNumber += 1;
    requests.push({ page: pageNumber, offset: page.offset, limit: page.limit, returned: page.rows.length, url: page.requestUrl });
    total = page.total;
    page.rows.forEach((row) => {
      const key = plan.dimension ? String(row[plan.dimension] ?? "Not supplied") : "__all__";
      const group = groups.get(key) || { category: plan.dimension ? row[plan.dimension] : undefined, values: [], count: 0, distinct: new Set() };
      group.count += 1;
      if (plan.measure) {
        const value = numeric(row[plan.measure]);
        if (value !== null) group.values.push(value);
        if (plan.aggregation === "distinct_count" && !isMissing(row[plan.measure])) group.distinct.add(String(row[plan.measure]));
      }
      groups.set(key, group);
    });
    scanned += page.rows.length;
    if (!page.rows.length || scanned >= page.total) break;
    offset += page.rows.length;
    if (offset <= previousOffset) break;
  }
  const rows = [...groups.values()].map((group) => {
    const values = group.values.sort((a, b) => a - b);
    let value = group.count;
    if (plan.aggregation === "distinct_count") value = group.distinct.size;
    if (plan.aggregation === "sum") value = values.reduce((sum, item) => sum + item, 0);
    if (plan.aggregation === "avg") value = values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : null;
    if (plan.aggregation === "min") value = values.length ? values[0] : null;
    if (plan.aggregation === "max") value = values.length ? values.at(-1) : null;
    if (plan.aggregation === "median") {
      const middle = Math.floor(values.length / 2);
      value = values.length ? (values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2) : null;
    }
    return plan.dimension ? { category: group.category, value } : { value };
  }).sort((a, b) => (plan.order === "asc" ? 1 : -1) * ((a.value ?? 0) - (b.value ?? 0)));
  return { rows: rows.slice(0, plan.limit || 100), total, scanned, truncated: scanned < total, maxRows, requests };
}