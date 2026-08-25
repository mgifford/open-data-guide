import "./style.css";
import { resolveDataset, loadDataDictionary, searchCkanCatalogPage, searchDkanCatalogPage } from "./adapters/resolver.js";
import {
  saveDataset, listDatasets, removeDataset, listRecords, putRecord, deleteRecord,
  exportWorkspace, importWorkspace, clearWorkspace, storageEstimate,
} from "./catalog/storage.js";
import { catalogSearchTerms, explainRelatedDataset, relatedDatasets } from "./catalog/related.js";
import { compareFields, historyStatus, sourceChanged } from "./catalog/history.js";
import { loadResource, runQuery } from "./data/duckdb.js";
import { compilePlan, interpretQuestion, validatePlan } from "./query/plan.js";
import { renderTable } from "./render/table.js";
import { renderChart } from "./render/chart.js";
import { shouldRefuseResource } from "./data/ingestion.js";

const elements = Object.fromEntries([
  "dataset-form", "dataset-url", "sample-button", "status", "dataset-section", "dataset-heading",
  "dataset-description", "dataset-metadata", "platform-label", "resource-control", "size-warning",
  "load-resource-button", "save-button", "explore-section", "profile-summary", "fields-table",
  "preview-table", "quality-summary", "question-section", "question-form", "question", "question-interpret-button", "plan-form", "aggregation",
  "measure", "dimension", "run-plan-button", "query-output", "result-explanation", "result-table", "chart", "sql-output",
  "provenance", "saved-list", "related-list", "semantic-button", "capability-output",
  "catalog-form", "catalog-url", "catalog-query", "catalog-results", "history-search-form", "history-query", "history-list", "export-button",
  "import-input", "clear-data-button", "storage-summary", "story-text", "export-receipt", "clarification-output",
].map((id) => [id, document.getElementById(id)]));

let currentDataset = null;
let currentResource = null;
let currentFields = [];
let savedDatasets = [];
let historyRecords = [];
let dismissedRelated = new Set();
let pendingHistoryRecord = null;
let pendingHistoryPlan = null;
let catalogSeenKeys = new Set();

function controlsPlan() {
  return {
    version: 1,
    status: "ready",
    question: elements.question.value,
    aggregation: elements.aggregation.value,
    measure: elements.measure.value,
    dimension: elements.dimension.value,
    timeField: currentFields.find((field) => field.name === elements.dimension.value && /DATE|TIME|TIMESTAMP/i.test(field.type || ""))?.name || "",
    filters: [],
    limit: 100,
    assumptions: [],
    visualization: { kind: elements.dimension.value ? "bar" : "table", x: elements.dimension.value || null, y: "value", series: null },
  };
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

function setStatus(message, kind = "info") {
  elements.status.textContent = message;
  elements.status.dataset.kind = kind;
}

function clearStatus() {
  elements.status.textContent = "";
}

function formatDate(value) {
  if (!value) return "Not supplied";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString();
}

function showDateClarification(plan) {
  elements["clarification-output"].replaceChildren();
  if (plan.status !== "needs-clarification" || !plan.clarification?.choices?.length) return;
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = plan.clarification.message;
  const label = document.createElement("label");
  label.htmlFor = "clarification-choice";
  label.textContent = "Date field to use";
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
  button.addEventListener("click", () => {
    elements.question.value = `${elements.question.value.replace(/\?$/, "")} by ${select.value}`;
    elements["clarification-output"].replaceChildren();
    elements["question-form"].requestSubmit();
  });
  fieldset.append(legend, label, select, button);
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
    details.textContent = ` — ${plainText(dataset.description) || "No description supplied."} Evidence: ${evidenceText || "catalog match; review metadata"}. Publisher: ${plainText(dataset.publisher) || "Not supplied"}. Themes: ${(dataset.themes || []).join(", ") || "Not supplied"}. Geography: ${plainText(dataset.spatial) || "Not supplied"}. Time: ${plainText(dataset.temporal) || "Not supplied"}. Source: ${dataset.sourceUrl}`;
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
  const catalogUrl = elements["catalog-url"].value.trim() || currentDataset?.catalogUrl;
  const query = elements["catalog-query"].value.trim() || catalogSearchTerms(currentDataset || { title: "public data" });
  if (!catalogUrl || !query) {
    setStatus("Enter a data catalog URL and search terms, or open a catalog dataset first.", "error");
    return;
  }
  try {
    const search = currentDataset?.connectorId === "dkan" ? searchDkanCatalogPage : searchCkanCatalogPage;
    const result = await search(catalogUrl, query, { start, rows: 20 });
    const ranked = result.datasets.map((dataset) => ({ dataset, score: currentDataset ? explainRelatedDataset(currentDataset, dataset).score : 0 })).sort((a, b) => b.score - a.score).map(({ dataset }) => dataset);
    renderCatalogResults(ranked, result.total, result.start, query, result.datasets.length);
    setStatus(`Found ${result.total} catalog matches.`);
  } catch (error) {
    setStatus(`Catalog search failed: ${error.message}. Check the URL, CORS, pagination, or rate limit.`, "error");
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
  currentFields = dataset.fields || [];
  if (dataset.catalogUrl) elements["catalog-url"].value = dataset.catalogUrl;
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
  const parseNote = profile.quality?.parseFailures?.length ? ` ${profile.quality.parseFailures.length} malformed row(s) were reported and excluded from the typed projection; inspect the source before relying on totals.` : " No malformed rows were found in the profiled CSV text.";
  qualityNote.textContent = `The resource contains ${profile.quality?.rowCount ?? "an unknown number of"} rows. Empty values and configured textual sentinels (None, NULL, null, N/A, NA, and Not supplied) are treated as missing for calculations.${parseNote} Raw CSV values remain queryable in the dataset_raw view.`;
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
  fillSelect(elements.measure, numeric, false);
  fillSelect(elements.dimension, currentFields, true);
  elements["explore-section"].hidden = false;
  elements["question-section"].hidden = false;
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
  [elements.aggregation, elements.measure, elements.dimension].forEach((control) => control.addEventListener("change", validateCurrentControls));
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
    setStatus(`Found ${dataset.title}. Choose a resource to load.`);
    return dataset;
  } catch (error) {
    setStatus(error.message, "error");
    return null;
  }
}

elements["dataset-form"].addEventListener("submit", (event) => {
  event.preventDefault();
  inspectUrl(elements["dataset-url"].value);
});

elements["sample-button"].addEventListener("click", () => {
  const sampleUrl = new URL("./sample/payments-sample.csv", window.location.href).href;
  elements["dataset-url"].value = sampleUrl;
  inspectUrl(sampleUrl);
});

elements["load-resource-button"].addEventListener("click", async () => {
  currentResource = selectedResource();
  if (!currentResource) return;
  setStatus("Starting DuckDB-Wasm and reading the resource. Large files may take time...");
  try {
    const [profile, dictionary] = await Promise.all([loadResource(currentResource), loadDataDictionary(currentResource)]);
    const definitions = new Map(dictionary.flatMap((field) => [
      [String(field.name || "").toLowerCase(), field.description],
      [String(field.title || "").toLowerCase(), field.description],
    ]));
    profile.fields = profile.fields.map((field) => ({ ...field, description: definitions.get(field.name.toLowerCase()) || "" }));
    currentDataset = { ...currentDataset, fields: profile.fields, selectedResource: currentResource };
    if (profile.sourceDigest) currentDataset.sourceDigest = profile.sourceDigest;
    renderProfile(profile);
    if (pendingHistoryRecord) {
      const stale = sourceChanged(currentDataset, pendingHistoryRecord);
      setStatus(stale
        ? "This source or schema changed since the saved analysis. Review the fields and query plan before running it."
        : "The saved analysis source is unchanged. Review the fields and query plan before running it.");
      pendingHistoryRecord = null;
    } else {
      setStatus("Resource loaded. The preview, fields, and question builder are ready.");
    }
  } catch (error) {
    setStatus(`The resource could not be loaded: ${error.message}. Check CORS support and file size.`, "error");
  }
});

elements["question-form"].addEventListener("submit", (event) => {
  event.preventDefault();
  const plan = interpretQuestion(elements.question.value, currentFields);
  elements.aggregation.value = plan.aggregation;
  elements.measure.value = plan.measure;
  elements.dimension.value = plan.dimension;
  elements["plan-form"].hidden = false;
  if (plan.status === "needs-clarification") {
    elements["plan-form"].hidden = true;
    showDateClarification(plan);
    setStatus(`${plan.clarification.message} Choices: ${plan.clarification.choices.join("; ")}`);
  } else if (plan.aggregation !== "count" && !plan.measure) {
    elements["clarification-output"].replaceChildren();
    setStatus("I recognized the calculation but not the measure. Choose the intended numeric field before running it.");
  } else if (/\bby\b/i.test(elements.question.value) && !plan.dimension) {
    setStatus("I could not match the requested grouping to a field. Choose it explicitly before running the query.");
  } else {
    setStatus("Review the interpreted calculation and fields, then run the verified query.");
  }
  validateCurrentControls();
});

elements["plan-form"].addEventListener("submit", async (event) => {
  event.preventDefault();
  const plan = controlsPlan();
  try {
    const sql = compilePlan(plan, currentFields);
    setStatus("Running the validated query in DuckDB-Wasm...");
    const rows = await runQuery(sql);
    elements["query-output"].hidden = false;
    elements["result-explanation"].textContent = plan.dimension
      ? `Calculated ${plan.aggregation} and grouped the result by ${plan.dimension}. The table contains all ${rows.length} returned categories; the chart displays at most 15.`
      : `Calculated ${plan.aggregation} across all loaded rows. The table contains all ${rows.length} returned result row(s), within the limit of ${plan.limit || 100}.`;
    elements["story-text"].textContent = resultStory(rows, plan);
    renderTable(elements["result-table"], rows, `Result for: ${elements.question.value}`);
    await renderChart(elements.chart, rows, plan, currentFields);
    elements["sql-output"].textContent = sql;
    metadataList(elements.provenance, [
      ["Dataset", currentDataset.title],
      ["Resource", currentResource.title],
      ["Source URL", currentResource.url],
      ["Fields used", [plan.dimension, plan.measure].filter(Boolean).join(", ") || "No named fields"],
      ["Rows returned", String(rows.length)],
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
      vegaLiteSpec: null,
      narrative: elements["result-explanation"].textContent,
      modelBackend: "deterministic",
      modelIdentifier: "",
      modelVersion: "",
      createdAt: new Date().toISOString(),
      lastRunAt: new Date().toISOString(),
    });
    await refreshHistory();
    await refreshStorageSummary();
    setStatus("Query complete. Review the table, chart, and SQL.");
  } catch (error) {
    setStatus(error.message, "error");
  }
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
  actions.append(inspect, source, remove);
  article.append(heading, detail, actions);
  return article;
}

function renderRelated(results = null, semantic = false) {
  elements["related-list"].replaceChildren();
  if (!currentDataset || savedDatasets.length < 2) return;
  const matches = (results || relatedDatasets(currentDataset, savedDatasets)).filter((match) => !dismissedRelated.has(match.dataset.key));
  if (!matches.length) return;
  const heading = document.createElement("h3");
  heading.textContent = semantic ? "Semantically related saved datasets" : "Potentially related saved datasets";
  const list = document.createElement("ol");
  matches.slice(0, 5).forEach((match) => {
    const item = document.createElement("li");
    const reason = semantic ? "Optional semantic comparison" : match.reasons.join("; ");
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
  if (savedDatasets.length < 2) {
    setStatus("Save at least two datasets before using semantic matching.");
    return;
  }
  setStatus("Downloading or opening the local MiniLM embedding model...");
  try {
    const { semanticRelated } = await import("./ai/embeddings.js");
    const results = await semanticRelated(currentDataset, savedDatasets, (progress) => {
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
  const fallback = document.createElement("button");
  fallback.type = "button";
  fallback.className = "button-secondary";
  fallback.textContent = "Use app-provided MiniLM matching";
  fallback.addEventListener("click", runAppProvidedSemanticMatching);
  container.append(heading, list, compute, interpretation, fallback);
}

elements["semantic-button"].addEventListener("click", async () => {
  setStatus("Checking page-accessible browser AI interfaces. No model download has been requested...");
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
listRecords("preferences").then((records) => {
  dismissedRelated = new Set(records.find((record) => record.key === "dismissed-related")?.values || []);
}).catch(() => {});
clearStatus();
