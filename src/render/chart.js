import embed from "vega-embed";
import { adviseChartKind, normalizeResults, chartDescription } from "./advisor.js";

export const CHART_DISPLAY_LIMIT = 15;

export function chartRowsFor(rows, limit = CHART_DISPLAY_LIMIT) {
  const visible = rows.slice(0, limit);
  const other = rows.find((row) => row._isOtherCategory);
  return other && !visible.includes(other) ? [...visible.slice(0, limit - 1), other] : visible;
}

function explicitCoordinateRows(rows = []) {
  return rows.filter((row) => Object.hasOwn(row, "latitude") && Object.hasOwn(row, "longitude") && Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)));
}

export function chartKindFor(plan, fields = [], rows = []) {
  const dimension = fields.find((field) => field.name === plan.dimension);
  const isTemporal = plan.timeField === plan.dimension || /DATE|TIME|TIMESTAMP/i.test(dimension?.type || "") || dimension?.semanticRole === "time";
  const latitudeField = fields.find((field) => field.semanticRole === "latitude" || /^(lat|latitude)$/i.test(field.name));
  const longitudeField = fields.find((field) => field.semanticRole === "longitude" || /^(lon|long|longitude)$/i.test(field.name));
  const hasMapCoordinates = explicitCoordinateRows(rows).length > 0;
  if (isTemporal && plan.timeField === plan.dimension) return "line";
  if (latitudeField && longitudeField && hasMapCoordinates) return "map";
  return "bar";
}

export async function renderChart(container, rows, plan, fields = []) {
  container.replaceChildren();
  if (!rows.length || !plan.dimension) return null;

  const advisedChart = adviseChartKind(plan, fields, rows);
  if (advisedChart.kind === "table") return null;

  let chartRows = normalizeResults(rows, plan, advisedChart);
  if (advisedChart.kind !== "map") {
    chartRows = chartRowsFor(chartRows, advisedChart.otherCategory ? CHART_DISPLAY_LIMIT + 1 : CHART_DISPLAY_LIMIT);
  }

  const description = document.createElement("p");
  const descriptionId = `chart-description-${crypto.randomUUID()}`;
  description.id = descriptionId;
  description.className = "visually-hidden";

  const chartHost = document.createElement("div");
  chartHost.className = "chart-host";
  container.append(description, chartHost);

  let spec;
  if (advisedChart.kind === "map") {
    const validRows = chartRows.filter((row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)));
    const chartDesc = chartDescription(plan, advisedChart, rows);
    description.textContent = `${chartDesc} The map shows ${validRows.length} station locations. The accessible table contains all ${rows.length} returned values.`;
    spec = {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      description: `${plan.aggregation} plotted by latitude and longitude`,
      data: { values: validRows },
      mark: { type: "circle", tooltip: true },
      encoding: {
        x: { field: "longitude", type: "quantitative", title: "Longitude", scale: { domain: [-180, 180] } },
        y: { field: "latitude", type: "quantitative", title: "Latitude", scale: { domain: [-90, 90] } },
        size: { value: 40 },
        color: { field: "category", type: "nominal", title: plan.dimension, legend: { orient: "bottom" } },
      },
      width: Math.max(1, Math.min(720, chartHost.clientWidth || 420)),
      height: 320,
      config: { view: { stroke: null } },
    };
    chartHost.setAttribute("role", "img");
    chartHost.setAttribute("aria-describedby", descriptionId);
    chartHost.setAttribute("aria-label", `Point map of ${plan.dimension} using latitude and longitude coordinates; see the table and description for all values.`);
  } else {
    const mark = advisedChart.kind === "line" ? "line" : "bar";
    const fieldType = mark === "line" ? "temporal" : "nominal";
    const chartDesc = chartDescription(plan, advisedChart, rows);
    const otherNote = chartRows.some((r) => r._isOtherCategory)
      ? ` The "Other" category groups ${rows.length - CHART_DISPLAY_LIMIT} remaining ${rows.length - CHART_DISPLAY_LIMIT === 1 ? "result" : "results"}.`
      : "";
    description.textContent = `${chartDesc} It displays ${chartRows.length} ${chartRows.length === 1 ? "category" : "categories"}. The result table contains all ${rows.length} returned values.${otherNote}`;
    spec = {
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
  }

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
