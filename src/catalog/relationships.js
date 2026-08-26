function comparable(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

const MISSING_KEYS = new Set(["", "none", "null", "n/a", "na", "not supplied"]);

function joinKey(value) {
  const normalized = comparable(value);
  return MISSING_KEYS.has(normalized) ? "" : normalized;
}

function typeFamily(type) {
  const normalized = String(type || "").toLowerCase();
  if (["text", "varchar", "string"].includes(normalized)) return "text";
  if (/int|decimal|double|float|real|numeric/.test(normalized)) return "numeric";
  return normalized;
}

function fieldValues(rows, field) {
  return rows.map((row) => row[field]).filter((value) => value !== null && value !== undefined && value !== "");
}

function profileField(rows, field) {
  const values = fieldValues(rows, field);
  const normalized = values.map(joinKey).filter(Boolean);
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
  const compatibleTypes = typeFamily(sourceType) === typeFamily(targetType) || (sourceType === "unknown" || targetType === "unknown");
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
  if (!evidence.normalizedOverlap) throw new Error("Join keys have no overlapping values in the bounded preview.");
  if (evidence.expectedCardinality === "many-to-many-risk") throw new Error("Many-to-many joins are blocked because they can multiply rows.");
  if (!confirmed) throw new Error("Join requires explicit user confirmation after reviewing key evidence.");
  return true;
}

export function joinPreview(source, target, sourceField, targetField) {
  const targetKeys = new Map();
  (target.rows || []).forEach((row, index) => {
    const key = joinKey(row[targetField]);
    if (!key) return;
    if (!targetKeys.has(key)) targetKeys.set(key, []);
    targetKeys.get(key).push(index);
  });
  const matchedTargetIndexes = new Set();
  let matchedSourceRows = 0;
  let unmatchedSourceRows = 0;
  (source.rows || []).forEach((row) => {
    const sourceKey = joinKey(row[sourceField]);
    const matches = sourceKey ? targetKeys.get(sourceKey) || [] : [];
    if (matches.length) {
      matchedSourceRows += 1;
      matches.forEach((index) => matchedTargetIndexes.add(index));
    } else {
      unmatchedSourceRows += 1;
    }
  });
  return {
    sourceRowsReviewed: (source.rows || []).length,
    targetRowsReviewed: (target.rows || []).length,
    matchedSourceRows,
    unmatchedSourceRows,
    matchedTargetRows: matchedTargetIndexes.size,
    unmatchedTargetRows: (target.rows || []).length - matchedTargetIndexes.size,
  };
}
