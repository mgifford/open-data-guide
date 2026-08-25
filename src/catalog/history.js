export function boundedPreview(rows, limit = 20) {
  return Array.isArray(rows) ? rows.slice(0, Math.max(0, Math.min(limit, 100))) : [];
}

export async function digestText(text) {
  if (!globalThis.crypto?.subtle) throw new Error("This browser cannot create source digests.");
  const bytes = new TextEncoder().encode(String(text));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function sourceChanged(dataset, historical) {
  if (!dataset || !historical) return true;
  if (!historical.datasetKeys?.includes(dataset.key)) return false;
  if (dataset.sourceDigest && historical.sourceDigests?.length && dataset.sourceDigest !== historical.sourceDigests[0]) return true;
  if (dataset.modified && historical.sourceModified && dataset.modified !== historical.sourceModified) return true;
  const selectedResource = dataset.selectedResource || dataset.resources?.find((resource) => resource.id === historical.resourceIds?.[0]);
  if (historical.resourceIds?.length && (!selectedResource || selectedResource.id !== historical.resourceIds[0])) return true;
  if (historical.resourceUrls?.length && (!selectedResource || selectedResource.url !== historical.resourceUrls[0])) return true;
  if (dataset.fields?.length && historical.fieldSnapshot?.length) {
    const currentFields = new Set(dataset.fields.map((field) => field.name));
    if (historical.fieldSnapshot.some((field) => !currentFields.has(field.name))) return true;
  }
  return false;
}

export function historyStatus(dataset, historical) {
  if (!dataset || !historical) return "unknown";
  if (!historical.datasetKeys?.includes(dataset.key)) return "different-dataset";
  return sourceChanged(dataset, historical) ? "stale" : "current";
}

export function fieldMapping(oldFields, newFields) {
  const available = newFields.map((field) => field.name);
  return oldFields.map((oldField) => {
    const exact = available.filter((name) => name === oldField.name);
    const insensitive = available.filter((name) => name.toLowerCase() === oldField.name.toLowerCase());
    const candidates = exact.length ? exact : insensitive;
    return {
      from: oldField.name,
      candidates,
      status: candidates.length === 1 ? "suggested" : candidates.length > 1 ? "ambiguous" : "missing",
      requiresReview: candidates.length !== 1 || (candidates[0] !== oldField.name),
    };
  });
}

export function compareFields(oldFields = [], newFields = []) {
  const current = new Map(newFields.map((field) => [field.name, field]));
  const previous = new Map(oldFields.map((field) => [field.name, field]));
  return {
    removed: oldFields.filter((field) => !current.has(field.name)).map((field) => field.name),
    added: newFields.filter((field) => !previous.has(field.name)).map((field) => field.name),
    retyped: oldFields.filter((field) => current.has(field.name) && current.get(field.name).type !== field.type).map((field) => ({ name: field.name, previous: field.type, current: current.get(field.name).type })),
  };
}