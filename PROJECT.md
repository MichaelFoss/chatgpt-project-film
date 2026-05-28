# Project Overview

## Purpose

This repository is a Git-backed source-of-truth system for maintaining
long-term spoiler-free movie and television recommendation context.

The repository stores canonical machine-readable state, append-only
update events, generated retrieval-oriented source documents,
operational workflows, project instructions, prompts, and supporting
metadata in a structured deterministic format.

The goal is to:

- keep durable context out of transient chat history
- maintain explicit version control over uploaded ChatGPT context
- separate current curated knowledge from historical/raw material
- support reproducible ChatGPT Project refresh workflows
- support conversational media recommendation workflows
- support append-only conversational update ingestion
- support deterministic rebuilds from canonical state and event history
- preserve durable user preference history over time
- make long-running ChatGPT Projects maintainable over time

## Repository Model

Git is the canonical source of truth.

The ChatGPT Project is treated as a runtime environment that consumes
generated uploaded files derived from canonical repository state.

Conversations are treated as producers of structured update events, not
as authoritative long-term state.

Unlike simpler Markdown-first ChatGPT Project repositories, this
repository follows a data-first architecture where generated retrieval
views are derived from canonical state and append-only event history.

The repository intentionally distinguishes between:

- immutable append-only event history
- canonical machine-readable state
- append-only conversational update events
- human-maintained runtime guidance
- generated retrieval-oriented upload views
- prompts and operational workflows
- historical/archive material
- transient runtime conversation history

## Architectural Model

The repository follows an event-oriented architecture.

High-level flow:

```text
conversation
  -> structured update event
  -> append-only patch log
  -> ingestion scripts
  -> canonical machine-readable state
  -> generated ChatGPT upload sources
  -> future conversations
```

The append-only event layer is the deepest level of durable truth.

Canonical state is materialized from event history.

Generated source documents are retrieval-oriented projections derived
from canonical state.

Key principles:

- ChatGPT is not the canonical database.
- Conversations produce proposed updates.
- Event history is immutable.
- Canonical state is materialized from events.
- Canonical state lives in `data/`.
- Generated upload files are derived views.
- Human-readable files are preferably machine-generated.
- Upload artifacts should be reproducible.
- Stable external identifiers should be preserved.

The repository intentionally separates:

- canonical state
- generated state
- conversational interpretation
- historical provenance

This allows deterministic rebuilds, auditability, incremental
refinement, reproducible deployment artifacts, and future automation.

## ChatGPT Project Setup

Use:

- `instructions/project-instructions.md` as ChatGPT Project
  Instructions.
- `dist/upload-instructions.md` as the operational upload checklist.
- `sources/manual/index.md` to determine which source files are eligible
  for upload.
- generated files from `dist/uploads/` as the actual uploaded ChatGPT
  Project runtime sources.

Upload only curated source documents intended for runtime retrieval.

Do not upload repository maintenance files unless explicitly needed.

## Source Document Standards

Source documents are intended for ChatGPT runtime consumption.

Some source documents are durable human-maintained runtime guidance.

Other source documents are generated retrieval-oriented projections
derived from canonical state.

Source documents should:

- remain retrieval-friendly
- contain durable contextual summaries
- avoid unnecessary conversational prose
- clearly distinguish confirmed facts from uncertainty
- use consistent metadata/frontmatter
- separate factual metadata from subjective reactions
- preserve spoiler-free recommendation context
- remain concise and retrieval-oriented
- remain reasonably scoped and maintainable
- be human-readable
- preferably be machine-generated rather than manually maintained
- clearly distinguish manual runtime guidance from generated projections

## Canonical Data Model

Append-only event history lives under `events/`.

Canonical machine-readable state lives under `data/`.

Event examples:

- media updates
- ratings
- reactions
- watch-status changes
- catalog imports

Canonical state examples:

- media catalog
- ratings
- reactions
- watch history
- recommendation signals
- ingestion queues
- append-only update logs

The preferred append-only event format is NDJSON.

Event history is the deepest durable layer.

Canonical state is authoritative current materialized state.

Generated Markdown source documents are derived retrieval-oriented
projections rather than primary state containers.

Human-maintained runtime guidance documents may also exist under
`sources/manual/` and are not required to be generated from canonical
state.

Example conceptual workflow:

```text
conversation
  -> MEDIA_UPDATE event
  -> events/media-updates.ndjson
  -> ingestion script
  -> canonical state update
  -> generated Markdown upload sources
```

Canonical data should prefer stable external identifiers such as IMDb
IDs whenever available.

Owned media should not automatically imply:

- watched
- completed
- liked
- recommended

Files prefixed with `_` are considered stubs, templates, inactive
material, or non-runtime documents unless explicitly promoted.

## Build Model

The repository build process creates immutable ChatGPT upload
checkpoints.

Given the same canonical data, append-only update history, and build
logic, the repository should produce the same generated upload artifact
set deterministically.

Normal workflow:

```bash
yarn check
git add .
git commit -m "Describe the source update"
yarn build
```

Then follow:

```text
dist/upload-instructions.md
```

A successful `yarn build`:

- requires a clean Git working tree
- must be run from the repository root
- creates a `build-YYYY-MM-DD-NNNN` Git tag when upload-impacting
  changes are detected
- skips rebuilding when `HEAD` already has a build tag
- skips build creation when no upload-impacting files changed
- copies changed uploadable source files into `dist/uploads/`
- packages both manual and generated source documents into deployment
  artifacts
- appends build tags to generated upload filenames
- uses immutable generated upload filenames to preserve runtime
  provenance
- copies project instructions into `dist/project-instructions.md` only
  when required
- writes operational upload instructions into
  `dist/upload-instructions.md`
- generates `dist/chatgpt-upload-bundle.md` for auditing, portability,
  and reference workflows

If no upload-impacting files changed since the prior build tag, no new
build tag is created.

Generated upload filenames intentionally include the build tag where the
source file last changed.

Example generated upload filename:

```text
baseball-cards.build-2026-05-17-0003.md
```

Stable Git source filename:

```text
sources/generated/baseball-cards.md
```

When updating uploaded ChatGPT Project source files:

1. delete the prior versioned uploaded file from the ChatGPT Project
2. upload the newly generated versioned file

To restore generated build artifacts without creating a new build tag:

```bash
yarn restore-build
```

The restore-build workflow:

- recreates generated upload artifacts from current repository state
- inspects existing `build-*` Git tags without creating new ones
- restores per-file build provenance in generated upload filenames
- recreates `dist/upload-instructions.md`
- recreates `dist/project-instructions.md`
- recreates `dist/chatgpt-upload-bundle.md`

## Default Upload Policy

Upload only current, curated source files.

Do not upload:

- archive material
- raw notes by default
- superseded summaries
- repository maintenance documentation
- prompts/workflow documents
- inactive `_`-prefixed files

unless explicitly required for the active ChatGPT workflow.

## Review Standard

Durable information discovered during conversations should eventually be
converted into structured append-only events and regenerated canonical
state rather than remaining only in transient chat history.

When source documents change:

1. append events or regenerate canonical state
2. commit the changes to Git
3. run `yarn build`
4. follow `dist/upload-instructions.md`
5. refresh the ChatGPT Project runtime context as needed

## Long-Term Maintenance Model

Projects created from the template are intentionally independent.

The template repository is a starting point, not an inheritance model.

Template improvements may be manually copied or cherry-picked into
downstream projects when useful.

Downstream projects are expected to evolve independently over time.
