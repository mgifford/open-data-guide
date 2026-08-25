import embed from "vega-embed";

export const CHART_DISPLAY_LIMIT = 15;

export function chartRowsFor(rows, limit = CHART_DISPLAY_LIMIT) {
  return rows.slice(0, limit);
}

export async function renderChart(container, rows, plan) {
  container.replaceChildren();
  if (!rows.length || !plan.dimension) return;
  const fieldType = rows.some((row) => Number.isNaN(Number(row.category))) ? "nominal" : "quantitative";
  const mark = fieldType === "nominal" ? "bar" : "line";
  const chartRows = chartRowsFor(rows);
  const largest = [...rows].sort((a, b) => Number(b.value) - Number(a.value))[0];
  const description = document.createElement("p");
  description.className = "visually-hidden";
  description.textContent = `${mark === "bar" ? "Bar" : "Line"} chart of ${plan.aggregation} by ${plan.dimension}. It displays the first ${chartRows.length} of ${rows.length} returned categories. The largest returned value is ${largest.category}: ${largest.value}. The accessible result table contains every returned value.`;
  container.append(description);
  const spec = {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    description: `${plan.aggregation} grouped by ${plan.dimension}`,
    data: { values: chartRows },
    mark: { type: mark, tooltip: true },
    encoding: {
      x: { field: "category", type: fieldType, title: plan.dimension, sort: mark === "bar" ? "-y" : undefined },
      y: { field: "value", type: "quantitative", title: plan.aggregation },
    },
    width: "container",
    height: 320,
    config: { view: { stroke: null } },
  };
  container.setAttribute("role", "img");
  container.setAttribute("aria-label", `${mark === "bar" ? "Bar" : "Line"} chart of ${plan.aggregation} by ${plan.dimension}; see the accessible description and result table for all values.`);
  await embed(container, spec, { actions: true, renderer: "svg" });
}
