import { describe, expect, it, vi } from "vitest";
import { createChromePromptProvider, createHuggingFaceProvider, deterministicProvider, providerDecision, validateProviderPlan } from "../src/ai/providers.js";

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

  it("validates ready and clarification plans independently", () => {
    expect(validateProviderPlan({ version: 1, status: "needs-clarification", question: "compare", clarification: { message: "Choose a measure", choices: ["Count", "Sum"] } }, fields)).toBe(true);
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
