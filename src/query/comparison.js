// A validated comparison-plan schema for bounded multi-dataset comparison.
// Comparisons run only from a confirmed relationship and an allow-listed template;
// this module blocks unsafe comparisons and compiles deterministic SQL. It never
// accepts model-generated SQL.

export const COMPARISON_PLAN_VERSION = 1;
export const COMPARISON_TEMPLATES = new Set(["match-coverage", "side-by-side", "counts-by-key", "difference"]);
const GEO_ROLES = new Set(["postal-code", "zip-code", "zip-plus-four", "zcta", "fips"]);
const TIME_ROLES = new Set(["date", "time", "timestamp", "year"]);

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

// Throw a specific, plain reason when a comparison must be blocked, per the
// relationship evidence, key roles, staleness, and template requirements.
export function validateComparisonPlan(plan) {
  if (!plan || plan.version !== COMPARISON_PLAN_VERSION) throw new Error("Unsupported comparison-plan version.");
  if (!COMPARISON_TEMPLATES.has(plan.template)) throw new Error("Unsupported comparison template.");
  if (plan.stale) throw new Error("The confirmed relationship is stale because a resource or schema changed; revalidate before comparing.");
  const evidence = plan.evidence || {};
  if (!evidence.compatibleTypes) throw new Error("Join key types are incompatible.");
  if (!evidence.normalizedOverlap) throw new Error("There is no bounded key overlap to compare.");
  if (evidence.expectedCardinality === "many-to-many-risk") throw new Error("A many-to-many comparison is blocked because it can multiply rows.");
  const roles = plan.keyRoles || {};
  const sourceGeo = GEO_ROLES.has(roles.source);
  const targetGeo = GEO_ROLES.has(roles.target);
  if (sourceGeo !== targetGeo) throw new Error("Geographic compatibility of the join keys is unknown.");
  if (sourceGeo && targetGeo && roles.source !== roles.target) throw new Error("Geographic grains are incompatible.");
  const sourceTime = TIME_ROLES.has(roles.source);
  const targetTime = TIME_ROLES.has(roles.target);
  if (sourceTime !== targetTime) throw new Error("Time-grain compatibility of the join keys is unknown.");
  if (plan.template === "difference") {
    const measures = plan.measures || [];
    if (measures.length < 2) throw new Error("A difference needs one documented measure from each dataset.");
    const units = measures.map((measure) => measure.unit || "");
    if (units.some((unit) => !unit)) throw new Error("A difference requires documented units on both measures.");
    if (new Set(units).size > 1) throw new Error("Measure units are incompatible for a difference.");
  }
  return true;
}

// Compile deterministic SQL from a validated plan. The two bounded preview
// snapshots are registered as comparison_source and comparison_target.
export function compileComparison(plan) {
  validateComparisonPlan(plan);
  const sourceKey = quoteIdentifier(plan.sourceField);
  const targetKey = quoteIdentifier(plan.targetField);
  const join = `FROM comparison_source AS s JOIN comparison_target AS t ON lower(trim(CAST(s.${sourceKey} AS VARCHAR))) = lower(trim(CAST(t.${targetKey} AS VARCHAR)))`;
  if (plan.template === "match-coverage") {
    return `SELECT count(*) AS matched_pairs ${join}`;
  }
  if (plan.template === "counts-by-key") {
    return `SELECT s.${sourceKey} AS key, count(*) AS matched_pairs ${join} GROUP BY s.${sourceKey} ORDER BY matched_pairs DESC, key ASC LIMIT ${plan.limit || 50}`;
  }
  const measures = (plan.measures || []).map((measure, index) => {
    const table = measure.side === "target" ? "t" : "s";
    return `${table}.${quoteIdentifier(measure.field)} AS ${quoteIdentifier(`${measure.side}_${measure.field}`)}`;
  });
  const columns = [`s.${sourceKey} AS key`, ...measures];
  return `SELECT ${columns.join(", ")} ${join} ORDER BY key ASC LIMIT ${plan.limit || 50}`;
}
