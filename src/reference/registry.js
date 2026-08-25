const SAFE_PROTOCOLS = new Set(["https:", "http:"]);

export const REFERENCE_SOURCES = [
  {
    id: "census-acs-static",
    authority: "U.S. Census Bureau",
    license: "Check the selected extract's Census terms",
    kind: "static-resource",
    supports: ["zcta", "fips"],
    status: "planned",
    notes: "Use only a versioned, locally hosted or user-selected extract. ACS estimates require vintage and margin-of-error pairing.",
  },
  {
    id: "census-acs-api",
    authority: "U.S. Census Bureau",
    license: "Census API terms",
    kind: "api",
    supports: ["zcta", "fips"],
    status: "user-configured",
    notes: "Requires a user-supplied session key; never embed a key in the static application.",
  },
  {
    id: "local-http-mcp",
    authority: "User-configured local service",
    license: "User must verify",
    kind: "http-mcp",
    supports: ["postal-code", "zcta", "fips"],
    status: "user-configured",
    notes: "Only compatible with an explicitly configured local endpoint; no default service is called.",
  },
];

export function getReferenceSource(id) {
  return REFERENCE_SOURCES.find((source) => source.id === id) || null;
}

export function checkReferenceCompatibility(source, url = "") {
  const record = typeof source === "string" ? getReferenceSource(source) : source;
  if (!record) return { compatible: false, reasons: ["Reference source is not registered."] };
  if (url && !SAFE_PROTOCOLS.has(new URL(url).protocol)) return { compatible: false, reasons: ["Reference resources must use HTTP or HTTPS."] };
  if (record.kind === "http-mcp" && url) {
    const hostname = new URL(url).hostname;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) return { compatible: false, reasons: ["The local HTTP-MCP reference source accepts loopback hosts only."] };
  }
  return { compatible: true, reasons: [record.kind === "api" ? "API requires explicit user configuration." : record.kind === "static-resource" ? "Static resource can be versioned and queried locally." : "HTTP-MCP endpoint requires explicit local configuration."] };
}

export function planUniqueLookup({ sourceId, role, values, country = "", minimumGroupSize = 10, sensitive = false, sourceVintage = "", sourceDigest = "", estimateField = "", marginOfErrorField = "", compatibility = null }) {
  const source = getReferenceSource(sourceId);
  if (!source) throw new Error("Choose a registered reference-data source.");
  if (!source.supports.includes(role)) throw new Error("The selected source does not document support for this geography role.");
  if (!Array.isArray(values) || values.length === 0 || values.length > 100) throw new Error("Lookup must contain between 1 and 100 unique values.");
  if (!Number.isInteger(minimumGroupSize) || minimumGroupSize < 5) throw new Error("Minimum group size must be at least 5.");
  if (sourceId === "census-acs-static" && (!sourceVintage || !sourceDigest)) throw new Error("Census ACS extracts require a source vintage and digest.");
  if ((estimateField && !marginOfErrorField) || (!estimateField && marginOfErrorField)) throw new Error("ACS estimate and margin-of-error fields must be provided together.");
  return {
    sourceId, role, country, values: [...new Set(values.map(String))], minimumGroupSize,
    approved: false, approvedAt: "", approvalScope: "", sensitive, sourceVintage, sourceDigest,
    estimateField, marginOfErrorField, compatibility, compatibilityRationale: "",
    disclosureAccepted: false, sendsUniqueValuesOnly: true,
    safeguards: ["User approval required", "No full rows are sent", "ZIP-to-ZCTA matches are approximate", "ACS estimate and margin of error must remain paired", "Small or sensitive groups require review"],
  };
}
