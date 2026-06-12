---
title: Event Schema
status: current
last_updated: 2026-06-12
upload_to_chatgpt: false
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

Implementation status: implemented.

Records inclusion intent for a title in the known catalog.

This event means:

```text
this title belongs in my system
```

This event does not describe the title. Catalog events must not contain
descriptive metadata.

Title description belongs in:

```text
data/metadata-cache.json
```

This event does not imply that the item was watched, completed, liked,
owned intentionally, or recommended.

Plex-imported `catalog.add` events are durable membership records. They
are not Plex metadata snapshots.

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

These are the only implemented source values for `catalog.add`.

`source` is provenance only. It records where the catalog membership
event came from. It does not contain descriptive metadata and must not
be used as a title-data source.

For Plex-imported events, `source: "plex"` means the event originated
from the Plex import workflow. It does not preserve Plex title metadata,
library metadata, watched state, ratings, view history, or preference
signals.

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

## `title.reaction.updated`

Implementation status: implemented.

Records explicit user reactions for catalog titles.

This event may include a personal-fit rating and optional free-form
notes. Notes are for human recall only and must not be used as
recommendation logic, analytics input, clustering input, normalization
input, or preference inference.

### Required Fields

| Field         | Type   | Description                                      |
| ------------- | ------ | ------------------------------------------------ |
| `eventId`     | string | Globally unique event identifier.                |
| `type`        | string | Must be `title.reaction.updated`.                |
| `occurredAt`  | string | ISO timestamp.                                   |
| `canonicalId` | string | Existing canonical title ID from `data/catalog`. |

### Rating Fields

| Field    | Type   | Description                                                 |
| -------- | ------ | ----------------------------------------------------------- |
| `rating` | number | Integer personal-fit rating from 1 through 10.              |
| `notes`  | string | Optional spoiler-free human notes. Blank notes are omitted. |

When a rating event is projected, `rating` and `notes` use replace
semantics. A newer rating event without `notes` removes any previous
projected `notes` for that title.

### Example

```json
{
  "eventId": "reaction-2026-06-12-tt0133093",
  "type": "title.reaction.updated",
  "occurredAt": "2026-06-12T00:00:00.000Z",
  "canonicalId": "imdb:tt0133093",
  "rating": 9,
  "notes": "Loved the atmosphere and soundtrack."
}
```

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

`source` records where an event came from.

Implemented `catalog.add` source values are:

- `plex`
- `manual`

Source is provenance only.

Source values do not provide descriptive metadata.

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
