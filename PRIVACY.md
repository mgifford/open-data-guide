# Privacy

The static site makes browser requests to URLs the user opens or explicitly configures, including catalog metadata, data dictionaries, selected data resources, optional browser-managed AI availability APIs, and the explicitly requested MiniLM model sources.

Dataset markers, normalized metadata, field dictionaries, relationships, bounded query history, embeddings, and preferences remain in IndexedDB. Source files and complete result tables are not copied into IndexedDB. Browser-managed model cache is separate and may be evicted by the browser.

There is no account, application server, analytics, telemetry, or client-side credential. Export and opening a source URL are explicit user actions.
