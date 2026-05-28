---
title: Event Schema
status: current
last_updated: 2026-05-27
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

| Field        | Required | Type     | Description                                                |
| ------------ | -------- | -------- | ---------------------------------------------------------- |
| `eventType`  | Yes      | string   | Event discriminator.                                       |
| `id`         | Yes      | string   | Stable media ID, preferably IMDb-formatted.                |
| `occurredAt` | Yes      | string   | ISO timestamp for when the event occurred or was recorded. |
| `source`     | No       | string   | Provenance only. Does not imply preference.                |
| `notes`      | No       | string[] | Optional non-spoiler notes.                                |

## ID Format

Prefer stable external identifiers.

Preferred format:

```text
imdb:tt0112573
```

If an IMDb ID is unavailable, use the best available stable identifier
and preserve enough provenance to migrate later.

Examples:

```text
plex:12345
tmdb:197
manual:braveheart-1995
```

## `CATALOG_ITEM_ADDED`

Records that a media item exists in the known catalog.

This event does not imply that the item was watched, completed, liked,
or intentionally collected.

### Required Fields

| Field        | Type   | Description                   |
| ------------ | ------ | ----------------------------- |
| `eventType`  | string | Must be `CATALOG_ITEM_ADDED`. |
| `id`         | string | Stable media ID.              |
| `title`      | string | Display title.                |
| `mediaType`  | string | Media type.                   |
| `occurredAt` | string | ISO timestamp.                |

### Optional Fields

| Field         | Type     | Description                                         |
| ------------- | -------- | --------------------------------------------------- |
| `year`        | number   | Release year when known.                            |
| `source`      | string   | Provenance, such as `plex`, `netflix`, or `manual`. |
| `externalIds` | object   | Additional IDs from Plex, TMDb, or other systems.   |
| `notes`       | string[] | Non-spoiler notes.                                  |

### Media Types

Allowed `mediaType` values:

- `movie`
- `series`
- `miniseries`
- `special`
- `unknown`

### Example

```json
{
  "eventType": "CATALOG_ITEM_ADDED",
  "id": "imdb:tt0112573",
  "title": "Braveheart",
  "mediaType": "movie",
  "year": 1995,
  "source": "plex",
  "occurredAt": "2026-05-27T00:00:00.000Z"
}
```

## `MEDIA_REACTION_RECORDED`

Records the user's subjective reaction to a media item.

This event should capture what the user explicitly said, not inferred
preferences unless the inference is clearly marked as a recommendation
signal.

### Required Fields

| Field        | Type   | Description                        |
| ------------ | ------ | ---------------------------------- |
| `eventType`  | string | Must be `MEDIA_REACTION_RECORDED`. |
| `id`         | string | Stable media ID.                   |
| `occurredAt` | string | ISO timestamp.                     |

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
  "id": "imdb:tt0112573",
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
