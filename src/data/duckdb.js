import * as duckdb from "@duckdb/duckdb-wasm";
import mvpModule from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import ehModule from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import mvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import ehWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

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

function readerFor(format, filename) {
  if (format === "parquet") return `read_parquet('${filename}')`;
  if (format === "json") return `read_json_auto('${filename}')`;
  return `read_csv_auto('${filename}', header = true, sample_size = 20000)`;
}

export async function loadResource(resource) {
  const db = await database();
  if (!connection) connection = await db.connect();
  const filename = `dataset-${crypto.randomUUID()}.${resource.format}`;
  await db.registerFileURL(filename, resource.url, duckdb.DuckDBDataProtocol.HTTP, false);
  await connection.query(`CREATE OR REPLACE VIEW dataset AS SELECT * FROM ${readerFor(resource.format, filename)}`);
  const schema = rowsOf(await connection.query("DESCRIBE SELECT * FROM dataset"));
  const preview = rowsOf(await connection.query("SELECT * FROM dataset LIMIT 20"));
  const fields = schema.map((field) => ({
    name: field.column_name,
    type: field.column_type,
    nullable: field.null === "YES",
  }));
  return { fields, preview, filename };
}

export async function runQuery(sql) {
  if (!connection) throw new Error("Load a resource before running a query.");
  return rowsOf(await connection.query(sql));
}
