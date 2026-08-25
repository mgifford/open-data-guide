import * as duckdb from "@duckdb/duckdb-wasm";
import mvpModule from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import ehModule from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import mvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import ehWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import { detectSemanticRole } from "./geography.js";
import { decodeUtf8, profileRows } from "./ingestion.js";
import { digestText } from "../catalog/history.js";

const BUNDLES = {
  mvp: { mainModule: mvpModule, mainWorker: mvpWorker },
  eh: { mainModule: ehModule, mainWorker: ehWorker },
};

let databasePromise;
let connection;

async function database() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const bundle = await duckdb.selectBundle(BUNDLES);
      const worker = new Worker(bundle.mainWorker);
      const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      return db;
    })();
  }
  return databasePromise;
}

function jsonSafe(value) {
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  return value;
}

function rowsOf(table) {
  return table.toArray().map((row) => jsonSafe(row.toJSON ? row.toJSON() : row));
}

function readerFor(format, filename, options = "") {
  if (format === "parquet") return `read_parquet('${filename}')`;
  if (format === "json") return `read_json_auto('${filename}')`;
  return `read_csv_auto('${filename}', header = true, sample_size = 20000, nullstr = ['', 'None', 'NULL', 'null', 'N/A', 'NA', 'Not supplied']${options})`;
}

function rawCsvReader(filename) {
  return `read_csv('${filename}', header = true, all_varchar = true, nullstr = ['__OPEN_DATA_GUIDE_NO_NULL_SENTINEL__'])`;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalizedSourceExpression(field) {
  const source = quoteIdentifier(field.name);
  const missing = `CASE WHEN ${source} IN (${["", "None", "NULL", "null", "N/A", "NA", "Not supplied"].map(quoteLiteral).join(", ")}) THEN NULL ELSE ${source} END`;
  if (["postal-code", "zip-code", "zip-plus-four", "zcta", "fips"].includes(field.semanticRole)) return `CAST(${missing} AS VARCHAR) AS ${source}`;
  if (field.inferredType === "number") return `TRY_CAST(${missing} AS DOUBLE) AS ${source}`;
  if (field.inferredType === "date") return `TRY_CAST(${missing} AS DATE) AS ${source}`;
  return `${source}`;
}

export async function loadResource(resource) {
  const db = await database();
  if (!connection) connection = await db.connect();
  const filename = `dataset-${crypto.randomUUID()}.${resource.format}`;
  let sourceProfile = null;
  if (resource.format === "csv") {
    const response = await fetch(resource.url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const text = decodeUtf8(new Uint8Array(await response.arrayBuffer()));
    sourceProfile = profileRows(text);
    sourceProfile.sourceDigest = await digestText(text);
    await db.registerFileText(`${filename}.raw`, text);
    await connection.query(`CREATE OR REPLACE VIEW dataset_raw AS SELECT * FROM ${rawCsvReader(`${filename}.raw`)}`);
    const projection = sourceProfile.fields.map(normalizedSourceExpression).join(", ");
    await connection.query(`CREATE OR REPLACE VIEW dataset AS SELECT ${projection} FROM dataset_raw`);
  } else {
    await db.registerFileURL(filename, resource.url, duckdb.DuckDBDataProtocol.HTTP, false);
    await connection.query(`CREATE OR REPLACE VIEW dataset AS SELECT * FROM ${readerFor(resource.format, filename)}`);
  }
  const schema = rowsOf(await connection.query("DESCRIBE SELECT * FROM dataset"));
  const preview = rowsOf(await connection.query("SELECT * FROM dataset LIMIT 20"));
  const fields = schema.map((field) => ({
    name: field.column_name,
    type: field.column_type,
    nullable: field.null === "YES",
    semanticRole: detectSemanticRole(field.column_name),
  }));
  const qualitySelect = fields.flatMap((field) => [
    `count(*) - count(${quoteIdentifier(field.name)}) AS ${quoteIdentifier(`${field.name}__null_count`)}`,
    `count(DISTINCT ${quoteIdentifier(field.name)}) AS ${quoteIdentifier(`${field.name}__distinct_count`)}`,
  ]);
  const quality = rowsOf(await connection.query(`SELECT count(*) AS row_count, ${qualitySelect.join(", ")} FROM dataset`))[0] || {};
  fields.forEach((field) => {
    field.nullCount = Number(quality[`${field.name}__null_count`] || 0);
    field.distinctCount = Number(quality[`${field.name}__distinct_count`] || 0);
    field.warnings = field.nullCount ? [`${field.nullCount} value(s) were recognized as missing, including configured textual null sentinels.`] : [];
  });
  return { fields, preview, filename, sourceDigest: sourceProfile?.sourceDigest || "", quality: { rowCount: Number(quality.row_count || 0), rawValuesRetained: resource.format === "csv", parseFailures: sourceProfile?.parseFailures || [] } };
}

export async function runQuery(sql) {
  if (!connection) throw new Error("Load a resource before running a query.");
  return rowsOf(await connection.query(sql));
}
