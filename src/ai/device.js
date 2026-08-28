// Whether a model-run error means "the GPU cannot do this right now" and is
// worth retrying on the CPU (WASM). A WebGPU adapter can be lost or run out of
// memory at run time even after the pre-flight check passed — another app grabs
// the GPU, the driver resets, or the working set overflows device memory. These
// are recoverable by switching device; a plain model or CDN error is not, so it
// must keep propagating. Kept as a pure export so both the worker and its tests
// share one definition.
const RECOVERABLE_GPU_FAILURE = /device.*lost|gpu.*lost|out.?of.?memory|webgpu.*(unavailable|fail)|overflow/i;

export function isRecoverableGpuFailure(message) {
  return RECOVERABLE_GPU_FAILURE.test(String(message || ""));
}
