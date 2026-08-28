import embed from "vega-embed";
import { describePointGeography } from "../data/geo-inference.js";

// A tile-less coordinate plot of the previewed points. It is NOT a street map:
// there is no basemap and no external tile server, which keeps the app
// local-first (nothing about what you are viewing leaves the browser). The
// points are drawn from the inferred latitude/longitude columns, the axes are
// fitted to the data's own extent, and an optional reviewed region rectangle
// gives context. An accessible description and the geography summary carry the
// same information in text.

export const MAP_POINT_LIMIT = 2000;

function round(value, places = 4) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// Collapse repeated station coordinates so a busy preview does not overplot,
// and cap the total for performance.
function uniquePoints(points) {
  const seen = new Map();
  points.forEach((point) => {
    const key = `${round(point.lat, 5)},${round(point.lon, 5)}`;
    if (!seen.has(key)) seen.set(key, { latitude: point.lat, longitude: point.lon });
  });
  return [...seen.values()].slice(0, MAP_POINT_LIMIT);
}

function paddedDomain(min, max) {
  const span = max - min || 1;
  const pad = span * 0.08;
  return [round(min - pad), round(max + pad)];
}

// Render into `container`. Returns the geography summary (also used for a text
// insight elsewhere), or null when there is nothing plottable.
export async function renderPointMap(container, { latField, lonField, rows = [] }) {
  container.replaceChildren();
  const geography = describePointGeography(latField, lonField, rows);
  if (!geography.count) return null;

  const points = uniquePoints(geography.points);
  const { bbox, centroid, matchedRegions } = geography;

  const heading = document.createElement("h3");
  heading.textContent = "Station location map";
  container.append(heading);

  const caption = document.createElement("p");
  caption.className = "field-hint";
  caption.textContent = `Coordinate plot of ${points.length} unique point(s) from the previewed rows, using ${latField} (latitude) and ${lonField} (longitude). This is a plot of the coordinates, not a street map — no map tiles are loaded and nothing about your view leaves the browser.`;
  container.append(caption);

  const insight = document.createElement("p");
  insight.textContent = geography.text;
  container.append(insight);

  const description = document.createElement("p");
  const descriptionId = `map-description-${crypto.randomUUID()}`;
  description.id = descriptionId;
  description.className = "visually-hidden";
  const region = matchedRegions?.[0];
  description.textContent = `Coordinate plot of ${points.length} unique previewed point(s). Latitude spans ${round(bbox.latMin)} to ${round(bbox.latMax)} and longitude spans ${round(bbox.lonMin)} to ${round(bbox.lonMax)}, centred near ${centroid.lat}, ${centroid.lon}.${region ? ` The points fall within the approximate extent of ${region.label}.` : ""} Full values are in the preview table above.`;

  const mapHost = document.createElement("div");
  mapHost.className = "chart-host";
  mapHost.setAttribute("role", "img");
  mapHost.setAttribute("aria-describedby", descriptionId);
  mapHost.setAttribute("aria-label", `Coordinate plot of ${points.length} previewed points by latitude and longitude; see the description and preview table for values.`);
  container.append(description, mapHost);

  // Frame the plot to the data, extended to include the matched region's extent
  // when there is one, so the points sit inside a recognisable box (e.g. the
  // outline of California) rather than filling the whole world or a tiny sliver.
  const frameLon = region ? [Math.min(bbox.lonMin, region.lonMin), Math.max(bbox.lonMax, region.lonMax)] : [bbox.lonMin, bbox.lonMax];
  const frameLat = region ? [Math.min(bbox.latMin, region.latMin), Math.max(bbox.latMax, region.latMax)] : [bbox.latMin, bbox.latMax];
  const xDomain = paddedDomain(frameLon[0], frameLon[1]);
  const yDomain = paddedDomain(frameLat[0], frameLat[1]);
  // Correct for longitude compression at this latitude so the plot is not
  // horizontally stretched, then clamp to a sensible on-screen size.
  const lonSpan = xDomain[1] - xDomain[0];
  const latSpan = yDomain[1] - yDomain[0];
  const cos = Math.max(0.2, Math.cos((centroid.lat * Math.PI) / 180));
  const width = Math.max(1, Math.min(640, mapHost.clientWidth || 420));
  const height = Math.max(220, Math.min(560, Math.round((width * latSpan) / (lonSpan * cos || 1))));
  // zero:false is essential: the region rect mark otherwise forces 0 into the
  // shared scale, which would un-zoom the whole plot back to the full globe.
  const xScale = { domain: xDomain, nice: false, zero: false };
  const yScale = { domain: yDomain, nice: false, zero: false };

  const layers = [];
  if (region) {
    layers.push({
      data: { values: [{ x0: region.lonMin, x1: region.lonMax, y0: region.latMin, y1: region.latMax }] },
      mark: { type: "rect", fill: "#3a7d5d", fillOpacity: 0.08, stroke: "#3a7d5d", strokeOpacity: 0.4 },
      encoding: {
        x: { field: "x0", type: "quantitative", scale: xScale, title: "Longitude" }, x2: { field: "x1" },
        y: { field: "y0", type: "quantitative", scale: yScale, title: "Latitude" }, y2: { field: "y1" },
      },
    });
  }
  layers.push({
    data: { values: points },
    mark: { type: "circle", tooltip: true, size: 45, opacity: 0.75 },
    encoding: {
      x: { field: "longitude", type: "quantitative", title: "Longitude", scale: xScale },
      y: { field: "latitude", type: "quantitative", title: "Latitude", scale: yScale },
    },
  });

  const spec = {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    description: `Coordinate plot of previewed points by ${latField} and ${lonField}`,
    width,
    height,
    layer: layers,
    config: { view: { stroke: "#d0d0d0" } },
  };

  await embed(mapHost, spec, { actions: true, renderer: "svg" });
  return geography;
}
