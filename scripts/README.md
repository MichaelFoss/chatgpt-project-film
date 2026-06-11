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

`yarn catalog:list`, `yarn catalog:show <canonicalId>`, and
`yarn catalog:search [title]` are read-only views over
`data/catalog.json`. They do not append events, mutate the metadata
cache, or contact providers. Query commands support `--json` output;
list and search filters may be repeated to OR values for the same flag,
while different filter flags are ANDed together.

List and search filters accept either `--flag value` or `--flag=value`.
Use `--type movie` or `--type=movie` for media type filtering;
`--media-type` remains supported as a compatibility alias. Quote values
with spaces, punctuation, or shell wildcards, for example:

```sh
yarn catalog:search "Guardians of the Galaxy: Vol. 2"
yarn catalog:list --title="Guardians of the Galaxy: Vol. 2"
yarn catalog:search --genre='*comedy'
```

`yarn reactions:list` is a read-only view over
`data/title-reactions.json` joined with `data/catalog.json`. It does not
read the title reaction event stream. Use `--rating loved`, `--liked`,
`--mixed`, `--disliked`, or `--hated` to list only one recorded reaction
rating group.

`yarn reactions:stats` is a read-only diagnostic view over
`data/title-reactions.json` joined with `data/catalog.json`. It reports
reaction coverage, canonical reaction rating distribution, and movie/TV
reacted and unreacted counts without reading the title reaction event
stream.

`yarn enrich:metadata:plan` is a legacy read-only planner. It reports
metadata gaps and planned lookups without contacting providers or
writing files. `yarn enrich:metadata:write` is deprecated and fails
closed; use capped metadata hydration for all cache-writing workflows.

Metadata hydration and catalog rebuild are separate review steps:

1. Run `yarn hydrate:metadata:plan --provider mock` or
   `yarn hydrate:metadata:plan --provider omdb` to review missing,
   skipped, ineligible, and invalid cache records without writing files.
2. Run `yarn hydrate:metadata:write --provider mock --limit 25`, or an
   explicitly capped real-provider run, to update only
   `data/metadata-cache.json`.
3. Inspect the `data/metadata-cache.json` diff before rebuilding the
   catalog.
4. Run `yarn build:catalog` to regenerate `data/catalog.json` offline
   from `events/catalog.events.ndjson` and `data/metadata-cache.json`.
5. Inspect the `data/catalog.json` diff separately from the metadata
   cache diff.
6. Run `yarn check` and the relevant catalog tests before committing.

Catalog generation must not read provider API keys or contact metadata
providers. Hydration write mode must not write `data/catalog.json`.

Hydration plan mode accepts only `--provider`. Provider selection makes
plan mode preview the same provider support that write mode will use.
Without `--provider`, plan mode uses the production provider registry.

Hydration write options:

- `--provider mock|omdb`: select the provider. OMDb is real-provider
  hydration and must be explicitly selected.
- `--limit N`: cap provider lookup attempts. The default cap is 25 and
  the hard maximum is 100.
- `--id canonicalId`: target a single eligible catalog ID.
- `--dry-run`: perform provider lookups and reporting without writing
  `data/metadata-cache.json`.
- `--delay-ms N`: wait between provider lookup attempts.
- `--mock-delay-ms N`: add artificial delay inside mock lookups for
  timeout testing. This is separate from `--delay-ms`.
- `--timeout-ms N`: pass a provider timeout to each lookup.
- `--retry-limit N`: retry retryable failures and timeouts up to this
  many times. Retries count against `--limit`.

Real-provider hydration should be run cautiously and manually. OMDb free
API keys are limited to 1,000 requests per day, so normal OMDb runs
should use conservative caps, starting with a small cap such as 10 or
25:

```sh
yarn hydrate:metadata:write --provider omdb --limit 10
```

Local CLI runs load `OMDB_API_KEY` from the repository root `.env` file.
An `OMDB_API_KEY` value provided by the shell takes precedence over the
`.env` value.

If a run reports provider rate limiting or the daily OMDb limit is
reached, stop real-provider hydration for the day. Resume on the next
day by running `yarn hydrate:metadata:plan`, then another capped
`yarn hydrate:metadata:write --provider omdb --limit 10` or `--limit 25`
run. Each real run should be followed by inspecting the
`data/metadata-cache.json` diff before rebuilding `data/catalog.json`.

Do not run real-provider hydration automatically in tests or unattended
workflows. Use `yarn hydrate:metadata:write --provider mock --limit 25`
for local workflow testing without network access or API keys.

As of 2026-06-03, a small real OMDb validation succeeded with a
requested limit of 10, 10 attempted requests, 10 metadata-cache writes,
and 0 unresolved lookups. The follow-up catalog rebuild produced 11
catalog records and reported 694 missing metadata records. Production
hydration has not yet been performed.

`yarn catalog:sync` no longer performs legacy metadata enrichment by
default because that path is uncapped. Use capped hydration first, then
run `yarn build:catalog`. It does not append catalog events or perform
catalog import/add behavior.

Provider planning and execution report distinct states:

- no supporting provider configured: no registered provider supports the
  canonical ID
- provider unavailable or misconfigured: a supporting provider exists,
  but cannot run in the current environment
- provider lookup failure: a planned lookup ran but did not produce
  usable metadata
