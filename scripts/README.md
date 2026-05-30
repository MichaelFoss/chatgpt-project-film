# scripts/

Repository tooling for ingestion, generation, validation, and build
workflows.

Scripts should prefer deterministic, reproducible behavior whenever
possible.

For media catalog workflows, metadata enrichment and catalog generation
are separate script responsibilities. Metadata enrichment may contact
providers and update `data/metadata-cache.json`; catalog generation
should consume `events/catalog.events.ndjson` and
`data/metadata-cache.json` offline and write `data/catalog.json` without
provider lookups.

`yarn enrich:metadata:plan` runs the dry-run planner. It reports
metadata gaps and planned lookups without contacting providers or
writing files. `yarn enrich:metadata:write` performs cache-writing
metadata enrichment.
