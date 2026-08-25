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
  if (dataset.sourceDigest && historical.sourceDigests?.length && dataset.sourceDigest !== historical.sourceDigests[0]) return true;
  if (dataset.modified && historical.sourceModified && dataset.modified !== historical.sourceModified) return true;
  if (dataset.resources?.length && historical.resourceUrls?.length) {
    const currentUrls = dataset.resources.map((resource) => resource.url).filter(Boolean);
    if (currentUrls.length && currentUrls[0] !== historical.resourceUrls[0]) return true;
  }
  return false;
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