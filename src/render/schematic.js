/**
 * Data Schematic: compact dataset overview
 * Shows field roles, health, frequencies, date coverage, and suggested questions
 */

const TEMPORAL_TYPES = /DATE|TIME|TIMESTAMP/i;
const GEOGRAPHIC_ROLES = new Set(["postal-code", "zip-code", "zip-plus-four", "zcta", "fips"]);

function classifyFieldRole(field) {
  if (TEMPORAL_TYPES.test(field.type)) return "temporal";
  if (field.semanticRole && GEOGRAPHIC_ROLES.has(field.semanticRole)) return "geographic";
  if (field.type && (field.type.includes("DOUBLE") || field.type.includes("INTEGER"))) return "numeric";
  return "categorical";
}

export function renderSchematic(container, fields = [], qualities = {}, resource = {}) {
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

  const qualityScore = calculateHealthScore(fields, qualities);
  const healthText = document.createElement("p");
  healthText.innerHTML = `<strong>Health:</strong> ${healthIndicator(qualityScore)}`;
  stats.appendChild(healthText);

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
      li.textContent = f.name;
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
  
  // Generate questions based on field types
  const categoricalFields = fields.filter((f) => classifyFieldRole(f) === "categorical");
  const numericFields = fields.filter((f) => classifyFieldRole(f) === "numeric");

  if (categoricalFields.length && numericFields.length) {
    const cf = categoricalFields[0];
    const nf = numericFields[0];
    const li1 = document.createElement("li");
    li1.textContent = `Count of records by ${cf.name}`;
    suggestedList.appendChild(li1);
    
    const li2 = document.createElement("li");
    li2.textContent = `Average ${nf.name} by ${cf.name}`;
    suggestedList.appendChild(li2);
  }

  if (dateFields.length && numericFields.length) {
    const df = dateFields[0];
    const nf = numericFields[0];
    const li = document.createElement("li");
    li.textContent = `How did ${nf.name} change over ${df.name}?`;
    suggestedList.appendChild(li);
  }

  if (categoricalFields.length > 1) {
    const li = document.createElement("li");
    li.textContent = `Count of records by ${categoricalFields[0].name} and ${categoricalFields[1].name}`;
    suggestedList.appendChild(li);
  }

  suggestedSection.appendChild(suggestedList);
  section.appendChild(suggestedSection);

  container.appendChild(section);
}

function calculateHealthScore(fields = [], qualities = {}) {
  if (!fields.length) return 0;

  let score = 100;
  fields.forEach((field) => {
    const nullKey = `${field.name}__null_count`;
    const nullCount = qualities[nullKey] || 0;
    if (nullCount > 0) score -= Math.min(20, nullCount * 5);
  });

  return Math.max(0, score);
}

function healthIndicator(score) {
  if (score >= 90) return `✓ Excellent (${score}%)`;
  if (score >= 70) return `~ Good (${score}%)`;
  if (score >= 50) return `⚠ Fair (${score}%)`;
  return `✗ Poor (${score}%)`;
}
