# Codex Ignore Workflow Tasks

## Context

The reaction workflow needs a durable way to stop surfacing titles the
user does not want to rate.

Current `Skip` behavior is correct and must not change:

- `Skip` means "do not rate this title right now."
- `Skip` should not persist anything.
- `Skip` should allow the title to appear again in a later reaction
  session.

The new ignore workflow should be event-driven and reversible.

## Design decisions

- Ignoring a title is not a reaction or rating.
- Ignoring a title means "exclude this title from automatic reaction
  prompts."
- A title may be in exactly one of the following states:
  - reacted
  - ignored
  - eligible-unreacted
- Reacted and ignored states are mutually exclusive.
- Ignored titles must be unignored before they can be rated.
- Reacted titles must be reset before they can be ignored.
- Ignored state should be derived from append-only events.
- Ignored titles should not appear in normal `yarn reactions:list`
  output.
- Ignored titles should be listable with
  `yarn reactions:list --ignored`.
- Ignored list output must include canonical IDs so titles can be
  unignored later.
- Unignore should support one or more canonical IDs:

  ```bash
  yarn reactions:unignore <canonicalId> [...<canonicalId>]
  ```

- Stats should distinguish reacted, ignored, and eligible-unreacted
  titles.

## Ticket 0 — Add reaction reset workflow

Add a command to remove the current reaction state from one or more
titles.

Suggested event type:

- `title.reaction.reset`

Command shape:

yarn reactions:reset <canonicalId> [...<canonicalId>]

Requirements:

- Accept one or more canonical IDs.
- Validate every canonical ID before writing events.
- Reset must be event-driven and rebuildable.
- Existing reaction history must remain in the event stream.
- Resetting a title removes it from the current reacted projection.
- Reset titles become eligible-unreacted.
- Reset titles may subsequently be ignored.
- Print a concise summary of affected titles.
- Add tests for single-ID and multi-ID reset.
- Update help text and documentation.

Acceptance criteria:

- Users can remove a reaction without editing history.
- Reset titles are no longer considered reacted.
- Reset titles become eligible for future reaction workflows.

## Ticket 1 — Add ignored-title event model

Add event support for ignoring and unignoring titles.

Suggested event types:

- `title.ignored`
- `title.unignored`

Requirements:

- Events must include `canonicalId`.
- Events should include enough title metadata to remain useful in the
  append-only event log, consistent with existing reaction event
  conventions.
- Validation must reject unknown canonical IDs.
- Validation must reject malformed ignore/unignore events.
- Projection should derive current ignored state from the latest
  relevant ignore/unignore event per canonical ID.
- Ignored state should be projected independently from reaction state
  and must not be represented as a reaction value, rating, or reaction
  status.
- Rebuilds must be deterministic.
- Add tests for:
  - valid ignore event
  - valid unignore event
  - unknown canonical ID rejection
  - malformed event rejection
  - ignore followed by unignore
  - unignore followed by ignore

Acceptance criteria:

- Ignored state is event-sourced.
- Ignored state can be rebuilt from events alone.
- Existing reaction projection behavior remains unchanged for rated
  titles.

## Ticket 2 — Exclude ignored titles from reaction prompts

Update the `react` workflow so ignored titles are excluded from
automatic candidate selection.

Requirements:

- `yarn react` must not prompt ignored titles.
- `yarn react --random` must not prompt ignored titles.
- `yarn react --ordered` must not prompt ignored titles.
- `Skip` must remain non-persistent and must not create ignore events.
- Ignored titles must not be rateable.
- Direct targeting (--id) of an ignored title should fail with a clear
  message explaining that the title must be unignored first.
- Ignored titles must be excluded from default search results.
- An ignored-only search mode is out of scope for this task list.

Add tests proving ignored titles are excluded from normal prompt
candidate selection.

Acceptance criteria:

- Ignored titles no longer appear during normal reaction sessions.
- Skipped titles can still appear later.
- Rated-title behavior is unchanged.

## Ticket 3 — Add ignore action to interactive reaction workflow

Add an explicit `Ignore` action to the reaction prompt.

Requirements:

- The prompt should clearly distinguish `Skip` from `Ignore`.
- Choosing `Ignore` should append a `title.ignored` event.
- Choosing `Ignore` should continue the session until the limit is
  reached, unless existing session behavior dictates otherwise.
- Ignore operations must fail for titles that currently have a reaction
  state; users must reset the reaction before ignoring the title.
- Session output should accurately report written event counts.
- Ignoring a title should not require notes, reasons, or a rating.
- The ignore action should be tested alongside existing `Skip`, `Quit`,
  and rating behavior.

Suggested semantics:

| Action | Meaning                           |
| ------ | --------------------------------- |
| Rate   | Create or update a title reaction |
| Skip   | Do not rate now; ask again later  |
| Ignore | Do not ask again automatically    |
| Quit   | End the session                   |

Acceptance criteria:

- A user can ignore a title from the interactive workflow.
- Ignore writes an event.
- Skip still writes no event.

## Ticket 4 — List ignored titles through `reactions:list --ignored`

Extend `yarn reactions:list` with an ignored-title mode.

Requirements:

- `yarn reactions:list` should continue listing reacted titles.
- Ignored titles must not appear in normal reaction output.
- `yarn reactions:list --ignored` should list currently ignored titles.
- Ignored list output must include canonical IDs.
- Ignored list output should include title, year, media type, and genres
  when available.
- Add tests for normal list output and ignored list output.
- Update CLI help text.
- Update documentation.

Acceptance criteria:

- Ignored titles are discoverable with canonical IDs.
- Normal reaction listing remains focused on actual reactions.

## Ticket 5 — Add `reactions:unignore` command

Add a command to unignore one or more titles by canonical ID.

Command shape:

```bash
yarn reactions:unignore <canonicalId> [...<canonicalId>]
```

Requirements:

- Accept one or more canonical IDs.
- Validate every canonical ID before writing events.
- Append `title.unignored` events.
- Fail clearly if any canonical ID is unknown.
- Unignoring an already-unignored title must be treated as a no-op.
- Print a clear message indicating that the title is not currently
  ignored.
- Do not append an event when no state change occurs.
- Print a concise summary of changed titles.
- Add tests for single-ID and multi-ID unignore.
- Update package scripts, CLI help, and documentation.

Acceptance criteria:

- Users can restore ignored titles to normal reaction eligibility.
- Multiple IDs can be unignored in one command.

## Ticket 6 — Update reaction statistics for ignored titles

Update `yarn reactions:stats` to account for ignored titles.

Suggested categories:

- Total catalog titles
- Total reacted titles
- Total ignored titles
- Total eligible unreacted titles
- Reaction coverage

Definitions:

- `reacted` = titles with current reaction state
- `ignored` = titles with current ignored state
- `eligible unreacted` = catalog titles that are neither reacted nor
  ignored
- `reaction coverage` should remain based on actual reacted titles, not
  ignored titles

Requirements:

- Ignored titles should not inflate reaction coverage.
- Stats should make it obvious how much of the catalog remains eligible
  for rating.
- Preserve media type breakdowns where possible.
- Add tests for stats output with reacted, ignored, and eligible
  unreacted titles.
- Update documentation.

Acceptance criteria:

- Stats clearly separate reacted, ignored, and eligible unreacted
  titles.
- Existing reaction counts remain accurate.

## Ticket 7 — Documentation and workflow review

Review and update all user-facing docs after the ignore workflow is
implemented.

Requirements:

- Explain the difference between `Skip` and `Ignore`.
- Document `yarn reactions:list --ignored`.
- Document `yarn reactions:unignore <canonicalId> [...<canonicalId>]`.
- Document stats behavior.
- Ensure CLI `--help` output matches docs.
- Search for stale language that does not account for ignored titles or
  eligible-unreacted titles.

Acceptance criteria:

- Docs match actual CLI behavior.
- Future users can understand how to ignore and unignore titles without
  reading code.

## Ticket 8 — Remove obsolete typeless reaction-event compatibility logic

Requirements:

- Remove the legacy fallback in `countBufferedEventsByType` that infers
  reaction events from the presence of a `rating` field when
  `event.type` is missing.
- Update any tests that construct synthetic typeless reaction events.
- Confirm all buffered session events continue to use explicit event
  types.
- Preserve existing behavior and output.

Acceptance criteria:

- Event counting relies exclusively on explicit event types.
- No typeless reaction-event fixtures remain.
- All tests pass.

## Ticket 9 — Consolidate reset and unignore command infrastructure

Review `reactions:reset` and `reactions:unignore` for duplicated
command-orchestration logic.

Requirements:

- Reduce duplicated infrastructure shared by:
  - `reactions:reset`
  - `reactions:unignore`
- Extract shared helpers only where doing so improves readability and
  maintainability.
- Preserve all existing CLI behavior, output, and error messages.
- Preserve all existing tests.
- Avoid introducing abstractions that make command-specific behavior
  harder to follow.
- Keep command-specific responsibilities explicit:
  - event creation
  - target-state validation
  - summary formatting
  - projection rebuild behavior
- Do not change event schemas.
- Do not change projections.
- Do not change user-facing workflows.

Acceptance criteria:

- Duplicate command-orchestration code is reduced.
- Reset and unignore behavior remain unchanged.
- Existing tests continue to pass.
- No user-facing behavior changes.

## Out of scope for this task list

- Bulk ignore by search query.
- Ignore reasons.
- Ignore notes.
- Expiring ignores.
- Separate ignore files outside the event stream.
- Treating ignored titles as ratings or reactions.
