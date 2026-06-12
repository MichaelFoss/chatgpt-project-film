---
title: Data Model
status: current
last_updated: 2026-06-10
upload_to_chatgpt: false
---

# Data Model

## Purpose

Define the canonical repository data model.

This document specifies:

- event storage philosophy
- canonical identifiers
- canonical state structure
- catalog generation strategy
- title reaction generation strategy
- metadata enrichment strategy
- configuration strategy

Implementation details should follow this document.

## Scope

This document defines:

```text
events/
data/
```

Generated runtime source documents are out of scope.

## Non-Goals

The repository does not currently model:

- individual episodes
- individual seasons
- cast preferences
- actor preferences
- recommendation algorithms

## Canonical Identity

### Preferred Identifier

The preferred identifier is an IMDb title identifier.

Examples:

```text
imdb:tt0112573
imdb:tt0944947
```

Identifiers should remain stable over time.

### Fallback Identifier

When no suitable IMDb identifier exists, a manual identifier may be
used.

Examples:

```text
manual:rare-documentary
manual:festival-short-2024
```

Manual identifiers should be stable and human-readable.

### Identifier Uniqueness

Canonical identifiers are globally unique.

If two records share the same canonical identifier, they represent the
same title.

The repository must reject creation of multiple catalog items with the
same canonical identifier.

Identifier uniqueness applies regardless of:

- media type
- identifier source
- object type

### Series Policy

Television series should use the identifier representing the overall
series.

Do not use:

- season identifiers
- episode identifiers
- special episode identifiers

The repository evaluates and tracks series as a whole.

## Event Model

### Philosophy

Events represent durable historical facts.

Events should be:

- append-only
- immutable
- replayable
- machine-readable

### Initial Event Stream

The initial implementation uses:

```text
events/catalog.events.ndjson
```

One JSON object exists per line.

Future event streams may be added when justified.

### Title Reaction Event Stream

The title reaction implementation uses:

```text
events/title-reactions.events.ndjson
```

One JSON object exists per line. Events must reference an existing
`canonicalId` from `data/catalog.json`; no title lookup, fuzzy matching,
or unknown-title resolution is performed during reaction builds.

Conceptual structure:

```ts
type TitleReactionEvent = {
  eventId: string;
  type: 'title.reaction.updated';
  occurredAt: string;
  canonicalId: string;
  rating?: number;
  watchStatus?: 'completed' | 'incomplete' | 'abandoned' | 'planned';
  memoryConfidence?: 'high' | 'medium' | 'low';
  reasonTags?: string[];
  notes?: string;
  householdSuitability?: 'any' | 'kid' | 'teen' | 'adult';
  spoilerDiscussion?: 'premise-only' | 'known-safe' | 'full';
};
```

At least one optional update field must be present. Reaction events do
not include human-readable title fields; generated sources join display
titles from `data/catalog.json`.

`rating` is a personal-fit rating, not an objective quality score. It
must be an integer from `1` through `10`:

- `1-2`: strong negative personal fit
- `3-4`: negative personal fit
- `5-6`: mixed or neutral personal fit
- `7-8`: positive personal fit
- `9-10`: strong positive personal fit

`watchStatus` uses only:

- `completed`: watched enough to evaluate as complete for recommendation
  purposes
- `incomplete`: started but not finished; not necessarily negative
- `abandoned`: intentionally stopped; usually a cautionary signal
- `planned`: intends to watch; not preference evidence yet

`householdSuitability` uses only `any`, `kid`, `teen`, or `adult`. This
is a household-specific judgment and must not be inferred from provider
metadata.

`spoilerDiscussion` uses only `premise-only`, `known-safe`, or `full`.
Missing spoiler discussion should be treated conservatively and must not
weaken the project’s global spoiler-safe behavior.

Build title reactions with:

```bash
yarn build:title-reactions
```

Then regenerate runtime source documents with:

```bash
yarn build:sources
```

### Current Catalog Membership State

Catalog membership derives exclusively from:

```text
events/catalog.events.ndjson
```

The repository currently contains 705 `catalog.add` events:

- 704 events originated from Plex import.
- 1 event is manual.

These events establish catalog membership only.

Plex-imported catalog events are durable membership records. They are
not metadata snapshots and do not create watched, rated, liked, owned,
completed, or preference facts.

No watched, rated, liked, or owned intent may be inferred from Plex
import.

Temporary Plex snapshot tooling exists only outside the production
architecture and is not part of the repository's production data model.

### Catalog Add Event

The initial implementation should support a catalog-add event.

This event is responsible for introducing a title into the repository.

Catalog-add events express inclusion intent:

```text
this title belongs in my system
```

Catalog-add events do not describe the title.

Title description belongs in:

```text
data/metadata-cache.json
```

Conceptual structure:

```ts
type EventSource = 'plex' | 'manual';
type MetadataLookupPolicy = 'auto' | 'skip';

type CatalogAddEvent = {
  eventId?: string;
  schemaVersion?: number;
  eventType: 'catalog.add';
  occurredAt: string;
  source: EventSource;
  canonicalId: string;
  metadataLookup?: MetadataLookupPolicy;
};
```

`metadataLookup` defaults to `auto`.

`schemaVersion` defaults to `1` when omitted.

`eventId` is optional. When present, it should be a true unique
identifier rather than a stringified event action.

Duplicate `eventId` values indicate a serious event-log data problem and
should cause processing to fail without writing output.

Duplicate catalog-add actions for the same `canonicalId` should not
produce duplicate catalog records. They should be reported and skipped
as redundant inclusion intent.

Use `auto` when provider enrichment may be attempted later if metadata
is missing or invalid.

Use `skip` when provider enrichment should not be attempted for that
title.

`skip` does not allow catalog generation to proceed without valid
metadata. A `catalog.add` event with `metadataLookup: 'skip'` still
requires a valid `data/metadata-cache.json` entry before a catalog item
can be generated.

### Metadata and Catalog Phase Boundary

Metadata enrichment and catalog generation are independent phases.

Metadata remains in:

```text
data/metadata-cache.json
```

Phase 1: Metadata enrichment

```text
events/catalog.events.ndjson
  -> identify missing metadata
  -> provider lookups
  -> data/metadata-cache.json
```

Phase 2: Catalog generation

```text
events/catalog.events.ndjson
        +
data/metadata-cache.json
        |
        v
data/catalog.json
```

Metadata enrichment is the only phase that may contact metadata
providers. It may update `data/metadata-cache.json`.

Catalog generation consumes `events/catalog.events.ndjson` and
`data/metadata-cache.json`. It must not contact metadata providers and
must not modify `data/metadata-cache.json`.

The sync command may orchestrate metadata enrichment followed by catalog
generation, but it must not append catalog events or perform catalog
import/add behavior.

Given the same `events/catalog.events.ndjson` and
`data/metadata-cache.json`, catalog generation should produce the same
`data/catalog.json` output. Catalog generation should be possible
entirely offline.

The generated `data/catalog.json` output is expected to remain sparse
until metadata hydration occurs. At the current 2026-06-03 checkpoint,
the completed Plex import has produced 705 catalog event IDs. A small
real OMDb validation succeeded for 10 records, and `data/catalog.json`
currently contains 11 generated catalog records with 694 catalog IDs
still missing metadata. Production metadata hydration has not yet been
performed.

Capped metadata hydration is the supported write workflow for filling
`data/metadata-cache.json`. The older metadata enrichment write path is
deprecated because it does not provide hydration request caps.

### Catalog Generation Replay Semantics

Event replay should generate catalog state every time it runs.

Replay should:

1. read events in file order
2. treat missing `schemaVersion` as `1`
3. validate each event shape
4. fail without writing output when duplicate `eventId` values are found
5. build a unique catalog inclusion set by `canonicalId`
6. report and skip duplicate catalog-add actions
7. use the metadata cache to build catalog records
8. omit catalog-add entries that still have missing or invalid metadata
9. generate deterministic catalog output
10. print success, missing metadata, and invalid metadata reports

Catalog generation must not perform provider lookups. If metadata is
missing or invalid, catalog generation should report the problem and
omit the affected catalog item rather than enriching it inline.

If `events/catalog.events.ndjson` and `data/metadata-cache.json` are
unchanged, repeated catalog generation runs should produce identical
`data/catalog.json` output.

Catalog generation should not emit empty placeholder catalog records. A
`catalog.add` event whose `canonicalId` has no valid metadata should be
reported and omitted from `data/catalog.json`.

Missing metadata and invalid metadata should be reported at the end of
the script. Missing or invalid metadata should not cause the script to
hard fail by itself.

Fatal failures should be reserved for event-log integrity or parse
problems, such as invalid NDJSON, invalid event shape, duplicate
`eventId`, or unreadable required input files.

### Catalog Event Ingestion

Catalog inclusion should be appended as `catalog.add` events through the
catalog import workflow when possible.

Supported commands:

```bash
yarn catalog:import <path> --plan
yarn catalog:import <path> --write
yarn catalog:add <canonicalId> --source manual --plan
yarn catalog:add <canonicalId> --source manual --write
yarn catalog:sync
yarn hydrate:metadata:plan [--provider mock|omdb]
yarn hydrate:metadata:write --provider mock|omdb --limit <N>
```

Import input is a JSON array. Each item must include `canonicalId` and
`source`, and may include `metadataLookup` and `occurredAt`. Descriptive
catalog fields such as title, year, media type, people, ratings, and
external IDs do not belong in import items.

Plan mode validates and reports only. Write mode appends valid,
non-duplicate new events to `events/catalog.events.ndjson`. Existing
catalog IDs and repeated IDs within the import input are reported and
skipped rather than treated as fatal. Fatal event-log validation errors,
such as invalid NDJSON or duplicate existing `eventId` values, should
still stop ingestion.

Catalog event ingestion must not build `data/catalog.json`, mutate
`data/metadata-cache.json`, or perform provider lookups.

## Canonical State Model

### Philosophy

Canonical state is derived from events.

Canonical state is stored under:

```text
data/
```

Generated runtime documents are derived from canonical state.

### Initial Catalog

The initial catalog should contain one record per movie or series.

A catalog item should represent a single watchable title.

### Catalog Storage

Catalog state should be stored under:

```text
data/catalog.json
```

`data/catalog.json` is the generated data provider for the ChatGPT Film
project.

The file should be keyed by canonical identifier.

Catalog records are generated directly from:

- `events/catalog.events.ndjson`
- `data/metadata-cache.json`

Do not introduce an intermediate catalog-index layer.

Catalog records should be provider-independent and should only be
emitted when valid metadata exists for the canonical identifier.

Catalog records should contain information useful for:

- title identification
- recommendation discussions
- preference analysis
- viewing decisions

Catalog records should not contain provider-specific operational data.

### Catalog Item Structure

Conceptual structure:

```ts
type CatalogItem = {
  canonicalId: string;
  mediaType: 'movie' | 'series';
  title: string;
  description?: string;
  posterUrl?: string;
  genres: string[];
  people?: {
    directors?: string[];
    writers?: string[];
    actors?: string[];
  };
  ratings?: {
    imdb?: string;
    rottenTomatoes?: {
      critics?: string;
      audience?: string;
    };
    metacritic?: string;
  };
};
```

This type defines the minimum generated catalog output contract.

Catalog generation should only emit records that can satisfy the
required `CatalogItem` fields:

- `canonicalId`
- `mediaType`
- `title`
- `genres`

Optional generated catalog fields are:

- `description`
- `posterUrl`
- `people`
- `ratings`

A metadata record with `isValid: true` is still unusable for catalog
generation if it cannot be mapped into the required `CatalogItem`
fields.

Metadata records that are missing required catalog fields should be
reported as invalid or unusable metadata and omitted from
`data/catalog.json`.

Empty placeholder catalog records should never be emitted.

`genres` should always be emitted as an array. If valid metadata has no
useful genre data, catalog generation should emit an empty array rather
than omitting `genres`.

Ratings should preserve provider-native string formats and should be
treated as advisory context rather than preference truth.

### Title Reaction Storage

Title reaction state is stored under:

```text
data/title-reactions.json
```

This projection is generated from:

- `events/title-reactions.events.ndjson`
- `data/catalog.json`

Projection applies title reaction events in file order. Later events
overwrite supplied scalar fields for the same `canonicalId`; supplied
`reasonTags` replace previous values. For rating events, `rating` and
`notes` use replace semantics together: a newer rating event without
`notes` removes any previous projected `notes`. The projection stores
event IDs for auditability and does not copy catalog title metadata.

Generated recommendation context is emitted to:

```text
sources/generated/title-reactions-summary.md
```

### Catalog Exclusions

The catalog should not currently contain:

- runtime
- display year
- release dates
- content ratings
- box office information
- awards
- language
- country
- DVD information
- website URLs
- production information

These fields may remain available in metadata records without being
included in catalog state.

## Metadata Enrichment

### Philosophy

The event stream should remain minimal.

Metadata hydration should populate descriptive fields using external
sources and persist the results in `data/metadata-cache.json`.

Metadata hydration is separate from catalog generation. It identifies
catalog-add events whose metadata is missing, invalid, or eligible for
refresh; performs provider lookups only when allowed by event policy and
repository workflow; and updates metadata cache records according to the
metadata update rules.

Catalog generation should consume the resulting metadata cache without
performing lookups or modifying cache records.

Hydration write mode must always be capped. Use
`yarn hydrate:metadata:write` rather than the deprecated
`enrich:metadata:write` path.

### OMDb

OMDb is the primary metadata enrichment source.

The default provider registry includes OMDb. An `imdb:tt...` canonical
ID can therefore be provider-supported even when the local OMDb
credentials are absent.

OMDb responses should be retained after retrieval.

Provider responses are considered durable repository artifacts rather
than disposable cache entries.

Previously retrieved provider responses should be preserved even if the
active metadata provider changes in the future.

### Enrichment Failures

Enrichment failures should be tracked.

Enrichment reporting distinguishes three cases:

- no supporting provider configured: no registered provider supports the
  canonical ID
- provider unavailable or misconfigured: a supporting provider exists,
  but cannot perform the lookup in the current environment, such as when
  `OMDB_API_KEY` is absent
- provider lookup failure: a planned lookup was attempted but did not
  produce usable catalog metadata

Planning should report provider support without contacting providers.
Write mode may report provider lookup failures without writing cache
records until failure-state persistence is implemented.

The system should support:

- retry counts
- retry limits
- manual review workflows

### Metadata Storage

Metadata records should be stored under:

```text
data/metadata-cache.json
```

The file should be keyed by canonical identifier.

Each entry should contain the most recent metadata record for a single
title.

Metadata records may come from external providers or manual entry.

Supported metadata providers:

```ts
type MetadataProvider = 'omdb' | 'manual';
```

Conceptual structure:

```ts
type MetadataRecord = {
  canonicalId: string;
  provider: MetadataProvider;
  isValid: boolean;
  lastUpdatedAt: string;
  provenance?: {
    source: 'provider-lookup' | 'manual-entry' | 'manual-seed';
    provider?: MetadataProvider;
    note?: string;
  };
  metadata?: unknown;
  request?: {
    retryAttemptsCount: number;
    error?: {
      source: 'provider' | 'transport' | 'application';
      message: string;
      statusCode?: number;
    };
  };
};
```

Provider-backed `metadata` should keep provider-independent catalog
fields at the top level and provider-specific raw payloads beneath a
provider-owned key.

Manual-seeded provider data may use this same normalized metadata shape
without changing `provenance.source` to `provider-lookup`. The
provenance should continue to describe how the record entered the
repository.

Normalized catalog fields:

- `mediaType`
- `title`
- `genres`

Provider-specific payload example:

```json
{
  "metadata": {
    "mediaType": "movie",
    "title": "Example",
    "genres": ["Drama"],
    "omdb": {
      "Response": "True"
    }
  }
}
```

### Metadata Update Rules

If no prior record exists:

- store valid metadata
- report invalid metadata or failed request details without creating
  placeholder catalog data

If a valid record already exists:

- newer valid metadata replaces it
- invalid metadata or failed request details must not replace it

If an invalid record already exists:

- newer valid metadata replaces it
- newer invalid metadata or failed request details may be retained only
  by an explicit conservative failure-persistence workflow

### Metadata Validity

`isValid` indicates whether the metadata record is usable for catalog
generation.

For provider-backed records, `isValid` should generally correspond to a
successful provider response.

For manual records, `isValid` indicates whether the manually supplied
metadata is complete enough to use.

Request-specific details belong under `request`.

Manual records may omit `request`.

`provenance` describes how the metadata record entered the cache. It is
record-level provenance and should not be copied into generated catalog
records.

## Configuration

### Application Configuration

Repository configuration should live in a committed configuration file.

Potential examples include:

```text
.appconfig.jsonc
```

Configuration may include:

- enrichment limits
- retry limits
- request delays

### Secrets

Secrets should never be committed.

Examples:

```text
OMDB_API_KEY
PLEX_TOKEN
```

Local secrets should be stored outside the repository.
