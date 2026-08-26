import { describe, expect, it, vi } from "vitest";
import { datastoreRequest, datastoreResource, queryDataStore, runDataStorePlan } from "../src/data/datastore.js";

describe("CKAN DataStore adapter", () => {
  const resource = { datastoreActive: true, datastoreId: "resource-1", catalogUrl: "https://catalog.example.gov", url: "https://files.example.net/download/data.csv" };

  it("builds bounded, parameterized DataStore requests", () => {
    expect(datastoreResource(resource)).toBe(true);
    const request = datastoreRequest(resource, { dimension: "county", measure: "amount", filters: [{ field: "state", operator: "equals", value: "CA" }] }, 20, 500);
    expect(request.pathname).toBe("/api/3/action/datastore_search");
    expect(request.searchParams.get("resource_id")).toBe("resource-1");
    expect(request.searchParams.get("fields")).toBe("county,amount");
    expect(request.searchParams.get("limit")).toBe("500");
    expect(request.searchParams.get("filters")).toContain("CA");
    expect(request.searchParams.get("filters")).not.toContain("SELECT");
  });

  it("rejects non-exact filters instead of emitting remote SQL", () => {
    expect(() => datastoreRequest(resource, { filters: [{ field: "amount", operator: "greater_than", value: 10 }] })).toThrow(/exact-match/);
  });

  it("returns normalized records and forwards cancellation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, result: { records: [{ county: "Alameda" }], total: 1, fields: [{ id: "county" }] } })));
    const signal = AbortSignal.timeout(1000);
    await expect(queryDataStore(resource, {}, { signal })).resolves.toMatchObject({ rows: [{ county: "Alameda" }], total: 1 });
    expect(fetchMock.mock.calls[0][1].signal).toBe(signal);
    expect(fetchMock.mock.calls[0][0].href).toContain("datastore_search");
    fetchMock.mockRestore();
  });

  it("rejects resources without DataStore support", () => {
    expect(() => datastoreRequest({ url: "https://example.gov/data.csv" })).toThrow(/DataStore/);
  });

  it("requires the preserved catalog origin for DataStore requests", () => {
    expect(() => datastoreRequest({ datastoreActive: true, datastoreId: "resource-1", url: "https://files.example.net/download/data.csv" })).toThrow(/catalog origin/i);
  });

  it("paginates and aggregates a controlled DataStore fixture", async () => {
    let calls = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      calls += 1;
      const records = [{ county: "Alameda", amount: 10 }, { county: "Alameda", amount: 5 }, { county: "Butte", amount: 7 }];
      return new Response(JSON.stringify({ success: true, result: { records, total: 3, fields: [] } }));
    });
    await expect(runDataStorePlan(resource, { aggregation: "sum", measure: "amount", dimension: "county", limit: 10 })).resolves.toMatchObject({ rows: [{ category: "Alameda", value: 15 }, { category: "Butte", value: 7 }], scanned: 3, truncated: false });
    expect(calls).toBe(1);
    fetchMock.mockRestore();
  });

  it("continues across server-capped short pages until the reported total", async () => {
    const calls = [];
    const allRows = [{ state: "A" }, { state: "A" }, { state: "B" }, { state: "B" }, { state: "C" }];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (request) => {
      const url = new URL(request.url || request);
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      calls.push({ offset, limit });
      return new Response(JSON.stringify({ success: true, result: { records: allRows.slice(offset, offset + 2), total: 5, fields: [] } }));
    });
    const result = await runDataStorePlan(resource, { aggregation: "count", dimension: "state" }, { maxRows: 100_000 });
    expect(calls).toHaveLength(3);
    expect(calls.map((call) => call.offset)).toEqual([0, 2, 4]);
    expect(calls.every((call) => call.limit === 1000)).toBe(true);
    expect(result.scanned).toBe(5);
    expect(result.truncated).toBe(false);
    expect(result.rows).toEqual([{ category: "A", value: 2 }, { category: "B", value: 2 }, { category: "C", value: 1 }]);
    fetchMock.mockRestore();
  });

  it("averages the two middle values for an even median", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, result: { records: [{ amount: 1 }, { amount: 3 }, { amount: 9 }, { amount: 11 }], total: 4, fields: [] } })));
    await expect(runDataStorePlan(resource, { aggregation: "median", measure: "amount", limit: 10 })).resolves.toMatchObject({ rows: [{ value: 6 }] });
    fetchMock.mockRestore();
  });

  it("calculates an even-sized median using both middle values", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ success: true, result: {
      records: [{ amount: 1 }, { amount: 3 }, { amount: 9 }, { amount: 11 }], total: 4, fields: [],
    } })));
    const result = await runDataStorePlan(resource, { aggregation: "median", measure: "amount", limit: 10 });
    expect(result.rows).toEqual([{ value: 6 }]);
    fetchMock.mockRestore();
  });

  it("applies local missing-value rules to every numeric aggregation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ success: true, result: {
      records: [{ amount: "" }, { amount: "  " }, { amount: "N/A" }, { amount: "None" }, { amount: 4 }], total: 5, fields: [],
    } })));
    for (const aggregation of ["avg", "median", "min", "max", "sum"]) {
      await expect(runDataStorePlan(resource, { aggregation, measure: "amount" })).resolves.toMatchObject({ rows: [{ value: 4 }] });
    }
    await expect(runDataStorePlan(resource, { aggregation: "distinct_count", measure: "amount" })).resolves.toMatchObject({ rows: [{ value: 1 }] });
    fetchMock.mockRestore();
  });

  it("matches the deterministic controlled file result", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, result: {
      records: [{ state: "CA", amount: 10 }, { state: "CA", amount: 5 }, { state: "NY", amount: 7 }], total: 3, fields: [],
    } })));
    const remote = await runDataStorePlan(resource, { aggregation: "sum", measure: "amount", dimension: "state", limit: 10 });
    const fileExpected = [{ category: "CA", value: 15 }, { category: "NY", value: 7 }];
    expect(remote.rows).toEqual(fileExpected);
    fetchMock.mockRestore();
  });

  it("stops before a remote request when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runDataStorePlan(resource, {}, { signal: controller.signal })).rejects.toThrow(/cancelled/);
  });
});