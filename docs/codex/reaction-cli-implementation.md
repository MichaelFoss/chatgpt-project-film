# Reaction CLI Implementation

## Goal

Implement a CLI workflow that allows the user to record title reactions
with minimal friction.

The purpose of this feature is to collect preference signals from an
existing catalog of watched titles.

The CLI must:

- Never modify existing events.
- Append new events only.
- Default to extremely short sessions.
- Be resumable.
- Be testable.
- Avoid exposing external ratings or recommendation signals to the user.

---

## Design Principles

### Event Sourcing

All reaction data is append-only.

Do not edit or delete prior events.

If a user re-reacts to a title, write a new reaction event.

Reducers determine the current reaction state.

### User Experience

The CLI should optimize for:

- Speed
- Simplicity
- Low cognitive load
- Repeatability

The CLI should not feel like a project.

A user should be able to run:

```bash
yarn react
```

and complete a reaction in under 15 seconds.

### Metadata Exposure

Display only enough metadata to identify the title.

Allowed examples:

```txt
The Matrix (1999)
Movie · Action, Sci-Fi
```

Do not display:

- IMDb rating
- Rotten Tomatoes scores
- Popularity rankings
- Recommendation scores
- Plot summaries
- Generated opinions

## Dependencies

Use:

```txt
commander
@inquirer/prompts
```

Do not build custom argument parsing.

Do not build custom interactive menu systems.

## Explicit Non-Goals

The following are intentionally out of scope for the MVP:

- Recommendation generation
- Preference inference
- Favorite actor detection
- Favorite genre detection
- Popularity ranking
- External API calls
- ChatGPT integration
- Web UI
- Batch editing
- Bulk imports
- File-driven queues
- Metadata enrichment
- Rating migration tools

## Initial Commands

### React

```bash
yarn react
```

Default behavior:

```txt
limit = 1
unreacted titles only
```

---

### Search

```bash
yarn search <query>
```

Example:

```bash
yarn search matrix
```

Displays matching titles and canonical IDs.

No writing occurs.

## Initial Flags

### React Flags

```bash
--limit <n>
--limit none
--movies
--tv
--random
--id <canonicalId>
--help
-?
```

Note:

Do not implement popularity-based selection in the MVP.

## Session Behavior

### Default Session

```bash
yarn react
```

Equivalent to:

```bash
yarn react --limit 1
```

---

### Reaction Options

Initial reactions:

```txt
Loved
Liked
Mixed
Disliked
Hated
```

Additional actions:

```txt
Skip
Quit
```

Naming can change during implementation.

## Buffered Writes

All reactions are stored in memory during a session.

No event files are written until:

- session completes successfully
- user selects Save & Quit

## Quit Flow

Selecting Quit opens a secondary menu.

Options:

```txt
Abort
Save & Quit
Cancel
```

Behavior:

### Abort

Discard all buffered reactions.

Write nothing.

Exit.

### Save & Quit

Write all buffered reactions.

Do not write the current in-progress title.

Display a message indicating the current title was not written.

Exit.

### Cancel

Return to the exact point where the user left the session.

## Filtering Rules

### Movies Filter

```bash
--movies
```

Only movie titles are eligible.

### TV Filter

```bash
--tv
```

Only television titles are eligible.

### Random Filter

```bash
--random
```

Randomizes selection after all other filters are applied.

## Re-Reaction Support

### Search Command

Provide a dedicated search command:

```bash
yarn search <query>
```

Output:

```txt
Canonical ID
Title
Year
Media Type
```

Example:

```txt
title:abc123
The Matrix (1999)
Movie
```

### Direct ID Selection

```bash
yarn react --id <canonicalId>
```

Allows reacting to a specific title.

This intentionally supports re-reaction.

Do not automatically block titles that already have reactions.

## Testing Requirements

Add automated tests before enabling real writes.

Required coverage:

- default limit = 1
- limit n
- limit none
- movies filter
- tv filter
- random preserves filter constraints
- unreacted selection
- id selection
- quit abort
- quit save & quit
- quit cancel
- append-only write behavior

## Implementation Phases

Implementation phases are milestone checkpoints.

The detailed behavior requirements defined above take precedence over
the abbreviated task lists below.

Tasks listed within phases are summaries, not exhaustive implementation
steps.

### Phase 1

CLI Skeleton

Tasks:

- create command entrypoint
- install commander
- add help output
- validate argument parsing

Deliverable:

CLI launches and parses arguments.

---

### Phase 2

Catalog Loading

Tasks:

- load generated catalog
- load reaction state
- select first eligible title

Deliverable:

CLI prints selected title.

---

### Phase 3

Reaction Prompting

Tasks:

- display title
- collect reaction
- buffer in memory
- print simulated event writes

Deliverable:

End-to-end dry run.

---

### Phase 4

Session Controls

Tasks:

- limit support
- skip support
- quit flow
- save & quit support

Deliverable:

Multi-title sessions work without writing files.

---

### Phase 5

Real Event Writing

Tasks:

- append event generation
- append event persistence
- tests

Deliverable:

Reactions persist to event stream.

---

### Phase 6

Discovery Features

Tasks:

- search command
- id targeting
- random selection

Deliverable:

Users can locate and re-react to specific titles.
