# HTML Review Workflow Tasks

## Overview

This milestone introduces an HTML-based review mode that reuses the
existing `yarn react` title-selection pipeline while preserving the
current event-sourced architecture.

The HTML workflow is an alternative renderer for the existing review
workflow. It is not a web application, API, service, database, or
replacement for the CLI.

The event store remains the source of truth.

Goals:

- Increase reaction-entry throughput through visual recognition.
- Reuse existing review-session selection logic.
- Preserve existing event-writing workflows.
- Prevent loss of work through LocalStorage persistence.
- Keep implementation lightweight and fully static.

---

## Ticket 1: Add HTML Review Mode to `yarn react`

### Objective

Add an HTML renderer that reuses the existing review-session
title-selection pipeline.

### Requirements

- Add a `--html` flag to `yarn react`.
- Reuse the same title-selection logic currently used by CLI review
  sessions.
- Respect existing options:
  - `--random`
  - `--ordered`
  - `--limit`
  - any existing selection-related options
- Do not duplicate title-selection logic.
- HTML review mode must consume the same selected title list that would
  otherwise be shown in the CLI review workflow.
- The HTML renderer must be invoked from the existing review-session
  workflow. Do not create a separate title-selection pipeline for HTML
  mode.

### HTML Defaults

Introduce:

```js
const DEFAULT_HTML_LIMIT = 100;
```

Behavior:

- `yarn react --html`
  - defaults to 100 titles
- `yarn react --html --limit 25`
  - uses 25 titles
- `yarn react --html --limit 200`
  - uses 200 titles

### Output

Generate a static HTML artifact containing the selected review session.

The implementation should print the generated HTML file location in a
format that is easy to open from a terminal.

A clickable file URL is preferred over automatically opening the
browser.

Example:

```text
file:///path/to/generated/review.html
```

Acceptance criteria:

- Existing CLI review mode remains unchanged.
- HTML mode receives the exact same title set the CLI would receive.
- HTML mode works with random and ordered review sessions.

---

## Ticket 1.5: Clean Up Duplicate Search Result Output

Investigate duplicate search-result output in `yarn react --search`.

Current behavior:

1. Search results are printed.
2. The selection prompt reprints the same results.

Expected behavior:

Only one presentation of search results should be shown before title
selection.

Requirements:

- Preserve existing search-selection behavior.
- Avoid duplicate result rendering.
- Update tests as needed.

---

## Ticket 2: Build Poster Grid Review UI

### Objective

Create a visual review experience optimized for rapid title recognition.

### Requirements

Render selected titles as a responsive poster grid.

Use a grid layout for this milestone.

Do not implement a one-title-at-a-time review flow.

Each card should display:

- poster
- title
- year
- genres
- top-billed actors

Do not add additional metadata in this milestone unless it is required
to support existing functionality described in this document.

The primary goal is fast recognition, not deep research.

### UI Requirements

Each card must allow selecting a rating from the existing rating scale:

```text
10 Exceptional
 9 Loved
 8
 7 Liked
 6
 5 Mixed
 4
 3 Disliked
 2
 1 Hated
```

The UI should visually communicate the same rating model used by the
CLI.

Acceptance criteria:

- Ratings 1–10 are supported.
- Current selections are visually obvious.
- Large batches remain easy to scan.

---

## Ticket 3: Browser-Side Reaction Capture and Persistence

### Objective

Allow reactions to be collected entirely in the browser without writing
events.

### Requirements

Store review progress in LocalStorage.

Use a namespaced key such as:

```text
film-reaction-review-v1
```

Persist:

- title identifier
- rating (1–10)
- reasons

Reasons should follow existing repository conventions:

```text
lowercase
comma-delimited
```

Examples:

```text
time travel
time travel, sci-fi
thought-provoking, dystopian
```

### Reset Workflow

Provide a Reset button.

Behavior:

- confirmation prompt required
- clear all HTML review LocalStorage data
- reload page

Reset behavior must not attempt reconciliation with the current page
contents.

Acceptance criteria:

- Page refresh does not lose work.
- Browser restart does not lose work.
- Reset completely clears stored progress.

---

## Ticket 3.5: Add Reason Entry UI

### Objective

Allow users to capture reaction reasons alongside ratings directly in
the HTML review workflow.

### Requirements

Add a reason-entry field to each title card. Use a single-line text
input.

The field should be positioned near the rating controls.

Each title card should support:

- rating
- reasons

### Input Format

Reasons should use the same format as the existing CLI workflow:

```text
lowercase
comma-delimited
```

Examples:

```text
time travel
time travel, sci-fi
thought-provoking, dystopian
```

### Normalization

Normalize entered reasons using the same rules as the existing reaction
pipeline wherever possible.

At minimum:

- trim leading and trailing whitespace
- collapse empty entries
- support comma-delimited values
- preserve lowercase repository conventions

Normalization should occur before persistence and export.

### Persistence

Reasons must participate in the same LocalStorage workflow introduced in
Ticket 3.

Page refreshes and browser restarts must not lose entered reasons.

### Export

Reasons must be included in draft exports introduced in Ticket 4.

Exported reasons should be emitted as arrays.

Example:

```json
{
  "titleId": "tt0133093",
  "rating": 9,
  "reasons": ["sci-fi", "action"]
}
```

### UX Requirements

The reason field should remain lightweight.

The goal is rapid entry, not form completion.

Users should be able to:

- click into the field
- enter comma-delimited reasons
- move immediately to the next title

No autocomplete is required for this milestone.

No reason taxonomy is required for this milestone.

### Acceptance Criteria

- Each title card contains a reason-entry field.
- Reasons survive page refreshes.
- Reasons survive browser restarts.
- Reasons are included in draft exports.
- Reasons are exported as normalized arrays.
- Workflow remains fast for large review sessions.

---

## Ticket 4: Export Reaction Drafts

### Objective

Export collected reactions into a draft artifact suitable for later
import.

### Requirements

Provide an Export button.

Only titles with captured reactions should be exported.

Do not export unrated titles, placeholder entries, empty reactions, or
other unchanged records.

Export a JSON file.

Example structure:

```json
{
  "generatedAt": "2026-06-18T12:00:00.000Z",
  "titleCount": 100,
  "reactions": [
    {
      "titleId": "tt0133093",
      "rating": 9,
      "reasons": ["sci-fi", "action"]
    }
  ]
}
```

Notes:

- Ratings must be numeric values from 1–10.
- Reasons should be exported as normalized arrays.
- Export format is a draft format, not an event format.

Acceptance criteria:

- Export works without a server.
- Draft can be saved locally.
- Draft contains only reacted titles.
- Draft contains all captured reactions.

---

## Ticket 4.5: Require Ratings for Exportable Reactions

### Objective

Ensure exported reaction drafts only contain complete reactions that can
be imported through the event pipeline.

### Requirements

A reaction is considered exportable only if it contains a valid rating.

Reasons without ratings are not exportable reactions.

Example:

```json
{
  "titleId": "tt0133093",
  "reasons": ["slow"]
}
```

must never appear in an exported draft.

### Browser Behavior

Reason fields should remain visible at all times.

When a title is unrated:

- reason input is disabled
- existing reason text remains visible
- reason text is not cleared automatically

When a rating is selected:

- reason input becomes editable

When a rating is removed:

- reason input becomes disabled again
- existing reason text remains visible

### Export Behavior

Export only titles that contain valid ratings.

Exported reactions must contain:

```json
{
  "titleId": "tt0133093",
  "rating": 9,
  "reasons": ["sci-fi", "action"]
}
```

Do not export:

- unrated titles
- reasons-only entries
- placeholder entries
- empty reactions

### Acceptance Criteria

- Reasons are editable only when a rating exists.
- Existing reason text survives rating removal.
- Exported drafts contain only rated reactions.
- Reasons-only entries never appear in exported drafts.
- Export format is finalized for import.

---

## Ticket 5: Add `reactions:apply-draft`

### Objective

Import exported reaction drafts through the existing event-writing
pipeline.

### Requirements

Add:

```bash
yarn reactions:apply-draft <draft-file>
```

### Validation

Validate the entire draft before writing anything.

At minimum validate:

- draft structure is valid
- title IDs exist
- every reaction contains a rating
- ratings are integers from 1–10
- reasons satisfy existing validation rules
- duplicate title IDs are rejected

Drafts containing reasons without ratings are invalid.

Example:

```json
{
  "titleId": "tt0133093",
  "reasons": ["slow"]
}
```

The entire import must fail validation.

### Transaction Semantics

Import must be all-or-nothing.

Workflow:

```text
read draft
↓
validate entire draft
↓
create events
↓
append events
↓
rebuild projections
```

If any validation fails:

```text
write nothing
```

No partial imports.

### Event Handling

The browser must never generate events.

The import command is responsible for:

- converting draft entries into events
- appending events
- rebuilding projections

Acceptance criteria:

- Invalid drafts write nothing.
- Valid drafts write all reactions.
- Existing reaction validation remains authoritative.
- Event store remains the sole source of truth.

---

## Ticket 5.1: Add Disabled Styling For Reasons

Add explicit disabled styling for HTML review reason inputs.

Requirements:

- Disabled reason inputs remain visible.
- Existing reason text remains readable.
- Disabled state is visually obvious.
- Do not change behavior.
- Do not change LocalStorage structure.
- Do not change export logic.
