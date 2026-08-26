// Classify dataset-resolution and resource-load failures into distinct, plain
// reasons so the interface can tell CORS, unsupported format, network, and size
// problems apart instead of showing one generic error.

export function classifyLoadError(error) {
  const message = error?.message || String(error);
  if (/cross-origin|CORS/i.test(message)) return `Cross-origin (CORS) block: the catalog or file did not let this browser read it. ${message}`;
  if (/HTTP or HTTPS|direct CSV, JSON, or Parquet/i.test(message)) return `Unsupported format or address: ${message}`;
  if (/Failed to fetch|NetworkError|network/i.test(message)) return `Network failure: the request could not reach the source. Check the address and your connection. ${message}`;
  return message;
}

export function classifyResourceError(error) {
  const message = error?.message || String(error);
  if (/refused|500 MB|too large|memory budget/i.test(message)) return `Size refusal: ${message}`;
  if (/UTF-8|parse|read_csv|read_json|read_parquet|Invalid|unsupported format/i.test(message)) return `Unsupported or unreadable format: ${message}`;
  if (/Failed to fetch|NetworkError|load failed/i.test(message)) return `Network or CORS failure: the browser could not fetch this resource. The source may block cross-origin requests or be unavailable. (${message})`;
  return `The resource could not be loaded: ${message}. Check CORS support and file size.`;
}
