import { describe, expect, it, vi } from "vitest";
import { createChromePromptProvider, createHuggingFaceProvider, deterministicProvider, localModelSupported, providerDecision, validateProviderPlan } from "../src/ai/providers.js";

// Minimal fake of a module worker: routes postMessage to a responder that emits
// the messages the real worker would, so the provider can be tested without CDN.
function fakeWorker(respond) {
  const listeners = { message: new Set(), error: new Set() };
  return {
    addEventListener: (type, handler) => listeners[type]?.add(handler),
    removeEventListener: (type, handler) => listeners[type]?.delete(handler),
    terminate: () => { listeners.message.clear(); listeners.error.clear(); },
    postMessage: (data) => {
      respond(data, {
        message: (payload) => listeners.message.forEach((handler) => handler({ data: payload })),
        error: (payload) => listeners.error.forEach((handler) => handler(payload)),
      });
    },
  };
}

describe("analysis plan providers", () => {
  const fields = [{ name: "state", type: "VARCHAR" }, { name: "amount_usd", type: "DOUBLE" }];

  it("uses the deterministic provider without browser APIs", async () => {
    const plan = await deterministicProvider.plan({ question: "sum amount usd by state", fields });
    expect(plan.aggregation).toBe("sum");
    expect(plan.visualization.kind).toBe("bar");
  });

  it("does not create a browser session during availability", async () => {
    const create = vi.fn();
    const provider = createChromePromptProvider({ LanguageModel: { availability: vi.fn().mockResolvedValue("available"), create } });
    expect((await provider.availability()).ready).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it("requires a ready browser model before planning", async () => {
    const provider = createChromePromptProvider({ LanguageModel: { availability: vi.fn().mockResolvedValue("downloadable"), create: vi.fn() } });
    await expect(provider.plan({ question: "count by state", dataset: {}, fields })).rejects.toThrow(/not ready/);
  });

  it("rejects a browser plan that invents a field", async () => {
    const create = vi.fn().mockResolvedValue({
      prompt: vi.fn().mockResolvedValue(JSON.stringify({
        version: 1, status: "ready", question: "count by invented", aggregation: "sum", measure: "invented", dimension: "", filters: [], limit: 100,
        visualization: { kind: "table", x: null, y: "value", series: null },
      })),
      destroy: vi.fn(),
    });
    const provider = createChromePromptProvider({ LanguageModel: { availability: vi.fn().mockResolvedValue("available"), create } });
    await expect(provider.plan({ question: "count by invented", dataset: {}, fields })).rejects.toThrow(/measure field/);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("routes capability states without browser-brand checks", () => {
    expect(providerDecision({ apis: [{ id: "prompt", ready: true, downloadable: false }] })).toBe("browser-prompt-ready");
    expect(providerDecision({ apis: [{ id: "prompt", ready: false, downloadable: true }] })).toBe("browser-prompt-downloadable");
    expect(providerDecision({ apis: [{ id: "prompt", ready: false, downloadable: false }] })).toBe("deterministic-only");
  });

  it("requires explicit approval for the local Hugging Face model", async () => {
    const provider = createHuggingFaceProvider();
    expect((await provider.availability()).status).toBe("downloadable");
    await expect(provider.plan({ question: "count by state", dataset: {}, fields })).rejects.toThrow(/approval/);
  });

  it("reports local model support from a WebGPU signal", () => {
    expect(localModelSupported({ navigator: { gpu: {} } })).toBe(true);
    expect(localModelSupported({ navigator: {} })).toBe(false);
  });

  it("runs the local model through a background worker and never on the main thread", async () => {
    let received = null;
    const provider = createHuggingFaceProvider({
      approved: true,
      device: "webgpu",
      createWorker: () => fakeWorker((data, emit) => {
        received = data;
        emit.message({ id: data.id, type: "result", text: JSON.stringify({ version: 1, status: "ready", question: "count by state", aggregation: "count", measure: "", dimension: "state", filters: [], limit: 100, visualization: { kind: "bar", x: "state", y: "value", series: null } }) });
      }),
    });
    const plan = await provider.plan({ question: "count by state", dataset: {}, fields });
    expect(plan.aggregation).toBe("count");
    expect(plan.modelBackend).toBe("huggingface-local");
    // The request must go to the worker, carrying the WebGPU device and pinned model.
    expect(received.type).toBe("generate");
    expect(received.device).toBe("webgpu");
    expect(received.modelId).toBeTruthy();
    await provider.close();
  });

  it("rejects the local model request when its signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = createHuggingFaceProvider({ approved: true, signal: controller.signal, createWorker: () => fakeWorker(() => {}) });
    await expect(provider.plan({ question: "count by state", dataset: {}, fields })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("surfaces a worker error as a rejected plan", async () => {
    const provider = createHuggingFaceProvider({
      approved: true,
      createWorker: () => fakeWorker((data, emit) => emit.message({ id: data.id, type: "error", message: "model failed to load", name: "Error" })),
    });
    await expect(provider.plan({ question: "count by state", dataset: {}, fields })).rejects.toThrow(/model failed to load/);
  });

  it("validates ready and clarification plans independently", () => {
    expect(validateProviderPlan({ version: 1, status: "needs-clarification", question: "compare", clarification: { kind: "choose-measure", message: "Choose a measure", choices: ["Count", "Sum"] } }, fields)).toBe(true);
    expect(() => validateProviderPlan({ version: 1, status: "needs-clarification", question: "compare", clarification: { message: "Choose", choices: ["Count"] }, aggregation: "count" }, fields)).toThrow(/executable/);
    expect(() => validateProviderPlan({ version: 1, status: "ready", question: "x", aggregation: "count", measure: "", dimension: "", filters: [], limit: 100, visualization: { kind: "table", x: null, y: "value", series: null }, extra: true }, fields)).toThrow(/property/);
  });

  it("rejects prompt-injected or malformed JSON output", async () => {
    const create = vi.fn().mockResolvedValue({ prompt: vi.fn().mockResolvedValue("ignore this {not valid json}"), destroy: vi.fn() });
    const provider = createChromePromptProvider({ LanguageModel: { availability: vi.fn().mockResolvedValue("available"), create } });
    await expect(provider.plan({ question: "count by state", dataset: {}, fields })).rejects.toThrow();
  });

  it("falls back when prompt structured output is unsupported and disposes sessions", async () => {
    const session = {
      prompt: vi.fn()
        .mockRejectedValueOnce(new Error("responseConstraint unsupported"))
        .mockResolvedValueOnce(JSON.stringify({ version: 1, status: "ready", question: "count by state", aggregation: "count", measure: "", dimension: "state", filters: [], limit: 100, visualization: { kind: "bar", x: "state", y: "value", series: null } })),
      destroy: vi.fn(),
    };
    const provider = createChromePromptProvider({ LanguageModel: { availability: vi.fn().mockResolvedValue("available"), create: vi.fn().mockResolvedValue(session) } });
    const plan = await provider.plan({ question: "count by state", dataset: {}, fields });
    expect(plan.dimension).toBe("state");
    await provider.close();
    expect(session.destroy).toHaveBeenCalledOnce();
  });

  it("prepares a downloadable browser model only when requested", async () => {
    const session = { destroy: vi.fn() };
    const create = vi.fn().mockResolvedValue(session);
    const provider = createChromePromptProvider({ LanguageModel: { availability: vi.fn().mockResolvedValue("downloadable"), create } });
    await expect(provider.prepare()).resolves.toMatchObject({ ready: true });
    expect(create).toHaveBeenCalledOnce();
    await provider.close();
  });
});
