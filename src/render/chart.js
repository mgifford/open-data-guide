import embed from "vega-embed";

export const CHART_DISPLAY_LIMIT = 15;

export function chartRowsFor(rows, limit = CHART_DISPLAY_LIMIT) {
  return rows.slice(0, limit);
}

export function chartKindFor(plan, fields = []) {
  const dimension = fields.find((field) => field.name === plan.dimension);
  const isTemporal = plan.timeField === plan.dimension || /DATE|TIME|TIMESTAMP/i.test(dimension?.type || "") || dimension?.semanticRole === "time";
  if (isTemporal && plan.timeField === plan.dimension) return "line";
  return "bar";
}

export async function renderChart(container, rows, plan, fields = []) {
  container.replaceChildren();
  if (!rows.length || !plan.dimension) return;
  const mark = chartKindFor(plan, fields);
  const fieldType = mark === "line" ? "temporal" : "nominal";
  const chartRows = chartRowsFor(rows);
  const largest = [...rows].sort((a, b) => Number(b.value) - Number(a.value))[0];
  const description = document.createElement("p");
  const descriptionId = `chart-description-${crypto.randomUUID()}`;
  description.id = descriptionId;
  description.className = "visually-hidden";
  description.textContent = `${mark === "bar" ? "Bar" : "Line"} chart of ${plan.aggregation} by ${plan.dimension}. It displays the first ${chartRows.length} of ${rows.length} returned categories. The largest returned value is ${largest.category}: ${largest.value}. The accessible result table contains every returned value.`;
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
  await embed(chartHost, spec, { actions: true, renderer: "svg" });
}
