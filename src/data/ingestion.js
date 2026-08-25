export const NULL_SENTINELS = ["", "None", "NULL", "null", "N/A", "NA"];
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

export function normalizeRows(text, delimiter = detectDelimiter(text)) {
  const parsed = parseDelimited(text, delimiter);
  const headers = parsed.shift() || [];
  const rawRows = parsed.filter((row) => row.length === headers.length).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
  const sentinelCounts = Object.fromEntries(headers.map((header) => [header, 0]));
  const normalizedRows = rawRows.map((row) => Object.fromEntries(headers.map((header) => {
    const value = row[header];
    if (NULL_SENTINELS.includes(value)) {
      sentinelCounts[header] += 1;
      return [header, null];
    }
    return [header, value];
  })));
  return { headers, rawRows, normalizedRows, sentinelCounts, delimiter };
}

function numberValue(value) {
  if (value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function profileRows(text, delimiter) {
  const normalized = normalizeRows(text, delimiter);
  const fields = normalized.headers.map((name) => {
    const values = normalized.normalizedRows.map((row) => row[name]);
    const nonNull = values.filter((value) => value !== null && value !== "");
    const numbers = nonNull.map(numberValue);
    const numeric = numbers.length === nonNull.length && nonNull.length > 0;
    const dates = DATE_NAME.test(name) ? nonNull.map((value) => new Date(value)).filter((date) => !Number.isNaN(date.valueOf())) : [];
    const distinct = new Set(nonNull.map(String));
    return {
      name,
      inferredType: numeric ? "number" : dates.length === nonNull.length && dates.length > 0 ? "date" : "text",
      nullCount: values.length - nonNull.length,
      sentinelCount: normalized.sentinelCounts[name],
      distinctCount: distinct.size,
      sampleValues: nonNull.slice(0, 5),
      minimum: numeric ? Math.min(...numbers) : "",
      maximum: numeric ? Math.max(...numbers) : "",
      dateRange: dates.length ? [new Date(Math.min(...dates.map((date) => date.valueOf()))).toISOString(), new Date(Math.max(...dates.map((date) => date.valueOf()))).toISOString()] : [],
      likelyIdentifier: distinct.size === nonNull.length && nonNull.length > 1,
      warnings: normalized.sentinelCounts[name] ? [`${normalized.sentinelCounts[name]} textual null sentinel(s) normalized to SQL NULL; raw values remain available for audit.`] : [],
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

export function shouldRefuseResource(bytes, limit = MAX_BROWSER_RESOURCE_BYTES) {
  return Number.isFinite(Number(bytes)) && Number(bytes) > limit;
}
