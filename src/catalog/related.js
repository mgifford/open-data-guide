const STOP_WORDS = new Set(["and", "the", "for", "from", "with", "data", "dataset", "of", "to", "a", "in", "california", "state", "public", "information", "report", "these", "this", "are", "have", "more", "which", "local", "federal"]);

export function tokensFor(dataset) {
  const fields = (dataset.fields || []).map((field) => `${field.name || ""} ${field.description || ""}`).join(" ");
  return new Set(`${dataset.title || ""} ${dataset.description || ""} ${fields}`
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

export function catalogSearchTerms(dataset, limit = 6) {
  return [...new Set([
    ...tokensFor(dataset),
    ...(dataset.keywords || []).flatMap((keyword) => [...tokensFor({ title: keyword })]),
    ...(dataset.themes || []).flatMap((theme) => [...tokensFor({ title: theme })]),
  ])].slice(0, limit).join(" ");
}

function fieldCategory(field) {
  if (["postal-code", "zip-code", "zip-plus-four", "zcta", "fips", "latitude", "longitude"].includes(field.semanticRole)) return "geography";
  if (field.semanticRole === "time" || /DATE|TIME|TIMESTAMP/i.test(field.type || "") || /(date|time|year)/i.test(field.name || "")) return "time";
  if (/INT|DECIMAL|DOUBLE|FLOAT|REAL|NUMERIC|HUGEINT/i.test(field.type || "")) return "measure";
  if (field.likelyIdentifier || /(^|[_ -])(id|identifier|key|uuid)($|[_ -])/i.test(field.name || "")) return "identifier";
  return "category";
}

function valuesFor(dataset, key) {
  const value = dataset[key];
  return new Set((Array.isArray(value) ? value : [value]).filter(Boolean).flatMap((item) => tokensFor({ title: item })));
}

export function explainRelatedDataset(current, candidate) {
  const source = tokensFor(current);
  const target = tokensFor(candidate);
  const sharedTerms = [...source].filter((token) => target.has(token));
  const reasons = [];
  const evidence = [];
  const candidatePublisher = String(candidate.publisher || "").toLowerCase();
  const currentPublisher = String(current.publisher || "").toLowerCase();
  if (candidatePublisher && currentPublisher && candidatePublisher === currentPublisher) {
    reasons.push("same publisher");
    evidence.push({ type: "subject", label: "same publisher", value: candidate.publisher });
  }
  const sharedThemes = [...valuesFor(current, "themes")].filter((value) => valuesFor(candidate, "themes").has(value));
  if (sharedThemes.length) {
    reasons.push("shared themes");
    evidence.push({ type: "subject", label: "shared themes", value: sharedThemes.slice(0, 5).join(", ") });
  }
  const currentSpatial = tokensFor({ title: current.spatial });
  const candidateSpatial = tokensFor({ title: candidate.spatial });
  const sharedGeography = [...currentSpatial].filter((token) => candidateSpatial.has(token));
  if (sharedGeography.length) {
    reasons.push("geographic overlap");
    evidence.push({ type: "geography", label: "shared geography terms", value: sharedGeography.slice(0, 5).join(", ") });
  }
  const currentTemporal = tokensFor({ title: current.temporal });
  const candidateTemporal = tokensFor({ title: candidate.temporal });
  const sharedTime = [...currentTemporal].filter((token) => candidateTemporal.has(token));
  if (sharedTime.length) {
    reasons.push("overlapping time terms");
    evidence.push({ type: "temporal", label: "shared time terms", value: sharedTime.slice(0, 5).join(", ") });
  }
  if (sharedTerms.length) {
    reasons.push("similar subject wording");
    evidence.push({ type: "subject", label: "shared subject terms", value: sharedTerms.slice(0, 8).join(", ") });
  }
  const currentFields = new Map((current.fields || []).map((field) => [String(field.name).toLowerCase(), field]));
  const sharedFields = (candidate.fields || []).filter((field) => currentFields.has(String(field.name).toLowerCase()));
  if (sharedFields.length) {
    reasons.push("shared field names");
    const categories = [...new Set(sharedFields.map(fieldCategory))];
    evidence.push({ type: categories.includes("geography") ? "geography" : categories.includes("time") ? "temporal" : categories.includes("measure") ? "measure" : categories.includes("identifier") ? "identifier" : "category", label: "shared field names", value: sharedFields.slice(0, 8).map((field) => `${field.name} (${fieldCategory(field)})`).join(", ") });
  }
  if (/\bzcta\b|\bcensus\b|\bacs\b/i.test(`${candidate.title} ${candidate.description} ${(candidate.keywords || []).join(" ")}`)) {
    reasons.push("Census geography requires review");
    evidence.push({ type: "geography", label: "Census/ZCTA caution", value: "Confirm geography, vintage, estimate, and margin of error; area values do not describe individuals." });
  }
  const score = Math.min(1, (sharedTerms.length * 0.04) + (sharedThemes.length * 0.12) + (sharedGeography.length * 0.16) + (sharedTime.length * 0.08) + (sharedFields.length * 0.1) + (candidatePublisher && currentPublisher === candidatePublisher ? 0.15 : 0));
  return { score, reasons, evidence, shared: sharedTerms.slice(0, 8), joinCandidate: false };
}

export function relatedDatasets(current, candidates) {
  return candidates.filter((candidate) => candidate.key !== current.key).map((candidate) => ({
    dataset: candidate,
    ...explainRelatedDataset(current, candidate),
  })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
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
