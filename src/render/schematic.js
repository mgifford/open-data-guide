/**
 * Data Schematic: compact dataset overview
 * Shows field roles, health, frequencies, date coverage, and suggested questions
 */

const TEMPORAL_TYPES = /DATE|TIME|TIMESTAMP/i;
const GEOGRAPHIC_ROLES = new Set(["postal-code", "zip-code", "zip-plus-four", "zcta", "fips"]);

function classifyFieldRole(field) {
  if (TEMPORAL_TYPES.test(field.type)) return "temporal";
  if (field.semanticRole && GEOGRAPHIC_ROLES.has(field.semanticRole)) return "geographic";
  if (field.type && /DOUBLE|INTEGER|INT|DECIMAL|NUMERIC|FLOAT|REAL|BIGINT|SMALLINT/i.test(field.type)) return "numeric";
  return "categorical";
}

function isTechnicalIdentifier(field) {
  const name = String(field.name || "").toLowerCase();
  if (!name) return true;
  return /(^|_)(id|uuid|guid|key|code|index|seq|row|number)$/i.test(name) || /(^|_)(id|code|key)$/.test(name);
}

function scoreCandidateField(field) {
  const name = String(field.name || "").toLowerCase();
  let score = 0;
  if (/(county|district|basin|waterbody|stream|site|station|well|project|study|name|type|status)/i.test(name)) score += 4;
  if (/(date|time|year)/i.test(name)) score += 3;
  if (/(county|basin|well|station|site|name)/i.test(name)) score += 2;
  if (/(id|code|uuid|guid|key|index|row|seq)/i.test(name)) score -= 5;
  return score;
}

function suggestion(label, plan, why) {
  return { label, plan, why };
}

export function renderSchematic(container, fields = [], qualities = {}, resource = {}, onApply = null) {
  container.replaceChildren();

  const section = document.createElement("section");
  section.className = "data-schematic";

  // Title
  const title = document.createElement("h2");
  title.textContent = "Dataset Overview";
  section.appendChild(title);

  // Summary stats
  const stats = document.createElement("div");
  stats.className = "schematic-stats";

  const fieldCount = document.createElement("p");
  fieldCount.innerHTML = `<strong>${fields.length}</strong> fields`;
  stats.appendChild(fieldCount);

  const healthText = document.createElement("p");
  const completeness = calculateCompleteness(fields, qualities);
  healthText.innerHTML = `<strong>Completeness:</strong> ${completeness}% of profiled cells contain values`;
  stats.appendChild(healthText);

  const latitude = fields.find((field) => field.semanticRole === "latitude" || /^(lat|latitude)$/i.test(field.name));
  const longitude = fields.find((field) => field.semanticRole === "longitude" || /^(lon|long|longitude)$/i.test(field.name));
  if (latitude && longitude) {
    const locationText = document.createElement("p");
    locationText.textContent = `Location point: ${latitude.name} + ${longitude.name}. These two fields describe one place; a map needs reviewed reference geometry.`;
    stats.appendChild(locationText);
  }

  section.appendChild(stats);

  // Field roles table
  const fieldTable = document.createElement("table");
  fieldTable.className = "schematic-fields";
  
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["Field", "Role", "Nulls", "Distinct"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    th.scope = "col";
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  fieldTable.appendChild(thead);

  const tbody = document.createElement("tbody");
  fields.forEach((field) => {
    const row = document.createElement("tr");
    
    const nameCell = document.createElement("td");
    nameCell.textContent = field.name;
    row.appendChild(nameCell);

    const roleCell = document.createElement("td");
    roleCell.textContent = classifyFieldRole(field);
    roleCell.className = `role-${classifyFieldRole(field)}`;
    row.appendChild(roleCell);

    const nullKey = `${field.name}__null_count`;
    const nulls = qualities[nullKey];
    const nullCell = document.createElement("td");
    nullCell.textContent = nulls !== undefined ? nulls : "—";
    if (nulls && nulls > 0) nullCell.className = "caution";
    row.appendChild(nullCell);

    const distinctKey = `${field.name}__distinct_count`;
    const distinct = qualities[distinctKey];
    const distinctCell = document.createElement("td");
    distinctCell.textContent = distinct !== undefined ? distinct : "—";
    row.appendChild(distinctCell);

    tbody.appendChild(row);
  });
  fieldTable.appendChild(tbody);
  section.appendChild(fieldTable);

  // Date coverage
  const dateFields = fields.filter((f) => TEMPORAL_TYPES.test(f.type));
  if (dateFields.length) {
    const dateSection = document.createElement("div");
    dateSection.className = "schematic-dates";
    const dateTitle = document.createElement("h3");
    dateTitle.textContent = "Time Coverage";
    dateSection.appendChild(dateTitle);
    const dateList = document.createElement("ul");
    dateFields.forEach((f) => {
      const li = document.createElement("li");
      li.textContent = `${f.name}: ${f.dateRange?.length === 2 ? `${new Date(f.dateRange[0]).toLocaleDateString()} to ${new Date(f.dateRange[1]).toLocaleDateString()}` : "range not available"}`;
      dateList.appendChild(li);
    });
    dateSection.appendChild(dateList);
    section.appendChild(dateSection);
  }

  // Suggested questions
  const suggestedSection = document.createElement("div");
  suggestedSection.className = "schematic-questions";
  const suggestedTitle = document.createElement("h3");
  suggestedTitle.textContent = "Suggested Questions";
  suggestedSection.appendChild(suggestedTitle);
  const suggestedList = document.createElement("ul");
  
  // Generate only plans the deterministic query engine can execute.
  const categoricalFields = fields
    .filter((f) => classifyFieldRole(f) === "categorical" && !isTechnicalIdentifier(f))
    .sort((a, b) => scoreCandidateField(b) - scoreCandidateField(a));
  const numericFields = fields
    .filter((f) => classifyFieldRole(f) === "numeric" && !isTechnicalIdentifier(f))
    .sort((a, b) => scoreCandidateField(b) - scoreCandidateField(a));
  const suggestions = [suggestion("How many records are in this dataset?", { aggregation: "count", measure: "", dimension: "", timeField: "", filters: [], limit: 100 }, "Returns one total.")];

  if (categoricalFields.length) {
    const cf = categoricalFields[0];
    suggestions.push(suggestion(`Compare records by ${cf.name}`, { aggregation: "count", measure: "", dimension: cf.name, timeField: "", filters: [], limit: 100 }, `Shows a table and bounded bar chart grouped by ${cf.name}.`));
  }

  if (categoricalFields.length && numericFields.length) {
    const cf = categoricalFields[0];
    const nf = numericFields[0];
    suggestions.push(suggestion(`Compare average ${nf.name} by ${cf.name}`, { aggregation: "avg", measure: nf.name, dimension: cf.name, timeField: "", filters: [], limit: 100 }, `Shows typical ${nf.name} for each ${cf.name}.`));
  }

  if (dateFields.length && numericFields.length) {
    const df = dateFields[0];
    const nf = numericFields[0];
    suggestions.push(suggestion(`See average ${nf.name} over ${df.name}`, { aggregation: "avg", measure: nf.name, dimension: df.name, timeField: df.name, filters: [], limit: 100 }, `Shows how the average changes across ${df.name}.`));
  }

  suggestions.slice(0, 5).forEach(({ label, plan, why }) => {
    const li = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = `${label}. ${why}`;
    li.appendChild(text);
    if (onApply) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button-secondary compact-button";
      button.textContent = "Apply suggestion";
      button.addEventListener("click", () => onApply(plan));
      li.append(" ", button);
    }
    suggestedList.appendChild(li);
  });

  suggestedSection.appendChild(suggestedList);
  section.appendChild(suggestedSection);

  container.appendChild(section);
}

function calculateCompleteness(fields = [], qualities = {}) {
  if (!fields.length) return 0;
  const rowCount = Number(qualities.__row_count);
  if (!rowCount) return 0;
  const cells = fields.length * rowCount;
  const missing = fields.reduce((total, field) => {
    const nullKey = `${field.name}__null_count`;
    return total + Number(qualities[nullKey] || 0);
  }, 0);
  return Math.max(0, Math.round(((cells - missing) / cells) * 100));
}
