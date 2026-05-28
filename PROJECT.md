# Project Overview

## Purpose

This repository is a Git-backed source-of-truth system for maintaining
long-term ChatGPT Project context.

The repository stores curated source documents, operational workflows,
project instructions, prompts, and supporting metadata in a structured,
deterministic format.

The goal is to:

- keep durable context out of transient chat history
- maintain explicit version control over uploaded ChatGPT context
- separate current curated knowledge from historical/raw material
- support reproducible ChatGPT Project refresh workflows
- make long-running ChatGPT Projects maintainable over time

## Repository Model

Git is the canonical source of truth.

The ChatGPT Project is treated as a runtime environment that consumes
curated uploaded files derived from this repository.

The repository intentionally distinguishes between:

- durable source documents
- prompts and operational workflows
- generated upload artifacts
- historical/archive material
- transient conversation history

## ChatGPT Project Setup

Use:

- `instructions/project-instructions.md` as ChatGPT Project
  Instructions.
- `dist/upload-instructions.md` as the operational upload checklist.
- `sources/index.md` to determine which source files are eligible for
  upload.
- generated files from `dist/uploads/` as the actual uploaded ChatGPT
  Project runtime sources.

Upload only curated source documents intended for runtime retrieval.

Do not upload repository maintenance files unless explicitly needed.

## Source Document Standards

Source documents should:

- remain retrieval-friendly
- contain durable factual context
- avoid unnecessary conversational prose
- clearly distinguish confirmed facts from uncertainty
- use consistent metadata/frontmatter
- remain reasonably scoped and maintainable

Files prefixed with `_` are considered stubs, templates, inactive
material, or non-runtime documents unless explicitly promoted.

## Build Model

The repository build process creates immutable ChatGPT upload
checkpoints.

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
sources/baseball-cards.md
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
converted into source document updates rather than remaining only in
chat history.

When source documents change:

1. update the relevant source files
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
