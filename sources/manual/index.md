---
title: Source Document Index
status: current
last_updated: 2026-05-27
upload_to_chatgpt: false
---

# Source Document Index

This file defines the uploadable runtime source documents used by the
ChatGPT Project.

This file acts as both:

- a runtime upload manifest
- a source document registry

## Source Registry

| Path                                     | Type      | Upload      | Purpose                                           |
| ---------------------------------------- | --------- | ----------- | ------------------------------------------------- |
| `sources/manual/current-state.md`        | manual    | yes         | Current project and runtime status.               |
| `sources/manual/decisions.md`            | manual    | optional    | Architectural and operational decisions.          |
| `sources/manual/glossary.md`             | manual    | optional    | Shared terminology and definitions.               |
| `sources/manual/event-schema.md`         | manual    | optional    | Event definitions and field semantics.            |
| `sources/manual/spoiler-policy.md`       | manual    | optional    | Runtime spoiler-protection guidance.              |
| `sources/manual/recommendation-rules.md` | manual    | optional    | Recommendation and filtering guidance.            |
| `sources/generated/*.md`                 | generated | conditional | Generated retrieval-oriented runtime projections. |

## Default Upload Set

Upload these files for normal project use:

- `sources/manual/current-state.md`

## Do Not Upload By Default

Do not upload these directories by default:

- `archive/`
- `prompts/`
- `templates/`
- `events/`
- `scripts/`

## Upload Only When Needed

Upload archived or raw material only when historical context is
specifically required.

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
