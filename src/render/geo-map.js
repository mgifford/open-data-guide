import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { describePointGeography } from "../data/geo-inference.js";

// The previewed points drawn on an OpenStreetMap basemap with Leaflet, so the
// locations sit on a recognisable map rather than a bare scatter. Trade-off: the
// basemap tiles load from OpenStreetMap, an external service, so the fact that
// you are viewing this area does leave the browser — but the dataset itself is
// still only read and queried locally. Markers are drawn as SVG circles (no
// image assets, so no bundler icon-path issues), and an accessible description
// plus the geography summary carry the same information in text.

export const MAP_POINT_LIMIT = 2000;
const OSM_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// One live map instance at a time; removed before re-rendering so Leaflet does
// not leak listeners or complain that the container is already initialised.
let activeMap = null;

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

// Render into `container`. Returns the geography summary (also used for a text
// insight elsewhere), or null when there is nothing plottable.
export function renderPointMap(container, { latField, lonField, rows = [] }) {
  if (activeMap) { activeMap.remove(); activeMap = null; }
  container.replaceChildren();
  const geography = describePointGeography(latField, lonField, rows);
  if (!geography.count) return null;

  const points = uniquePoints(geography.points);
  const { bbox, centroid, matchedRegions } = geography;
  const region = matchedRegions?.[0];

  const heading = document.createElement("h3");
  heading.textContent = "Station location map";

  const caption = document.createElement("p");
  caption.className = "field-hint";
  caption.textContent = `${points.length} unique point(s) from the previewed rows, using ${latField} (latitude) and ${lonField} (longitude), shown on an OpenStreetMap basemap. The map tiles load from OpenStreetMap (an external service); your dataset itself stays in this browser.`;

  const insight = document.createElement("p");
  insight.textContent = geography.text;

  const descriptionId = `map-description-${crypto.randomUUID()}`;
  const description = document.createElement("p");
  description.id = descriptionId;
  description.className = "visually-hidden";
  description.textContent = `Map of ${points.length} unique previewed point(s) on an OpenStreetMap basemap. Latitude spans ${round(bbox.latMin)} to ${round(bbox.latMax)} and longitude spans ${round(bbox.lonMin)} to ${round(bbox.lonMax)}, centred near ${centroid.lat}, ${centroid.lon}.${region ? ` The points fall within the approximate extent of ${region.label}.` : ""} Full values are in the preview table above.`;

  const mapHost = document.createElement("div");
  mapHost.className = "geo-map-canvas";
  mapHost.setAttribute("role", "region");
  mapHost.setAttribute("aria-describedby", descriptionId);
  mapHost.setAttribute("aria-label", `Map of ${points.length} previewed points on an OpenStreetMap basemap; see the description and preview table for values.`);

  container.append(heading, caption, insight, description, mapHost);

  // scrollWheelZoom off so the map does not trap page scrolling; keyboard pan/
  // zoom stays on (Leaflet makes the container focusable) for keyboard users.
  const map = L.map(mapHost, { scrollWheelZoom: false });
  activeMap = map;
  L.tileLayer(OSM_TILES, { maxZoom: 18, attribution: OSM_ATTRIBUTION }).addTo(map);

  const latlngs = points.map((point) => [point.latitude, point.longitude]);
  points.forEach((point) => {
    L.circleMarker([point.latitude, point.longitude], { radius: 5, color: "#1d6b45", weight: 1, fillColor: "#2e8b57", fillOpacity: 0.85 })
      .bindPopup(`${round(point.latitude)}, ${round(point.longitude)}`)
      .addTo(map);
  });

  // Frame to the points (a single point gets a reasonable default zoom).
  if (latlngs.length === 1) map.setView(latlngs[0], 9);
  else map.fitBounds(L.latLngBounds(latlngs).pad(0.15));
  // The container is sized by CSS after append; recompute once layout settles.
  requestAnimationFrame(() => map.invalidateSize());

  return geography;
}
