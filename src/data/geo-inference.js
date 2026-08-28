// Value-based geographic inference.
//
// The app's name-only role detection (see geography.js) misses misspelled or
// unusual headers ("lattitude", "lat_dd", a bare "y"). This module confirms a
// column's meaning from its VALUES, so a latitude column is recognised because
// its numbers all fall in [-90, 90] and pair with a longitude in [-180, 180] —
// almost regardless of what the header says. The same value evidence lets us
// state, from the data alone, roughly where the dataset is (its bounding box,
// centre, and any reviewed region whose extent contains it).
//
// Everything here is deterministic and works on the sampled preview rows the
// profiler already holds; it never calls a network geocoder.

// Name hints only NOMINATE a candidate; values confirm it. Kept deliberately
// broad, including common abbreviations and export conventions.
const LATITUDE_HINTS = ["latitude", "lat", "lat_dd", "latdd", "declat", "declatitude", "decimallatitude", "y", "ycoord", "y_coord", "northing"];
const LONGITUDE_HINTS = ["longitude", "long", "lon", "lng", "lon_dd", "londd", "declong", "declongitude", "decimallongitude", "x", "xcoord", "x_coord", "easting"];

// Reviewed approximate extents (min/max latitude and longitude) for a coarse
// "which region" hint. These are rectangular bounding boxes, not outlines, so
// they can overlap at shared borders; the caller reports every match and treats
// them as approximate. Extend this table with other reviewed extents as needed.
// Source: approximate US Census state extents, rounded.
export const REGION_EXTENTS = [
  { id: "california", label: "California", latMin: 32.53, latMax: 42.01, lonMin: -124.48, lonMax: -114.13 },
  { id: "nevada", label: "Nevada", latMin: 35.0, latMax: 42.0, lonMin: -120.01, lonMax: -114.04 },
  { id: "oregon", label: "Oregon", latMin: 41.99, latMax: 46.29, lonMin: -124.57, lonMax: -116.46 },
  { id: "arizona", label: "Arizona", latMin: 31.33, latMax: 37.0, lonMin: -114.82, lonMax: -109.05 },
  { id: "contiguous-us", label: "the contiguous United States", latMin: 24.4, latMax: 49.38, lonMin: -124.85, lonMax: -66.95 },
];

function normalizeHeader(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Small, bounded Levenshtein so a genuine typo ("lattitude") still nominates a
// candidate. Capped length keeps it cheap and avoids matching long unrelated
// headers by coincidence.
export function editDistance(a, b) {
  const s = String(a);
  const t = String(b);
  if (Math.abs(s.length - t.length) > 2) return 3;
  const rows = Array.from({ length: s.length + 1 }, (_, i) => [i, ...Array(t.length).fill(0)]);
  for (let j = 0; j <= t.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
    }
  }
  return rows[s.length][t.length];
}

// Returns how a header matches an axis's hints: "exact" (spelled correctly),
// "fuzzy" (one or two typos away), or "" (no name signal — values may still
// confirm it).
function nameMatch(name, hints) {
  const norm = normalizeHeader(name);
  if (!norm) return "";
  if (hints.includes(norm)) return "exact";
  // Only fuzzy-match longer hints so a stray "y"/"x" cannot absorb typos.
  if (hints.some((hint) => hint.length >= 4 && editDistance(norm, hint) <= 2)) return "fuzzy";
  return "";
}

function numericSamples(rows, fieldName) {
  const values = [];
  rows.forEach((row) => {
    const raw = row?.[fieldName];
    if (raw === null || raw === undefined || String(raw).trim() === "") return;
    const num = Number(raw);
    if (Number.isFinite(num)) values.push(num);
  });
  return values;
}

// Confirm a column against an axis by its values: enough parsed as numbers and
// (almost) all inside the valid coordinate range, with some spread so a constant
// column is not mistaken for coordinates.
export function confirmAxisFromValues(rows, fieldName, axis) {
  const bound = axis === "latitude" ? 90 : 180;
  const values = numericSamples(rows, fieldName);
  if (values.length < 3) return { ok: false, values };
  const inRange = values.filter((value) => value >= -bound && value <= bound);
  const fractionInRange = inRange.length / values.length;
  const min = Math.min(...inRange);
  const max = Math.max(...inRange);
  const spread = max - min;
  // Nearly all values must be in range, span more than a rounding wobble, and
  // not be trivially small integers (which look like counts, not coordinates).
  const ok = fractionInRange >= 0.9 && inRange.length >= 3 && spread > 0.01 && !(min === 0 && max === 0);
  return { ok, values, inRange: inRange.length, total: values.length, fractionInRange, min, max, spread };
}

// Find the best latitude/longitude column pair. Name hints (exact or fuzzy)
// raise a candidate's confidence, but a column with no name signal can still
// win purely on its values, which is what defeats a misspelled or cryptic
// header. Returns null when no confident pair exists.
export function inferPointFields(fields = [], rows = []) {
  if (!Array.isArray(fields) || !fields.length || !Array.isArray(rows) || !rows.length) return null;

  const score = (field, axis, hints) => {
    const name = nameMatch(field.name, hints);
    const values = confirmAxisFromValues(rows, field.name, axis);
    if (!values.ok) return null;
    // Values are the ground truth; the name only breaks ties and records why.
    const confidence = values.fractionInRange + (name === "exact" ? 1 : name === "fuzzy" ? 0.5 : 0);
    return { field, name, values, confidence, reason: name === "exact" ? "header and values agree" : name === "fuzzy" ? `header "${field.name}" is close to ${axis}, and values fall in range` : `values fall within the ${axis} range even though the header does not say so` };
  };

  const latCandidates = fields.map((field) => score(field, "latitude", LATITUDE_HINTS)).filter(Boolean).sort((a, b) => b.confidence - a.confidence);
  const lonCandidates = fields.map((field) => score(field, "longitude", LONGITUDE_HINTS)).filter(Boolean).sort((a, b) => b.confidence - a.confidence);
  if (!latCandidates.length || !lonCandidates.length) return null;

  let latitude = latCandidates[0];
  let longitude = lonCandidates.find((candidate) => candidate.field.name !== latitude.field.name);
  if (!longitude) return null;
  // A column in [-90, 90] also satisfies the longitude test; if both axes picked
  // the same top column, keep it as whichever axis its name favours.
  if (latitude.field.name === longitude.field.name) return null;

  return {
    latitude: latitude.field,
    longitude: longitude.field,
    method: latitude.name === "" || longitude.name === "" ? "values" : latitude.name === "fuzzy" || longitude.name === "fuzzy" ? "fuzzy-header" : "header",
    reason: `Latitude: ${latitude.reason}. Longitude: ${longitude.reason}.`,
    latitudeMatch: latitude.name,
    longitudeMatch: longitude.name,
  };
}

function round(value, places = 4) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// Summarise where the points are, from the data alone: how many usable points,
// their bounding box and centre, and any reviewed region extent that fully
// contains them. The prose is deliberately hedged ("fall within the extent
// of") because a bounding box is not an outline.
export function describePointGeography(latField, lonField, rows = []) {
  const points = [];
  rows.forEach((row) => {
    const lat = Number(row?.[latField]);
    const lon = Number(row?.[lonField]);
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      points.push({ lat, lon });
    }
  });
  if (!points.length) return { count: 0, points, text: "No usable coordinate points were found in the previewed rows." };

  const lats = points.map((point) => point.lat);
  const lons = points.map((point) => point.lon);
  const bbox = { latMin: Math.min(...lats), latMax: Math.max(...lats), lonMin: Math.min(...lons), lonMax: Math.max(...lons) };
  const centroid = { lat: round(lats.reduce((sum, value) => sum + value, 0) / lats.length), lon: round(lons.reduce((sum, value) => sum + value, 0) / lons.length) };

  const matched = REGION_EXTENTS.filter((region) => bbox.latMin >= region.latMin && bbox.latMax <= region.latMax && bbox.lonMin >= region.lonMin && bbox.lonMax <= region.lonMax);
  // Prefer the tightest containing region (e.g. California over contiguous US).
  matched.sort((a, b) => (a.latMax - a.latMin) * (a.lonMax - a.lonMin) - (b.latMax - b.latMin) * (b.lonMax - b.lonMin));

  const bboxText = `latitude ${round(bbox.latMin)} to ${round(bbox.latMax)}, longitude ${round(bbox.lonMin)} to ${round(bbox.lonMax)}`;
  let regionText;
  if (matched.length) {
    const primary = matched[0];
    regionText = ` Every previewed point falls within the approximate extent of ${primary.label}, so this data looks like it is about ${primary.label}.`;
    if (matched.length > 1) regionText += ` (Its bounding box also fits within ${matched.slice(1).map((region) => region.label).join(", ")}; bounding boxes overlap at borders, so treat this as approximate.)`;
  } else {
    regionText = " The points do not fall inside any bundled reviewed region extent, so no place name is asserted from the data.";
  }

  return {
    count: points.length,
    points,
    bbox,
    centroid,
    matchedRegions: matched,
    text: `${points.length} previewed point(s) span ${bboxText}, centred near ${centroid.lat}, ${centroid.lon}.${regionText} This is read from the coordinate values, not from the catalog description.`,
  };
}
