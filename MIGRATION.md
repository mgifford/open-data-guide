# Migration Note

Users of the previous draft keep their saved dataset markers when the IndexedDB database upgrades from version 1 to version 2. Existing records are enriched with a connector identity, resource and field arrays, and retrieval metadata where those values were absent.

The new workspace stores analysis history separately and does not copy source files. Existing browser model cache is unaffected by the IndexedDB migration. Exported workspace files must use the current version and are validated before records are imported.
