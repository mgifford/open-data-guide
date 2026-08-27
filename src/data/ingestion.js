import { CODE_ROLES, detectSemanticRole, normalizeGeographicValue } from "./geography.js";

export const NULL_SENTINELS = ["", "None", "NULL", "null", "N/A", "NA", "Not supplied"];
export const MAX_BROWSER_RESOURCE_BYTES = 500_000_000;

const DATE_NAME = /(date|time|timestamp|year)/i;

export function decodeUtf8(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("The resource is not valid UTF-8 text and cannot be safely profiled.");
  }
}

export function detectDelimiter(text) {
  const firstLine = String(text).split(/\r?\n/, 1)[0];
  const candidates = [",", "\t", ";", "|"];
  return candidates.sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
}

export function parseDelimited(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

export function validateHeaders(headers) {
  const normalized = headers.map((header) => String(header).trim().toLowerCase());
  if (normalized.some((header) => !header)) throw new Error("The CSV header contains an empty column name.");
  if (new Set(normalized).size !== normalized.length) throw new Error("The CSV header contains duplicate column names.");
  return headers;
}

export function normalizeRows(text, delimiter = detectDelimiter(text)) {
  const parsed = parseDelimited(text, delimiter);
  const headers = validateHeaders(parsed.shift() || []);
  const parseFailures = parsed.flatMap((row, index) => row.length === headers.length ? [] : [{ rowNumber: index + 2, expectedFields: headers.length, actualFields: row.length }]);
  const rawRows = parsed.filter((row) => row.length === headers.length).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
  const sentinelCounts = Object.fromEntries(headers.map((header) => [header, 0]));
  const normalizedRows = rawRows.map((row) => Object.fromEntries(headers.map((header) => {
    const value = row[header];
    if (NULL_SENTINELS.some((sentinel) => sentinel.toLowerCase() === String(value).trim().toLowerCase())) {
      sentinelCounts[header] += 1;
      return [header, null];
    }
    return [header, normalizeGeographicValue(value, detectSemanticRole(header)).normalizedValue];
  })));
  return { headers, rawRows, normalizedRows, sentinelCounts, delimiter, parseFailures };
}

function numberValue(value) {
  if (value === null || String(value).trim() === "") return null;
  const number = Number(value);
  return /^[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/.test(String(value).trim()) && Number.isFinite(number) ? number : null;
}

export function profileRows(text, delimiter) {
  const normalized = normalizeRows(text, delimiter);
  const fields = normalized.headers.map((name) => {
    const semanticRole = detectSemanticRole(name);
    const values = normalized.normalizedRows.map((row) => row[name]);
    const nonNull = values.filter((value) => value !== null && value !== "");
    const numbers = nonNull.map(numberValue);
    const numeric = !CODE_ROLES.has(semanticRole) && nonNull.length > 0 && numbers.every(Number.isFinite);
    const dates = DATE_NAME.test(name) ? nonNull.map((value) => new Date(value)).filter((date) => !Number.isNaN(date.valueOf())) : [];
    const distinct = new Set(nonNull.map(String));
    return {
      name,
      semanticRole,
      inferredType: numeric ? "number" : dates.length === nonNull.length && dates.length > 0 ? "date" : "text",
      nullCount: values.length - nonNull.length,
      sentinelCount: normalized.sentinelCounts[name],
      distinctCount: distinct.size,
      sampleValues: nonNull.slice(0, 5),
      minimum: numeric ? Math.min(...numbers) : "",
      maximum: numeric ? Math.max(...numbers) : "",
      dateRange: dates.length ? [new Date(Math.min(...dates.map((date) => date.valueOf()))).toISOString(), new Date(Math.max(...dates.map((date) => date.valueOf()))).toISOString()] : [],
      likelyIdentifier: distinct.size === nonNull.length && nonNull.length > 1,
      warnings: [
        ...(normalized.sentinelCounts[name] ? [`${normalized.sentinelCounts[name]} textual null sentinel(s) normalized to SQL NULL; raw values remain available for audit.`] : []),
        ...(semanticRole === "zcta" ? ["ZCTA values describe Census statistical areas; they are not USPS ZIP codes or address locations."] : []),
        ...(CODE_ROLES.has(semanticRole) ? ["Stored as text to preserve leading zeros. Country context is required for validation."] : []),
      ],
    };
  });
  return { ...normalized, fields };
}

export function formatDisplayValue(value, fieldName = "") {
  if (value === null || value === undefined || value === "") return "Not supplied";
  if (DATE_NAME.test(fieldName) && typeof value === "number" && value > 100000000000) {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) return date.toISOString();
  }
  return String(value);
}

// Roles that carry a plain-language meaning worth stating as an observation.
const ROLE_OBSERVATIONS = {
  "postal-code": "Values look like postal codes; kept as text to preserve leading zeros.",
  "zip-code": "Values look like ZIP codes; kept as text to preserve leading zeros.",
  "zip-plus-four": "Values look like ZIP+4 codes; kept as text to preserve leading zeros.",
  zcta: "Values look like Census ZCTAs, not USPS ZIP codes or addresses.",
  fips: "Values look like FIPS geographic codes; kept as text to preserve leading zeros.",
  latitude: "Values look like latitude coordinates.",
  longitude: "Values look like longitude coordinates.",
};

// A trailing unit token shared by most sample values (e.g. 45' or 12 ft) is a
// strong observed hint about what the numbers mean, without asserting it as fact.
const UNIT_PATTERNS = [
  [/^\s*['′]\s*$/, "feet (a trailing ' mark)"],
  [/^\s*(ft|feet)\s*$/i, "feet"],
  [/^\s*["″]\s*$/, "inches (a trailing \" mark)"],
  [/^\s*(in|inch|inches)\s*$/i, "inches"],
  [/^\s*%\s*$/, "percent"],
  [/^\s*(mi|miles?)\s*$/i, "miles"],
  [/^\s*(km|kilometers?)\s*$/i, "kilometers"],
  [/^\s*(m|meters?)\s*$/i, "meters"],
  [/^\s*(cm|centimeters?)\s*$/i, "centimeters"],
  [/^\s*(kg|kilograms?)\s*$/i, "kilograms"],
  [/^\s*(lbs?|pounds?)\s*$/i, "pounds"],
];

function detectTrailingUnit(sampleStrings) {
  const units = new Map();
  let measured = 0;
  for (const raw of sampleStrings) {
    // Split a leading number from any trailing non-numeric remainder.
    const match = /^[<>~=]*\s*[-+]?[\d,]*\.?\d+\s*(.*)$/.exec(String(raw).trim());
    if (!match) continue;
    measured += 1;
    const suffix = match[1];
    const unit = UNIT_PATTERNS.find(([pattern]) => pattern.test(suffix))?.[1];
    if (unit) units.set(unit, (units.get(unit) || 0) + 1);
  }
  if (!measured) return null;
  const [best] = [...units.entries()].sort((a, b) => b[1] - a[1]);
  // Report only when the unit dominates the measured values, not a lone outlier.
  return best && best[1] / measured >= 0.6 ? best[0] : null;
}

// Build short, plainly-inferred observations about a field from its profile and
// preview sample values. These are the app's own read of the data and must never
// be presented as the publisher's documented definition.
export function describeFieldObservations(field, sampleValues = [], rowCount = 0) {
  if (!field) return [];
  const notes = [];
  const samples = sampleValues.map((value) => (value === null || value === undefined ? "" : String(value))).filter((value) => value.trim() !== "");
  const nonNull = rowCount && Number.isFinite(field.nullCount) ? rowCount - field.nullCount : samples.length;

  if (ROLE_OBSERVATIONS[field.semanticRole]) notes.push(ROLE_OBSERVATIONS[field.semanticRole]);

  if (field.inferredType === "date") {
    notes.push("Values parse as dates.");
    if (Array.isArray(field.dateRange) && field.dateRange.length === 2) notes.push(`Observed range ${field.dateRange[0].slice(0, 10)} to ${field.dateRange[1].slice(0, 10)}.`);
  } else if (field.inferredType === "number") {
    const unit = detectTrailingUnit(samples);
    if (unit) notes.push(`Numbers appear to be measured in ${unit}.`);
    if (field.minimum !== "" && field.maximum !== "" && field.minimum !== undefined) notes.push(`Observed range ${field.minimum} to ${field.maximum}.`);
    else notes.push("Values are numeric.");
  } else {
    // Text: distinguish a small controlled vocabulary from free-form entry.
    const distinct = Number(field.distinctCount);
    if (field.likelyIdentifier || (distinct && nonNull && distinct === nonNull && nonNull > 1)) {
      notes.push("Every value is distinct, so this looks like an identifier rather than a category.");
    } else if (distinct && distinct <= 12 && (!nonNull || distinct < nonNull)) {
      const shown = [...new Set(samples)].slice(0, 3).join(", ");
      notes.push(`Appears categorical: ${distinct} distinct value(s)${shown ? ` such as ${shown}` : ""}.`);
    } else if (distinct) {
      notes.push(`${distinct} distinct value(s); likely free-form text.`);
    }
    const unit = detectTrailingUnit(samples);
    if (unit) notes.push(`Some values carry a ${unit} unit, so the column mixes numbers and text.`);
  }

  if (samples.some((value) => /^[<>~]|[<>~]\s*\d/.test(value.trim()))) {
    notes.push("Some values include comparison markers (for example >45'), so they are approximate rather than exact.");
  }

  if (rowCount && field.nullCount) {
    notes.push(`${field.nullCount} of ${rowCount} row(s) are missing or a recognized null sentinel.`);
  }

  return notes;
}

export function shouldRefuseResource(bytes, limit = MAX_BROWSER_RESOURCE_BYTES) {
  return Number.isFinite(Number(bytes)) && Number(bytes) > limit;
}
export function abortCheckForResourceLoading(bytes) {
  if (shouldRefuseResource(bytes)) {
    throw new Error("Resource loading aborted due to exceeding the transfer budget.");
  }
}
