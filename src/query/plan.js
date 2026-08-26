const AGGREGATIONS = new Set(["count", "distinct_count", "sum", "avg", "median", "min", "max"]);
const FILTER_OPERATORS = new Set(["equals", "not_equals", "greater_than", "greater_or_equal", "less_than", "less_or_equal"]);
const DATE_GRAINS = new Set(["year", "month", "day"]);
const GEOGRAPHIC_CODE_ROLES = new Set(["postal-code", "zip-code", "zip-plus-four", "zcta", "fips"]);
const TEMPORAL_TYPES = /DATE|TIME|TIMESTAMP/i;
const NUMERIC_TYPES = /INT|DECIMAL|DOUBLE|FLOAT|REAL|NUMERIC|HUGEINT/i;

function isTemporalField(field) {
  return !!field && (TEMPORAL_TYPES.test(field.type || "") || field.inferredType === "date");
}

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
  if (plan.timeField && !names.has(plan.timeField)) throw new Error("The time field is not in this dataset.");
  if (!["count"].includes(plan.aggregation) && !names.has(plan.measure)) throw new Error("Choose a measure field for this calculation.");
  if (plan.aggregation === "distinct_count" && !plan.measure) throw new Error("Choose a field for the distinct count.");
  const measureField = fields.find((field) => field.name === plan.measure);
  if (measureField?.semanticRole && GEOGRAPHIC_CODE_ROLES.has(measureField.semanticRole) && plan.aggregation !== "distinct_count") {
    throw new Error("Postal and Census geography codes are labels, not numeric measures. Use a distinct count or group by the field.");
  }
  if (["sum", "avg", "median", "min", "max"].includes(plan.aggregation) && (!measureField || !NUMERIC_TYPES.test(measureField.type || ""))) {
    throw new Error("Numeric calculations require a numeric measure field.");
  }
  (plan.filters || []).forEach((filter) => {
    if (!names.has(filter.field)) throw new Error("A filter field is not in this dataset.");
    if (!FILTER_OPERATORS.has(filter.operator)) throw new Error("Unsupported filter operator.");
  });
  if (plan.dateGrain) {
    if (!DATE_GRAINS.has(plan.dateGrain)) throw new Error("Unsupported date grain.");
    if (!plan.dimension) throw new Error("Group by a date field before choosing a date grain.");
    if (!isTemporalField(fields.find((field) => field.name === plan.dimension))) {
      throw new Error("A date grain requires the grouping field to be a date or time.");
    }
  }
  if (plan.limit !== undefined && (!Number.isInteger(plan.limit) || plan.limit < 1 || plan.limit > 1000)) {
    throw new Error("The result limit must be a whole number from 1 to 1000.");
  }
  if (plan.order !== undefined && !["asc", "desc"].includes(plan.order)) throw new Error("Unsupported result order.");
  return true;
}

export function compilePlan(plan, fields) {
  validatePlan(plan, fields);
  const dimensionField = plan.dimension ? fields.find((field) => field.name === plan.dimension) : null;
  const grainActive = plan.dateGrain && DATE_GRAINS.has(plan.dateGrain) && isTemporalField(dimensionField);
  const dimension = plan.dimension
    ? grainActive ? `date_trunc('${plan.dateGrain}', ${quoteIdentifier(plan.dimension)})` : quoteIdentifier(plan.dimension)
    : null;
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
    dimension ? `ORDER BY ${grainActive ? "category ASC" : `value ${plan.order === "asc" ? "ASC" : "DESC"}, category ASC`}` : "ORDER BY value DESC",
    `LIMIT ${plan.limit || 100}`,
  ].filter(Boolean).join("\n");
}

function normalized(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function mentionedField(question, fields) {
  const query = ` ${normalized(question)} `;
  return [...fields].sort((a, b) => b.name.length - a.name.length)
    .find((field) => {
      const name = normalized(field.name);
      const plural = name.endsWith("y") ? `${name.slice(0, -1)}ies` : `${name}s`;
      return query.includes(` ${name} `) || query.includes(` ${plural} `);
    })?.name || "";
}

export function interpretQuestion(question, fields) {
  const lower = normalized(question);
  const dateFields = fields.filter((field) => TEMPORAL_TYPES.test(field.type) || /(date|time|timestamp|year)/i.test(field.name));
  const asksChange = /\b(change|changed|trend|over time|through time|increased|decreased)\b/.test(lower);
  if (asksChange && dateFields.length > 1 && !dateFields.some((field) => lower.includes(normalized(field.name)))) {
    return {
      version: 1, status: "needs-clarification", question,
      clarification: {
        kind: "choose-time-field",
        message: "Which date field should define time? The choice can change the result.",
        choices: dateFields.map((field) => field.name),
      }, aggregation: "count", measure: "", dimension: "", timeField: "",
    };
  }
  if (/\bmissing\b/.test(lower)) {
    return { version: 1, status: "needs-clarification", question, clarification: { kind: "choose-missing-field", message: "Choose the field whose missing values should be counted.", choices: fields.map((field) => field.name).slice(0, 5) } };
  }
  if (/\b(why|cause|caused|impact|effect)\b/.test(lower) || (/\bhow did\b/.test(lower) && (!asksChange || dateFields.length === 0))) {
    return {
      version: 1,
      status: "needs-clarification",
      question,
      clarification: {
        kind: "avoid-causal-claim",
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
  if (/\b(show|list)\b/.test(lower) && /\bdates?\b/.test(lower) && /\bby\b/.test(lower)) {
    return { version: 1, status: "needs-clarification", question, clarification: { kind: "unsupported-shape", message: "This planner supports one grouping field at a time. Choose the field to group by.", choices: fields.filter((field) => field.name.toLowerCase() !== "").map((field) => field.name).slice(0, 5) } };
  }
  if (/\bsort\b/.test(lower) && !/\b(top|bottom)\b/.test(lower)) {
    return { version: 1, status: "needs-clarification", question, clarification: { kind: "unsupported-shape", message: "Choose a grouped result before sorting it.", choices: ["Count by a field", "Choose a numeric measure"] } };
  }
  const limitMatch = lower.match(/\b(top|bottom)\s+(\d+)\s+(.+)$/);
  const byMatch = lower.match(/\bby\s+(.+)$/);
  const dimension = byMatch ? mentionedField(byMatch[1], fields) : "";
  const rankedDimension = limitMatch ? mentionedField(limitMatch[3], fields) : "";
  const measureQuestion = byMatch ? lower.slice(0, byMatch.index) : lower;
  const measure = aggregation === "count" ? "" : mentionedField(measureQuestion, fields);
  const namedTimeField = dateFields.find((field) => lower.includes(normalized(field.name)))?.name || (asksChange && dateFields.length === 1 ? dateFields[0].name : "");
  if (asksChange && namedTimeField && !dimension) return { version: 1, status: "ready", question, aggregation, measure, dimension: namedTimeField, timeField: namedTimeField, filters: [], limit: 100, assumptions: [`Using ${namedTimeField} as the time field; review this choice.`] };
  return { version: 1, status: "ready", question, aggregation, measure, dimension: rankedDimension || dimension, timeField: namedTimeField, order: limitMatch?.[1] === "bottom" ? "asc" : "desc", filters: [], limit: limitMatch ? Number(limitMatch[2]) : 100, assumptions: namedTimeField && asksChange ? [`Using ${namedTimeField} as the time field; review this choice.`] : [] };
}
