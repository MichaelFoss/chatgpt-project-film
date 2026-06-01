# Plex Phase 3: Import Writes

## Status

- [x] P3-01: Add roadmap document
- [x] P3-02: Add review-map support
- [x] P3-03: Add plex:import scaffolding
- [x] P3-04: Implement plex:import --write
- [ ] P3-05: Controlled import validation
- [ ] P3-06: Full import validation

## Purpose

Capture the agreed Phase 3 import architecture before implementation
begins.

This is a documentation-only phase. P3-01 must not introduce production
code changes, test changes, or refactoring.

## Goal

Import Plex-discovered movies into the catalog event stream.

## Commands

- Keep `plex:plan` as the read-only visibility command.
- Add `plex:import`.
- `plex:import --plan` should reuse the existing planning logic and
  produce equivalent output to `plex:plan`.
- `plex:import --write` will be the only mode allowed to append events.

## Events

- Continue using standard catalog events.
- Write one `catalog.add` event per eligible Plex movie.
- Event shape remains consistent with existing catalog imports.
- `source` should be `plex`.
- Do not persist Plex-specific metadata in catalog events.
- Catalog membership remains derived exclusively from the event stream.
- Generated catalog artifacts (catalog files, indexes, caches, and other
  derived outputs) must never be treated as the source of truth.

## Review Map

Add a future configuration file:

```text
config/plex-review.json
```

The structure should support:

```json
{
  "ignoredItems": [],
  "manualMappings": []
}
```

### Ignored Items

Ignored items should store:

- `plexRatingKey`
- title/year at time of ignore for human review
- optional reason

### Manual Mappings

Manual mappings should store:

- `plexRatingKey`
- title/year at time of mapping
- canonical IMDb ID
- optional reason

### Rules

1. Native IMDb GUID wins.
2. Manual mapping may supply a canonical ID when Plex lacks an IMDb
   GUID.
3. Ignored items are excluded from import and needs-review output.
4. Remaining unmatched items appear in needs-review.

## Phase 3 Success Criteria

Phase 3 is complete only when all of the following are true:

### Idempotent Imports

- Running `plex:import --write` twice without catalog changes must
  append events only on the first run.
- The second run must append zero events.
- Existing catalog membership must continue to be determined from the
  event stream, not generated catalog artifacts.

### No Plex Metadata in Events

- `catalog.add` events created by Plex import must contain only the
  standard catalog event fields already used by the system.
- Plex-specific metadata must never be persisted into the event stream.
- Examples of forbidden event data include:
  - Plex rating keys
  - Plex GUIDs
  - Plex paths
  - Plex library identifiers
  - Plex titles
  - Plex-derived metadata blobs

### No Provider Calls During Import

- Plex import must not call OMDb or any future metadata providers.
- Plex import is an event-generation workflow only.
- Metadata enrichment remains a separate workflow.
- Import behavior must be deterministic for the same Plex responses.

### Review Map Behavior

- Manual mappings may make a Plex item importable.
- Ignored items must not be imported.
- Remaining unmatched items must continue to appear in needs-review
  output.

## Phase Breakdown

### P3-01: Add Roadmap Document

Add this roadmap document.

### P3-02: Add Review-Map Support

Add support for the future `config/plex-review.json` review map.

### P3-03: Add plex:import Scaffolding

Add `plex:import` command scaffolding and `--plan` / `--write` mode
handling.

### P3-04: Implement plex:import --write

Append standard `catalog.add` events for eligible Plex movies.

### P3-05: Controlled Import Validation

Validate write behavior with a controlled import target before a full
import. Validation must confirm idempotent imports, no provider calls,
and no Plex metadata in written events.

### P3-06: Full Import Validation

Validate the full import workflow and confirm repeat runs do not append
duplicate events. Validation must confirm idempotent imports, no
provider calls, and no Plex metadata in written events.

## Acceptance

- Markdown follows repository style.
- Roadmap is clear enough that future tasks can be implemented without
  revisiting architecture decisions.
