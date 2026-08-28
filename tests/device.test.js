import { describe, expect, it } from "vitest";
import { isRecoverableGpuFailure } from "../src/ai/device.js";

describe("recoverable GPU failure detection", () => {
  it("matches device-lost, out-of-memory, and overflow errors", () => {
    expect(isRecoverableGpuFailure("The WebGPU device was lost")).toBe(true);
    expect(isRecoverableGpuFailure("GPU device lost: reason unknown")).toBe(true);
    expect(isRecoverableGpuFailure("Out of memory allocating buffer")).toBe(true);
    expect(isRecoverableGpuFailure("out-of-memory")).toBe(true);
    expect(isRecoverableGpuFailure("Tensor size overflow")).toBe(true);
  });

  it("does not match ordinary model or network errors", () => {
    expect(isRecoverableGpuFailure("model failed to load")).toBe(false);
    expect(isRecoverableGpuFailure("Failed to fetch from CDN")).toBe(false);
    expect(isRecoverableGpuFailure("")).toBe(false);
    expect(isRecoverableGpuFailure(undefined)).toBe(false);
  });
});
