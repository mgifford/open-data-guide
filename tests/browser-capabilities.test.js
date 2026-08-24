import { describe, expect, it, vi } from "vitest";
import { capabilityDecision, normalizeAvailability, probeBrowserCapabilities } from "../src/ai/browser-capabilities.js";

describe("browser AI capability detection", () => {
  it("normalizes current and earlier availability vocabulary", () => {
    expect(normalizeAvailability("available").ready).toBe(true);
    expect(normalizeAvailability("readily").ready).toBe(true);
    expect(normalizeAvailability("after-download").downloadable).toBe(true);
    expect(normalizeAvailability("unavailable").ready).toBe(false);
  });

  it("detects a ready browser-provided prompt model without creating it", async () => {
    const create = vi.fn();
    const root = {
      isSecureContext: true,
      navigator: { gpu: {} },
      LanguageModel: { availability: vi.fn().mockResolvedValue("available"), create },
    };
    const report = await probeBrowserCapabilities(root, 50);
    expect(report.apis.find((api) => api.id === "prompt").ready).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect(capabilityDecision(report).queryPlanner).toBe("browser-ready");
  });

  it("distinguishes a browser-managed download from a ready model", async () => {
    const root = {
      isSecureContext: true,
      navigator: {},
      LanguageModel: { availability: vi.fn().mockResolvedValue("downloadable") },
    };
    const report = await probeBrowserCapabilities(root, 50);
    expect(capabilityDecision(report).queryPlanner).toBe("browser-downloadable");
    expect(capabilityDecision(report).relatedDatasets).toBe("no-browser-embedding-api");
  });

  it("reports an API that does not answer rather than blocking the page", async () => {
    const root = {
      isSecureContext: true,
      navigator: {},
      Translator: { availability: () => new Promise(() => {}) },
    };
    const report = await probeBrowserCapabilities(root, 5);
    expect(report.apis.find((api) => api.id === "translator").status).toBe("error");
  });
});
