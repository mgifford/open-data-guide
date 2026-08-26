import "./style.css";
import { resolveDataset, loadDataDictionary, searchCkanCatalogPage, searchDkanCatalogPage } from "./adapters/resolver.js";
import {
  saveDataset, listDatasets, removeDataset, listRecords, putRecord, deleteRecord,
  exportWorkspace, importWorkspace, clearWorkspace, storageEstimate,
  listCustomCatalogs, saveCustomCatalog, removeCustomCatalog,
} from "./catalog/storage.js";
import { listBuiltinCatalogs, getBuiltinCatalog, detectCatalog, normalizeCustomCatalog, DEFAULT_CATALOG_ID } from "./catalog/catalogs.js";
import { catalogSearchTerms, explainRelatedDataset, relatedDatasets } from "./catalog/related.js";
import { compareFields, historyStatus, sourceChanged } from "./catalog/history.js";
import { loadResource, runQuery } from "./data/duckdb.js";
import { compilePlan, interpretQuestion, validatePlan } from "./query/plan.js";
import { renderTable } from "./render/table.js";
import { renderChart } from "./render/chart.js";
import { renderSchematic } from "./render/schematic.js";
import { describeResult } from "./render/advisor.js";
import { downloadText, resultsToCsv, resultsToJson } from "./render/export.js";
import { shouldRefuseResource } from "./data/ingestion.js";
import { datastoreResource, runDataStorePlan } from "./data/datastore.js";
import { createActivityLog } from "./ui/activity.js";
import { createJourney } from "./ui/journey.js";
import { analyzeJoinCandidate, joinPreview, validateJoinCandidate } from "./catalog/relationships.js";

const elements = Object.fromEntries([
  "dataset-form", "dataset-url", "sample-button", "local-csv-input", "status", "dataset-section", "dataset-heading",
  "dataset-description", "dataset-metadata", "platform-label", "resource-control", "size-warning",
  "load-resource-button", "save-button", "explore-section", "profile-summary", "fields-table",
  "preview-table", "quality-summary", "question-section", "question-form", "question", "question-interpret-button", "plan-form", "aggregation",
  "measure", "dimension", "run-plan-button", "plan-review", "query-output", "result-explanation", "result-table", "chart", "sql-output", "download-csv-button", "download-json-button", "download-spec-button",
    "schematic-view",
  "provenance", "saved-list", "related-list", "semantic-button", "capability-output",
  "catalog-form", "catalog-select", "catalog-details", "catalog-publisher-link", "catalog-url", "catalog-query", "catalog-results",
  "custom-catalog-form", "custom-catalog-name", "test-catalog-button", "save-catalog-button", "catalog-detection", "custom-catalog-list",
  "history-search-form", "history-query", "history-list", "export-button",
  "import-input", "clear-data-button", "storage-summary", "story-text", "export-receipt", "clarification-output",
  "cancel-resource-button", "resource-status", "cancel-query-button", "query-status",
  "activity-list", "copy-diagnostics-button", "download-diagnostics-button", "clear-diagnostics-button", "diagnostics-status",
  "join-section", "join-form", "join-target", "join-source-field", "join-target-field", "join-evidence", "join-confirmation", "join-confirm-checkbox", "join-confirm-button", "join-result",
].map((id) => [id, document.getElementById(id)]));

let currentDataset = null;
let currentResource = null;
let currentFields = [];
let currentQualities = {};
let savedDatasets = [];
let catalogCandidates = [];
let activeCatalog = null;
let detectedCustomCatalog = null;
const journey = createJourney(document.getElementById("journey-nav"));
let historyRecords = [];
let dismissedRelated = new Set();
let pendingHistoryRecord = null;
let pendingHistoryPlan = null;
let catalogSeenKeys = new Set();
let activePlannerProvenance = { modelBackend: "deterministic", modelIdentifier: "", modelVersion: "" };
let plannerAbortController = null;
let activePlan = null;
let activePlanner = null;
let currentResult = null;
let resourceAbortController = null;
let queryAbortController = null;
let joinTargetDataset = null;
let joinEvidence = null;

function renderActivity(events) {
  elements["activity-list"].replaceChildren();
  events.slice().reverse().forEach((event) => {
    const item = document.createElement("li");
    const summary = document.createElement("span");
    summary.textContent = `${new Date(event.timestamp).toLocaleTimeString()} ${event.level.toUpperCase()} ${event.operation}.${event.stage}`;
    const detail = document.createElement("details");
    const disclosure = document.createElement("summary");
    disclosure.textContent = "Details";
    detail.append(disclosure);
    detail.addEventListener("toggle", () => {
      if (detail.open && detail.children.length === 1) {
        const message = document.createElement("p");
        message.textContent = event.message;
        detail.append(message);
      }
    });
    item.append(summary, " ", detail);
    elements["activity-list"].append(item);
  });
}

const activity = createActivityLog({ onChange: renderActivity });

function diagnosticsText() {
  return JSON.stringify(activity.list(), null, 2);
}

elements["copy-diagnostics-button"].addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(diagnosticsText());
    setStatus("Diagnostics copied for this session.", "info", elements["diagnostics-status"]);
  } catch (error) {
    setStatus(`Diagnostics could not be copied: ${error.message}`, "error", elements["diagnostics-status"]);
  }
});

elements["download-diagnostics-button"].addEventListener("click", () => {
  const blob = new Blob([diagnosticsText()], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "open-data-guide-diagnostics.json";
  link.click();
  URL.revokeObjectURL(link.href);
});

elements["clear-diagnostics-button"].addEventListener("click", () => {
  activity.clear();
  setStatus("Session diagnostics cleared.", "info", elements["diagnostics-status"], { operation: "diagnostics", stage: "cleared" });
});

function resetPlannerProvenance() {
  activePlannerProvenance = { modelBackend: "deterministic", modelIdentifier: "", modelVersion: "" };
  activePlanner = null;
}

function renderPlanReview(plan) {
  elements["plan-review"].replaceChildren();
  const summary = document.createElement("p");
  summary.textContent = `Plan: ${plan.aggregation}; measure: ${plan.measure || "row count"}; group: ${plan.dimension || "none"}; time field: ${plan.timeField || "none"}; limit: ${plan.limit}.`;
  const detail = document.createElement("details");
  const disclosure = document.createElement("summary");
  disclosure.textContent = "Show filters, visualization, assumptions, and warnings";
  const content = document.createElement("pre");
  content.textContent = JSON.stringify({ filters: plan.filters || [], visualization: plan.visualization || { kind: "table" }, assumptions: plan.assumptions || [], warnings: plan.warnings || [] }, null, 2);
  detail.append(disclosure, content);
  elements["plan-review"].append(summary, detail);
}

function applySuggestion(plan) {
  activePlan = { version: 1, status: "ready", question: plan.question || "Suggested analysis", ...plan, visualization: { kind: plan.dimension ? "bar" : "table", x: plan.dimension || null, y: plan.measure || "value", series: null } };
  elements.question.value = activePlan.question;
  elements.aggregation.value = activePlan.aggregation;
  fillSelect(elements.measure, currentFields.filter((field) => /INT|DECIMAL|DOUBLE|FLOAT|REAL|NUMERIC|HUGEINT/i.test(field.type || "")), false);
  fillSelect(elements.dimension, currentFields, true);
  elements.measure.value = activePlan.measure || "";
  elements.dimension.value = activePlan.dimension || "";
  elements["plan-form"].hidden = false;
  renderPlanReview(activePlan);
  validateCurrentControls();
  elements["plan-form"].scrollIntoView({ behavior: "smooth", block: "start" });
}

function controlsPlan() {
  const plan = {
    ...(activePlan || {}),
    version: 1,
    status: "ready",
    question: elements.question.value,
    aggregation: elements.aggregation.value,
    measure: elements.measure.value,
    dimension: elements.dimension.value,
    timeField: activePlan?.timeField || currentFields.find((field) => field.name === elements.dimension.value && /DATE|TIME|TIMESTAMP/i.test(field.type || ""))?.name || "",
    filters: activePlan?.filters || [],
    limit: activePlan?.limit || 100,
    assumptions: activePlan?.assumptions || [],
    warnings: activePlan?.warnings || [],
    visualization: activePlan?.visualization || { kind: elements.dimension.value ? "bar" : "table", x: elements.dimension.value || null, y: "value", series: null },
  };
  return plan;
}

function validateCurrentControls() {
  if (elements["plan-form"].hidden || !currentFields.length) return false;
  try {
    validatePlan(controlsPlan(), currentFields);
    elements["run-plan-button"].disabled = false;
    return true;
  } catch (error) {
    elements["run-plan-button"].disabled = true;
    return false;
  }
}

function setStatus(message, kind = "info", target = elements.status, meta = {}) {
  target.textContent = message;
  target.dataset.kind = kind;
  target.setAttribute("role", kind === "error" ? "alert" : "status");
  activity.add({ level: kind === "error" ? "error" : "info", operation: meta.operation || target.id || "application", stage: meta.stage || (kind === "error" ? "failed" : "update"), message, details: meta.details || {} });
}

function clearStatus() {
  elements.status.textContent = "";
}

function formatDate(value) {
  if (!value) return "Not supplied";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString();
}

function showClarification(plan) {
  elements["clarification-output"].replaceChildren();
  if (plan.status !== "needs-clarification" || !plan.clarification?.choices?.length) return;
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = plan.clarification.message;
  const label = document.createElement("label");
  label.htmlFor = "clarification-choice";
  label.textContent = plan.clarification.kind === "choose-time-field" ? "Date field to use" : "Choice";
  const select = document.createElement("select");
  select.id = "clarification-choice";
  plan.clarification.choices.forEach((choice) => {
    const option = document.createElement("option");
    option.value = choice;
    option.textContent = choice;
    select.append(option);
  });
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Use this date field for review";
  button.hidden = plan.clarification.kind !== "choose-time-field";
  button.addEventListener("click", () => {
    elements.question.value = `${elements.question.value.replace(/\?$/, "")} by ${select.value}`;
    elements["clarification-output"].replaceChildren();
    elements["question-form"].requestSubmit();
  });
  if (plan.clarification.kind !== "choose-time-field") {
    const note = document.createElement("p");
    note.textContent = "These choices provide guidance only. No executable plan has been created.";
    fieldset.append(legend, label, select, note);
  } else {
    fieldset.append(legend, label, select, button);
  }
  elements["clarification-output"].append(fieldset);
}

function resultStory(rows, plan) {
  if (!rows.length) return "No rows matched this question, so there is no pattern to describe.";
  if (!plan.dimension) return `The calculation returned one overall value: ${rows[0].value}. Review the table and source metadata before drawing conclusions.`;
  const ranked = [...rows].sort((a, b) => Number(b.value) - Number(a.value));
  const largest = ranked[0];
  const smallest = ranked[ranked.length - 1];
  return `The largest returned value is ${largest.category} (${largest.value}); the smallest is ${smallest.category} (${smallest.value}). This is a ${plan.aggregation} grouped by ${plan.dimension}, not a causal explanation. The table contains ${rows.length} returned categories.`;
}

async function refreshStorageSummary() {
  const [datasets, queries, relationships] = await Promise.all([
    listRecords("datasets"), listRecords("queries"), listRecords("relationships"),
  ]);
  const estimate = await storageEstimate();
  const usage = estimate.usage === null ? "storage estimate unavailable" : `${(estimate.usage / 1024 / 1024).toFixed(1)} MB used`;
  elements["storage-summary"].textContent = `Local cache: ${datasets.length} saved dataset${datasets.length === 1 ? "" : "s"}, ${queries.length} saved quer${queries.length === 1 ? "y" : "ies"}, and ${relationships.length} relationship record${relationships.length === 1 ? "" : "s"}. ${usage}. Source files are not copied here.`;
}

function plainText(value) {
  const documentFragment = new DOMParser().parseFromString(String(value || ""), "text/html");
  return documentFragment.body.textContent?.replace(/\s+/g, " ").trim() || "";
}

function metadataList(container, entries) {
  container.replaceChildren();
  entries.forEach(([term, value]) => {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    if (value instanceof Node) dd.append(value);
    else dd.textContent = value || "Not supplied";
    container.append(dt, dd);
  });
}

function renderCatalogResults(datasets, total, start = 0, query = "", rawCount = datasets.length) {
  elements["catalog-results"].replaceChildren();
  catalogCandidates = datasets;
  if (!datasets.length) {
    elements["catalog-results"].textContent = "No datasets matched those terms in this data catalog.";
    return;
  }
  const heading = document.createElement("p");
  heading.textContent = `Showing ${start + 1}-${start + datasets.length} of ${total} catalog matches. Search terms: ${query}. Results are reranked only within this fetched page.`;
  const list = document.createElement("ol");
  const unique = [...new Map(datasets.filter((dataset) => dataset.key !== currentDataset?.key && !catalogSeenKeys.has(dataset.key)).map((dataset) => [dataset.key, dataset])).values()];
  unique.forEach((dataset) => catalogSeenKeys.add(dataset.key));
  unique.forEach((dataset) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = dataset.sourceUrl;
    link.textContent = dataset.title;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      elements["dataset-url"].value = dataset.sourceUrl;
      inspectUrl(dataset.sourceUrl);
    });
    const details = document.createElement("span");
    const evidence = currentDataset ? explainRelatedDataset(currentDataset, dataset) : { evidence: [] };
    const evidenceText = evidence.evidence.map((item) => `${item.label}: ${item.value}`).join("; ");
    details.textContent = ` — From catalog: ${dataset.catalogName || dataset.catalogUrl || "Unknown"}. ${plainText(dataset.description) || "No description supplied."} Evidence: ${evidenceText || "catalog match; review metadata"}. Publisher: ${plainText(dataset.publisher) || "Not supplied"}. Themes: ${(dataset.themes || []).join(", ") || "Not supplied"}. Geography: ${plainText(dataset.spatial) || "Not supplied"}. Time: ${plainText(dataset.temporal) || "Not supplied"}. Catalog metadata retrieval does not guarantee this resource is browser-accessible. Source: ${dataset.sourceUrl}`;
    const save = document.createElement("button");
    save.type = "button";
    save.className = "button-secondary compact-button";
    save.textContent = "Save dataset";
    save.addEventListener("click", async () => {
      await saveDataset(dataset);
      await refreshSaved();
      save.textContent = "Saved dataset";
    });
    item.append(link, details, save);
    list.append(item);
  });
  elements["catalog-results"].append(heading, list);
  if (start + rawCount < total) {
    const next = document.createElement("button");
    next.type = "button";
    next.className = "button-secondary";
    next.textContent = "Load next catalog page";
    next.addEventListener("click", () => searchCatalog(start + rawCount));
    elements["catalog-results"].append(next);
  }
}

async function searchCatalog(start = 0) {
  if (start === 0) catalogSeenKeys = new Set();
  if (!activeCatalog) {
    setStatus("Choose a catalog to search.", "error");
    return;
  }
  const catalogUrl = activeCatalog.baseUrl;
  const query = elements["catalog-query"].value.trim() || catalogSearchTerms(currentDataset || { title: "public data" });
  if (!query) {
    setStatus("Enter search terms, or open a catalog dataset first.", "error");
    return;
  }
  try {
    const search = activeCatalog.platform === "DKAN" ? searchDkanCatalogPage : searchCkanCatalogPage;
    const result = await search(catalogUrl, query, { start, rows: 20 });
    const tagged = result.datasets.map((dataset) => ({ ...dataset, catalogId: activeCatalog.id, catalogName: activeCatalog.name, catalogUrl }));
    const ranked = tagged.map((dataset) => ({ dataset, score: currentDataset ? explainRelatedDataset(currentDataset, dataset).score : 0 })).sort((a, b) => b.score - a.score).map(({ dataset }) => dataset);
    renderCatalogResults(ranked, result.total, result.start, query, result.datasets.length);
    setStatus(`Found ${result.total} matches in ${activeCatalog.name}.`);
  } catch (error) {
    setStatus(`Catalog search of ${activeCatalog.name} failed: ${error.message}. The catalog may block cross-origin browser requests.`, "error");
  }
}

async function refreshHistory(filter = "") {
  historyRecords = (await listRecords("queries"))
    .filter((record) => !filter || `${record.question} ${record.normalizedQuestion}`.includes(filter.toLowerCase()))
    .sort((a, b) => String(b.lastRunAt || b.createdAt).localeCompare(String(a.lastRunAt || a.createdAt)));
  elements["history-list"].replaceChildren();
  if (!historyRecords.length) {
    elements["history-list"].textContent = "No saved analyses match this search.";
    return;
  }
  historyRecords.forEach((record) => {
    const article = document.createElement("article");
    article.className = "saved-card";
    const heading = document.createElement("h3");
    heading.textContent = record.question;
    const detail = document.createElement("p");
    const status = currentDataset ? historyStatus(currentDataset, record) : "unknown";
    const stale = status === "stale";
    const statusLabel = status === "different-dataset" ? " · different dataset" : stale ? " · stale source: review before reuse" : "";
    detail.textContent = `${formatDate(record.lastRunAt)} · ${record.interpretation?.aggregation || "query"} · ${record.rowCountReturned ?? 0} rows returned${statusLabel}`;
    const actions = document.createElement("div");
    actions.className = "saved-actions";
    const rerun = document.createElement("button");
    rerun.type = "button";
    rerun.className = "button-secondary";
    rerun.textContent = stale ? "Review stale question" : "Reuse question";
    rerun.addEventListener("click", () => {
      elements.question.value = record.question;
      restoreHistoryRecord(record).catch((error) => setStatus(`Could not reopen this analysis: ${error.message}`, "error"));
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button-secondary";
    remove.textContent = "Delete analysis";
    remove.addEventListener("click", async () => {
      await deleteRecord("queries", record.id);
      await refreshHistory(elements["history-query"].value);
      await refreshStorageSummary();
      setStatus("Analysis removed from this browser.");
    });
    actions.append(rerun, remove);
    article.append(heading, detail, actions);
    elements["history-list"].append(article);
  });
}

async function restoreHistoryRecord(record) {
  if (!record.sourceUrl) {
    elements.question.value = record.question || "";
    elements["question-section"].hidden = false;
    elements["question-interpret-button"].disabled = true;
    elements["plan-form"].hidden = true;
    setStatus("This older saved analysis has no original source URL. The question can be reused, but the original source cannot be reopened.", "error");
    return;
  }
  const dataset = await inspectUrl(record.sourceUrl);
  if (!dataset) return;
  const stale = sourceChanged(dataset, record);
  pendingHistoryRecord = record;
  pendingHistoryPlan = record.queryPlan || record.interpretation || null;
  const resource = dataset.resources?.find((item) => item.id === record.resourceIds?.[0] || item.url === record.resourceUrls?.[0]);
  const select = document.getElementById("resource-select");
  if (select && resource) select.value = resource.id;
  elements.question.value = record.question;
  document.getElementById("question-section").hidden = false;
  elements.question.focus();
  setStatus(`${stale ? "This source changed since the analysis. " : ""}The dataset and resource are ready. Review the source, fields, and plan, then choose Load selected resource before running the analysis.`);
}

function sourceLink(dataset) {
  const link = document.createElement("a");
  link.href = dataset.sourceUrl;
  link.textContent = dataset.sourceUrl;
  link.rel = "noreferrer";
  return link;
}

function supportedResources(dataset) {
  return dataset.resources.filter((resource) => ["csv", "json", "parquet"].includes(resource.format));
}

function selectedResource() {
  const select = document.getElementById("resource-select");
  return supportedResources(currentDataset).find((resource) => resource.id === select?.value) || supportedResources(currentDataset)[0];
}

function renderDataset(dataset) {
  currentDataset = dataset;
  activePlan = null;
  resetPlannerProvenance();
  currentFields = dataset.fields || [];
  if (dataset.catalogUrl) currentDataset.catalogUrl = dataset.catalogUrl;
  elements["dataset-section"].hidden = false;
  elements["explore-section"].hidden = true;
  elements["question-section"].hidden = true;
  elements["query-output"].hidden = true;
  elements["platform-label"].textContent = dataset.platform;
  elements["dataset-heading"].textContent = dataset.title;
  elements["dataset-description"].textContent = plainText(dataset.description) || "No catalog description was supplied.";
  metadataList(elements["dataset-metadata"], [
    ["Publisher", dataset.publisher],
    ["Modified", formatDate(dataset.modified)],
    ["License", dataset.license],
    ["Source", sourceLink(dataset)],
  ]);

  const resources = supportedResources(dataset);
  elements["resource-control"].replaceChildren();
  if (!resources.length) {
    elements["resource-control"].textContent = "No supported CSV, JSON, or Parquet resource was found.";
    elements["load-resource-button"].hidden = true;
  } else {
    const label = document.createElement("label");
    label.htmlFor = "resource-select";
    label.textContent = "Resource";
    const select = document.createElement("select");
    select.id = "resource-select";
    resources.forEach((resource) => {
      const option = document.createElement("option");
      option.value = resource.id;
      option.textContent = `${resource.title} (${resource.format.toUpperCase()})`;
      select.append(option);
    });
    select.addEventListener("change", updateResourceWarning);
    elements["resource-control"].append(label, select);
    elements["load-resource-button"].hidden = false;
    updateResourceWarning();
  }
  elements["save-button"].textContent = savedDatasets.some((item) => item.key === dataset.key)
    ? "Update saved marker" : "Save marker in this browser";
  renderRelated();
}

async function updateResourceWarning() {
  currentResource = selectedResource();
  elements["size-warning"].hidden = true;
  elements["size-warning"].textContent = "";
  elements["load-resource-button"].disabled = false;
  if (!currentResource) return;
  if (datastoreResource(currentResource)) {
    elements["size-warning"].hidden = false;
    elements["size-warning"].textContent = "This resource exposes CKAN DataStore. Open Data Guide will request bounded API pages instead of downloading the complete source file.";
    return;
  }
  const declaredBytes = Number(currentResource.sizeBytes);
  if (shouldRefuseResource(declaredBytes)) {
    elements["load-resource-button"].disabled = true;
    elements["size-warning"].hidden = false;
    elements["size-warning"].textContent = `The publisher reports that this resource is approximately ${(declaredBytes / 1_000_000).toFixed(0)} MB. Automatic browser loading is refused above 500 MB.`;
    return;
  }
  if (/very large file/i.test(currentDataset.description || "")) {
    elements["size-warning"].hidden = false;
    elements["size-warning"].textContent = "The publisher identifies this as a very large file. Loading it may use substantial bandwidth and browser memory. Consider a smaller resource or portal API for initial exploration.";
    return;
  }
  try {
    const response = await fetch(currentResource.url, { method: "HEAD" });
    const bytes = Number(response.headers.get("content-length"));
    if (shouldRefuseResource(bytes)) {
      elements["load-resource-button"].disabled = true;
      elements["size-warning"].hidden = false;
      elements["size-warning"].textContent = `This resource is approximately ${(bytes / 1_000_000).toFixed(0)} MB. Automatic browser loading is refused above 500 MB to protect memory. Choose a smaller resource or a portal API.`;
    } else if (bytes > 200_000_000) {
      elements["size-warning"].hidden = false;
      elements["size-warning"].textContent = `This resource is approximately ${(bytes / 1_000_000).toFixed(0)} MB. Loading it may use substantial bandwidth and browser memory.`;
    }
  } catch {
    // A missing CORS-enabled HEAD response should not prevent a later GET request.
  }
}

function fillSelect(select, fields, includeNone) {
  select.replaceChildren();
  if (includeNone) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No grouping";
    select.append(option);
  }
  fields.forEach((field) => {
    const option = document.createElement("option");
    option.value = field.name;
    option.textContent = `${field.name} (${field.type})`;
    select.append(option);
  });
}

function renderProfile(profile) {
  currentFields = profile.fields;
  currentQualities = Object.fromEntries(currentFields.flatMap((field) => [
    [`${field.name}__null_count`, field.nullCount],
    [`${field.name}__distinct_count`, field.distinctCount],
  ]).filter(([, value]) => value !== undefined));
  currentQualities.__row_count = profile.quality?.remote ? profile.quality.previewRowCount : profile.quality?.rowCount ?? profile.preview?.length ?? 0;
  const numeric = currentFields.filter((field) => !["postal-code", "zip-code", "zip-plus-four", "zcta", "fips"].includes(field.semanticRole) && /INT|DECIMAL|DOUBLE|FLOAT|REAL|NUMERIC|HUGEINT/i.test(field.type));
  elements["profile-summary"].replaceChildren();
  [["Fields", currentFields.length], ["Previewed rows", profile.preview.length], ["Numeric fields", numeric.length]].forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "summary-item";
    const strong = document.createElement("strong");
    strong.textContent = value;
    item.append(strong, document.createTextNode(label));
    elements["profile-summary"].append(item);
  });
  renderTable(elements["fields-table"], currentFields.map((field) => ({
    field: field.name,
    inferred_type: field.type,
    documented_definition: field.description || "Not supplied",
  })), "Fields found in this resource");
  renderTable(elements["preview-table"], profile.preview, "First 20 rows");
  elements["quality-summary"].replaceChildren();
  const qualityHeading = document.createElement("h3");
  qualityHeading.textContent = "Data quality before analysis";
  const qualityNote = document.createElement("p");
  const parseNote = profile.quality?.parseFailures?.length ? ` ${profile.quality.parseFailures.length} malformed row(s) were reported and excluded from the typed projection; inspect the source before relying on totals.` : "";
  qualityNote.textContent = profile.quality?.remote
    ? `The resource reports ${profile.quality.rowCount ?? "an unknown number of"} total rows. Missing and distinct counts below describe only the ${profile.quality.previewRowCount} preview rows returned by the DataStore, not the full resource.`
    : `The resource contains ${profile.quality?.rowCount ?? "an unknown number of"} rows. Empty values and configured textual sentinels (None, NULL, null, N/A, NA, and Not supplied) are treated as missing for calculations.${parseNote} Raw CSV values remain queryable in the dataset_raw view.`;
  const qualityRows = currentFields.map((field) => ({
    field: field.name,
    semantic_role: field.semanticRole || "Not inferred",
    inferred_type: field.type,
    missing_values: field.nullCount ?? "Not profiled",
    distinct_values: field.distinctCount ?? "Not profiled",
    warnings: field.warnings?.join(" ") || "None",
  }));
  const qualityTable = document.createElement("div");
  elements["quality-summary"].append(qualityHeading, qualityNote, qualityTable);
  renderTable(qualityTable, qualityRows, "Profile for fields used in analysis");
  renderSchematic(elements["schematic-view"], currentFields, currentQualities, currentResource, applySuggestion);
  fillSelect(elements.measure, numeric, false);
  fillSelect(elements.dimension, currentFields, true);
  elements["explore-section"].hidden = false;
  elements["question-section"].hidden = false;
  journey.reach(3);
  elements["question"].value = currentFields.some((field) => field.name === "state") ? "count by state" : "count rows";
  elements["question-interpret-button"].disabled = false;
  elements["run-plan-button"].disabled = false;
  if (pendingHistoryPlan && pendingHistoryRecord) {
    const plan = pendingHistoryPlan;
    elements["question"].value = pendingHistoryRecord.question || elements["question"].value;
    elements.aggregation.value = plan.aggregation || "count";
    elements.measure.value = plan.measure || "";
    elements.dimension.value = plan.dimension || "";
    elements["plan-form"].hidden = false;
    const comparison = compareFields(pendingHistoryRecord.fieldSnapshot || [], currentFields);
    const changed = comparison.removed.length || comparison.added.length || comparison.retyped.length || sourceChanged(currentDataset, pendingHistoryRecord);
    if (changed) {
      elements["run-plan-button"].disabled = true;
      const details = [
        comparison.removed.length ? `removed: ${comparison.removed.join(", ")}` : "",
        comparison.added.length ? `added: ${comparison.added.join(", ")}` : "",
        comparison.retyped.length ? `retyped: ${comparison.retyped.map((field) => `${field.name} (${field.previous} to ${field.current})`).join(", ")}` : "",
      ].filter(Boolean).join("; ");
      setStatus(`This saved plan needs repair before it can run. ${details || "The source changed."}`);
    } else {
      setStatus("Saved plan restored. Review the calculation and fields before running it.");
      validateCurrentControls();
    }
    pendingHistoryPlan = null;
  }
  [elements.aggregation, elements.measure, elements.dimension].forEach((control) => control.addEventListener("change", () => {
    activePlan = controlsPlan();
    resetPlannerProvenance();
    renderPlanReview(activePlan);
    validateCurrentControls();
  }));
}

// Local CSV files are read through a blob URL so DuckDB-Wasm parses them in the
// browser without any network upload.
function loadLocalCsv(file) {
  const looksCsv = /\.csv$/i.test(file.name) || /csv|text\/plain/i.test(file.type || "");
  if (!looksCsv) {
    setStatus(`Unsupported format: ${file.name}. Local loading currently supports CSV files only.`, "error");
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  const dataset = {
    key: `local:${file.name}:${file.size}`,
    platform: "Local file",
    connectorId: "local",
    id: file.name,
    sourceUrl: "",
    catalogUrl: "",
    title: file.name,
    description: "A CSV file loaded from this computer. It is read and processed in your browser and is not uploaded to any server.",
    publisher: "This computer",
    license: "",
    modified: "",
    fields: [],
    resources: [{ id: file.name, title: file.name, url: objectUrl, format: "csv", mediaType: "text/csv", dataDictionaryUrl: "", catalogUrl: "" }],
    retrievedAt: new Date().toISOString(),
  };
  renderDataset(dataset);
  journey.reach(2);
  setStatus(`Loaded ${file.name} from this computer. Choose Load selected resource to profile it locally.`, "info");
}

// Report resolve-time failures with a distinct, plain reason.
function classifyLoadError(error) {
  const message = error?.message || String(error);
  if (/cross-origin|CORS/i.test(message)) return `Cross-origin (CORS) block: the catalog or file did not let this browser read it. ${message}`;
  if (/HTTP or HTTPS|direct CSV, JSON, or Parquet/i.test(message)) return `Unsupported format or address: ${message}`;
  if (/Failed to fetch|NetworkError|network/i.test(message)) return `Network failure: the request could not reach the source. Check the address and your connection. ${message}`;
  return message;
}

// Report resource-load failures as CORS, unsupported format, network, or size.
function classifyResourceError(error) {
  const message = error?.message || String(error);
  if (/refused|500 MB|too large|memory budget/i.test(message)) return `Size refusal: ${message}`;
  if (/UTF-8|parse|read_csv|read_json|read_parquet|Invalid|unsupported format/i.test(message)) return `Unsupported or unreadable format: ${message}`;
  if (/Failed to fetch|NetworkError|load failed/i.test(message)) return `Network or CORS failure: the browser could not fetch this resource. The source may block cross-origin requests or be unavailable. (${message})`;
  return `The resource could not be loaded: ${message}. Check CORS support and file size.`;
}

async function inspectUrl(url) {
  if (!url || typeof url !== "string") {
    setStatus("This saved analysis has no original source URL. The question can be reused, but the original source cannot be reopened.", "error");
    return null;
  }
  setStatus("Resolving the dataset and its catalog metadata...");
  try {
    const dataset = await resolveDataset(url);
    renderDataset(dataset);
    journey.reach(2);
    setStatus(`Found ${dataset.title}. Choose a resource to load.`);
    return dataset;
  } catch (error) {
    setStatus(classifyLoadError(error, url), "error");
    return null;
  }
}

elements["dataset-form"].addEventListener("submit", (event) => {
  event.preventDefault();
  inspectUrl(elements["dataset-url"].value);
});

elements["local-csv-input"].addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  loadLocalCsv(file);
  event.target.value = "";
});

elements["sample-button"].addEventListener("click", () => {
  const sampleUrl = new URL("./sample/payments-sample.csv", window.location.href).href;
  elements["dataset-url"].value = sampleUrl;
  inspectUrl(sampleUrl);
});

document.querySelectorAll(".starter-list a:not(.starter-publisher)").forEach((link) => link.addEventListener("click", (event) => {
  event.preventDefault();
  elements["dataset-url"].value = link.href;
  inspectUrl(link.href);
}));

elements["cancel-resource-button"].addEventListener("click", () => resourceAbortController?.abort());

elements["load-resource-button"].addEventListener("click", async () => {
  currentResource = selectedResource();
  if (!currentResource) return;
  resourceAbortController = new AbortController();
  elements["cancel-resource-button"].hidden = false;
  elements["load-resource-button"].disabled = true;
  const remote = datastoreResource(currentResource);
  setStatus(remote ? "Loading a bounded schema and preview through CKAN DataStore..." : "Starting DuckDB-Wasm and reading the resource. Large files may take time...", "info", elements["resource-status"]);
  try {
    const [profile, dictionary] = await Promise.all([loadResource(currentResource, { signal: resourceAbortController.signal }), loadDataDictionary(currentResource, { signal: resourceAbortController.signal })]);
    const definitions = new Map(dictionary.flatMap((field) => [
      [String(field.name || "").toLowerCase(), field.description],
      [String(field.title || "").toLowerCase(), field.description],
    ]));
    profile.fields = profile.fields.map((field) => ({ ...field, description: definitions.get(field.name.toLowerCase()) || "" }));
    currentDataset = {
      ...currentDataset,
      fields: profile.fields,
      selectedResource: currentResource,
      joinSnapshot: {
        fields: profile.fields.map((field) => ({ name: field.name, type: field.type, semanticRole: field.semanticRole || "" })),
        rows: profile.preview.slice(0, 100),
        rowLimit: 100,
        totalRows: profile.quality?.rowCount ?? null,
        resourceId: currentResource.id,
        resourceUrl: currentResource.url,
        capturedAt: new Date().toISOString(),
      },
    };
    if (profile.sourceDigest) currentDataset.sourceDigest = profile.sourceDigest;
    renderProfile(profile);
    await refreshSaved();
    if (pendingHistoryRecord) {
      const stale = sourceChanged(currentDataset, pendingHistoryRecord);
      setStatus(stale
        ? "This source or schema changed since the saved analysis. Review the fields and query plan before running it."
        : "The saved analysis source is unchanged. Review the fields and query plan before running it.", "info", elements["resource-status"]);
      pendingHistoryRecord = null;
    } else {
      setStatus("Resource loaded. The preview, fields, and question builder are ready.", "info", elements["resource-status"]);
    }
  } catch (error) {
    const cancelled = error.name === "AbortError" || resourceAbortController.signal.aborted;
    setStatus(cancelled ? "Resource loading cancelled. No analysis was run." : classifyResourceError(error), cancelled ? "info" : "error", elements["resource-status"]);
  } finally {
    resourceAbortController = null;
    elements["cancel-resource-button"].hidden = true;
    elements["load-resource-button"].disabled = false;
    updateResourceWarning();
  }
});

elements["question-form"].addEventListener("submit", (event) => {
  event.preventDefault();
  const plan = interpretQuestion(elements.question.value, currentFields);
  activePlan = plan;
  resetPlannerProvenance();
  elements.aggregation.value = plan.aggregation;
  elements.measure.value = plan.measure;
  elements.dimension.value = plan.dimension;
  elements["plan-form"].hidden = false;
  if (plan.status === "needs-clarification") {
    elements["plan-form"].hidden = true;
    showClarification(plan);
    setStatus(`${plan.clarification.message} Choices: ${plan.clarification.choices.join("; ")}`);
  } else if (plan.aggregation !== "count" && !plan.measure) {
    elements["clarification-output"].replaceChildren();
    setStatus("I recognized the calculation but not the measure. Choose the intended numeric field before running it.");
  } else if (/\bby\b/i.test(elements.question.value) && !plan.dimension) {
    setStatus("I could not match the requested grouping to a field. Choose it explicitly before running the query.");
  } else {
    renderPlanReview(plan);
    setStatus("Review the interpreted calculation and fields, then run the verified query.");
  }
  validateCurrentControls();
});

elements["cancel-query-button"].addEventListener("click", () => queryAbortController?.abort());

elements["plan-form"].addEventListener("submit", async (event) => {
  event.preventDefault();
  const plan = controlsPlan();
  activePlan = plan;
  try {
    const sql = compilePlan(plan, currentFields);
    const remote = datastoreResource(currentResource);
    queryAbortController = new AbortController();
    elements["run-plan-button"].disabled = true;
    elements["cancel-query-button"].hidden = !remote;
    journey.reach(4);
    setStatus(remote ? "Running the validated query through the CKAN DataStore..." : "Running the validated query in DuckDB-Wasm...", "info", elements["query-status"]);
    const result = remote ? await runDataStorePlan(currentResource, plan, { signal: queryAbortController.signal }) : { rows: await runQuery(sql), total: null, scanned: null, truncated: false, requests: [], maxRows: null };
    const rows = result.rows;
    const remoteProvenance = remote ? { catalogOrigin: currentResource.catalogUrl, resourceId: currentResource.datastoreId, maxRows: result.maxRows, totalRowsReported: result.total, rowsScanned: result.scanned, truncated: result.truncated, requests: result.requests } : null;
    currentResult = { rows, plan, sql, vegaLiteSpec: null, remote, total: result.total, scanned: result.scanned, truncated: result.truncated, remoteProvenance };
    elements["query-output"].hidden = false;
    journey.reach(5);
    elements["result-explanation"].textContent = result.truncated ? `Incomplete preview only. The row budget stopped this query after ${result.scanned.toLocaleString()} of ${result.total.toLocaleString()} rows. Narrow the filters before interpreting or exporting an aggregate.` : describeResult(plan, { kind: plan.dimension ? "bar" : "table" }, rows.length, rows.length);
    elements["story-text"].textContent = result.truncated ? "No insight is generated from this incomplete aggregate." : resultStory(rows, plan);
    renderTable(elements["result-table"], rows, `${result.truncated ? "Incomplete preview" : "Result"} for: ${elements.question.value}`);
    currentResult.vegaLiteSpec = result.truncated ? null : await renderChart(elements.chart, rows, plan, currentFields);
    elements["download-csv-button"].disabled = result.truncated;
    elements["download-json-button"].disabled = result.truncated;
    elements["download-spec-button"].disabled = result.truncated || !currentResult.vegaLiteSpec;
    elements["sql-output"].textContent = remote ? JSON.stringify(remoteProvenance, null, 2) : sql;
    metadataList(elements.provenance, [
      ["Dataset", currentDataset.title],
      ["Resource", currentResource.title],
      ["Source URL", currentResource.url],
      ["Fields used", [plan.dimension, plan.measure].filter(Boolean).join(", ") || "No named fields"],
      ["Rows returned", String(rows.length)],
      ...(remote ? [["Rows scanned", String(result.scanned)], ["Remote result truncated", result.truncated ? "Yes; refine filters" : "No"]] : []),
      ["Planning backend", activePlannerProvenance.modelBackend],
      ["Model identity", activePlannerProvenance.modelBackend === "deterministic" ? "Not applicable" : activePlannerProvenance.modelIdentifier || "Not disclosed by browser"],
      ["Calculated", new Date().toISOString()],
    ]);
    await putRecord("queries", {
      id: crypto.randomUUID(),
      version: 1,
      question: elements.question.value,
      normalizedQuestion: elements.question.value.toLowerCase().trim(),
      datasetKeys: [currentDataset.key],
      sourceUrl: currentDataset.sourceUrl,
      resourceIds: [currentResource.id],
      resourceUrls: [currentResource.url],
      sourceDigests: [currentDataset.sourceDigest || ""],
      sourceModified: currentDataset.modified || "",
      interpretation: plan,
      queryPlan: plan,
      fieldSnapshot: currentFields.map((field) => ({ name: field.name, type: field.type, semanticRole: field.semanticRole })),
      sql,
      resultColumns: rows.length ? Object.keys(rows[0]) : [],
      resultPreview: rows.slice(0, 20),
      resultDigest: JSON.stringify(rows.slice(0, 20)),
      rowCountReturned: rows.length,
      rowsConsidered: null,
      rowsExcluded: null,
      exclusionReasons: [],
      visualizationIntent: plan.dimension ? "grouped" : "table",
      incomplete: result.truncated,
      remoteProvenance,
      vegaLiteSpec: currentResult.vegaLiteSpec,
      narrative: elements["result-explanation"].textContent,
      modelBackend: activePlannerProvenance.modelBackend,
      modelIdentifier: activePlannerProvenance.modelIdentifier,
      modelVersion: activePlannerProvenance.modelVersion,
      createdAt: new Date().toISOString(),
      lastRunAt: new Date().toISOString(),
    });
    await refreshHistory();
    await refreshStorageSummary();
    setStatus(result.truncated ? "Remote query stopped at the row budget. Charting and exports are disabled until the query is narrowed." : remote ? "Query complete. Review the table and exact DataStore pagination provenance." : "Query complete. Review the table, chart, and SQL.", result.truncated ? "error" : "info", elements["query-status"]);
  } catch (error) {
    const cancelled = error.name === "AbortError" || queryAbortController?.signal.aborted;
    setStatus(cancelled ? "Remote query cancelled. No result was saved." : error.message, cancelled ? "info" : "error", elements["query-status"]);
  } finally {
    queryAbortController = null;
    elements["cancel-query-button"].hidden = true;
    validateCurrentControls();
  }
});

function resultMetadata() {
  return {
    dataset: currentDataset?.title || "",
    resource: currentResource?.title || "",
    sourceUrl: currentResource?.url || "",
    calculatedAt: new Date().toISOString(),
  };
}

elements["download-csv-button"].addEventListener("click", () => {
  if (!currentResult) return;
  if (currentResult.truncated) {
    setStatus("Export blocked because this aggregate is incomplete. Narrow the remote query first.", "error", elements["query-status"]);
    return;
  }
  downloadText("open-data-guide-results.csv", resultsToCsv(currentResult.rows), "text/csv;charset=utf-8");
});

elements["download-json-button"].addEventListener("click", () => {
  if (!currentResult) return;
  if (currentResult.truncated) {
    setStatus("Export blocked because this aggregate is incomplete. Narrow the remote query first.", "error", elements["query-status"]);
    return;
  }
  downloadText("open-data-guide-results.json", resultsToJson({ ...currentResult, incomplete: currentResult.truncated, metadata: resultMetadata() }), "application/json;charset=utf-8");
});

elements["download-spec-button"].addEventListener("click", () => {
  if (!currentResult?.vegaLiteSpec || currentResult.truncated) return;
  downloadText("open-data-guide-chart.vl.json", JSON.stringify(currentResult.vegaLiteSpec, null, 2), "application/json;charset=utf-8");
});

elements["save-button"].addEventListener("click", async () => {
  if (!currentDataset) return;
  await saveDataset(currentDataset);
  await refreshSaved();
  elements["save-button"].textContent = "Update saved marker";
  setStatus("Dataset marker saved in this browser.");
});

function datasetCard(dataset) {
  const article = document.createElement("article");
  article.className = "saved-card";
  const heading = document.createElement("h3");
  heading.textContent = dataset.title;
  const detail = document.createElement("p");
  detail.textContent = `${dataset.platform} · ${dataset.publisher || "Publisher not supplied"}`;
  const actions = document.createElement("div");
  actions.className = "saved-actions";
  const inspect = document.createElement("button");
  inspect.type = "button";
  inspect.className = "button-secondary";
  inspect.textContent = "Inspect again";
  inspect.addEventListener("click", () => {
    elements["dataset-url"].value = dataset.sourceUrl;
    inspectUrl(dataset.sourceUrl);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  const source = document.createElement("a");
  source.href = dataset.sourceUrl;
  source.textContent = "Open publisher source";
  source.rel = "noreferrer";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "button-secondary";
  remove.textContent = "Remove marker";
  remove.addEventListener("click", async () => {
    await removeDataset(dataset.key);
    await refreshSaved();
  });
  actions.append(inspect, source);
  if (currentDataset?.joinSnapshot?.rows?.length && dataset.joinSnapshot?.rows?.length && dataset.key !== currentDataset.key) {
    const review = document.createElement("button");
    review.type = "button";
    review.className = "button-secondary";
    review.textContent = "Review possible join";
    review.addEventListener("click", () => openJoinReview(dataset));
    actions.append(review);
  }
  actions.append(remove);
  article.append(heading, detail, actions);
  return article;
}

function fillJoinFields(select, fields = []) {
  select.replaceChildren();
  fields.forEach((field) => {
    const option = document.createElement("option");
    option.value = field.name;
    option.textContent = `${field.name} (${field.type || "unknown"})`;
    select.append(option);
  });
}

function openJoinReview(dataset) {
  joinTargetDataset = dataset;
  joinEvidence = null;
  elements["join-section"].hidden = false;
  journey.reach(6);
  elements["join-target"].textContent = `Current dataset: ${currentDataset.title}. Saved dataset: ${dataset.title}.`;
  fillJoinFields(elements["join-source-field"], currentDataset.joinSnapshot.fields);
  fillJoinFields(elements["join-target-field"], dataset.joinSnapshot.fields);
  const shared = currentDataset.joinSnapshot.fields.find((field) => dataset.joinSnapshot.fields.some((candidate) => candidate.name.toLowerCase() === field.name.toLowerCase()));
  if (shared) {
    elements["join-source-field"].value = shared.name;
    elements["join-target-field"].value = dataset.joinSnapshot.fields.find((field) => field.name.toLowerCase() === shared.name.toLowerCase()).name;
  }
  elements["join-evidence"].replaceChildren();
  elements["join-result"].replaceChildren();
  elements["join-confirmation"].hidden = true;
  elements["join-confirm-checkbox"].checked = false;
  elements["join-confirm-button"].disabled = true;
  elements["join-section"].scrollIntoView({ behavior: "smooth", block: "start" });
}

elements["join-form"].addEventListener("submit", (event) => {
  event.preventDefault();
  if (!joinTargetDataset) return;
  const sourceField = elements["join-source-field"].value;
  const targetField = elements["join-target-field"].value;
  joinEvidence = analyzeJoinCandidate(currentDataset.joinSnapshot, joinTargetDataset.joinSnapshot, sourceField, targetField);
  const counts = joinPreview(currentDataset.joinSnapshot, joinTargetDataset.joinSnapshot, sourceField, targetField);
  const blocked = !joinEvidence.compatibleTypes || !joinEvidence.normalizedOverlap || joinEvidence.expectedCardinality === "many-to-many-risk";
  const list = document.createElement("dl");
  metadataList(list, [["Source key", `${sourceField} (${joinEvidence.sourceType})`], ["Target key", `${targetField} (${joinEvidence.targetType})`], ["Normalized values overlapping", String(joinEvidence.normalizedOverlap)], ["Expected cardinality", joinEvidence.expectedCardinality], ["Unmatched source preview rows", String(counts.unmatchedSourceRows)], ["Unmatched target preview rows", String(counts.unmatchedTargetRows)]]);
  const note = document.createElement("p");
  note.textContent = blocked ? `Join blocked. ${joinEvidence.reasons.join("; ")}.` : `Review required. ${joinEvidence.reasons.join("; ")}.`;
  elements["join-evidence"].replaceChildren(note, list);
  elements["join-confirmation"].hidden = blocked;
  elements["join-confirm-button"].disabled = true;
});

elements["join-confirm-checkbox"].addEventListener("change", () => {
  elements["join-confirm-button"].disabled = !elements["join-confirm-checkbox"].checked;
});

[elements["join-source-field"], elements["join-target-field"]].forEach((control) => control.addEventListener("change", () => {
  joinEvidence = null;
  elements["join-evidence"].replaceChildren();
  elements["join-confirmation"].hidden = true;
  elements["join-confirm-checkbox"].checked = false;
  elements["join-confirm-button"].disabled = true;
}));

elements["join-confirm-button"].addEventListener("click", async () => {
  if (!joinTargetDataset || !joinEvidence) return;
  validateJoinCandidate(joinEvidence, { confirmed: true });
  const counts = joinPreview(currentDataset.joinSnapshot, joinTargetDataset.joinSnapshot, joinEvidence.sourceField, joinEvidence.targetField);
  const provenance = { id: crypto.randomUUID(), version: 1, sourceDatasetKey: currentDataset.key, targetDatasetKey: joinTargetDataset.key, sourceResourceUrl: currentDataset.joinSnapshot.resourceUrl, targetResourceUrl: joinTargetDataset.joinSnapshot.resourceUrl, sourceField: joinEvidence.sourceField, targetField: joinEvidence.targetField, expectedCardinality: joinEvidence.expectedCardinality, scope: "bounded-preview", ...counts, confirmedAt: new Date().toISOString() };
  await putRecord("relationships", provenance);
  const heading = document.createElement("h3");
  heading.textContent = "Confirmed bounded join review";
  const note = document.createElement("p");
  note.textContent = "Saved the relationship marker, unmatched-row counts, and join provenance. This does not execute or endorse a full-data join.";
  elements["join-result"].replaceChildren(heading, note);
  await refreshStorageSummary();
});

function renderRelated(results = null, semantic = false) {
  elements["related-list"].replaceChildren();
  if (!currentDataset || (!savedDatasets.length && !catalogCandidates.length && !historyRecords.length)) return;
  const matches = (results || relatedDatasets(currentDataset, savedDatasets)).filter((match) => !dismissedRelated.has(match.dataset.key));
  if (!matches.length) return;
  const heading = document.createElement("h3");
  heading.textContent = semantic ? "Semantically related saved datasets" : "Potentially related saved datasets";
  const list = document.createElement("ol");
  matches.slice(0, 5).forEach((match) => {
    const item = document.createElement("li");
    const reason = semantic
      ? `Semantic similarity ${(match.score * 100).toFixed(1)}%; deterministic evidence: ${match.reasons.join("; ") || "none"}. Similarity does not establish comparison or join compatibility.`
      : match.reasons.join("; ");
    item.textContent = `${match.dataset.title} (${reason})`;
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "button-secondary compact-button";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", async () => {
      dismissedRelated.add(match.dataset.key);
      await putRecord("preferences", { key: "dismissed-related", values: [...dismissedRelated] });
      renderRelated();
    });
    item.append(" ", dismiss);
    list.append(item);
  });
  elements["related-list"].append(heading, list);
}

async function refreshSaved() {
  savedDatasets = await listDatasets();
  savedDatasets.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  elements["saved-list"].replaceChildren();
  if (!savedDatasets.length) {
    elements["saved-list"].textContent = "No dataset markers have been saved yet.";
  } else {
    savedDatasets.forEach((dataset) => elements["saved-list"].append(datasetCard(dataset)));
  }
  renderRelated();
  await refreshStorageSummary();
}

async function runAppProvidedSemanticMatching() {
  if (!currentDataset) {
    setStatus("Inspect a dataset before comparing it with saved datasets.");
    return;
  }
  const historyCandidates = historyRecords.map((record) => ({ key: `history:${record.id}`, title: record.question || "Previous analysis", description: `Historical query signal for ${record.sourceUrl || "this dataset"}` }));
  const candidates = [...new Map([...savedDatasets, ...catalogCandidates, ...historyCandidates].filter((candidate) => candidate.key !== currentDataset.key).map((candidate) => [candidate.key, candidate])).values()];
  if (!candidates.length) {
    setStatus("Search the catalog or save another dataset before using semantic matching.");
    return;
  }
  setStatus("Downloading or opening the local MiniLM embedding model...");
  try {
    const { semanticRelated } = await import("./ai/embeddings.js");
    const results = await semanticRelated(currentDataset, candidates, (progress) => {
      if (progress.status === "progress" && progress.progress) {
        setStatus(`Downloading the local model: ${Math.round(progress.progress)}%`);
      }
    });
    renderRelated(results, true);
    setStatus("Semantic comparison complete. Dataset text was processed locally.");
  } catch (error) {
    setStatus(`Local semantic matching failed: ${error.message}`, "error");
  }
}

elements["history-search-form"].addEventListener("submit", (event) => {
  event.preventDefault();
  refreshHistory(elements["history-query"].value).catch((error) => setStatus(`History search failed: ${error.message}`, "error"));
});

elements["catalog-form"].addEventListener("submit", async (event) => {
  event.preventDefault();
  await searchCatalog();
});

function renderCatalogDetails(catalog) {
  activeCatalog = catalog;
  const verified = catalog.lastVerified ? new Date(catalog.lastVerified).toISOString().slice(0, 10) : "Not yet verified from the browser";
  elements["catalog-details"].replaceChildren();
  const dl = document.createElement("dl");
  dl.className = "metadata";
  const rows = [
    ["Description", catalog.description],
    ["Platform", `${catalog.platform} (API ${catalog.apiVersion})`],
    ["Jurisdiction", catalog.jurisdiction],
    ["Last verified", verified],
    ["Known limitations", catalog.knownLimitations],
  ];
  rows.forEach(([term, value]) => {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = value || "Not supplied";
    dl.append(dt, dd);
  });
  elements["catalog-details"].append(dl);
  elements["catalog-publisher-link"].href = catalog.publisherUrl || catalog.baseUrl;
  elements["catalog-publisher-link"].textContent = `Visit the ${catalog.name} catalog website`;
}

async function refreshCatalogPicker(selectId) {
  const builtins = listBuiltinCatalogs();
  const custom = await listCustomCatalogs().catch(() => []);
  const all = [...builtins, ...custom];
  const select = elements["catalog-select"];
  const previous = selectId || select.value || DEFAULT_CATALOG_ID;
  select.replaceChildren();
  if (builtins.length) {
    const group = document.createElement("optgroup");
    group.label = "Built-in catalogs";
    builtins.forEach((catalog) => {
      const option = document.createElement("option");
      option.value = catalog.id;
      option.textContent = `${catalog.name} (${catalog.platform})`;
      group.append(option);
    });
    select.append(group);
  }
  if (custom.length) {
    const group = document.createElement("optgroup");
    group.label = "Your saved catalogs";
    custom.forEach((catalog) => {
      const option = document.createElement("option");
      option.value = catalog.id;
      option.textContent = `${catalog.name} (${catalog.platform})`;
      group.append(option);
    });
    select.append(group);
  }
  const chosen = all.find((catalog) => catalog.id === previous) || all.find((catalog) => catalog.id === DEFAULT_CATALOG_ID) || all[0];
  if (chosen) {
    select.value = chosen.id;
    renderCatalogDetails(chosen);
  }
  renderCustomCatalogList(custom);
}

function renderCustomCatalogList(custom) {
  const container = elements["custom-catalog-list"];
  container.replaceChildren();
  if (!custom.length) return;
  const heading = document.createElement("h3");
  heading.textContent = "Saved catalogs in this browser";
  const list = document.createElement("ul");
  custom.forEach((catalog) => {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${catalog.name} — ${catalog.baseUrl} (${catalog.platform})`;
    const rename = document.createElement("button");
    rename.type = "button";
    rename.className = "button-secondary compact-button";
    rename.textContent = "Rename";
    rename.addEventListener("click", async () => {
      const next = window.prompt("New name for this catalog", catalog.name);
      if (next === null) return;
      await saveCustomCatalog({ ...catalog, name: next.trim() || catalog.baseUrl });
      await refreshCatalogPicker(catalog.id);
    });
    const retest = document.createElement("button");
    retest.type = "button";
    retest.className = "button-secondary compact-button";
    retest.textContent = "Retest";
    retest.addEventListener("click", async () => {
      const result = await detectCatalog(catalog.baseUrl);
      setStatus(result.supported ? `${catalog.name} still responds as ${result.platform}.` : `${catalog.name} did not respond as a supported catalog: ${result.reason}`, result.supported ? "" : "error");
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button-secondary compact-button";
    remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      await removeCustomCatalog(catalog.key);
      await refreshCatalogPicker(DEFAULT_CATALOG_ID);
    });
    item.append(label, rename, retest, remove);
    list.append(item);
  });
  container.append(heading, list);
}

elements["catalog-select"].addEventListener("change", async () => {
  const id = elements["catalog-select"].value;
  const catalog = getBuiltinCatalog(id) || (await listCustomCatalogs()).find((entry) => entry.id === id);
  if (catalog) renderCatalogDetails(catalog);
});

elements["custom-catalog-form"].addEventListener("submit", async (event) => {
  event.preventDefault();
  detectedCustomCatalog = null;
  elements["save-catalog-button"].disabled = true;
  const url = elements["catalog-url"].value.trim();
  if (!url) {
    elements["catalog-detection"].textContent = "Enter a catalog URL to test.";
    return;
  }
  elements["catalog-detection"].textContent = "Testing the catalog from your browser…";
  try {
    const result = await detectCatalog(url);
    if (!result.supported) {
      elements["catalog-detection"].textContent = `Not a supported catalog: ${result.reason}`;
      return;
    }
    detectedCustomCatalog = normalizeCustomCatalog({ url, name: elements["custom-catalog-name"].value, platform: result.platform, apiVersion: result.apiVersion });
    elements["catalog-detection"].textContent = `Detected a ${result.platform} catalog. You can save it in this browser.`;
    elements["save-catalog-button"].disabled = false;
  } catch (error) {
    elements["catalog-detection"].textContent = `Catalog test failed: ${error.message}`;
  }
});

elements["save-catalog-button"].addEventListener("click", async () => {
  if (!detectedCustomCatalog) return;
  await saveCustomCatalog(detectedCustomCatalog);
  elements["catalog-detection"].textContent = `Saved ${detectedCustomCatalog.name} in this browser.`;
  elements["save-catalog-button"].disabled = true;
  const savedId = detectedCustomCatalog.id;
  detectedCustomCatalog = null;
  elements["catalog-url"].value = "";
  elements["custom-catalog-name"].value = "";
  await refreshCatalogPicker(savedId);
});


elements["export-button"].addEventListener("click", async () => {
  try {
    const workspace = await exportWorkspace();
    const counts = Object.fromEntries(Object.entries(workspace.records).map(([store, records]) => [store, records.length]));
    const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "open-data-guide-workspace.json";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    elements["export-receipt"].hidden = false;
    elements["export-receipt"].textContent = `Export created: ${link.download}. It contains ${counts.datasets} saved datasets, ${counts.queries} saved analyses, and ${counts.relationships} relationships. Your browser downloaded the file; check its Downloads folder.`;
    setStatus("Workspace exported. The file contains local metadata and bounded query previews.");
  } catch (error) {
    setStatus(`Workspace export failed: ${error.message}`, "error");
  }
});

elements["import-input"].addEventListener("change", async () => {
  const file = elements["import-input"].files?.[0];
  if (!file) return;
  try {
    await importWorkspace(JSON.parse(await file.text()));
    await refreshSaved();
    await refreshHistory();
    await refreshStorageSummary();
    setStatus("Workspace imported into this browser.");
  } catch (error) {
    setStatus(`Workspace import failed: ${error.message}`, "error");
  }
  elements["import-input"].value = "";
});

elements["clear-data-button"].addEventListener("click", async () => {
  if (!window.confirm("Delete all saved datasets, relationships, queries, and preferences from this browser?")) return;
  await clearWorkspace();
  await refreshSaved();
  await refreshHistory();
  await refreshStorageSummary();
  setStatus("Local application data deleted. Browser-managed model cache is separate.");
});

function renderCapabilityReport(report, decision) {
  const container = elements["capability-output"];
  container.replaceChildren();
  const heading = document.createElement("h3");
  heading.textContent = "AI capabilities exposed to this page";
  const list = document.createElement("ul");
  report.apis.forEach((api) => {
    const item = document.createElement("li");
    item.textContent = `${api.label}: ${api.status}`;
    list.append(item);
  });
  const compute = document.createElement("p");
  compute.textContent = `Local compute signals: WebGPU ${report.compute.webgpu ? "available" : "not exposed"}; WebNN ${report.compute.webnn ? "available" : "not exposed"}. These are compute interfaces, not installed models.`;
  const interpretation = document.createElement("p");
  if (decision.queryPlanner === "browser-ready") {
    interpretation.textContent = "A browser-provided Prompt API model is ready. It can be evaluated later for constrained query planning. No browser embedding API is exposed, so it does not replace semantic vector matching.";
  } else if (decision.queryPlanner === "browser-downloadable") {
    interpretation.textContent = "The browser reports that it can download a Prompt API model. Open Data Guide has not started that download. No browser embedding API is exposed.";
  } else {
    interpretation.textContent = "No ready page-accessible Prompt API was found. The browser may still contain internal AI features that websites cannot call. No browser embedding API is exposed.";
  }
  const fallbackDetails = document.createElement("details");
  const fallbackSummary = document.createElement("summary");
  fallbackSummary.textContent = "Use app-provided MiniLM matching";
  const disclosure = document.createElement("p");
  disclosure.textContent = "Model: Xenova/all-MiniLM-L6-v2, revision 751bff37182d3f1213fa05d7196b954e230abad9. Source: Hugging Face Transformers.js CDN. License: Apache-2.0 for the model and runtime; review the model card and library notices before use. Transfer: q8 model files are approximately 23 MB, plus browser runtime/configuration overhead; browser-managed. Purpose: compare catalog titles, descriptions, and field descriptions locally; raw dataset rows are not sent. Storage: cached vectors are keyed by canonical metadata text, model revision, and runtime/dtype version in this browser. Removal: use the browser site-data controls to remove the model cache; the Clear local application data action removes cached vectors and saved metadata only.";
  const consent = document.createElement("button");
  consent.type = "button";
  consent.className = "button-secondary";
  consent.textContent = "Approve local semantic matching";
  consent.addEventListener("click", runAppProvidedSemanticMatching);
  fallbackDetails.append(fallbackSummary, disclosure, consent);
  container.append(heading, list, compute, interpretation, fallbackDetails);
  if (decision.queryPlanner === "browser-ready" && currentDataset && currentFields.length) {
    const browserPlanner = document.createElement("button");
    browserPlanner.type = "button";
    browserPlanner.textContent = "Ask browser-provided AI to suggest a plan";
    browserPlanner.addEventListener("click", runBrowserPlanner);
    container.append(browserPlanner);
  }
  if (currentDataset && currentFields.length) {
    const localPlanner = document.createElement("button");
    localPlanner.type = "button";
    localPlanner.className = "button-secondary";
    localPlanner.textContent = "Use a local Hugging Face planner";
    localPlanner.addEventListener("click", runHuggingFacePlanner);
    container.append(localPlanner);
    const localNote = document.createElement("p");
    localNote.textContent = "Optional local AI planner: about 500 MB, downloaded only after approval and kept in the browser-managed cache. It suggests a plan; deterministic code validates and runs the query.";
    container.append(localNote);
  }
  if (decision.queryPlanner === "browser-downloadable") {
    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.textContent = "Approve browser-managed model download";
    downloadButton.addEventListener("click", runBrowserModelPreparation);
    container.append(downloadButton);
  }
}

async function runBrowserModelPreparation() {
  const controller = new AbortController();
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "button-secondary";
  cancel.textContent = "Cancel browser model download";
  cancel.addEventListener("click", () => controller.abort());
  elements["capability-output"].append(cancel);
  setStatus("Downloading and preparing the browser-provided AI model after your approval. The model stays browser-managed...");
  try {
    const { createChromePromptProvider } = await import("./ai/providers.js");
    const provider = createChromePromptProvider(window, { signal: controller.signal });
    await provider.prepare((progress) => setStatus(`Browser-managed model download: ${Math.round(Number(progress) * 100)}%`));
    setStatus("Browser-managed model is ready. Ask it for a constrained plan when you are ready.");
  } catch (error) {
    setStatus(`Browser-managed model preparation failed: ${error.message}. The deterministic planner remains available.`, "error");
  } finally {
    cancel.remove();
  }
}

async function runBrowserPlanner() {
  if (!currentDataset || !currentFields.length) {
    setStatus("Load a dataset resource before asking browser-provided AI to suggest a plan.", "error");
    return;
  }
  plannerAbortController = new AbortController();
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "button-secondary";
  cancel.textContent = "Cancel browser planning";
  cancel.addEventListener("click", () => plannerAbortController?.abort());
  elements["capability-output"].append(cancel);
  setStatus("Creating a browser-provided planning session after your request...");
  try {
    const { createChromePromptProvider } = await import("./ai/providers.js");
    const provider = createChromePromptProvider(window, { signal: plannerAbortController.signal });
    activePlanner = provider;
    const plan = await provider.plan({ question: elements.question.value, dataset: currentDataset, fields: currentFields });
    activePlannerProvenance = { modelBackend: provider.id, modelIdentifier: "browser-provided", modelVersion: "browser-managed" };
    elements.aggregation.value = plan.aggregation || "count";
    elements.measure.value = plan.measure || "";
    elements.dimension.value = plan.dimension || "";
    activePlan = plan;
    renderPlanReview(plan);
    elements["plan-form"].hidden = plan.status === "needs-clarification";
    if (plan.status === "needs-clarification") showClarification(plan);
    else setStatus("Browser-provided AI suggested a constrained plan. Review it before running the deterministic query.");
  } catch (error) {
    setStatus(`Browser-provided planning failed: ${error.message}. The deterministic planner remains available.`, "error");
  } finally {
    await activePlanner?.close?.();
    activePlanner = null;
    cancel.remove();
    plannerAbortController = null;
  }
}

async function runHuggingFacePlanner() {
  if (!currentDataset || !currentFields.length) return;
  if (!window.confirm("Download and run the optional local Hugging Face model? The browser will manage about 500 MB of model files.")) return;
  plannerAbortController = new AbortController();
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "button-secondary";
  cancel.textContent = "Cancel local model";
  cancel.addEventListener("click", () => plannerAbortController?.abort());
  elements["capability-output"].append(cancel);
  setStatus("Downloading and preparing the optional local AI planner after your approval. Source data stays in this browser...");
  try {
    const { createHuggingFaceProvider } = await import("./ai/providers.js");
    const provider = createHuggingFaceProvider({
      approved: true,
      signal: plannerAbortController.signal,
      onProgress: (progress) => {
        if (progress.status === "progress" && progress.progress) setStatus(`Downloading the optional local model: ${Math.round(progress.progress)}%`);
      },
    });
    activePlanner = provider;
    const plan = await provider.plan({ question: elements.question.value, dataset: currentDataset, fields: currentFields });
    activePlannerProvenance = { modelBackend: provider.id, modelIdentifier: provider.modelIdentifier, modelVersion: provider.modelVersion };
    elements.aggregation.value = plan.aggregation || "count";
    elements.measure.value = plan.measure || "";
    elements.dimension.value = plan.dimension || "";
    activePlan = plan;
    renderPlanReview(plan);
    elements["plan-form"].hidden = plan.status === "needs-clarification";
    if (plan.status === "needs-clarification") showClarification(plan);
    else setStatus("The local model suggested a constrained plan. Review it before running the deterministic query.");
  } catch (error) {
    setStatus(`Local model planning failed: ${error.message}. The deterministic planner remains available.`, "error");
  } finally {
    await activePlanner?.close?.();
    activePlanner = null;
    cancel.remove();
    plannerAbortController = null;
  }
}

elements["semantic-button"].addEventListener("click", async () => {
  setStatus("Checking page-accessible browser AI interfaces. This checks availability only; no model download or source-data transfer has been requested...");
  try {
    const { probeBrowserCapabilities, capabilityDecision } = await import("./ai/browser-capabilities.js");
    const report = await probeBrowserCapabilities(window);
    renderCapabilityReport(report, capabilityDecision(report));
    setStatus("Capability check complete. No model was downloaded.");
  } catch (error) {
    setStatus(`Browser AI capability check failed: ${error.message}`, "error");
  }
});

refreshSaved().catch((error) => setStatus(`Browser storage is unavailable: ${error.message}`, "error"));
refreshHistory().catch((error) => setStatus(`History is unavailable: ${error.message}`, "error"));
refreshCatalogPicker(DEFAULT_CATALOG_ID).catch(() => {
  const cnra = getBuiltinCatalog(DEFAULT_CATALOG_ID);
  if (cnra) renderCatalogDetails(cnra);
});
listRecords("preferences").then((records) => {
  dismissedRelated = new Set(records.find((record) => record.key === "dismissed-related")?.values || []);
}).catch(() => {});
clearStatus();
