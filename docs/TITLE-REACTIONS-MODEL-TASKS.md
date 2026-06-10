# Title Reactions Model Tasks

Implement the MVP title reactions model.

This task creates the foundational event, projection, and generated
source workflow for user title reactions. It must remain intentionally
boring: accept manually authored, perfectly structured events; validate
them; project them; and generate ChatGPT-readable reaction context.

## Current Project State

- Plex import is complete.
- OMDb hydration is complete.
- `data/catalog.json` is the canonical enriched title catalog
  projection.
- Generated catalog source documents already exist under
  `sources/generated/`.
- Upload bundle inclusion has already been validated.
- Catalog ownership/access does not imply watched status, preference,
  liking, or recommendation strength.
- All generation must remain deterministic and offline.

## Goal

Add a title reaction event model that allows manually authored reactions
to known catalog titles, then materialize those reactions into
deterministic JSON and Markdown outputs useful to ChatGPT Project
recommendations and viewing guidance.

## Scope

Implement only the title reactions model.

Do not implement:

- rating-entry CLI helpers
- random unrated title workflows
- voice workflows
- web UI
- fuzzy title matching
- title lookup by name
- unknown-title resolution
- recommendation scoring engines
- inference from natural language
- provider calls
- Plex calls
- preference inference from ownership/access
- season-level or episode-level reactions

Future entry helpers may be built later, but this milestone should
assume events are manually authored and already structurally correct.

## Required Files

Add:

- `events/title-reactions.events.ndjson`
- `data/title-reactions.json`
- `sources/generated/title-reactions-summary.md`

Add or update scripts as needed for:

- validating title reaction events
- building `data/title-reactions.json`
- generating `sources/generated/title-reactions-summary.md`

Prefer existing project conventions for scripts, library modules,
errors, generated JSON writing, generated Markdown writing, tests, and
package scripts.

## Event Stream

Use:

```text
/events/title-reactions.events.ndjson
```

Each line is one JSON object.

Required event fields:

```ts
eventId: string;
type: 'title.reaction.updated';
occurredAt: string; // ISO timestamp
canonicalId: string;
```

Optional update fields:

```ts
rating?: number; // integer 1-10
watchStatus?: "completed" | "incomplete" | "abandoned" | "planned";
memoryConfidence?: "high" | "medium" | "low";
reasonTags?: string[];
notes?: string;
householdSuitability?: "any" | "kid" | "teen" | "adult";
spoilerDiscussion?: "premise-only" | "known-safe" | "full";
```

`reasonTags` are free-form user-defined tags. No controlled vocabulary
is required for MVP.

At least one optional update field must be present.

Do not include `title` in reaction events. Human-readable titles must be
joined from `data/catalog.json` during projection/source generation.

Do not include `sentiment`. Sentiment is intentionally out of scope for
MVP. Future entry tooling may accept sentiment-like input and convert it
into `rating`, but stored events and projections should use only
`rating`.

## Rating Semantics

`rating` is a personal-fit rating, not an objective quality score.

Validation:

- must be an integer
- minimum `1`
- maximum `10`

Suggested interpretation for generated docs and manual guidance:

```text
1-2  = strong negative personal fit
3-4  = negative personal fit
5-6  = mixed or neutral personal fit
7-8  = positive personal fit
9-10 = strong positive personal fit
```

Do not store the above interpretation as a separate field.

## Watch Status Semantics

Use only these statuses:

```text
completed
incomplete
abandoned
planned
```

Meanings:

- `completed`: watched enough to evaluate as complete for recommendation
  purposes.
- `incomplete`: started but not finished; not necessarily negative.
- `abandoned`: intentionally stopped; usually a negative or cautionary
  signal, but reasons/notes should explain why.
- `planned`: intends to watch; not preference evidence yet.

Do not add `paused`, `skipped`, or `unknown` for MVP. Missing field
means no assertion.

Series-level only: a series reaction applies to the whole title, not to
seasons or episodes.

## Spoiler Discussion Semantics

Use only:

```text
premise-only
known-safe
full
```

Meanings:

- `premise-only`: avoid plot developments, twists, endings, hidden
  identities, and future-season details.
- `known-safe`: the user has seen or already knows major elements, but
  responses should still avoid spoilery details unless directly
  relevant.
- `full`: the user explicitly allows full discussion for that title.

Missing field should be treated conservatively by generated docs and
project guidance. Do not weaken the project’s global spoiler-safe
behavior.

## Household Suitability Semantics

Use only:

```text
any
kid
teen
adult
```

This is the user’s household-specific suitability judgment, not an
MPAA/content rating. It should not be inferred from provider metadata.

Missing field means no assertion.

## Validation Rules

Implement validation that fails loudly for bad events.

An empty `events/title-reactions.events.ndjson` file is valid and should
produce an empty projection plus a valid generated source document.

Required validation:

- event file can be empty initially, but if present, every non-empty
  line must be valid JSON
- `eventId` is required and non-empty
- `eventId` values must be unique within the event stream
- `type` must equal `title.reaction.updated`
- `occurredAt` is required and must be parseable as an ISO timestamp
- `canonicalId` is required and non-empty
- `canonicalId` must exist in `data/catalog.json`
- at least one optional update field must be present
- `rating`, if present, must be integer `1` through `10`
- enum fields must be one of the allowed values
- `reasonTags`, if present, must be an array of non-empty strings
- `notes`, if present, must be a non-empty string
- event lines should not include unknown top-level fields unless
  existing project conventions strongly prefer leniency

Recommended strictness: prefer rejecting unknown fields so accidental
typos do not silently become lost data.

## Projection Output

Generate:

```text
data/title-reactions.json
```

Projection shape should be deterministic and keyed by `canonicalId`,
similar to `data/catalog.json`.

One projected record per `canonicalId` with at least:

```ts
{
  canonicalId: string;
  updatedAt: string; // occurredAt from latest applied event for this title
  eventIds: string[]; // applied event IDs in chronological/application order
  rating?: number;
  watchStatus?: "completed" | "incomplete" | "abandoned" | "planned";
  memoryConfidence?: "high" | "medium" | "low";
  reasonTags?: string[];
  notes?: string;
  householdSuitability?: "any" | "kid" | "teen" | "adult";
  spoilerDiscussion?: "premise-only" | "known-safe" | "full";
}
```

Projection rules:

- Apply events in file order. `occurredAt` is informational and does not
  affect projection ordering.
- Later events overwrite scalar fields for the same `canonicalId`.
- `reasonTags` should replace the previous list when supplied, not
  append implicitly.
- `notes` should replace previous notes when supplied, not append
  implicitly.
- Preserve `eventIds` for auditability.
- Include only titles that have at least one reaction event. Do not
  generate empty reaction records for catalog titles without reactions.
- Sort output deterministically by canonical ID or existing project
  convention.
- Do not copy title metadata into `data/title-reactions.json`; titles
  are joined only for generated Markdown display.

## Generated Source Output

Generate:

```text
sources/generated/title-reactions-summary.md
```

Frontmatter:

```yaml
title: Generated Title Reactions Summary
status: generated
last_updated: YYYY-MM-DD
upload_to_chatgpt: true
generated_from:
  - data/title-reactions.json
  - data/catalog.json
```

The document should be concise and optimized for ChatGPT recommendation
context.

The generated summary is recommendation context, not a complete audit
dump. Prefer compact retrieval-friendly summaries over exhaustive
field-by-field listings.

Include:

- scope caveat: ratings are personal-fit ratings, not objective quality
- scope caveat: ownership/access is separate from watched status and
  preference
- total reacted titles
- rating interpretation guide
- highest-rated titles
- lowest-rated titles
- abandoned titles
- incomplete titles
- planned titles
- family/household suitability sections when data exists
- spoiler-discussion allowances when data exists
- reason tag summary when data exists
- per-title reaction list or compact table useful for retrieval

Use human-readable title/year/media type from `data/catalog.json` for
display.

Avoid plot summaries and provider descriptions in this generated
reaction summary.

Do not infer preference for titles without reaction records.

If no reactions exist yet, generate a valid source document that clearly
states no title reactions are currently recorded.

## Package Scripts

Add scripts using existing naming conventions.

Suggested names:

```json
{
  "build:title-reactions": "node scripts/build-title-reactions.js"
}
```

If source generation is centralized, ensure `yarn build:sources` also
emits or preserves `title-reactions-summary.md` as appropriate.

Use the project’s existing build flow conventions. Do not break existing
scripts.

## Tests

Add tests covering:

- valid minimal event with only `rating`
- valid minimal event with only `watchStatus`
- rejection of missing required fields
- rejection of unknown `canonicalId`
- rejection of duplicate `eventId`
- rejection of invalid enum values
- rejection of invalid rating values including decimals, `0`, and `11`
- rejection of event with no update fields
- rejection of unknown fields if strict validation is implemented
- projection merge behavior for multiple events on one title
- deterministic projection output
- generated Markdown frontmatter
- generated Markdown joins titles from `data/catalog.json`
- generated Markdown does not include plot summaries
- empty event stream behavior
- no provider/Plex/network calls during reaction build or source
  generation

Update upload artifact tests if needed to ensure
`title-reactions-summary.md` is included when `upload_to_chatgpt: true`.

## Documentation

Update relevant docs minimally.

At minimum, document:

- manual event shape
- rating semantics
- watch status semantics
- household suitability semantics
- spoiler discussion semantics
- build command(s)
- strict canonical ID requirement

Prefer existing docs locations such as `README.md`,
`sources/manual/data-model.md`, or a focused generated/runtime sources
README if appropriate.

Do not over-document future CLI workflows.

## Commands To Run

Run:

```bash
yarn build:title-reactions
yarn build:sources
yarn run check
yarn test
```

If the actual script name differs, run the equivalent project commands
and report the difference.

## Return

Report:

- files changed
- event/projection/source files created
- package scripts added
- tests added or updated
- commands run
- architectural decisions made
- any concerns or follow-up recommendations
