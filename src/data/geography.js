const ROLE_PATTERNS = [
  ["zip-plus-four", /^(zip|zipcode|postal)[ _-]*(plus[ _-]*)?4$|zip[ _-]*plus[ _-]*4/i],
  ["postal-code", /postal[ _-]*code|post[ _-]*code/i],
  ["zip-code", /(^|[ _-])zip(code)?([ _-]|$)/i],
  ["zcta", /(^|[ _-])zcta([ _-]|$)/i],
  ["fips", /(^|[ _-])fips([ _-]|$)|fips[ _-]*code/i],
  ["latitude", /latitude|(^|[ _-])lat([ _-]|$)/i],
  ["longitude", /longitude|(^|[ _-])lon(gitude)?([ _-]|$)/i],
];

const POSTAL_ROLES = new Set(["postal-code", "zip-code", "zip-plus-four"]);
const CODE_ROLES = new Set(["postal-code", "zip-code", "zip-plus-four", "zcta", "fips"]);

export function detectSemanticRole(fieldName) {
  const name = String(fieldName || "").trim();
  return ROLE_PATTERNS.find(([, pattern]) => pattern.test(name))?.[0] || "";
}

function usPostalStatus(value) {
  if (/^\d{5}$/.test(value) || /^\d{5}-\d{4}$/.test(value)) return "valid-format";
  return "invalid-format";
}

function canadaPostalStatus(value) {
  return /^[A-Z]\d[A-Z] \d[A-Z]\d$/.test(value.toUpperCase()) ? "valid-format" : "invalid-format";
}

export function validateGeographicValue(value, role, country = "") {
  const rawValue = String(value ?? "");
  if (!rawValue || ["None", "NULL", "null", "N/A", "NA", "Not supplied"].includes(rawValue)) return { status: "missing", country: country || "unknown" };
  if (!country) return { status: "country-required", country: "unknown" };
  const normalizedCountry = String(country).trim().toUpperCase();
  if (["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(normalizedCountry) && POSTAL_ROLES.has(role)) {
    return { status: usPostalStatus(rawValue), country: "US" };
  }
  if (["CA", "CAN", "CANADA"].includes(normalizedCountry) && POSTAL_ROLES.has(role)) {
    return { status: canadaPostalStatus(rawValue), country: "CA" };
  }
  if (role === "zcta") return { status: "not-a-postal-validation", country: normalizedCountry, note: "A ZCTA is a Census statistical area, not a USPS ZIP code." };
  return { status: "not-validated", country: normalizedCountry };
}

export function normalizeGeographicValue(value, role) {
  const rawValue = String(value ?? "");
  if (!CODE_ROLES.has(role)) return { rawValue, normalizedValue: rawValue };
  return { rawValue, normalizedValue: rawValue.trim().toUpperCase() };
}

export { CODE_ROLES, POSTAL_ROLES };
