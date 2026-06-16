# Review UX Improvements

Goal: Improve title recognition and readability during CLI review and
reaction workflows.

These changes are presentation-only enhancements. No event schema
changes are required.

---

## Ticket 1: Standardize Review Screen Layout

### Problem

Review screens are currently dense and difficult to scan quickly.

Titles run together visually, making it harder to distinguish where one
title ends and the next begins.

### Requirements

Implement a consistent review layout for all review/reaction workflows.

The layout must follow this structure:

```text
After Yang (2021)

[r]eact  [s]kip  [i]nfo  [q]uit

>
```

### Formatting Rules

- Title appears at column 0.
- Year remains on the title line.
- Metadata sections are indented by the same formatting constant.
- Prompt options remain at column 0.
- User input remains at column 0.
- A blank line must separate titles from subsequent review screens.
- Layout should remain readable in a standard terminal window.

### Implementation Notes

- Reuse the same formatting conventions in future review-related
  features where practical.

### Documentation

Update any relevant project design or architecture documentation that
describes review workflow output so the CLI layout becomes part of the
documented design.

---

## Ticket 2: Display Top-Billed Actors During Review

### Problem

Titles alone are often insufficient for recognition.

Actor names are frequently a stronger memory trigger than genres or
release dates.

### Requirements

Display a limited number of top-billed actors directly in the review
screen.

Display the media type (Movie, Series, etc.) above the actor list using
the review layout established in Ticket 1.

Example:

```text
  Movie

  Actors:
    - Jake Gyllenhaal
    - Michelle Monaghan
    - Vera Farmiga
```

### Notes

- Introduce a shared indentation constant instead of hard-coded spacing
  throughout the codebase.
- Use hydrated metadata only.
- Gracefully handle missing actor data.
- Limit output to a small number of actors.
- Prioritize readability over completeness.
- Media type and actors should be rendered using the shared formatting
  conventions established in Ticket 1.

### Validation

Verify that review workflows continue to function normally when actor
metadata is missing.

---

## Ticket 3: Add `[i]nfo` Action

### Problem

Some titles require additional context before a reaction can be
recorded.

### Requirements

Add a new review action:

```text
[i]nfo
```

Selecting this action should display a detailed information view for the
currently selected title and then return the user to the review prompt.

### Information View

Display the following information when available:

- Title
- Year
- Media type
- Genres
- Top-billed actors
- Plot summary
- IMDb URL
- Poster URL

Example:

```text
After Yang (2021)

  Movie

  Genres:
    Drama
    Sci-Fi

  Actors:
    - Colin Farrell
    - Jodie Turner-Smith
    - Justin H. Min

  Plot:
    A family attempts to repair their AI companion
    and uncovers memories from its past.

  IMDb:
    https://www.imdb.com/title/tt8633464/

  Poster:
    https://...
```

### Plot Formatting

- Wrap plot summaries to 72 characters.
- Keep output readable in a terminal environment.

### Behavior

- Display information.
- Return to the review prompt.
- Do not modify ratings.
- Do not modify reactions.
- Do not alter review state.

### Validation

Verify that missing metadata is handled gracefully and that the user
always returns to the active review prompt after viewing information.
