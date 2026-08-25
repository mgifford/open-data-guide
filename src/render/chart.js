import embed from "vega-embed";
import { adviseChartKind, normalizeResults, chartDescription } from "./advisor.js";

export const CHART_DISPLAY_LIMIT = 15;

export function chartRowsFor(rows, limit = CHART_DISPLAY_LIMIT) {
  const visible = rows.slice(0, limit);
  const other = rows.find((row) => row._isOtherCategory);
  return other && !visible.includes(other) ? [...visible.slice(0, limit - 1), other] : visible;
}

export function chartKindFor(plan, fields = []) {
  const dimension = fields.find((field) => field.name === plan.dimension);
  const isTemporal = plan.timeField === plan.dimension || /DATE|TIME|TIMESTAMP/i.test(dimension?.type || "") || dimension?.semanticRole === "time";
  if (isTemporal && plan.timeField === plan.dimension) return "line";
  return "bar";
}

export async function renderChart(container, rows, plan, fields = []) {
  container.replaceChildren();
  if (!rows.length || !plan.dimension) return null;

  // Use deterministic advisor for chart type selection
  const advisedChart = adviseChartKind(plan, fields, rows);
  if (advisedChart.kind === "table") return null; // Don't render chart

  // Normalize results for top-N with "Other"
  let chartRows = normalizeResults(rows, plan, advisedChart);
  chartRows = chartRowsFor(chartRows, advisedChart.otherCategory ? CHART_DISPLAY_LIMIT + 1 : CHART_DISPLAY_LIMIT);

  const mark = advisedChart.kind === "line" ? "line" : "bar";
  const fieldType = mark === "line" ? "temporal" : "nominal";

  // Build accessible description
  const description = document.createElement("p");
  const descriptionId = `chart-description-${crypto.randomUUID()}`;
  description.id = descriptionId;
  description.className = "visually-hidden";

  const chartDesc = chartDescription(plan, advisedChart, rows);
  const otherNote = chartRows.some((r) => r._isOtherCategory)
    ? ` The "Other" category groups ${rows.length - CHART_DISPLAY_LIMIT} remaining ${rows.length - CHART_DISPLAY_LIMIT === 1 ? "result" : "results"}.`
    : "";

  description.textContent = `${chartDesc} It displays ${chartRows.length} ${chartRows.length === 1 ? "category" : "categories"}. The result table contains all ${rows.length} returned values.${otherNote}`;

  const chartHost = document.createElement("div");
  chartHost.className = "chart-host";
  container.append(description, chartHost);

  const spec = {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    description: `${plan.aggregation} grouped by ${plan.dimension}`,
    data: { values: chartRows },
    mark: { type: mark, tooltip: true },
    encoding: {
      x: { field: "category", type: fieldType, title: plan.dimension, sort: mark === "bar" ? "-y" : undefined },
      y: { field: "value", type: "quantitative", title: plan.aggregation },
    },
    width: Math.max(1, Math.min(720, chartHost.clientWidth || 320)),
    height: 320,
    config: { view: { stroke: null } },
  };

  chartHost.setAttribute("role", "img");
  chartHost.setAttribute("aria-describedby", descriptionId);
  chartHost.setAttribute("aria-label", `${mark === "bar" ? "Bar" : "Line"} chart of ${plan.aggregation} by ${plan.dimension}; see the accessible description and result table for all values.`);

  // Add warnings
  if (advisedChart.warnings?.length) {
    const warningsEl = document.createElement("ul");
    warningsEl.className = "chart-warnings";
    advisedChart.warnings.forEach((warning) => {
      const li = document.createElement("li");
      li.textContent = warning;
      warningsEl.appendChild(li);
    });
    container.appendChild(warningsEl);
  }

  await embed(chartHost, spec, { actions: true, renderer: "svg" });
  return spec;
}
