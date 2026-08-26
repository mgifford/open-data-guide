import { describe, expect, it, vi } from "vitest";
import { createActivityLog, sanitizeActivityDetails } from "../src/ui/activity.js";

describe("activity diagnostics", () => {
  it("redacts credentials and row-bearing details", () => {
    const details = sanitizeActivityDetails({ url: "https://example.test/data?token=secret", rows: [{ value: 1 }], stage: "loaded" });
    expect(details.url).toContain("token=[redacted]");
    expect(details.rows).toBe("[omitted]");
    expect(details.stage).toBe("loaded");
  });

  it("keeps a bounded session event list", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const log = createActivityLog({ limit: 2, now: () => new Date("2026-01-01T00:00:00Z") });
    log.add({ operation: "one" });
    log.add({ operation: "two" });
    log.add({ operation: "three" });
    expect(log.list()).toHaveLength(2);
    expect(log.list()[0].operation).toBe("two");
    expect(debug).toHaveBeenCalledTimes(3);
    debug.mockRestore();
  });
});
