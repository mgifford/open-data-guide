const API_SPECS = [
  {
    id: "prompt",
    label: "Prompt API",
    paths: ["LanguageModel", "ai.languageModel"],
    options: {},
  },
  {
    id: "summarizer",
    label: "Summarizer API",
    paths: ["Summarizer"],
    options: { type: "key-points", format: "plain-text", length: "short" },
  },
  {
    id: "writer",
    label: "Writer API",
    paths: ["Writer"],
    options: {},
  },
  {
    id: "rewriter",
    label: "Rewriter API",
    paths: ["Rewriter"],
    options: {},
  },
  {
    id: "translator",
    label: "Translator API",
    paths: ["Translator"],
    options: { sourceLanguage: "en", targetLanguage: "fr" },
  },
  {
    id: "language-detector",
    label: "Language Detector API",
    paths: ["LanguageDetector"],
    options: {},
  },
];

export function resolvePath(root, path) {
  return path.split(".").reduce((value, key) => value?.[key], root);
}

export function normalizeAvailability(value) {
  const raw = String(value?.status ?? value?.available ?? value ?? "unknown").toLowerCase();
  if (["available", "readily", "ready"].includes(raw)) {
    return { status: "available", ready: true, downloadable: false };
  }
  if (["downloadable", "after-download"].includes(raw)) {
    return { status: "downloadable", ready: false, downloadable: true };
  }
  if (raw === "downloading") {
    return { status: "downloading", ready: false, downloadable: true };
  }
  if (["unavailable", "no"].includes(raw)) {
    return { status: "unavailable", ready: false, downloadable: false };
  }
  return { status: raw, ready: false, downloadable: false };
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("availability check timed out")), timeoutMs);
    }),
  ]);
}

async function probeApi(root, spec, timeoutMs) {
  const detectedPath = spec.paths.find((path) => resolvePath(root, path) !== undefined);
  if (!detectedPath) {
    return { ...spec, detected: false, detectedPath: "", status: "not-exposed", ready: false, downloadable: false };
  }
  const api = resolvePath(root, detectedPath);
  if (typeof api?.availability !== "function") {
    const ready = typeof api?.create === "function" || typeof api === "function";
    return { ...spec, detected: true, detectedPath, status: ready ? "exposed" : "unknown", ready, downloadable: false };
  }
  try {
    const result = await withTimeout(Promise.resolve(api.availability(spec.options)), timeoutMs);
    return { ...spec, detected: true, detectedPath, ...normalizeAvailability(result) };
  } catch (error) {
    return { ...spec, detected: true, detectedPath, status: "error", ready: false, downloadable: false, error: error.message };
  }
}

// Below this many gigabytes of reported device memory, loading a ~500 MB local
// model into WebGPU buffers is very likely to exhaust memory. On Apple Silicon
// and other unified-memory machines that pressure can stall the system
// compositor and take the whole desktop down, forcing a restart — so we refuse
// to offer the local model at all. navigator.deviceMemory is coarse and capped
// at 8 for privacy, so an 8 GB machine is indistinguishable from a 64 GB one;
// this threshold only catches the clearly-too-small devices. Everything at or
// above it still gets an explicit plain-language risk warning before download.
export const LOCAL_MODEL_MIN_DEVICE_MEMORY_GB = 8;

// Actually resolve a WebGPU adapter instead of trusting that navigator.gpu
// merely exists. A browser can expose the API but fail to return an adapter
// (blocklisted GPU, software fallback disabled, headless), in which case the
// model cannot run and offering it would only produce a confusing failure or,
// worse, a hang. Returns a structured result the UI uses to decide whether to
// offer the local model and how strongly to warn.
export async function probeWebGpu(root = globalThis, timeoutMs = 3000) {
  const gpu = root.navigator?.gpu;
  const deviceMemory = typeof root.navigator?.deviceMemory === "number" ? root.navigator.deviceMemory : null;
  if (!gpu) {
    return { present: false, usable: false, adapter: false, deviceMemory, reason: "This browser does not expose WebGPU. A local model would fall back to CPU, which is slow enough to look like a frozen page." };
  }
  if (deviceMemory !== null && deviceMemory < LOCAL_MODEL_MIN_DEVICE_MEMORY_GB) {
    return { present: true, usable: false, adapter: false, deviceMemory, reason: `This device reports about ${deviceMemory} GB of memory. Loading a ~500 MB model into WebGPU memory on a machine this small can make the whole computer unresponsive and force a restart, so it is not offered here.` };
  }
  if (typeof gpu.requestAdapter !== "function") {
    // Older or partial implementations: the API object exists but we cannot
    // confirm a working adapter. Treat presence as usable but let callers warn.
    return { present: true, usable: true, adapter: false, deviceMemory, reason: "" };
  }
  try {
    const adapter = await withTimeout(Promise.resolve(gpu.requestAdapter()), timeoutMs);
    if (!adapter) {
      return { present: true, usable: false, adapter: false, deviceMemory, reason: "WebGPU is exposed but no graphics adapter is available to this browser, so a local model cannot run here." };
    }
    return { present: true, usable: true, adapter: true, deviceMemory, reason: "" };
  } catch (error) {
    return { present: true, usable: false, adapter: false, deviceMemory, reason: `WebGPU could not initialise a graphics adapter (${error.message}), so a local model cannot run here.` };
  }
}

// A plain-language caution when a large model download would run over a
// metered, cellular, or slow connection, or with Data Saver on — so a ~500 MB
// download does not silently burn mobile data. Returns "" when the connection
// looks unmetered or the Network Information API is unavailable (Safari,
// Firefox), in which case no false warning is shown.
export function connectionWarning(root = globalThis) {
  const connection = root.navigator?.connection;
  if (!connection) return "";
  if (connection.saveData) return "Data Saver is turned on in your browser, which usually means you are trying to limit data use. This model download is large.";
  if (connection.type === "cellular") return "You appear to be on a cellular connection. Downloading the model may use mobile data and could incur charges.";
  if (/^(slow-2g|2g|3g)$/.test(connection.effectiveType || "")) return "Your connection looks slow, so downloading the model may take a long time.";
  return "";
}

export async function probeBrowserCapabilities(root = globalThis, timeoutMs = 3000) {
  const apis = [];
  for (const spec of API_SPECS) {
    // Run sequentially because experimental browser implementations can contend
    // for the same model service and may not tolerate concurrent probes.
    apis.push(await probeApi(root, spec, timeoutMs));
  }
  const webgpu = await probeWebGpu(root, timeoutMs);
  return {
    secureContext: root.isSecureContext === true,
    apis,
    compute: {
      // Kept as a boolean for backward compatibility: true only when a working
      // adapter was confirmed and the device is large enough to be offered the
      // local model. `webgpuPresent` records that the API merely exists.
      webgpu: webgpu.usable,
      webgpuPresent: webgpu.present,
      webgpuAdapter: webgpu.adapter,
      webgpuReason: webgpu.reason,
      deviceMemory: webgpu.deviceMemory,
      webnn: Boolean(root.navigator?.ml),
    },
  };
}

export function capabilityDecision(report) {
  const prompt = report.apis.find((api) => api.id === "prompt");
  return {
    queryPlanner: prompt?.ready ? "browser-ready"
      : prompt?.downloadable ? "browser-downloadable"
        : "no-browser-prompt-api",
    relatedDatasets: "no-browser-embedding-api",
    appModelUseful: true,
  };
}
