---
title: Event Schema
status: current
last_updated: 2026-05-30
upload_to_chatgpt: true
---

# Event Schema

## Purpose

Define the append-only event format used by the Film project.

Events are durable historical records. They are not current state by
themselves.

The intended flow is:

```text
conversation or import
  -> event
  -> events/*.ndjson
  -> ingestion script
  -> data/
  -> sources/generated/
  -> dist/uploads/
```

## Core Rules

- Events are append-only.
- Events should be one JSON object per line.
- Event files should use NDJSON.
- Events should preserve stable external IDs when available.
- Events should not infer preference, rating, watched status, or
  completion unless explicitly provided.
- Events should avoid spoilers.
- Events should be replayable in deterministic order.
- Current state should be materialized from events by scripts.

## Shared Fields

All event types share these fields.

| Field           | Required | Type   | Description                                                |
| --------------- | -------- | ------ | ---------------------------------------------------------- |
| `eventType`     | Yes      | string | Event discriminator.                                       |
| `occurredAt`    | Yes      | string | ISO timestamp for when the event occurred or was recorded. |
| `eventId`       | No       | string | Globally unique event identifier when present.             |
| `schemaVersion` | No       | number | Event schema version. Defaults to `1` when omitted.        |

`eventId` is optional. When present, it must be globally unique across
the event log.

Duplicate `eventId` values indicate a serious event-log data problem and
should cause processing to fail without writing output.

`schemaVersion` is optional. Missing `schemaVersion` values should be
treated as version `1`.

## Canonical ID Format

Use `canonicalId` for title identity.

Prefer stable IMDb title identifiers.

Preferred format:

```text
imdb:tt0112573
```

If an IMDb ID is unavailable, use a stable, human-readable manual
identifier.

Examples:

```text
manual:braveheart-1995
manual:festival-short-2024
```

## `catalog.add`

Records inclusion intent for a title in the known catalog.

This event means:

```text
this title belongs in my system
```

This event does not describe the title.

Title description belongs in:

```text
data/metadata-cache.json
```

This event does not imply that the item was watched, completed, liked,
owned intentionally, or recommended.

### Required Fields

| Field         | Type   | Description                         |
| ------------- | ------ | ----------------------------------- |
| `eventType`   | string | Must be `catalog.add`.              |
| `occurredAt`  | string | ISO timestamp.                      |
| `source`      | string | Must be `plex` or `manual`.         |
| `canonicalId` | string | Globally unique canonical title ID. |

### Optional Fields

| Field            | Type   | Description                                         |
| ---------------- | ------ | --------------------------------------------------- |
| `eventId`        | string | Globally unique event identifier when present.      |
| `schemaVersion`  | number | Event schema version. Defaults to `1` when omitted. |
| `metadataLookup` | string | Must be `auto` or `skip`. Defaults to `auto`.       |

### Source Values

Allowed `source` values:

- `plex`
- `manual`

`source` is provenance only.

It does not imply:

- watched
- completed
- liked
- disliked
- recommended
- owned intentionally

### Metadata Lookup

Allowed `metadataLookup` values:

- `auto`
- `skip`

Use `auto` when provider enrichment may be attempted later if metadata
is missing or invalid.

Use `skip` when provider enrichment should not be attempted for that
title.

`metadataLookup` controls metadata enrichment only. Catalog generation
must not contact providers regardless of this value.

`skip` does not allow catalog generation to proceed without valid
metadata. A `catalog.add` event with `metadataLookup: "skip"` still
requires a valid `data/metadata-cache.json` entry before a catalog item
can be generated.

If metadata is missing or invalid for a `skip` item, catalog generation
should report it and omit the item from generated catalog output.

If metadata is missing or invalid for an `auto` item, metadata
enrichment may later update `data/metadata-cache.json`. Catalog
generation should still only consume the existing metadata cache.

### Excluded Fields

Do not include descriptive title fields in `catalog.add`.

Excluded fields include:

- `id`
- `title`
- `year`
- `mediaType`
- `externalIds`

Catalog descriptive fields are derived from valid metadata records, not
from catalog-add events.

### Example

```json
{
  "eventType": "catalog.add",
  "canonicalId": "imdb:tt0112573",
  "source": "plex",
  "metadataLookup": "auto",
  "occurredAt": "2026-05-27T00:00:00.000Z"
}
```

### Ingestion Commands

Catalog inclusion events should be appended through the catalog
ingestion commands when possible:

```bash
yarn catalog:import <path> --plan
yarn catalog:import <path> --write
yarn catalog:add <canonicalId> --source manual --plan
yarn catalog:add <canonicalId> --source manual --write
```

The import command accepts a JSON array of items with `canonicalId` and
`source`, plus optional `metadataLookup` and `occurredAt`. It validates
and reports invalid rows, duplicate input IDs, and already-existing
catalog IDs before writing. The add command is a one-item wrapper around
the same import path.

Catalog ingestion appends valid new `catalog.add` events only. It does
not build `data/catalog.json`, mutate `data/metadata-cache.json`, or
perform provider lookups.

## Spoiler Rules for Events

Events should not contain spoilers unless the user explicitly chooses to
record spoiler-bearing private notes later.

For now, all event fields should remain spoiler-free.

Avoid recording:

- plot twists
- character outcomes
- deaths
- hidden identities
- future-season details
- ending details

Prefer tone, pacing, atmosphere, genre, acting, structure, and general
reaction language.

## Provenance

`source` records where the event came from.

Examples:

- `plex`
- `netflix`
- `chatgpt`
- `manual`

Source is provenance only.

It does not imply:

- watched
- completed
- liked
- disliked
- recommended
- owned intentionally

## V1 Non-Goals

Do not model these yet unless explicitly added later:

- episode-level reactions
- season-level reactions
- streaming availability freshness
- automated recommendation scoring
- inferred preference profiles as authoritative state
- Plex watched-state trust
- spoiler-bearing private notes
