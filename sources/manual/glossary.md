---
title: Glossary
status: current
last_updated: 2026-05-30
upload_to_chatgpt: false
---

# Glossary

## Append-Only Event History

The durable historical event log stored under:

```text
events/
```

Events are intended to be immutable historical records.

## Canonical State

Machine-readable materialized state derived from append-only events and,
where explicitly documented, durable enrichment artifacts.

Canonical state exists under:

```text
data/
```

Canonical state is authoritative derived state.

Generated Markdown projections are not canonical state.

## ChatGPT Project

The ChatGPT runtime container that includes:

- project instructions
- uploaded runtime source files
- conversations
- retrieval context

## Commitment Awareness

The philosophy that recommendations should account for:

- runtime length
- episode count
- season count
- pacing density
- emotional investment
- cognitive load

Long commitments should justify themselves.

## Conditional Recommendation

A recommendation whose quality depends heavily on:

- mood
- pacing tolerance
- genre interest
- emotional preference
- structural preference

Conditional recommendations should explicitly acknowledge uncertainty.

## Deterministic Build

A workflow where identical inputs produce identical outputs.

The repository attempts to preserve deterministic generation wherever
practical.

## Dist

Generated deployment-ready upload artifacts.

Stored under:

```text
dist/
```

## Event

A durable historical record describing something that occurred.

Events are:

- append-only
- replayable
- machine-readable
- deterministic inputs into canonical state generation

## Event-Driven Architecture

A repository architecture where:

- events represent durable history
- current state is derived from events
- generated projections are materialized outputs

## Generated Runtime Projection

A generated retrieval-oriented runtime document intended for ChatGPT
consumption.

Stored under:

```text
sources/generated/
```

Generated projections are derived outputs rather than canonical state.

## High Confidence Recommendation

A recommendation with strong evidence of preference alignment.

High confidence recommendations should remain relatively rare.

## Manual Runtime Guidance

Human-maintained runtime documentation that defines:

- architecture
- recommendation philosophy
- spoiler policy
- operational guidance
- runtime behavior

Stored under:

```text
sources/manual/
```

## Materialized State

A generated representation of current canonical state derived from event
history.

## NDJSON

Newline-delimited JSON.

Used for append-only event storage.

One JSON object exists per line.

## Non-Goal

A capability or system behavior intentionally excluded from current
repository scope.

Non-goals help prevent uncontrolled architectural expansion.

## Plex Catalog Source

The philosophy that Plex primarily acts as:

- title inventory source
- identifier source
- catalog source

Plex metadata should not automatically imply:

- watched status
- preference
- completion
- recommendation quality

## Recommendation Category

A normalized recommendation classification.

Current categories:

- `watch-now`
- `watch-soon`
- `watch-eventually`
- `conditional`
- `skip`

## Retrieval-Oriented Projection

A generated document optimized for ChatGPT retrieval quality rather than
human authorship.

These documents may reorganize canonical state for improved runtime
retrieval behavior.

## Runtime Source Document

A document intended to be uploaded into the ChatGPT Project runtime.

Runtime source documents may be:

- manual
- generated

## Slow-Burn

A storytelling style prioritizing:

- atmosphere
- tension
- character development
- deliberate pacing

Slow pacing alone is not automatically considered positive.

## Source Registry

The upload manifest and runtime source registry defined in:

```text
sources/manual/index.md
```

## Spoiler Safety

The repository-wide philosophy of protecting first-view experiences.

When uncertainty exists:

```text
prefer revealing less information
```

## Stable External ID

A persistent identifier sourced from an external media system.

Preferred format:

```text
imdb:tt1234567
```

## Upload Artifact

A generated file prepared for upload into the ChatGPT Project.

Upload artifacts are generated outputs rather than canonical source
material.

## Viewing Value

The practical subjective value derived from spending limited viewing
time on a piece of media.

The repository attempts to optimize for viewing value rather than
popularity or hype.

## Watch Queue Philosophy

The philosophy that high-quality recommendations should be paced over
long periods of time rather than consumed immediately in maximum-density
fashion.
