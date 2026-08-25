function comparable(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function fieldValues(rows, field) {
  return rows.map((row) => row[field]).filter((value) => value !== null && value !== undefined && value !== "");
}

function profileField(rows, field) {
  const values = fieldValues(rows, field);
  const normalized = values.map(comparable);
  const unique = new Set(normalized);
  return {
    field,
    rows: rows.length,
    nonNull: values.length,
    nullRate: rows.length ? (rows.length - values.length) / rows.length : 1,
    uniqueRate: values.length ? unique.size / values.length : 0,
    duplicateRate: values.length ? 1 - unique.size / values.length : 1,
    values: unique,
  };
}

export function analyzeJoinCandidate(source, target, sourceField, targetField) {
  const sourceProfile = profileField(source.rows || [], sourceField);
  const targetProfile = profileField(target.rows || [], targetField);
  const overlap = [...sourceProfile.values].filter((value) => targetProfile.values.has(value)).length;
  const sourceTypes = source.fields || [];
  const targetTypes = target.fields || [];
  const sourceType = sourceTypes.find((field) => field.name === sourceField)?.type || "unknown";
  const targetType = targetTypes.find((field) => field.name === targetField)?.type || "unknown";
  const compatibleTypes = sourceType === targetType || (sourceType === "unknown" || targetType === "unknown");
  const reasons = [];
  if (compatibleTypes) reasons.push("field types are compatible or incomplete");
  if (sourceProfile.uniqueRate >= 0.95 || targetProfile.uniqueRate >= 0.95) reasons.push("at least one side is nearly unique");
  if (overlap) reasons.push(`${overlap} normalized key values overlap`);
  if (sourceProfile.nullRate || targetProfile.nullRate) reasons.push("one or both keys contain missing values");
  const likelyManyToMany = sourceProfile.duplicateRate > 0.05 && targetProfile.duplicateRate > 0.05;
  if (likelyManyToMany) reasons.push("both sides contain duplicate keys; multiplicative joins are possible");
  return {
    sourceField,
    targetField,
    sourceType,
    targetType,
    compatibleTypes,
    normalizedOverlap: overlap,
    source: { ...sourceProfile, values: undefined },
    target: { ...targetProfile, values: undefined },
    expectedCardinality: likelyManyToMany ? "many-to-many-risk" : "needs-review",
    reasons,
    requiresUserConfirmation: true,
  };
}

export function validateJoinCandidate(evidence, { confirmed = false } = {}) {
  if (!evidence?.compatibleTypes) throw new Error("Join keys have incompatible types.");
  if (evidence.expectedCardinality === "many-to-many-risk") throw new Error("Many-to-many joins are blocked because they can multiply rows.");
  if (!confirmed) throw new Error("Join requires explicit user confirmation after reviewing key evidence.");
  return true;
}
