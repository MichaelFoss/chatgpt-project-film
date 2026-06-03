---
title: Current State
status: current
last_updated: 2026-06-03
upload_to_chatgpt: false
---

# Current State

## Purpose

Summarize the current operational, architectural, and repository state
of the Film project.

This document should remain concise and focused on durable current
context rather than historical detail.

## Current Repository State

The Film project is currently in early repository bootstrap and
architecture-definition phase.

The repository architecture is intentionally deterministic and
event-driven.

The intended workflow is:

```text
conversation or import
  -> append-only events
  -> metadata enrichment
  -> canonical machine-readable state
  -> generated retrieval-oriented sources
  -> build artifacts
  -> ChatGPT Project uploads
```

For catalog data, capped metadata hydration and catalog generation are
separate phases:

```text
events/catalog.events.ndjson
  -> capped provider lookups
  -> data/metadata-cache.json

events/catalog.events.ndjson + data/metadata-cache.json
  -> data/catalog.json
```

`yarn hydrate:metadata:write` is the supported metadata-cache write
path. `yarn catalog:sync` no longer performs uncapped metadata
enrichment by default.

Catalog generation is deterministic from `events/catalog.events.ndjson`
and `data/metadata-cache.json`. It should run offline, must not perform
provider lookups, and consumes the metadata cache without modifying it.

## Current Architecture

The repository currently distinguishes between:

- append-only historical events
- canonical machine-readable state
- provider-backed metadata enrichment
- manual runtime guidance
- generated retrieval-oriented runtime projections
- deployment/upload artifacts

Primary directories:

| Directory            | Purpose                                             |
| -------------------- | --------------------------------------------------- |
| `events/`            | Append-only historical event log.                   |
| `data/`              | Canonical machine-readable materialized state.      |
| `sources/manual/`    | Human-maintained runtime guidance and architecture. |
| `sources/generated/` | Generated retrieval-oriented runtime projections.   |
| `dist/`              | Deployment-ready upload artifacts.                  |

## Current Recommendation Philosophy

The Film project is designed to:

- optimize for enjoyment and time value
- preserve spoiler-free first-view experiences
- provide confidence-aware recommendations
- avoid hype-driven recommendation behavior
- support long-term curated viewing strategy

The recommendation system should behave more like:

- a trusted curator
- a thoughtful advisor
- a practical strategist

and less like:

- a popularity algorithm
- a trending-content feed
- a marketing system

## Current Spoiler Philosophy

Spoiler prevention is considered a core project requirement.

The default runtime assumption should be:

```text
The user has not seen the media being discussed.
```

The project intentionally avoids:

- trailer-style recommendation behavior
- twist framing
- future-event hints
- payoff spoilers
- “it gets better later” spoiler patterns

## Current Platform Context

Primary viewing platforms:

- Plex
- Netflix

Platform context assumptions:

- Plex metadata may be incomplete or unreliable historically.
- Plex primarily acts as catalog and identifier source.
- Netflix is considered low-friction viewing.
- Amazon Prime Video has elevated friction due to advertisements.
- Theater viewing is relatively uncommon.

## Current Data Model State

Current canonical design assumptions:

- events are append-only
- events use NDJSON
- state is materialized from events
- generated sources are deterministic build artifacts
- source documents are retrieval-oriented projections
- stable external IDs should be preserved when possible

Preferred ID format:

```text
imdb:tt1234567
```

## Current Operational State

The repository currently contains:

- foundational architecture documentation
- runtime behavioral guidance
- recommendation policy definitions
- spoiler handling policy
- streaming context definitions
- event schema definitions
- mid-series guidance rules
- committed application configuration in `.appconfig.jsonc`
- Plex import tooling
- catalog event ingestion tooling
- capped metadata hydration tooling
- deterministic catalog generation tooling
- 705 catalog event IDs from the completed Plex import
- 11 currently generated catalog records

The current catalog checkpoint is:

- Plex import: complete
- catalog events: 705 IDs
- OMDb real-provider validation: succeeded for 10 records
- generated catalog: 11 records
- missing catalog metadata after rebuild: 694 records
- production metadata hydration: not yet performed
- runtime source architecture: not yet implemented

The repository does not yet contain generated runtime projections or
event ingestion automation beyond the current catalog import workflows.

## Current Workflow Philosophy

The intended operational workflow is:

```text
conversation
  -> generated event patch
  -> append-only event history
  -> deterministic regeneration
  -> updated runtime projections
  -> ChatGPT Project refresh
```

Manual editing should generally focus on:

- runtime guidance
- architecture documents
- operational policy
- debugging
- migrations

Generated runtime projections should preferably be machine-generated.

## Current Open Questions

Known unresolved areas include:

- exact generated source structure
- event ingestion batching strategy
- Plex import normalization details
- long-term generated preference-profile design
- generated watch queue projection format
- future season-level or episode-level modeling

These should evolve incrementally rather than being over-designed
upfront.

## Current Non-Goals

The repository is intentionally not attempting to become:

- a social recommendation platform
- a public review system
- a streaming aggregation engine
- a ratings-optimization engine
- a spoiler-heavy fandom wiki
- a fully automated recommendation AI pipeline

The focus remains:

```text
high-quality spoiler-safe viewing guidance
```

## Do Not Assume

- Do not assume Plex watched history is authoritative.
- Do not assume catalog presence implies watched status.
- Do not assume generated source projections are canonical state.
- Do not assume recommendation confidence when evidence is weak.
- Do not assume popularity implies recommendation quality.
- Do not assume unfinished architectural details are finalized.
