const AGGREGATIONS = new Set(["count", "distinct_count", "sum", "avg", "median", "min", "max"]);
const FILTER_OPERATORS = new Set(["equals", "not_equals", "greater_than", "greater_or_equal", "less_than", "less_or_equal"]);

export function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function quoteLiteral(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

export function validatePlan(plan, fields) {
  const names = new Set(fields.map((field) => field.name));
  if (!AGGREGATIONS.has(plan.aggregation)) throw new Error("Unsupported calculation.");
  if (plan.version && plan.version !== 1) throw new Error("Unsupported query-plan version.");
  if (plan.dimension && !names.has(plan.dimension)) throw new Error("The grouping field is not in this dataset.");
  if (!["count"].includes(plan.aggregation) && !names.has(plan.measure)) throw new Error("Choose a measure field for this calculation.");
  if (plan.aggregation === "distinct_count" && !plan.measure) throw new Error("Choose a field for the distinct count.");
  (plan.filters || []).forEach((filter) => {
    if (!names.has(filter.field)) throw new Error("A filter field is not in this dataset.");
    if (!FILTER_OPERATORS.has(filter.operator)) throw new Error("Unsupported filter operator.");
  });
  if (plan.limit !== undefined && (!Number.isInteger(plan.limit) || plan.limit < 1 || plan.limit > 1000)) {
    throw new Error("The result limit must be a whole number from 1 to 1000.");
  }
  return true;
}

export function compilePlan(plan, fields) {
  validatePlan(plan, fields);
  const dimension = plan.dimension ? quoteIdentifier(plan.dimension) : null;
  const valueExpression = plan.aggregation === "count" ? "count(*)"
    : plan.aggregation === "distinct_count" ? `count(DISTINCT ${quoteIdentifier(plan.measure)})`
      : `${plan.aggregation}(${quoteIdentifier(plan.measure)})`;
  const select = dimension ? `${dimension} AS category, ${valueExpression} AS value` : `${valueExpression} AS value`;
  const where = (plan.filters || []).map((filter) => {
    const field = quoteIdentifier(filter.field);
    const operator = {
      equals: "=", not_equals: "<>", greater_than: ">", greater_or_equal: ">=", less_than: "<", less_or_equal: "<=",
    }[filter.operator];
    return `${field} ${operator} ${quoteLiteral(filter.value)}`;
  });
  return [
    `SELECT ${select}`,
    "FROM dataset",
    where.length ? `WHERE ${where.join(" AND ")}` : "",
    dimension ? `GROUP BY ${dimension}` : "",
    dimension ? "ORDER BY value DESC, category ASC" : "ORDER BY value DESC",
    `LIMIT ${plan.limit || 100}`,
  ].filter(Boolean).join("\n");
}

function normalized(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function mentionedField(question, fields) {
  const query = ` ${normalized(question)} `;
  return [...fields].sort((a, b) => b.name.length - a.name.length)
    .find((field) => query.includes(` ${normalized(field.name)} `))?.name || "";
}

export function interpretQuestion(question, fields) {
  const lower = normalized(question);
  if (/\b(how did|why|cause|caused|impact|effect)\b/.test(lower)) {
    return {
      version: 1,
      status: "needs-clarification",
      question,
      clarification: {
        message: "This dataset can show measured differences, but it cannot establish why they happened. Choose a calculation to compare.",
        choices: ["Count records", "Compare a numeric measure", "Show the data without a causal claim"],
      },
      aggregation: "count",
      measure: "",
      dimension: "",
    };
  }
  const aggregation = lower.includes("average") || lower.includes("mean") ? "avg"
    : lower.includes("median") ? "median"
      : lower.includes("distinct") || lower.includes("unique") ? "distinct_count"
    : lower.includes("sum") || lower.includes("total") ? "sum"
      : lower.includes("minimum") || lower.includes("lowest") ? "min"
        : lower.includes("maximum") || lower.includes("highest") ? "max" : "count";
  const byMatch = lower.match(/\bby\s+(.+)$/);
  const dimension = byMatch ? mentionedField(byMatch[1], fields) : "";
  const measureQuestion = byMatch ? lower.slice(0, byMatch.index) : lower;
  const measure = aggregation === "count" ? "" : mentionedField(measureQuestion, fields);
  return { version: 1, status: "ready", question, aggregation, measure, dimension, filters: [], limit: 100 };
}
