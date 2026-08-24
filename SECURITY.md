# Security

Catalog descriptions, README text, field definitions, and data values are untrusted input and are rendered as text. They cannot change application instructions or authorize actions.

Only HTTP and HTTPS URLs are accepted. Query plans accept allow-listed aggregations, fields, operators, and numeric limits. SQL identifiers are quoted and filter literals are escaped before compilation. Imported SQL is never executed automatically.

Join candidates are evidence-based hypotheses. Type compatibility, null rates, duplicate rates, normalized key overlap, and cardinality risks are surfaced, and user confirmation remains required.

Known limits include browser CORS behavior, resource denial of service through publisher-sized files, and experimental browser API availability. Large-resource warnings and explicit user actions reduce avoidable scans.
