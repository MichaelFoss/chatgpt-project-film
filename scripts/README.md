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

`yarn catalog:import <path> --plan` validates a JSON-array import file
and reports catalog-add events that would be appended.
`yarn catalog:import <path> --write` appends only valid, new
`catalog.add` events to `events/catalog.events.ndjson`.

`yarn catalog:add <canonicalId> --source manual --plan` and
`yarn catalog:add <canonicalId> --source manual --write` use the same
import path with a one-item input. Both catalog ingestion commands
require exactly one of `--plan` or `--write`; they do not build the
catalog, touch `data/metadata-cache.json`, or contact providers.

`yarn enrich:metadata:plan` runs the dry-run planner. It reports
metadata gaps and planned lookups without contacting providers or
writing files. `yarn enrich:metadata:write` performs cache-writing
metadata enrichment.

`yarn catalog:sync` runs `enrich:metadata:write` behavior followed by
`build:catalog` behavior. It does not append catalog events, perform
catalog import/add, or replace the standalone enrichment and build
commands. Fatal enrichment errors skip catalog generation; provider
lookup failures are reported without blocking catalog generation.

Provider planning and execution report distinct states:

- no supporting provider configured: no registered provider supports the
  canonical ID
- provider unavailable or misconfigured: a supporting provider exists,
  but cannot run in the current environment
- provider lookup failure: a planned lookup ran but did not produce
  usable metadata
