---
title: Manual Sources
status: current
last_updated: 2026-05-27
upload_to_chatgpt: false
---

# sources/manual/

This directory contains durable human-maintained source documents used
for ChatGPT Project runtime guidance, repository architecture,
operational workflows, and retrieval-oriented behavioral context.

Unlike `sources/generated/`, files in this directory are not expected to
be regenerated from canonical machine-readable state.

These files are:

- human-maintained
- durable runtime guidance
- architectural reference material
- operational workflow documentation
- retrieval-oriented
- upload-eligible ChatGPT Project context

The intended architecture is:

```text
sources/manual/
  -> durable runtime guidance
  -> build workflows
  -> dist/uploads/
  -> ChatGPT runtime
```

Manual source documents should:

- remain concise and retrieval-friendly
- avoid unnecessary conversational prose
- clearly distinguish architectural guidance from canonical state
- preserve spoiler-free recommendation rules
- remain reasonably stable over time
- support deterministic build and upload workflows

## Expected Manual Source Files

Examples of manual source files include:

- `index.md`
- `current-state.md`
- `decisions.md`
- `glossary.md`
- `event-schema.md`
- `spoiler-policy.md`
- `recommendation-rules.md`
- `mid-series-advice.md`
- `streaming-context.md`

Not all manual source files must exist immediately.

Manual source files should be introduced when they provide meaningful
runtime, architectural, or operational value.

## Editing Rules

Files in this directory are expected to be maintained intentionally by
humans.

However, updates should still:

- preserve deterministic workflows
- avoid redundant or conflicting guidance
- remain compatible with generated source workflows
- avoid drifting from canonical repository architecture
