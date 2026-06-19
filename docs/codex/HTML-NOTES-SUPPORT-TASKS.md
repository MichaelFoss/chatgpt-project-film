# HTML Notes Support Tasks

## Ticket 1: Reaction Schema Audit

Status: complete

Audit date: 2026-06-19

### Summary

The complete user-authored field set depends on which layer is being
described.

For current first-class rating workflows, the supported fields are:

- `rating`
- `reasons`
- `notes`

For the lower-level `title.reaction.updated` event and projection
schema, additional user-authored reaction fields are also accepted and
projected:

- `watchStatus`
- `memoryConfidence`
- `reasonTags`
- `householdSuitability`
- `spoilerDiscussion`

`notes` is the only currently projected first-class rating field that is
missing from the HTML review workflow. The wider event/projection-only
fields are not part of the current HTML rating workflow.

### Audited Areas

- Reaction event creation:
  - `scripts/lib/reaction-cli.js`
  - `scripts/lib/reaction-apply-draft.js`
  - `scripts/lib/reaction-reset.js`
  - `scripts/lib/reaction-unignore.js`
- Reaction event validation and projection:
  - `scripts/lib/title-reactions.js`
  - `scripts/lib/reaction-validation.js`
- Reaction CLI workflows:
  - `scripts/lib/reaction-cli.js`
  - `scripts/lib/reaction-query.js`
  - `scripts/lib/reaction-stats.js`
- Reaction import/export workflows:
  - `scripts/lib/reaction-apply-draft.js`
  - `scripts/lib/reaction-query.js`
- Generated source projection:
  - `scripts/build-generated-sources.js`
- Documentation:
  - `sources/manual/event-schema.md`
  - `sources/manual/data-model.md`
  - `scripts/README.md`
  - `data/README.md`
  - `events/README.md`
- Tests:
  - `tests/catalog/title-reactions.test.js`
  - `tests/catalog/reaction-cli.test.js`
  - `tests/catalog/reaction-apply-draft.test.js`
  - `tests/catalog/reaction-export.test.js`
  - `tests/catalog/reaction-validation.test.js`

### User-Authored Reaction Fields

| Field                  | Supported where                                                                                                                              | HTML workflow status                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `rating`               | CLI event creation, HTML local storage, HTML draft export, draft import, event validation, projection, list/export output, generated sources | Present                                  |
| `reasons`              | CLI event creation, HTML local storage, HTML draft export, draft import, event validation, projection, list/export output, generated sources | Present                                  |
| `notes`                | CLI event creation, event validation, projection, list/export output, generated sources                                                      | Missing                                  |
| `watchStatus`          | Event validation, projection, generated sources                                                                                              | Not part of current HTML rating workflow |
| `memoryConfidence`     | Event validation, projection, generated sources                                                                                              | Not part of current HTML rating workflow |
| `reasonTags`           | Event validation, projection, generated sources                                                                                              | Not part of current HTML rating workflow |
| `householdSuitability` | Event validation, projection, generated sources                                                                                              | Not part of current HTML rating workflow |
| `spoilerDiscussion`    | Event validation, projection, generated sources                                                                                              | Not part of current HTML rating workflow |

### Layer Findings

`scripts/lib/reaction-cli.js` creates first-class reaction events with
`rating`, optional `notes`, and optional `reasons`. The interactive CLI
prompts for notes and reasons after a rating selection and pre-fills
existing projected notes/reasons when updating a reacted title.

`yarn react --html` currently stores and exports only `titleId`,
`rating`, and `reasons`. Its draft export intentionally filters out
reasons-only records and requires a valid rating. It has no notes input,
no notes local storage field, and no draft notes field.

`scripts/lib/reaction-apply-draft.js` accepts draft reactions with only
`titleId`, `rating`, and `reasons`. It rejects unknown fields, so
`notes` cannot currently round-trip through HTML draft import.

`scripts/lib/title-reactions.js` validates and projects a broader
`title.reaction.updated` schema. It accepts any non-empty update event
with one or more of `rating`, `watchStatus`, `memoryConfidence`,
`reasonTags`, `notes`, `reasons`, `householdSuitability`, or
`spoilerDiscussion`.

`scripts/lib/reaction-validation.js` validates the generated projection
for required `rating`, optional string `notes`, and normalized
`reasons`. It does not currently validate the wider projected enum
fields.

`scripts/lib/reaction-query.js` and `yarn reactions:export` expose only
`rating`, `notes`, and `reasons` from projected reactions, plus joined
catalog display metadata.

`scripts/build-generated-sources.js` renders all projected reaction
fields that are present, including the wider event/projection-only
fields.

### Conclusion

The statement "the complete set is `rating`, `reasons`, `notes`" is true
for the current first-class CLI/HTML/import/export rating workflow, but
not true for the lower-level event and projection schema.

For the HTML review workflow, `notes` is the only missing first-class
field from the current rating workflow. The additional projected fields
belong to a separate schema-capability decision and should not be added
to HTML notes support unless that workflow is intentionally expanded
beyond ratings, reasons, and notes.
