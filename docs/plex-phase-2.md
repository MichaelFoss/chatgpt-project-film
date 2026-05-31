# Plex Phase 2: Import Planning

## Status

- [x] P2-01: Introduce Plex configuration and command scaffolding
      (plex:plan)
- [x] P2-02: Implement Plex client capable of reading movie summaries
      and movie metadata
- [x] P2-03: Implement IMDb extraction, normalized Plex planning items,
      and needs-review detection
- [ ] P2-04: Reuse existing import planning engine to diff Plex IDs
      against event-stream IDs
- [ ] P2-05: Build Plex-specific report formatter (text + --json)
- [ ] P2-06: End-to-end validation against real Plex data

---

## Goal

Provide a read-only planning command that compares the Plex movie
library against the event stream and reports what would be imported.

The planner must not modify the event stream, metadata cache, or
generated catalog.

---

## Scope

### Included

- Read Plex movie data
- Extract IMDb identifiers from Plex metadata
- Read existing event stream data
- Determine which Plex movies are already represented
- Determine which Plex movies would be added
- Determine which Plex movies require manual review
- Produce human-readable planning output
- Produce optional JSON planning output

### Excluded

- Event generation
- Event writes
- Metadata cache writes
- OMDb requests
- Provider metadata refreshes
- Catalog generation
- Catalog writes
- TV show support
- Plex-triggered automation

---

## Architectural Decisions

### Event Stream Remains the Source of Truth

The planner must compare Plex data against the event stream, not against
generated catalog artifacts.

### Metadata Providers Remain Authoritative

Plex is an identification and discovery source only.

Metadata ownership remains unchanged.

### IMDb Is the Only Supported Plex Import Identifier

Current priority:

1. IMDb
2. Needs review

TMDb IDs, TVDb IDs, Plex GUIDs, rating keys, and other Plex identifiers
must not become canonical catalog identifiers.

### Plex IDs Are Discovery Data

Examples:

- plex://movie/...
- rating keys
- Plex GUIDs

These may be used internally during planning but must not be written as
canonical catalog identifiers.

### Plex Rating Keys Are Local Discovery Identifiers

A Plex `ratingKey` identifies an item within this Plex server's library.
It is useful for fetching full Plex metadata after reading summary rows,
but it is not a stable external identifier and must not become a
canonical catalog ID.

Phase 2 should retain Plex discovery fields only when they help explain
planning output or support follow-up inspection.

Required planning fields should stay minimal:

- canonical IMDb ID, when available
- Plex title
- Plex year, when available
- Plex rating key, for follow-up metadata inspection
- reason/status when an item needs review

Do not carry Plex metadata that is not needed for matching against the
event stream or identifying needs-review items.

### Planning Is Read-Only

Phase 2 must not:

- append events
- update metadata cache
- build catalogs
- modify repository state
- call OMDb or other metadata providers
- refresh the metadata cache

---

## Phase 1 Findings

```text
Total movies: 712
With IMDb ID: 705
Missing IMDb ID: 7
Duplicate IMDb IDs: 0
```

Sample metadata records exposed:

```xml
<Guid id="imdb://tt1131724" />
<Guid id="tmdb://269795" />
<Guid id="tvdb://1864" />
```

Conclusion:

Plex reliably exposes IMDb identifiers through movie metadata endpoints
and is suitable as a discovery source.

Movies without IMDb identifiers should be reported as needing manual
review.

---

## Implementation Assumptions

Phase 1 diagnostics showed that Plex movie summary records include the
local Plex `ratingKey`, but do not include IMDb IDs.

The current planning assumption is:

1. Read movie summaries from the Plex Movies library.
2. Extract each movie's Plex `ratingKey`.
3. Fetch full Plex metadata for each movie by `ratingKey`.
4. Extract `<Guid id="imdb://tt..." />` from the full metadata.
5. Compare extracted IMDb IDs against canonical IDs in the event stream.

This does not involve OMDb, provider metadata refreshes, the metadata
cache, or catalog generation.

---

## Desired User Experience

### Human Output

```text
Movies scanned: 712

Importable: 705
Needs review: 7

Already represented: 681
Would add: 24

Would add:

  tt1234567 | Example Movie (2020)
  tt2345678 | Another Movie (1995)

Needs review:

  Family Guy Presents: Blue Harvest
  Family Guy Presents: It's a Trap!
```

### JSON Output

```json
{
  "moviesScanned": 712,
  "importable": 705,
  "needsReview": 7,
  "alreadyRepresented": 681,
  "wouldAdd": 24,
  "plannedItems": [
    {
      "canonicalId": "tt1234567",
      "source": "plex",
      "title": "Example Movie",
      "year": 2020,
      "plexRatingKey": "1234"
    }
  ],
  "needsReviewItems": [
    {
      "title": "Family Guy Presents: Blue Harvest",
      "year": 2007,
      "plexRatingKey": "1718",
      "reason": "Missing IMDb identifier"
    }
  ]
}
```

This schema should remain stable for Phase 2 unless implementation
reveals a concrete reason to change it.

---

## Environment Variables

Required:

```text
PLEX_URL=
PLEX_TOKEN=
```

Existing metadata configuration remains unchanged.

Example:

```text
OMDB_API_KEY=
PLEX_URL=
PLEX_TOKEN=
```

---

## Failure Behavior

Planning should fail fast.

The command must throw or exit non-zero when:

- `PLEX_URL` is missing
- `PLEX_TOKEN` is missing
- the Plex server cannot be reached
- Plex returns an authentication or authorization failure
- Plex returns an unexpected response shape that prevents planning

No partial report should be treated as successful.

---

## Existing Item Matching

A Plex movie is already represented when its canonical IMDb ID already
exists in the event stream.

Metadata cache contents are irrelevant.

Generated catalog contents are irrelevant.

Only the event stream determines whether a Plex item already exists.

---

## Provider Requests

`plex:plan` must not call OMDb or any other metadata provider.

If a later phase introduces provider refresh behavior, provider requests
must be throttled and capped per run. A safe initial default would be:

- maximum provider requests per run: 10
- delay between provider requests: 1 second

Those limits are not part of Phase 2 planning because Phase 2 does not
perform provider requests.

---

## Task Details

### P2-01: Introduce Plex Configuration and Command Scaffolding

Goals:

- Register plex:plan
- Wire PLEX_URL
- Wire PLEX_TOKEN
- Add validation
- Produce placeholder output

Must Not:

- Contact Plex
- Call OMDb or any other metadata provider
- Parse XML
- Read events
- Perform planning

---

### P2-02: Implement Plex Client

Goals:

- Connect to Plex
- Read movie summaries
- Read movie metadata
- Support movie libraries only
- Fail fast on missing config, connection failure, authorization
  failure, or unusable Plex responses

Must Not:

- Diff against events
- Generate reports

---

### P2-03: Implement IMDb Extraction

Goals:

- Extract IMDb identifiers
- Detect missing IMDb identifiers
- Produce normalized Plex planning items with the minimal fields needed
  for matching and review

Output shape should support later planning work.

Expected importable item shape:

```json
{
  "canonicalId": "tt1234567",
  "source": "plex",
  "title": "Example Movie",
  "year": 2020,
  "plexRatingKey": "1234"
}
```

Expected needs-review item shape:

```json
{
  "title": "Family Guy Presents: Blue Harvest",
  "year": 2007,
  "plexRatingKey": "1718",
  "reason": "Missing IMDb identifier"
}
```

Must Not:

- Compare against event stream

---

### P2-04: Reuse Existing Import Planning Logic

Goals:

- Read existing event stream
- Determine represented canonical IDs
- Diff Plex IMDb IDs against existing IDs
- Treat an item as already represented only when the canonical IMDb ID
  is present in the event stream

Must reuse existing import-planning infrastructure where practical.

Must Not:

- Write events

---

### P2-05: Build Plex Report Formatter

Goals:

- Human-readable output
- --json output
- Summary counts
- Would-add list
- Needs-review list
- Stable JSON output matching the Phase 2 schema

Must Not:

- Write events

---

### P2-06: End-to-End Validation

Goals:

- Validate against real Plex data
- Confirm counts are correct
- Confirm no writes occur
- Confirm output quality

Deliverable:

Phase 2 considered complete and ready for Phase 3 planning.

---

## Phase 2 Completion Criteria

Phase 2 is complete when:

- `plex:plan` works against a real Plex server
- missing configuration fails fast
- Plex connection or authorization failures fail fast
- no event writes occur
- no metadata cache writes occur
- no catalog writes occur
- no OMDb or provider requests occur
- output is deterministic for the same Plex and event-stream inputs
- the report correctly identifies:
  - already represented items
  - items that would be added
  - items that need manual review
