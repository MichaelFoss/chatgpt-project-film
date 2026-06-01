# Source Document Reconciliation

Purpose:

Reconcile repository source documents after completion of the Plex
import project.

Rules:

- Treat repository contents as the source of truth.
- Do not introduce new architecture decisions.
- Do not begin catalog hydration.
- Complete exactly one task at a time.
- Stop after each task for human review.
- Mark completed tasks with [x].
- Show a concise diff summary after each task.

## Repository Facts (Do Not Change)

- Plex import project is complete and merged to `main`.
- Catalog remains event-sourced.
- Catalog membership derives exclusively from
  `events/catalog.events.ndjson`.
- Repository contains 705 `catalog.add` events:
  - 704 imported from Plex.
  - 1 manual event.
- Import workflow is replay-safe and idempotent.
- `data/metadata-cache.json` currently contains one enriched title.
- `data/catalog.json` currently contains one generated catalog record.
- Metadata enrichment infrastructure exists but bulk hydration is not
  complete.
- Temporary Plex snapshot tooling exists only on `tool/plex-snapshot`
  and is not production architecture.

## Global Restrictions

- Do not modify `events/catalog.events.ndjson`.
- Do not modify catalog membership.
- Do not perform metadata enrichment.
- Do not perform catalog hydration.
- Do not modify generated catalog data unless required by validation
  tooling.
- Do not introduce new architecture decisions.

## Phase 1 - Source Registry

- [x] Update `sources/manual/index.md` with detailed implementation
      requirements:
  - Objective:
    - Establish `index.md` as the authoritative source registry for the
      repository.
    - Clearly distinguish Project Instructions
      (`instructions/project-instructions.md`) from source documents.
  - Repository facts:
    - Runtime upload set consists of:
      - `sources/manual/spoiler-policy.md`
      - `sources/manual/recommendation-rules.md`
      - `sources/manual/mid-series-advice.md`
      - `sources/manual/streaming-context.md`
    - Reference/source documents not uploaded by default include:
      - `sources/manual/current-state.md`
      - `sources/manual/data-model.md`
      - `sources/manual/event-schema.md`
      - `sources/manual/decisions.md`
      - `sources/manual/glossary.md`
      - `sources/generated/README.md`
      - architecture/design documents
    - Generated sources may eventually exist under `sources/generated`
      but none currently exist for runtime upload.
  - Required changes:
    - Document the runtime upload strategy explicitly.
    - Align frontmatter guidance with the documented upload strategy.
    - Distinguish runtime sources from architecture and reference
      documents in the registry.
  - Explicit upload strategy:
    - Only the runtime upload set documents are uploaded during runtime.
    - Architecture and reference documents are excluded from runtime
      upload by default.
  - Explicit non-goals:
    - Do not introduce new architectural decisions.
    - Do not begin catalog hydration or metadata enrichment here.
  - Expected completion criteria:
    - `index.md` clearly reflects the authoritative source registry.
    - Upload strategy is documented and consistent with frontmatter.
    - Runtime sources and architecture/reference documents are clearly
      distinguished.

## Phase 2 - Architecture Documents

- [x] Update `sources/manual/data-model.md` with detailed requirements:
  - Catalog membership derives exclusively from
    `events/catalog.events.ndjson`.
  - Repository contains 705 `catalog.add` events.
  - 704 events originated from Plex import; 1 event is manual.
  - Plex import establishes membership only.
  - No watched, rated, liked, or owned intent may be inferred from Plex
    import.
  - Metadata remains in `data/metadata-cache.json`.
  - `data/catalog.json` is a deterministic generated projection from
    events plus metadata cache.
  - Generated catalog output is expected to remain sparse until metadata
    hydration occurs because the metadata cache currently contains only
    one enriched title.
  - Metadata enrichment infrastructure exists but bulk hydration is
    incomplete.
  - Temporary Plex snapshot tooling is not part of production
    architecture.

- [x] Update `sources/manual/event-schema.md` with detailed
      requirements:
  - `catalog.add` event type is implemented.
  - Implemented source values are `plex` and `manual`.
  - `source` field is provenance only; does not contain descriptive
    metadata.
  - Catalog events do not contain descriptive metadata.
  - `metadataLookup` field remains `auto` or `skip`.
  - Catalog generation must not contact external providers.
  - Plex-imported events are durable membership records, not metadata
    snapshots.

## Phase 3 - Decision Log

- [ ] Update `sources/manual/decisions.md` with a detailed list of
      recorded decisions:
  - Plex import is the production ingestion mechanism.
  - Import process is replay-safe and idempotent.
  - Plex data identifies membership and stable IDs only.
  - Plex import does not imply watched status, watch history,
    preference, rating, completion, intentional ownership, or
    recommendation.
  - Snapshot tooling is intentionally excluded from production history.
  - Metadata enrichment is a separate phase following import.
  - Generated catalog state may remain sparse until enrichment coverage
    improves.

## Phase 4 - Runtime Context

- [ ] Update `sources/manual/streaming-context.md` with expanded
      requirements:
  - Plex is now an implemented catalog source.
  - Plex data serves as provenance, not watch history.
  - Plex data is not evidence of user preference.
  - Metadata should be sourced from enrichment/cache rather than raw
    Plex import data.
  - Preserve existing platform-preference guidance.
  - Preserve that Netflix remains a low-friction platform.
  - Preserve that Prime Video remains a higher-friction platform because
    of platform experience and advertising.
  - Preserve that theater viewing remains uncommon.

## Phase 5 - Cleanup

- [ ] Remove `DESIGN.metadata-enrichment.md` from the repository:
  - Remove the document from active repository documentation.
  - Remove any references that imply it is active.
  - Do not replace it with a new design proposal.
  - Git history is considered sufficient preservation.
  - Do not archive, relocate, or convert the document into a runtime
    source.
  - Architectural conclusions should live in durable documentation.

## Phase 6 - Validation

- [ ] Perform validation steps:
  - Update `last_updated` fields in source documents where appropriate.
  - Verify `upload_to_chatgpt` flags match the documented upload
    strategy.
  - Run `yarn check`.
  - Run `yarn test`.
  - Keep Markdown frontmatter valid for all files under `sources/`.
  - Report a concise summary of changed files.

## Completion Criteria

All tasks complete.

Repository documentation accurately reflects the post-Plex-import
architecture.

No catalog hydration work performed.

No new architectural decisions introduced.
