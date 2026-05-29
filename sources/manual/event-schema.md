---
title: Event Schema
status: current
last_updated: 2026-05-29
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

Use `auto` when provider lookup should be attempted if metadata is
missing or invalid.

Use `skip` when the title is known to require manual metadata.

A `catalog.add` event with `metadataLookup: "skip"` still requires a
valid metadata-cache entry before it can produce a catalog item.

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

## Replay Semantics

Replay should:

1. read events in file order
2. treat missing `schemaVersion` as `1`
3. validate each event shape
4. fail without writing output when duplicate `eventId` values are found
5. build a unique catalog inclusion set by `canonicalId`
6. report and skip duplicate catalog-add actions
7. use the metadata cache to build catalog records
8. fetch provider metadata only when allowed and needed
9. generate deterministic catalog output
10. print success and failure reports

Duplicate catalog-add actions for the same `canonicalId` should not
produce duplicate catalog records. They should be reported and skipped
as redundant inclusion intent.

## Future Events

### `MEDIA_REACTION_RECORDED`

Status: future/planned.

This event is not part of the current ingestion implementation.

Records the user's subjective reaction to a media item.

This event should capture what the user explicitly said, not inferred
preferences unless the inference is clearly marked as a recommendation
signal.

### Required Fields

| Field         | Type   | Description                         |
| ------------- | ------ | ----------------------------------- |
| `eventType`   | string | Must be `MEDIA_REACTION_RECORDED`.  |
| `canonicalId` | string | Globally unique canonical title ID. |
| `occurredAt`  | string | ISO timestamp.                      |

### Optional Fields

| Field                   | Type     | Description                                            |
| ----------------------- | -------- | ------------------------------------------------------ |
| `rating`                | number   | Personal enjoyment score from 1 to 10.                 |
| `status`                | string   | Viewing status.                                        |
| `liked`                 | string[] | Non-spoiler positive reaction bullets.                 |
| `disliked`              | string[] | Non-spoiler negative reaction bullets.                 |
| `interesting`           | string[] | Non-spoiler observations.                              |
| `recommendationSignals` | string[] | Non-spoiler signals useful for future recommendations. |
| `source`                | string   | Usually `chatgpt` or `manual`.                         |
| `notes`                 | string[] | Additional non-spoiler notes.                          |

### Viewing Status Values

Allowed `status` values:

- `watched`
- `completed`
- `watching`
- `paused`
- `abandoned`
- `unknown`

Use `completed` when the user explicitly finished the movie, series, or
available runtime unit being discussed.

Use `watched` only when completion is unclear but the user indicates
meaningful viewing.

### Rating Semantics

`rating` is a personal enjoyment score.

It is not:

- an objective quality score
- an IMDb-style community rating
- a critic score
- a measure of cultural importance

Suggested interpretation:

| Rating | Meaning                                |
| -----: | -------------------------------------- |
|     10 | All-time favorite or elite experience. |
|      9 | Loved it.                              |
|      8 | Very good.                             |
|      7 | Good and worthwhile.                   |
|      6 | Okay or mixed.                         |
|      5 | Weak, forgettable, or disappointing.   |
|    1-4 | Disliked to varying degrees.           |

Ratings are optional.

Reaction bullets are usually more useful than the number.

### Example

```json
{
  "eventType": "MEDIA_REACTION_RECORDED",
  "canonicalId": "imdb:tt0112573",
  "rating": 9,
  "status": "completed",
  "liked": [
    "emotional weight",
    "historical atmosphere",
    "battle scenes"
  ],
  "disliked": ["romance subplot pacing"],
  "interesting": [
    "large-scale historical epic with strong personal stakes"
  ],
  "source": "chatgpt",
  "occurredAt": "2026-06-01T02:15:00.000Z"
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
