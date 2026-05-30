# ChatGPT Project: Film

A deterministic event-driven repository for managing long-term
spoiler-free movie and television recommendation context for ChatGPT
Projects.

## Purpose

This repository is the canonical source of truth for a spoiler-free
movie and television recommendation project built around ChatGPT.

The goal is to keep ChatGPT Project Instructions small and stable while
storing append-only event history, canonical machine-readable state, and
generated retrieval-oriented source documents.

## Operating Model

- `events/` contains immutable append-only event history.
- `data/` contains canonical machine-readable materialized state.
- `sources/manual/` contains human-maintained runtime guidance and
  architectural reference documents.
- `sources/generated/` contains generated retrieval-oriented upload
  views derived from canonical state.
- `instructions/` contains behavior rules for the ChatGPT Project.
- `prompts/` contains reusable maintenance/update prompts.
- `archive/` contains raw, historical, superseded, or snapshot material.
- `templates/` contains reusable document templates.
- `scripts/` contains validation, ingestion, generation, and build
  helpers.
- Conversations generate append-only update events.
- Scripts ingest events into canonical state.
- Canonical state generates retrieval-oriented upload views.
- Build workflows generate deployable upload artifacts.

## Relationship to ChatGPT

The actual ChatGPT Project should use:

1. `instructions/project-instructions.md` as the Project Instructions.
2. Generated files from `dist/uploads/`, created from both manual and
   generated source documents by the build workflow, as uploaded source
   documents.

Git event history and canonical state remain the source of truth.
Uploaded ChatGPT files are generated runtime retrieval context.

## ⚠️ Upload Client Warning

As of May 2026, the ChatGPT macOS desktop client may successfully upload
source files while failing to make their contents retrievable/indexable
inside ChatGPT Projects.

The files may appear in the Project UI, but ChatGPT may be unable to
search or read their contents.

For reliable uploads, use the ChatGPT web application in a browser when
uploading source files to a ChatGPT Project.

After uploading files, verify retrieval by asking ChatGPT to quote or
search for a known unique phrase from one of the uploaded files.

## Required Workflow

Typical workflow:

```text
conversation
  -> append-only event
  -> metadata enrichment when needed
  -> canonical state regeneration
  -> generated source regeneration
  -> build artifacts
  -> ChatGPT upload
```

For media catalog data, enrichment and catalog generation are separate
responsibilities:

```text
events/media.ndjson
  -> provider lookups
  -> data/metadata-cache.json

events/media.ndjson + data/metadata-cache.json
  -> data/catalog.json
```

Catalog generation should be deterministic from those two input files
and should not perform provider lookups.

For normal source updates:

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

The build workflow:

- requires a clean Git working tree
- must be run from the repository root
- assumes generated source files are reproducible from canonical state
- creates a `build-YYYY-MM-DD-NNNN` Git tag when upload-impacting
  changes are detected
- skips rebuilding if `HEAD` already has a build tag
- skips build creation when no upload-impacting files changed
- copies changed uploadable source files into `dist/uploads/`
- packages both manual and generated source documents for upload
- appends build tags to generated upload filenames
- copies project instructions into `dist/project-instructions.md` for
  upload/reference workflows
- generates `dist/upload-instructions.md` describing exactly what must
  be uploaded to ChatGPT
- generates `dist/chatgpt-upload-bundle.md` for auditing, portability,
  and reference workflows

Generated upload filenames intentionally include the build tag where the
source file last changed.

Example:

```text
baseball-cards.build-2026-05-17-0003.md
```

Git source filenames remain stable:

```text
sources/generated/baseball-cards.md
```

When replacing uploaded ChatGPT Project sources:

1. delete the older versioned upload file from the ChatGPT Project
2. upload the newly generated versioned file

To restore generated build artifacts without creating a new build tag:

```bash
yarn restore-build
```

The restore-build workflow recreates upload artifacts using the most
recent build tag associated with each uploadable source file.

The template repository itself primarily provides the workflow,
documentation, and tooling. Downstream repositories created from this
template are the deployable/runtime projects.

## Required Files

- `PROJECT.md`
- `AGENTS.md`
- `instructions/project-instructions.md`
- `sources/manual/index.md`
- `sources/manual/current-state.md`
- `sources/manual/decisions.md`
- `sources/manual/glossary.md`
- `prompts/update-source-doc.md`
- `prompts/prepare-upload-bundle.md`
- `archive/README.md`

## Design Rules

- Keep instructions small.
- Put durable truth in events and canonical state.
- Put workflows in prompts.
- Keep archive material out of default uploads.
- Prefer boring, explicit, retrieval-friendly Markdown.
- Preserve dates, uncertainty, and provenance.
- Do not infer that owned media is liked media.
- Treat conversational updates as append-only events.
- Keep recommendation notes spoiler-free.
- Prefer stable external identifiers such as IMDb IDs.
- Separate canonical state from generated upload views.
- Prefer machine-generated source documents over manual editing.
- Treat `sources/generated/` as generated retrieval projections.
- Treat `sources/manual/` as durable human-maintained runtime guidance.
- Treat `dist/` as deployment artifacts.
- Prefer deterministic rebuilds whenever possible.

## Template Updates

Projects created from this template are copied, not linked. They do not
automatically receive later changes from this repository.

Derived repositories can opt into specific template updates by
cherry-picking small atomic refs from this repository:

```bash
yarn apply-template-update <template-ref> [description]
```

The helper ensures a `template` remote exists, fetches it, cherry-picks
the requested ref, and records the applied update in
`template-updates.md`.

### Initial Rollout

Existing derived repositories need a one-time manual bootstrap because
they do not yet contain the `apply-template-update` helper.

After that bootstrap, future template updates can use:

```bash
yarn apply-template-update <template-ref>
```

Skipping template updates is OK. Updates are intentionally opt-in and
atomic so each derived repository can decide which changes are worth
applying.
