---
title: Source Document Index
status: current
last_updated: 2026-06-10
upload_to_chatgpt: false
---

# Source Document Index

This file is the authoritative source registry for the repository.

It records which source documents are intended for ChatGPT runtime
upload and which documents are maintained as repository reference
material.

Project Instructions are separate from source documents:

- `instructions/project-instructions.md` defines compact ChatGPT Project
  behavior instructions.
- files under `sources/` provide retrieval-oriented source context,
  reference material, or generated source projections.
- Project Instructions are not a source registry and should not hold
  durable factual project context.

## Runtime Upload Strategy

Only the runtime upload set is uploaded for normal ChatGPT runtime use.

The runtime upload set consists of:

- `sources/manual/spoiler-policy.md`
- `sources/manual/recommendation-rules.md`
- `sources/manual/mid-series-advice.md`
- `sources/manual/streaming-context.md`

Architecture and reference documents are excluded from runtime upload by
default.

Generated sources may eventually exist under `sources/generated/`, but
none currently exist for runtime upload.

## Source Registry

| Path                                     | Category  | Runtime upload | Purpose                                              |
| ---------------------------------------- | --------- | -------------- | ---------------------------------------------------- |
| `sources/manual/spoiler-policy.md`       | runtime   | yes            | Runtime spoiler-protection guidance.                 |
| `sources/manual/recommendation-rules.md` | runtime   | yes            | Recommendation and filtering guidance.               |
| `sources/manual/mid-series-advice.md`    | runtime   | yes            | Mid-series recommendation and continuation rules.    |
| `sources/manual/streaming-context.md`    | runtime   | yes            | Platform preference and streaming context.           |
| `sources/manual/current-state.md`        | reference | no             | Current repository state and project status.         |
| `sources/manual/data-model.md`           | reference | no             | Data architecture and canonical state model.         |
| `sources/manual/event-schema.md`         | reference | no             | Event definitions and field semantics.               |
| `sources/manual/decisions.md`            | reference | no             | Architectural and operational decisions.             |
| `sources/manual/glossary.md`             | reference | no             | Shared terminology and definitions.                  |
| `sources/generated/README.md`            | reference | no             | Generated source directory guidance.                 |
| architecture/design documents            | reference | no             | Repository design context outside runtime sources.   |
| `sources/generated/*.md`                 | generated | conditional    | Future generated runtime projections, if introduced. |

## Default Upload Set

Upload these files for normal project use:

- `sources/manual/spoiler-policy.md`
- `sources/manual/recommendation-rules.md`
- `sources/manual/mid-series-advice.md`
- `sources/manual/streaming-context.md`

## Do Not Upload By Default

Do not upload these source and reference documents by default:

- `sources/manual/current-state.md`
- `sources/manual/data-model.md`
- `sources/manual/event-schema.md`
- `sources/manual/decisions.md`
- `sources/manual/glossary.md`
- `sources/generated/README.md`
- architecture and design documents

Do not upload these directories by default:

- `archive/`
- `prompts/`
- `templates/`
- `events/`
- `scripts/`

## Upload Only When Needed

Upload archived, raw, architecture, or reference material only when that
specific context is required for a maintenance workflow.

## Frontmatter Guidance

The `upload_to_chatgpt` frontmatter flag must match the runtime upload
strategy:

- runtime upload set documents use `upload_to_chatgpt: true`
- reference documents use `upload_to_chatgpt: false`
- architecture and design documents are not runtime upload sources
- generated source projections should use `upload_to_chatgpt: true` only
  if they are intentionally added to the runtime upload set

## Upload Notes

The ChatGPT Project should be refreshed after meaningful source document
changes are committed to Git.

The upload workflow is generated deterministically from:

- append-only event history
- canonical machine-readable state
- source document metadata
- Git build tags

For normal source updates:

```bash
yarn check
git add .
git commit -m "Describe the source update"
yarn build
```

`yarn build` runs the full deterministic project build:

1. `yarn build:catalog`
2. `yarn build:title-reactions`
3. `yarn build:sources`
4. `yarn build:upload`

`yarn build:upload` performs upload artifact packaging and build
tagging. It requires a clean working tree. If `yarn build` regenerates
canonical projections or generated sources, the upload step may abort;
commit the generated files, then rerun `yarn build`.

Then follow:

```text
dist/upload-instructions.md
```

Both manual and generated runtime source documents may contribute to
upload artifacts.

Generated upload files are copied to:

```text
dist/uploads/
```

Generated upload filenames include the build tag where the source file
last changed.

Example:

```text
baseball-cards.build-2026-05-17-0003.md
```

To restore generated build artifacts without creating a new build tag:

```bash
yarn restore-build
```

The restore-build workflow restores generated upload artifacts using the
most recent build tag associated with each uploadable source file.

## Non-Goals

This registry does not introduce new architectural decisions.

This registry does not begin catalog hydration or metadata enrichment.
