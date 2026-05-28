# AGENTS.md

## Role

This repository maintains curated source documents for a long-term
ChatGPT Project.

AI agents should help maintain structure, consistency, clarity, and
retrieval usefulness.

## Core Rules

- Do not add unverified facts.
- Do not silently resolve conflicting facts.
- Do not treat archived information as current.
- Do not put durable factual context in `instructions/`.
- Do not put canonical project facts in `prompts/`.
- Preserve dates and source provenance where available.
- Prefer small, focused edits.
- Keep ChatGPT Project Instructions short.
- Keep source documents retrieval-friendly.
- Treat generated upload files in `dist/uploads/` as immutable runtime
  artifacts.
- Preserve build-tag provenance in generated upload filenames.
- Do not manually rename generated upload files.
- Do not manually edit generated `dist/` artifacts.
- Add changelog entries for meaningful structural or factual updates.

## Directory Rules

### `instructions/`

Behavior rules only.

Examples:

- assistant behavior
- source precedence
- conflict handling
- response style
- clarification rules

### `sources/`

Durable factual context.

Examples:

- current state
- domain facts
- decisions
- terminology
- workflows
- known constraints

### `prompts/`

Reusable maintenance workflows.

Examples:

- update a source document
- audit upload build
- restore build artifacts
- reconcile conflicts
- audit stale context

### `archive/`

Historical, raw, superseded, or snapshot material.

Do not assume anything in `archive/` is current.

### `templates/`

Reusable file patterns.

Do not treat templates as project facts.

### `dist/`

Generated runtime artifacts.

Examples:

- versioned upload files
- upload instructions
- generated project instructions
- upload bundle snapshots

Rules:

- Do not manually edit generated `dist/` artifacts.
- Restore generated build artifacts using repository scripts.
- Generated upload filenames intentionally include build tags.
- Git source filenames remain stable.
- Upload versioned files from `dist/uploads/` into ChatGPT Projects.

## Markdown Standards

- Use clear headings.
- Use explicit dates.
- Prefer lists and tables when they improve retrieval.
- Avoid vague filenames.
- Use lowercase kebab-case filenames.
- Include frontmatter in source documents.
- Mark source document status clearly.
