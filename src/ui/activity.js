export const ACTIVITY_LIMIT = 100;

function sanitizeText(value) {
  return String(value ?? "")
    .replace(/([?&](?:token|key|secret|signature|sig|auth|authorization)=)[^&#\s]+/gi, "$1[redacted]")
    .replace(/(bearer\s+)[a-z0-9._~+/=-]+/gi, "$1[redacted]")
    .slice(0, 1000);
}

export function sanitizeActivityDetails(details = {}) {
  return Object.fromEntries(Object.entries(details).map(([key, value]) => {
    if (/^(rows|records|preview|rowValues|prompt|promptText|requestHeaders|responseHeaders|headers|authorization)$/i.test(key)) return [key, "[omitted]"];
    if (Array.isArray(value)) return [key, value.slice(0, 20).map(sanitizeText)];
    if (value && typeof value === "object") return [key, sanitizeActivityDetails(value)];
    return [key, sanitizeText(value)];
  }));
}

export function createActivityLog({ limit = ACTIVITY_LIMIT, now = () => new Date(), onChange = () => {} } = {}) {
  let events = [];
  function add({ level = "info", operation = "application", stage = "update", message = "", details = {} } = {}) {
    const event = { id: crypto.randomUUID(), timestamp: now().toISOString(), level, operation: sanitizeText(operation), stage: sanitizeText(stage), message: sanitizeText(message), details: sanitizeActivityDetails(details) };
    events = [...events, event].slice(-limit);
    console.debug("[Open Data Guide]", event);
    onChange([...events]);
    return event;
  }
  function clear() { events = []; onChange([]); }
  return { add, clear, list: () => [...events] };
}
