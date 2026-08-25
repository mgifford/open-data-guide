const DB_NAME = "open-data-guide";
const DB_VERSION = 3;
const STORES = ["datasets", "resources", "fields", "relationships", "queries", "embeddings", "preferences"];

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const transaction = request.transaction;
      if (!database.objectStoreNames.contains("datasets")) {
        database.createObjectStore("datasets", { keyPath: "key" });
      }
      ["resources", "fields", "relationships", "queries", "embeddings", "preferences"].forEach((name) => {
        if (!database.objectStoreNames.contains(name)) {
          const keyPath = name === "preferences" ? "key" : "id";
          database.createObjectStore(name, { keyPath });
        }
      });
      if (request.oldVersion < 2) {
        const datasets = transaction.objectStore("datasets");
        datasets.openCursor().onsuccess = (event) => {
          const cursor = event.target.result;
          if (!cursor) return;
          const dataset = cursor.value;
          cursor.update({
            ...dataset,
            connectorId: dataset.connectorId || dataset.platform?.toLowerCase() || "unknown",
            resources: Array.isArray(dataset.resources) ? dataset.resources : [],
            fields: Array.isArray(dataset.fields) ? dataset.fields : [],
            retrievedAt: dataset.retrievedAt || dataset.savedAt || new Date().toISOString(),
          });
          cursor.continue();
        };
      }
      if (request.oldVersion < 3) {
        const datasets = transaction.objectStore("datasets");
        datasets.openCursor().onsuccess = (event) => {
          const cursor = event.target.result;
          if (!cursor) return;
          cursor.update({ ...cursor.value, schemaVersion: DB_VERSION });
          cursor.continue();
        };
        const queries = transaction.objectStore("queries");
        queries.openCursor().onsuccess = (event) => {
          const cursor = event.target.result;
          if (!cursor) return;
          cursor.update({ ...cursor.value, version: cursor.value.version || 1, stale: Boolean(cursor.value.stale) });
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(storeNames, mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    const stores = Object.fromEntries(storeNames.map((name) => [name, transaction.objectStore(name)]));
    let result;
    Promise.resolve(action(stores)).then((value) => { result = value; }).catch(reject);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => db.close();
    transaction.oncomplete = () => { db.close(); resolve(result); };
  });
}

export function saveDataset(dataset) {
  const saved = { ...dataset, schemaVersion: DB_VERSION, savedAt: new Date().toISOString() };
  return transact(["datasets"], "readwrite", ({ datasets }) => datasets.put(saved));
}

export function listDatasets() {
  return transact(["datasets"], "readonly", ({ datasets }) => requestResult(datasets.getAll()));
}

export function removeDataset(key) {
  return transact(["datasets"], "readwrite", ({ datasets }) => datasets.delete(key));
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function listRecords(storeName) {
  if (!STORES.includes(storeName)) throw new Error("Unknown workspace store.");
  return transact([storeName], "readonly", (stores) => requestResult(stores[storeName].getAll()));
}

export function putRecord(storeName, record) {
  if (!STORES.includes(storeName)) throw new Error("Unknown workspace store.");
  return transact([storeName], "readwrite", (stores) => stores[storeName].put(record));
}

export function deleteRecord(storeName, key) {
  if (!STORES.includes(storeName)) throw new Error("Unknown workspace store.");
  return transact([storeName], "readwrite", (stores) => stores[storeName].delete(key));
}

export async function exportWorkspace() {
  const records = {};
  for (const storeName of STORES) records[storeName] = await listRecords(storeName);
  return { version: DB_VERSION, exportedAt: new Date().toISOString(), records };
}

export function validateWorkspace(workspace) {
  if (!workspace || typeof workspace !== "object" || workspace.version !== DB_VERSION || !workspace.records) {
    throw new Error(`Workspace export must use version ${DB_VERSION}.`);
  }
  STORES.forEach((storeName) => {
    if (!Array.isArray(workspace.records[storeName])) throw new Error(`Workspace export is missing ${storeName}.`);
    if (workspace.records[storeName].length > 10000) throw new Error(`${storeName} contains too many records.`);
    workspace.records[storeName].forEach((record) => {
      if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`${storeName} contains an invalid record.`);
      const key = storeName === "datasets" || storeName === "preferences" ? record.key : record.id;
      if (typeof key !== "string" || !key || key.length > 500) throw new Error(`${storeName} contains a record with an invalid key.`);
    });
  });
  if (JSON.stringify(workspace).length > 25_000_000) throw new Error("Workspace export is larger than the 25 MB safety limit.");
  return true;
}

export async function importWorkspace(workspace) {
  validateWorkspace(workspace);
  await transact(STORES, "readwrite", (stores) => {
    STORES.forEach((storeName) => {
      workspace.records[storeName].forEach((record) => stores[storeName].put(record));
    });
  });
}

export async function clearWorkspace() {
  await transact(STORES, "readwrite", (stores) => {
    STORES.forEach((storeName) => stores[storeName].clear());
  });
}

export function workspaceStoreNames() {
  return [...STORES];
}

export async function storageEstimate() {
  if (!globalThis.navigator?.storage?.estimate) return { usage: null, quota: null };
  const estimate = await globalThis.navigator.storage.estimate();
  return { usage: estimate.usage ?? null, quota: estimate.quota ?? null };
}
