/**
 * Deterministic visualization advisor
 * Recommends chart type based on validated plan, fields, and results
 * Rules avoid common pitfalls: 80+ bar charts, causal claims, silent aggregations
 */

const TEMPORAL_TYPES = /DATE|TIME|TIMESTAMP/i;
const GEOGRAPHIC_ROLES = new Set(["postal-code", "zip-code", "zip-plus-four", "zcta", "fips", "latitude", "longitude"]);
const TOP_N_LIMIT = 15;
const SMALL_CARDINALITY = 5;

export function fieldMetadata(fields = []) {
  return fields.reduce((acc, field) => {
    acc[field.name] = {
      name: field.name,
      type: field.type,
      isTemporal: TEMPORAL_TYPES.test(field.type) || field.semanticRole?.includes("time"),
      isNumeric: field.type && (field.type.includes("INTEGER") || field.type.includes("DOUBLE") || field.type.includes("NUMERIC")),
      isGeographic: field.semanticRole && GEOGRAPHIC_ROLES.has(field.semanticRole),
      semanticRole: field.semanticRole || null,
    };
    return acc;
  }, {});
}

export function adviseChartKind(plan, fields = [], results = []) {
  if (!plan || !fields.length || !results.length) {
    return { kind: "table", reason: "No valid data to visualize", warnings: [] };
  }

  const fieldMap = fieldMetadata(fields);
  const dimensionField = fieldMap[plan.dimension];
  const measureField = fieldMap[plan.measure];
  const warnings = [];
  const assumptions = [];

  // No dimension: summarizing the entire dataset
  if (!plan.dimension) {
    if (plan.aggregation === "count" && results.length === 1) {
      return {
        kind: "table",
        reason: "Single summary value; table is the accessible default",
        warnings,
        assumptions,
      };
    }
    return {
      kind: "table",
      reason: "Summary calculation without grouping; table is the clearest presentation",
      warnings,
      assumptions,
    };
  }

  // Temporal dimension: prefer line chart
  if (dimensionField?.isTemporal) {
    assumptions.push(`Using ${plan.dimension} as the time dimension for trend visualization.`);
    return {
      kind: "line",
      reason: `Time series: grouping by ${plan.dimension}`,
      warnings,
      assumptions,
    };
  }

  // Geographic identifiers do not imply reference geometry, so keep the result textual.
  if (dimensionField?.isGeographic) {
    assumptions.push(`Geographic identifier ${plan.dimension} is shown as labeled data; reviewed reference geometry is not available.`);
    warnings.push("Reviewed reference geometry is required for a map. The table is the authoritative representation.");
    return {
      kind: "bar",
      reason: `Geographic identifier: ${plan.dimension}; using a labeled bar chart until reference geometry is reviewed`,
      warnings,
      assumptions,
      geographicFallback: true,
    };
  }

  // High cardinality dimension: top-N with "Other"
  const cardinality = results.length;
  if (cardinality > TOP_N_LIMIT) {
    warnings.push(`Showing top ${TOP_N_LIMIT} of ${cardinality} categories. The result table includes all returned values.`);
    const additive = ["count", "sum"].includes(plan.aggregation);
    assumptions.push(additive
      ? `Categories beyond the top ${TOP_N_LIMIT} are combined into an Other category and remain visible in the accessible table.`
      : `Only the top ${TOP_N_LIMIT} categories are charted; ${plan.aggregation} values are not combined because that would change their meaning.`);
    return {
      kind: "bar",
      reason: `High-cardinality grouping (${cardinality} unique values); showing top ${TOP_N_LIMIT}`,
      topN: TOP_N_LIMIT,
      otherCategory: additive,
      warnings,
      assumptions,
    };
  }

  // Small cardinality: prefer bar chart
  if (cardinality <= TOP_N_LIMIT) {
    assumptions.push(`All ${cardinality} categories are shown in both chart and table.`);
    return {
      kind: "bar",
      reason: `Categorical grouping with ${cardinality} values`,
      warnings,
      assumptions,
    };
  }

  // Fallback
  return {
    kind: "table",
    reason: "Unable to determine optimal chart type; table is always accessible",
    warnings,
    assumptions,
  };
}

export function normalizeResults(rows, plan, advisor) {
  if (advisor.kind !== "bar" || !advisor.topN) return rows;

  const limited = rows.slice(0, advisor.topN);
  const remaining = rows.slice(advisor.topN);
  
  if (!remaining.length || !advisor.otherCategory) return limited;

  // Sum remaining rows into "Other"
  const otherValue = remaining.reduce((sum, row) => sum + Number(row.value || 0), 0);
  return [
    ...limited,
    {
      category: "Other",
      value: otherValue,
      _isOtherCategory: true,
    },
  ];
}

export function describeResult(plan, chartAdvice, resultCount, totalCount) {
  const parts = [];

  if (plan.aggregation === "count") {
    parts.push(`Count of records`);
  } else if (plan.aggregation === "distinct_count") {
    parts.push(`Count of distinct values in ${plan.measure}`);
  } else {
    parts.push(`${plan.aggregation} of ${plan.measure}`);
  }

  if (plan.dimension) {
    parts.push(`grouped by ${plan.dimension}`);
  }

  if (plan.timeField) {
    parts.push(`over time (${plan.timeField})`);
  }

  if (plan.filters?.length) {
    const filterClauses = plan.filters.map((f) => `${f.field} ${f.operator} ${f.value}`).join("; ");
    parts.push(`with filters: ${filterClauses}`);
  }

  let summary = parts.join(", ");

  if (resultCount !== totalCount && chartAdvice?.kind !== "table") {
    summary += `; showing ${resultCount} of ${totalCount} results`;
  }

  return summary + ".";
}

export function chartDescription(plan, advisedChart, rows) {
  const maxValue = Math.max(...rows.map((r) => Number(r.value || 0)));
  const minValue = Math.min(...rows.map((r) => Number(r.value || 0)));

  const parts = [];
  if (advisedChart.kind === "line") {
    parts.push("Line chart showing trend over time");
  } else if (advisedChart.kind === "bar") {
    parts.push(`Bar chart with ${rows.length} ${rows.length === 1 ? "category" : "categories"}`);
  } else if (advisedChart.kind === "map") {
    parts.push("Geographic map (accessible table required)");
  }

  if (plan.aggregation) {
    parts.push(`Values represent ${plan.aggregation}${plan.measure ? ` of ${plan.measure}` : ""}`);
  }

  if (maxValue && minValue) {
    parts.push(`ranging from ${minValue} to ${maxValue}`);
  }

  if (advisedChart.warnings?.length) {
    parts.push(...advisedChart.warnings.map((w) => `Note: ${w}`));
  }

  const legacyDescription = plan.dimension
    ? `This is a chart of ${plan.aggregation} by ${plan.dimension}`
    : `This is a chart of ${plan.aggregation}`;
  return `${parts.join(". ")}. ${legacyDescription}.`;
}
