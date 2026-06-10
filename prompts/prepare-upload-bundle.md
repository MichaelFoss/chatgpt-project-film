# Prompt: Audit Upload Build

## Purpose

Use this prompt only when an AI should audit a generated ChatGPT Project
upload build for stale, conflicting, or incorrectly included files.

This prompt is not required for the normal upload workflow. The normal
workflow is deterministic:

```bash
yarn run check
git add .
git commit -m "Describe the source update"
yarn build
```

Then follow:

```text
dist/upload-instructions.md
```

Changed source files that need to be uploaded are copied to:

```text
dist/uploads/
```

Generated upload filenames include the build tag where the source file
last changed.

Example:

```text
baseball-cards.build-2026-05-17-0003.md
```

Project instructions are always copied to this deterministic artifact:

```text
dist/project-instructions.md
```

The generated upload instructions still report whether ChatGPT Project
Instructions need to be updated.

If generated build artifacts need to be restored without creating a new
build tag, use:

```bash
yarn restore-build
```

## Prompt

You are helping audit a ChatGPT Project upload build from a Git-based
context repository.

Review:

- `sources/index.md`
- source documents marked `upload_to_chatgpt: true`
- files copied into `dist/uploads/`
- `dist/upload-instructions.md`
- any project-specific upload rules

Produce:

1. a list of files to upload
2. a list of files to exclude
3. whether project instructions need to be updated
4. any stale or conflicting documents
5. any warnings about archive/raw/superseded material
6. a recommended upload order

Rules:

- Do not include archived files by default.
- Do not include prompts by default.
- Do not include repository maintenance docs by default.
- Do not include files prefixed with `_` by default.
- Prefer current curated source documents.
- Flag documents with missing or stale metadata.
- Treat `dist/upload-instructions.md` as the operational checklist.
- Preserve build-tag provenance in generated upload filenames.
