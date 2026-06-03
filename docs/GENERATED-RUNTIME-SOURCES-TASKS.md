# Generated Runtime Sources Task

Implement Phase B: generated runtime source architecture.

Current project state:

- Plex import is complete.
- `events/catalog.events.ndjson` is the canonical ownership/event
  stream.
- OMDb hydration is complete.
- `data/metadata-cache.json` contains hydrated provider metadata.
- `data/catalog.json` is the enriched usable catalog projection.
- Catalog generation must remain deterministic and offline.
- No provider calls should occur during tests, checks, catalog builds,
  or source generation.

## Goal

Generate ChatGPT-friendly Markdown source documents from hydrated
catalog data.

## Critical Architectural Constraint

These generated documents are the primary artifacts that will ultimately
be uploaded into the ChatGPT Project as source documents.

Optimize for retrieval quality, factual grounding, and compactness.

Do not simply mirror catalog data into multiple documents. Each
generated document should provide a distinct retrieval view over the
same catalog so that uploaded source context remains useful and
non-redundant.

Generated source documents should be treated as the public knowledge
layer built from the catalog projection.

## Scope

- Implement generated runtime source documents only.
- Do not implement preference/reaction events.
- Do not implement recommendation scoring.
- Do not implement upload bundle changes beyond ensuring generated docs
  are valid source documents.
- Do not add provider calls.
- Do not infer that owned media is liked media.
- Avoid spoiler-prone plot/detail content.

## Required Generated Files

Create:

- `sources/generated/catalog-summary.md`
- `sources/generated/catalog-by-genre.md`
- `sources/generated/catalog-by-decade.md`
- `sources/generated/catalog-discovery.md`

Add:

- `scripts/build-generated-sources.js`
- package script: `build:sources`

## Recommended Implementation

1. Read `data/catalog.json`.
2. Generate deterministic Markdown with stable sorting.
3. Add frontmatter compatible with existing source validation/build
   tooling:
   - `title`
   - `status: generated`
   - `last_updated`
   - `upload_to_chatgpt: true`
   - `generated_from`
4. Keep output retrieval-oriented and concise.

## Catalog Model Decision

`catalog-by-decade.md` requires a normalized year.

If `data/catalog.json` does not expose one yet, add a normalized
optional field:

```ts
releaseYear?: number;
```

Derive it from OMDb `Year` during catalog build, not from raw OMDb
payload during source generation.

Source generation should consume normalized catalog output, not provider
internals.

Optional normalized fields if easy and low-risk:

```ts
runtimeMinutes?: number;
contentRating?: string;
```

Document and implement only what is required for generated source docs.

## Document Expectations

### catalog-summary.md

Include:

- total enriched catalog records
- media type counts
- top genres
- rating coverage
- decade coverage
- explicit caveat that ownership/access does not imply watched or liked

### catalog-by-genre.md

- group by genre
- list titles with year and media type when available
- stable alphabetical ordering

### catalog-by-decade.md

- group by decade using normalized release year
- include unknown/undated section only if needed
- stable ordering

### catalog-discovery.md

Factual discovery-oriented slices only.

Not recommendations.

Examples:

- highly rated titles by IMDb, Rotten Tomatoes, or Metacritic
- genre clusters
- notable decade clusters
- titles with strong critical metadata coverage

Include a caveat that these are catalog discovery views, not
personalized recommendations.

Avoid plot summaries.

## Testing

Add tests for:

- generated source output
- deterministic sorting
- no provider/network calls
- frontmatter presence and validity
- empty/minimal catalog input
- decade grouping using normalized catalog fields instead of provider
  payload internals

## Commands To Run

```bash
yarn build:catalog
yarn build:sources
yarn run check
yarn test
```

## Return

Report:

- files changed
- generated docs created
- checks run
- model decisions made
- concerns or follow-up recommendations
