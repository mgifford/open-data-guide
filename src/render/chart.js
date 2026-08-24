import embed from "vega-embed";

export async function renderChart(container, rows, plan) {
  container.replaceChildren();
  if (!rows.length || !plan.dimension) return;
  const fieldType = rows.some((row) => Number.isNaN(Number(row.category))) ? "nominal" : "quantitative";
  const mark = fieldType === "nominal" ? "bar" : "line";
  const largest = [...rows].sort((a, b) => Number(b.value) - Number(a.value))[0];
  const description = document.createElement("p");
  description.className = "visually-hidden";
  description.textContent = `${mark === "bar" ? "Bar" : "Line"} chart of ${plan.aggregation} by ${plan.dimension}. It shows ${rows.length} categories. The largest value is ${largest.category}: ${largest.value}. The accessible result table contains every returned value.`;
  container.append(description);
  const spec = {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    description: `${plan.aggregation} grouped by ${plan.dimension}`,
    data: { values: rows },
    mark: { type: mark, tooltip: true },
    encoding: {
      x: { field: "category", type: fieldType, title: plan.dimension, sort: mark === "bar" ? "-y" : undefined },
      y: { field: "value", type: "quantitative", title: plan.aggregation },
    },
    width: "container",
    height: 320,
    config: { view: { stroke: null } },
  };
  await embed(container, spec, { actions: true, renderer: "svg" });
}
