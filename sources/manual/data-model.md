---
title: Data Model
status: current
last_updated: 2026-05-30
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
- review text
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
events/media.ndjson
```

One JSON object exists per line.

Future event streams may be added when justified.

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

Phase 1: Metadata enrichment

```text
events/media.ndjson
  -> identify missing metadata
  -> provider lookups
  -> data/metadata-cache.json
```

Phase 2: Catalog generation

```text
events/media.ndjson
        +
data/metadata-cache.json
        |
        v
data/catalog.json
```

Metadata enrichment is the only phase that may contact metadata
providers. It may update `data/metadata-cache.json`.

Catalog generation consumes `events/media.ndjson` and
`data/metadata-cache.json`. It must not contact metadata providers and
must not modify `data/metadata-cache.json`.

Given the same `events/media.ndjson` and `data/metadata-cache.json`,
catalog generation should produce the same `data/catalog.json` output.
Catalog generation should be possible entirely offline.

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

If `events/media.ndjson` and `data/metadata-cache.json` are unchanged,
repeated catalog generation runs should produce identical
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

- `events/media.ndjson`
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

Metadata enrichment should populate descriptive fields using external
sources and persist the results in `data/metadata-cache.json`.

Metadata enrichment is separate from catalog generation. It identifies
catalog-add events whose metadata is missing, invalid, or eligible for
refresh; performs provider lookups only when allowed by event policy and
repository workflow; and updates metadata cache records according to the
metadata update rules.

Catalog generation should consume the resulting metadata cache without
performing lookups or modifying cache records.

### OMDb

OMDb is the primary metadata enrichment source.

OMDb responses should be retained after retrieval.

Provider responses are considered durable repository artifacts rather
than disposable cache entries.

Previously retrieved provider responses should be preserved even if the
active metadata provider changes in the future.

### Enrichment Failures

Enrichment failures should be tracked.

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

### Metadata Update Rules

If no prior record exists:

- store valid metadata
- store invalid metadata or failed request details

If a valid record already exists:

- newer valid metadata replaces it
- invalid metadata or failed request details must not replace it

If an invalid record already exists:

- newer valid metadata replaces it
- newer invalid metadata or failed request details may replace it

### Metadata Validity

`isValid` indicates whether the metadata record is usable for catalog
generation.

For provider-backed records, `isValid` should generally correspond to a
successful provider response.

For manual records, `isValid` indicates whether the manually supplied
metadata is complete enough to use.

Request-specific details belong under `request`.

Manual records may omit `request`.

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
