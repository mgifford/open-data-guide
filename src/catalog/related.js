const STOP_WORDS = new Set(["and", "the", "for", "from", "with", "data", "dataset", "of", "to", "a", "in"]);

export function tokensFor(dataset) {
  const fields = (dataset.fields || []).map((field) => `${field.name || ""} ${field.description || ""}`).join(" ");
  return new Set(`${dataset.title || ""} ${dataset.description || ""} ${dataset.publisher || ""} ${fields}`
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

export function relatedDatasets(current, candidates) {
  const source = tokensFor(current);
  return candidates.filter((candidate) => candidate.key !== current.key).map((candidate) => {
    const target = tokensFor(candidate);
    const shared = [...source].filter((token) => target.has(token));
    const union = new Set([...source, ...target]);
    return { dataset: candidate, score: union.size ? shared.length / union.size : 0, shared: shared.slice(0, 8) };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
}

export function cosineSimilarity(a, b) {
  if (!a?.length || a.length !== b?.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] ** 2;
    normB += b[index] ** 2;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}
