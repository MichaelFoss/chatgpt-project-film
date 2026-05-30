# data/

Canonical machine-readable state.

State in this directory is materialized from append-only event history
and, where explicitly documented, durable enrichment artifacts.

Catalog state is generated in two separate phases:

```text
events/catalog.events.ndjson
  -> metadata enrichment
  -> data/metadata-cache.json

events/catalog.events.ndjson + data/metadata-cache.json
  -> catalog generation
  -> data/catalog.json
```

Metadata enrichment may contact providers and update
`data/metadata-cache.json`.

Catalog generation consumes `events/catalog.events.ndjson` and
`data/metadata-cache.json`, must not contact providers, and must not
modify the metadata cache.

Do not manually edit generated state unless explicitly performing a
migration or repair workflow.
