function cellValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function csvCell(value) {
  const rawText = cellValue(value);
  const text = /^[=+\-@]/.test(rawText) ? `'${rawText}` : rawText;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function resultsToCsv(rows = []) {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  return [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\n");
}

export function resultsToJson({ metadata = {}, plan = {}, sql = "", rows = [], vegaLiteSpec = null, remoteProvenance = null, incomplete = false } = {}) {
  return JSON.stringify({ metadata, plan, query: sql, results: rows, vegaLiteSpec, incomplete, remoteProvenance }, null, 2);
}

export function downloadText(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
