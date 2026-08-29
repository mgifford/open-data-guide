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
let activeObserver = null;

// Zoom used for a single point (or many identical points), where fitBounds has
// no extent to work with. City-block level would be too close; this frames the
// point with recognisable surroundings.
const SINGLE_POINT_ZOOM = 11;
// Cap how far fitBounds may zoom in for tightly-clustered points so a single
// county's stations still show the county and its edges, not one street.
const FIT_MAX_ZOOM = 13;

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
  if (activeObserver) { activeObserver.disconnect(); activeObserver = null; }
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
  const map = L.map(mapHost, { scrollWheelZoom: false, worldCopyJump: false });
  activeMap = map;
  // noWrap stops the basemap repeating sideways if it is ever seen zoomed out.
  L.tileLayer(OSM_TILES, { maxZoom: 18, noWrap: true, attribution: OSM_ATTRIBUTION }).addTo(map);

  const latlngs = points.map((point) => [point.latitude, point.longitude]);
  points.forEach((point) => {
    L.circleMarker([point.latitude, point.longitude], { radius: 5, color: "#1d6b45", weight: 1, fillColor: "#2e8b57", fillOpacity: 0.85 })
      .bindPopup(`${round(point.latitude)}, ${round(point.longitude)}`)
      .addTo(map);
  });
  const bounds = L.latLngBounds(latlngs);

  // Frame the view to just contain the points, with a little padding so markers
  // are not on the very edge. A single point (or many identical ones) has no
  // extent, so use a fixed zoom instead.
  function fitToData() {
    map.invalidateSize();
    if (!bounds.isValid() || bounds.getNorthEast().equals(bounds.getSouthWest())) {
      map.setView(latlngs[0], SINGLE_POINT_ZOOM);
    } else {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: FIT_MAX_ZOOM });
    }
    // Expose the fitted zoom for tests and debugging.
    mapHost.dataset.fittedZoom = String(map.getZoom());
  }

  fitToData();
  // The map is often created while the Dataset Overview is still hidden, so the
  // container starts at 0x0 and the first fit lands on the whole world. Re-fit
  // as soon as it has a real size, then stop watching.
  activeObserver = new ResizeObserver(() => {
    if (mapHost.clientWidth > 0 && mapHost.clientHeight > 0) {
      fitToData();
      activeObserver?.disconnect();
      activeObserver = null;
    }
  });
  activeObserver.observe(mapHost);

  return geography;
}
