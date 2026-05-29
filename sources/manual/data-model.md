---
title: Data Model
status: current
last_updated: 2026-05-29
upload_to_chatgpt: false
---

# Data Model

## Purpose

Define the canonical repository data model.

This document specifies:

- event storage philosophy
- canonical identifiers
- canonical state structure
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
type MetadataLookupPolicy = 'auto' | 'skip';

type CatalogAddEvent = {
  eventType: 'catalog.add';
  occurredAt: string;
  canonicalId: string;
  metadataLookup?: MetadataLookupPolicy;
};
```

`metadataLookup` defaults to `auto`.

Use `auto` when provider lookup should be attempted if metadata is
missing or invalid.

Use `skip` when the title is known to require manual metadata.

A `catalog.add` event with `metadataLookup: 'skip'` still requires a
valid metadata-cache entry before it can produce a catalog item.

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

The file should be keyed by canonical identifier.

Catalog records are derived from:

- canonical events
- valid metadata records

Catalog records should be provider-independent.

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
sources.

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
.appconfig.json
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
