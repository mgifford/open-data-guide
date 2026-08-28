import { describe, expect, it, vi } from "vitest";
import { capabilityDecision, connectionWarning, normalizeAvailability, probeBrowserCapabilities, probeWebGpu } from "../src/ai/browser-capabilities.js";

describe("connection warning before a large download", () => {
  it("warns on a cellular connection", () => {
    expect(connectionWarning({ navigator: { connection: { type: "cellular" } } })).toMatch(/cellular/i);
  });

  it("warns when Data Saver is enabled", () => {
    expect(connectionWarning({ navigator: { connection: { saveData: true } } })).toMatch(/Data Saver/i);
  });

  it("warns on a slow effective connection", () => {
    expect(connectionWarning({ navigator: { connection: { effectiveType: "2g" } } })).toMatch(/slow/i);
  });

  it("stays silent on unmetered connections or when the API is absent", () => {
    expect(connectionWarning({ navigator: { connection: { type: "wifi", effectiveType: "4g" } } })).toBe("");
    expect(connectionWarning({ navigator: {} })).toBe("");
  });
});

describe("WebGPU guardrail for the local model", () => {
  it("refuses when the WebGPU API is not exposed", async () => {
    const result = await probeWebGpu({ navigator: {} });
    expect(result.usable).toBe(false);
    expect(result.present).toBe(false);
    expect(result.reason).toMatch(/WebGPU/i);
  });

  it("refuses low-memory devices before requesting an adapter", async () => {
    const requestAdapter = vi.fn();
    const result = await probeWebGpu({ navigator: { gpu: { requestAdapter }, deviceMemory: 4 } });
    expect(result.usable).toBe(false);
    expect(requestAdapter).not.toHaveBeenCalled();
    expect(result.reason).toMatch(/restart/i);
  });

  it("refuses when no graphics adapter is available", async () => {
    const result = await probeWebGpu({ navigator: { gpu: { requestAdapter: vi.fn().mockResolvedValue(null) }, deviceMemory: 8 } });
    expect(result.usable).toBe(false);
    expect(result.reason).toMatch(/adapter/i);
  });

  it("allows a machine with a working adapter and enough memory", async () => {
    const result = await probeWebGpu({ navigator: { gpu: { requestAdapter: vi.fn().mockResolvedValue({ limits: {} }) }, deviceMemory: 8 } });
    expect(result.usable).toBe(true);
    expect(result.adapter).toBe(true);
  });

  it("surfaces a usable=false compute report through probeBrowserCapabilities", async () => {
    const report = await probeBrowserCapabilities({ isSecureContext: true, navigator: { gpu: { requestAdapter: vi.fn().mockResolvedValue(null) } } }, 50);
    expect(report.compute.webgpu).toBe(false);
    expect(report.compute.webgpuPresent).toBe(true);
    expect(report.compute.webgpuReason).toMatch(/adapter/i);
  });
});

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
