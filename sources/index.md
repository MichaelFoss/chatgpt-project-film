---
title: Source Document Index
status: current
last_updated: 2026-05-16
upload_to_chatgpt: false
---

# Source Document Index

This file defines which source documents should be uploaded to the
ChatGPT Project.

## Default Upload Set

Upload these files for normal project use:

- `sources/current-state.md`

## Do Not Upload By Default

Do not upload these directories by default:

- `archive/`
- `prompts/`
- `templates/`
- `scripts/`

## Upload Only When Needed

Upload archived or raw material only when historical context is
specifically required.

## Upload Notes

The ChatGPT Project should be refreshed after meaningful source document
changes are committed to Git.

The upload workflow is generated deterministically from source document
metadata and Git build tags.

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
