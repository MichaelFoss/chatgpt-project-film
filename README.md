# ChatGPT Project Template

A lightweight Git-based template for managing long-term ChatGPT Project
context.

## Purpose

This repository is the canonical source of truth for a ChatGPT Project.

The goal is to keep ChatGPT Project Instructions small and stable while
storing durable factual context in curated source documents that can be
uploaded to the ChatGPT Project.

## Operating Model

- `instructions/` contains behavior rules for the ChatGPT Project.
- `sources/` contains factual context intended for upload.
- `prompts/` contains reusable maintenance/update prompts.
- `archive/` contains raw, historical, superseded, or snapshot material.
- `templates/` contains reusable document templates.
- `scripts/` contains validation and build helpers.

## Relationship to ChatGPT

The actual ChatGPT Project should use:

1. `instructions/project-instructions.copyable.md` as the Project
   Instructions.
2. Generated files from `dist/uploads/`, created by the build workflow,
   as uploaded source documents.

Git remains the source of truth. Uploaded ChatGPT files are derived
runtime context.

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
- creates a `build-YYYY-MM-DD-NNNN` Git tag when upload-impacting
  changes are detected
- skips rebuilding if `HEAD` already has a build tag
- skips build creation when no upload-impacting files changed
- copies changed uploadable source files into `dist/uploads/`
- appends build tags to generated upload filenames
- copies project instructions into `dist/project-instructions.md` when
  required
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
sources/baseball-cards.md
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
- `instructions/project-instructions.copyable.md`
- `sources/index.md`
- `sources/current-state.md`
- `sources/decisions.md`
- `sources/glossary.md`
- `prompts/update-source-doc.md`
- `prompts/prepare-upload-bundle.md`
- `archive/README.md`

## Design Rules

- Keep instructions small.
- Put facts in source documents.
- Put workflows in prompts.
- Keep archive material out of default uploads.
- Prefer boring, explicit, retrieval-friendly Markdown.
- Preserve dates, uncertainty, and provenance.

## Template Updates

Projects created from this template are independent repositories.

This template provides a starting structure, not an ongoing inheritance
model. If the template improves later, copy or cherry-pick useful
changes manually.
