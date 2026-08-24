# Data Model

IndexedDB schema version 2 contains `datasets`, `resources`, `fields`, `relationships`, `queries`, `embeddings`, and `preferences` stores.

Dataset records preserve `key`, `connectorId`, `sourceUrl`, `catalogUrl`, `identifier`, `title`, `description`, `publisher`, `license`, `themes`, `keywords`, `issued`, `modified`, `temporal`, `spatial`, `resources`, `fields`, `documentationUrls`, `retrievedAt`, and `savedAt` when supplied. Missing publisher values remain empty and inferred fields are kept separate from publisher descriptions.

Relationship records use `id`, source and target dataset keys, type, confidence, reasons, evidence, origin, timestamps, and confirmation state. Matching metadata creates a related suggestion; it does not create a join permission.

Query records use versioned question, dataset/resource keys, reviewed plan, generated SQL, bounded result preview, digest, row counts, provenance, visualization intent, model identity, and timestamps. Full result tables are not stored.

Imports require the current export version and every store array. Imported SQL is retained as provenance only and is never executed automatically.
