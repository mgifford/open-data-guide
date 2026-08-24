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

export async function probeBrowserCapabilities(root = globalThis, timeoutMs = 3000) {
  const apis = [];
  for (const spec of API_SPECS) {
    // Run sequentially because experimental browser implementations can contend
    // for the same model service and may not tolerate concurrent probes.
    apis.push(await probeApi(root, spec, timeoutMs));
  }
  return {
    secureContext: root.isSecureContext === true,
    apis,
    compute: {
      webgpu: Boolean(root.navigator?.gpu),
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
