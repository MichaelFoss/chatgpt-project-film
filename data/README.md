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

events/title-reactions.events.ndjson
  -> title reaction projection
  -> data/title-reactions.json

events/title-reactions.events.ndjson
  -> ignored title projection
  -> data/title-ignored.json
```

Metadata enrichment may contact providers and update
`data/metadata-cache.json`.

Catalog generation consumes `events/catalog.events.ndjson` and
`data/metadata-cache.json`, must not contact providers, and must not
modify the metadata cache.

Title reaction projection consumes
`events/title-reactions.events.ndjson` and writes
`data/title-reactions.json`. Rating notes and free-form reasons are
optional human recall fields and use replace semantics with the latest
rating event. `title.reaction.reset` events remove a title from the
current reacted projection without deleting earlier reaction history
from the event stream. Free-form reason values are stored in lowercase
normalized form.

Ignored title projection consumes the same event stream and writes
`data/title-ignored.json`. `title.ignored` and `title.unignored` events
derive the current ignored state independently from reaction ratings,
watch status, and reaction reset state.

Do not manually edit generated state unless explicitly performing a
migration or repair workflow.
