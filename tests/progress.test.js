import { describe, expect, it } from "vitest";
import { createAggregateReporter } from "../src/ai/progress.js";

describe("byte-weighted aggregate download progress", () => {
  it("weights progress by bytes across files instead of resetting to zero per file", () => {
    const posted = [];
    const report = createAggregateReporter(1, (message) => posted.push(message));

    // Two 100-byte files, both sizes known early. Per-file reporting would show
    // 0, 0, 50 (model done), then 0 again for the tokenizer; byte weighting
    // climbs 0 -> 25 -> 75 -> 100 without ever falling back to zero.
    report({ status: "progress", file: "model.onnx", loaded: 0, total: 100, progress: 0 });
    report({ status: "progress", file: "tokenizer.json", loaded: 50, total: 100, progress: 50 });
    report({ status: "progress", file: "model.onnx", loaded: 100, total: 100, progress: 100 });
    report({ status: "progress", file: "tokenizer.json", loaded: 100, total: 100, progress: 100 });

    const percents = posted.map((message) => message.event.aggregateProgress);
    expect(percents).toEqual([0, 25, 75, 100]);
    // Once the tokenizer's size is known, the aggregate only rises.
    expect(percents.slice(1)).toEqual([...percents.slice(1)].sort((a, b) => a - b));
  });

  it("falls back to the per-file percent when totals are unknown", () => {
    const posted = [];
    const report = createAggregateReporter(2, (message) => posted.push(message));
    report({ status: "progress", file: "weights", loaded: 0, total: 0, progress: 42 });
    expect(posted[0].event.aggregateProgress).toBe(42);
  });

  it("passes through non-progress events unchanged", () => {
    const posted = [];
    const report = createAggregateReporter(3, (message) => posted.push(message));
    report({ status: "done", file: "model.onnx" });
    expect(posted[0]).toEqual({ id: 3, type: "progress", event: { status: "done", file: "model.onnx" } });
  });
});
