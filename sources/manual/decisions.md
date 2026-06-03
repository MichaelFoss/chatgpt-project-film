---
title: Decisions
status: current
last_updated: 2026-06-01
upload_to_chatgpt: false
---

# Decisions

## Purpose

Record durable architectural, operational, and workflow decisions for
this repository.

This file should contain:

- stable repository decisions
- workflow decisions
- architectural philosophy decisions
- operational policy decisions

Avoid recording:

- temporary experiments
- abandoned ideas
- conversational brainstorming
- rapidly changing implementation details

## Decision Log

### 2026-06-01: Record Post-Plex Import Architecture Decisions

The Plex import is the production ingestion mechanism for bringing Plex
catalog membership into the repository.

The import process is replay-safe and idempotent. Re-running the import
workflow should not create duplicate catalog membership records for the
same canonical title.

Plex data identifies catalog membership and stable IDs only. Plex import
does not make Plex a source of descriptive title metadata for canonical
catalog generation.

Plex import does not imply:

- watched status
- watch history
- preference
- rating
- completion
- intentional ownership
- recommendation

Temporary snapshot tooling is intentionally excluded from production
history. Snapshot tooling may support review or one-off inspection, but
it is not the production architecture and should not be treated as a
durable data source.

Metadata enrichment is a separate phase following import. Catalog
membership can exist before descriptive metadata has been enriched.

Generated catalog state may remain sparse until enrichment coverage
improves.

### 2026-05-30: Add Catalog Sync as Phase Orchestration

Status: superseded by the 2026-06-03 uncapped enrichment deprecation.

`yarn catalog:sync` should run metadata enrichment write behavior before
catalog generation for the common cache-and-build workflow.

The command should remain orchestration only. It must not append catalog
events, perform catalog import/add behavior, or replace standalone
`yarn enrich:metadata:write` and `yarn build:catalog` commands.

### 2026-06-03: Deprecate Uncapped Metadata Enrichment Writes

The uncapped `enrich:metadata:write` path is deprecated in favor of
capped metadata hydration.

Use `yarn hydrate:metadata:write` for metadata cache writes. Run
`yarn build:catalog` separately after inspecting the metadata cache
diff. `yarn catalog:sync` should not perform uncapped metadata
enrichment by default.

### 2026-05-30: Name Catalog Event Stream Explicitly

The catalog event stream should be stored at:

```text
events/catalog.events.ndjson
```

The filename should make the stream's role clear to new readers and keep
the catalog workflow understandable:

```text
events/catalog.events.ndjson
  -> metadata enrichment
  -> data/metadata-cache.json

events/catalog.events.ndjson + data/metadata-cache.json
  -> catalog generation
  -> data/catalog.json
```

### 2026-05-27: Use Git as Canonical Source of Truth

The Git repository is the authoritative long-term source of truth.

ChatGPT Project uploads are derived runtime artifacts rather than
canonical state.

### 2026-05-27: Use Event-Driven Repository Architecture

The repository uses an append-only event-driven architecture.

The intended flow is:

```text
conversation or import
  -> append-only events
  -> canonical machine-readable state
  -> generated retrieval-oriented projections
  -> upload artifacts
```

Historical events are durable truth.

Materialized state and generated sources are derived projections.

### 2026-05-27: Separate Events, Data, and Sources

The repository intentionally separates:

- `events/`
- `data/`
- `sources/manual/`
- `sources/generated/`
- `dist/`

Each layer has a distinct responsibility.

Generated retrieval-oriented Markdown is not canonical state.

### 2026-05-27: Distinguish Manual and Generated Sources

The repository distinguishes between:

- durable human-maintained runtime guidance
- generated retrieval-oriented runtime projections

Manual runtime guidance exists under:

```text
sources/manual/
```

Generated retrieval-oriented projections exist under:

```text
sources/generated/
```

Generated files should preferably be machine-generated rather than
manually maintained.

### 2026-05-27: Use NDJSON for Event Storage

Append-only event history should use NDJSON.

Rationale:

- deterministic replay
- append-friendly workflow
- Git-friendly diffs
- streaming compatibility
- simple ingestion semantics

One JSON object should exist per line.

### 2026-05-27: Preserve Stable External IDs

The repository should preserve stable external identifiers whenever
possible.

Preferred format:

```text
imdb:tt1234567
```

External identifiers improve:

- deterministic regeneration
- metadata normalization
- future migration flexibility
- cross-platform reconciliation

### 2026-05-27: Prioritize Spoiler Safety

Spoiler prevention is considered a core project requirement.

Recommendation quality should never come at the expense of spoiler
safety.

When uncertainty exists:

```text
prefer revealing less information
```

The default runtime assumption should be:

```text
the user has not seen the media
```

### 2026-05-27: Optimize for Viewing Value Rather Than Popularity

The recommendation system should optimize for:

- enjoyment
- viewing satisfaction
- time value
- confidence-aware recommendations
- long-term viewing strategy

The project should avoid behaving like:

- a popularity feed
- a hype engine
- a trending-content algorithm

### 2026-05-27: Respect Viewing Commitment

Long runtimes and large series commitments should justify themselves.

The project should:

- acknowledge viewing commitment
- avoid weak long-form recommendations
- avoid obligation viewing
- avoid sunk-cost reasoning

Stopping a series is considered acceptable.

### 2026-05-27: Treat Plex Primarily as Catalog Source

Plex metadata is considered partially unreliable historically because of
server migration and incomplete retained state.

Plex should primarily be treated as:

- catalog source
- title inventory source
- identifier source

Plex metadata should not automatically imply:

- watched status
- completion
- preference
- recommendation strength

### 2026-05-27: Keep Project Instructions Small

Project Instructions should remain relatively small and
behavior-focused.

Durable runtime context should primarily live in:

```text
sources/manual/
```

Generated retrieval-oriented context should primarily live in:

```text
sources/generated/
```

### 2026-05-27: Prefer Deterministic Build Workflows

The repository should prefer deterministic workflows whenever practical.

Given:

- identical events
- identical canonical state
- identical scripts

build outputs should remain reproducible.

### 2026-05-30: Separate Metadata Enrichment from Catalog Generation

Metadata enrichment and catalog generation should be treated as
independent phases.

Metadata enrichment may contact external providers and update:

```text
data/metadata-cache.json
```

Catalog generation should read:

```text
events/catalog.events.ndjson
data/metadata-cache.json
```

and write:

```text
data/catalog.json
```

Catalog generation must not perform provider lookups and should be
possible entirely offline. Given unchanged
`events/catalog.events.ndjson` and `data/metadata-cache.json`, repeated
catalog generation runs should produce the same catalog output.

### 2026-05-27: Use JavaScript with Node.js for Repository Tooling

Repository automation should primarily use JavaScript running on
Node.js.

Short-lived helper scripts should also generally prefer Node.js over
Python unless Python is specifically justified.

### 2026-05-27: Use Yarn

Yarn is the package manager for this repository.

### 2026-05-27: Validate Only Staged Sources During Pre-Commit

Pre-commit hooks should validate the staged snapshot rather than failing
because of unrelated unstaged source drafts.

Rationale:

- safer Git behavior
- avoids hidden stash workflows
- supports iterative source drafting
- preserves explicit full-repository validation via manual commands

Full validation should still remain available through:

```bash
yarn validate:sources
```
