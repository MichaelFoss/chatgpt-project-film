---
title: Generated Sources
status: current
last_updated: 2026-05-27
upload_to_chatgpt: false
---

# sources/generated/

This directory contains generated retrieval-oriented source documents
intended for ChatGPT Project runtime uploads.

Files in this directory are derived from canonical machine-readable
state under `data/`, which itself is materialized from append-only event
history under `events/`.

These files are:

- human-readable
- retrieval-oriented
- deterministic build artifacts
- optimized for ChatGPT runtime context
- preferably machine-generated
- not considered authoritative canonical state

The intended architecture is:

```text
events/
  -> append-only historical truth
  -> ingestion scripts
  -> data/
  -> generated source projections
  -> dist/uploads/
  -> ChatGPT runtime
```

Generated source files should:

- remain concise and retrieval-friendly
- avoid conversational filler
- preserve spoiler-free summaries
- separate factual metadata from subjective reactions
- preserve stable identifiers when possible
- remain deterministic when regenerated from identical inputs

Generated files may be deleted and regenerated at any time.

## Expected Generated Files

Examples of generated files include:

- `catalog-summary.md`
- `ratings.md`
- `reactions.md`
- `watch-history.md`
- `watchlist.md`
- `preference-profile.md`

Not all generated files must exist at all times.

Generated files should only appear when supported by canonical state and
generation workflows.

## Editing Rules

Prefer updating:

- append-only event history under `events/`
- canonical machine-readable state under `data/`
- generation scripts under `scripts/`

rather than manually editing generated source files.

Manual edits should generally be limited to:

- debugging
- migrations
- emergency repair workflows
- temporary bootstrap scenarios
