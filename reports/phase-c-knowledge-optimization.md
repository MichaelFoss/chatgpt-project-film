# Phase C Knowledge Optimization Review

## 2026-06-03 Architecture Review

Scope: evaluate currently uploadable source documents for ChatGPT
Project retrieval quality after Plex import, OMDb hydration, catalog
generation, generated runtime source creation, and upload bundle
validation.

This is a retrieval architecture review. It does not propose provider
expansion, recommendation engines, preference events, watch-history
tracking, ratings systems, user-reaction systems, personalization logic,
or upload workflow changes.

## Current Uploadable Sources

| Source                                   | Words  | Upload value                                      |
| ---------------------------------------- | ------ | ------------------------------------------------- |
| `sources/manual/spoiler-policy.md`       | 669    | High-value runtime safety policy.                 |
| `sources/manual/recommendation-rules.md` | 978    | High-value recommendation behavior guidance.      |
| `sources/manual/mid-series-advice.md`    | 742    | High-value specialized continuation guidance.     |
| `sources/manual/streaming-context.md`    | 772    | High-value practical availability context.        |
| `sources/generated/catalog-summary.md`   | 160    | High-value compact catalog overview.              |
| `sources/generated/catalog-discovery.md` | 1,034  | Medium-value critical-metadata discovery summary. |
| `sources/generated/catalog-by-decade.md` | 4,908  | Medium-value chronological ownership lookup.      |
| `sources/generated/catalog-by-genre.md`  | 13,504 | High coverage, but too large and repetitive.      |

Current generated catalog scale:

- Catalog records: 705
- Total genre listings: 1,941
- Records with multiple genres: 668
- Maximum genres on one record: 6
- Records without genres: 1
- Genre listing expansion factor: 2.75

## Unique Retrieval Value

`spoiler-policy.md` should remain uploaded. It defines global safety
behavior and protects every recommendation, comparison, and discussion.
It has unique runtime value that generated catalog views cannot replace.

`recommendation-rules.md` should remain uploaded. It defines the desired
recommendation reasoning style: selective, confidence-aware, time-aware,
fit-oriented, and resistant to hype. This is distinct from catalog
ownership facts.

`mid-series-advice.md` should remain uploaded for now. It overlaps with
the spoiler and recommendation documents, but its query surface is
different: "should I continue?", "does this get better?", "am I wasting
time?", and similar in-progress viewing questions.

`streaming-context.md` should remain uploaded. It establishes platform
friction and Plex interpretation rules. This is currently the clearest
place where the project states that Plex catalog presence is membership
and provenance only, not watched status, completion, preference, or
recommendation strength.

`catalog-summary.md` should remain uploaded. It is the best compact
orientation view for total catalog size, media type mix, genre density,
rating coverage, and decade distribution.

`catalog-discovery.md` has partial unique value. Its high-rating lists
are useful entry points for factual owned-catalog discovery, but the
"Strong Critical Metadata Coverage" section is less useful because it
mostly says which records have populated rating fields. That is a data
quality signal, not a user-facing retrieval view.

`catalog-by-decade.md` has unique value for chronological questions and
era-based browsing. It is long but structurally simple and less
duplicative than the genre view.

`catalog-by-genre.md` has unique value for genre ownership lookup, but
its current single-file shape is not retrieval-optimized. It repeats
titles once per genre and mixes very large clusters with tiny clusters
inside one document.

## Redundancy

The manual policy documents have intentional conceptual overlap: spoiler
safety, commitment awareness, and practical recommendation tone appear
in multiple files. The overlap is acceptable because each file serves a
different user-query mode. Do not remove them solely to reduce word
count.

The generated summary and discovery documents repeat top genre and
decade counts. This is mild redundancy. Keep the summary as the
authoritative overview and consider removing cluster counts from
discovery if a future generated `catalog-index.md` replaces them.

The genre and decade documents repeat basic title-year-media facts. This
is acceptable because each view answers a different lookup question.
However, the genre document repeats a large portion of the catalog
multiple times due to multi-genre classification.

## Documents That Are Too Large

`catalog-by-genre.md` is too large at 13,504 words and 2,030 lines. It
contains 1,941 genre listings for 705 records, so retrieval has to scan
many repeated title rows. Large genres such as Action, Drama, Adventure,
Sci-Fi, Horror, Thriller, and Mystery are especially likely to bury
relevant records.

`catalog-by-decade.md` is borderline at 4,908 words and 742 lines. It is
probably acceptable today because it has only seven decade sections and
low title duplication, but it should be split once the catalog grows or
when television records are added.

`catalog-discovery.md` is a reasonable size, but its sections are mixed:
some are discovery lists, while others are coverage/count summaries. Its
retrieval value would improve if those purposes were separated.

## Split Recommendations

Split the current genre view into multiple retrieval-oriented documents:

- `catalog-genres-action-adventure.md`
- `catalog-genres-drama-crime-thriller-mystery.md`
- `catalog-genres-sci-fi-fantasy-horror.md`
- `catalog-genres-comedy-family-animation-romance.md`
- `catalog-genres-documentary-biography-history-music-sport-war-western.md`
- `catalog-genres-uncategorized.md`

This keeps related browsing modes together while avoiding one very large
all-genre document.

Split the decade view only when necessary:

- Keep `catalog-by-decade.md` while the catalog is movie-only and under
  roughly 1,000 records.
- Later split into `catalog-decades-1960s-1990s.md`,
  `catalog-decades-2000s.md`, `catalog-decades-2010s.md`, and
  `catalog-decades-2020s.md` if the file grows materially.

Separate discovery into more explicit retrieval documents:

- `catalog-critical-highlights.md` for high IMDb, Rotten Tomatoes, and
  Metacritic lists.
- `catalog-coverage-summary.md` for metadata coverage and data quality
  counts if those remain useful to upload.

## Missing Retrieval Views

Add a compact ownership lookup index:

- `catalog-title-index-a-f.md`
- `catalog-title-index-g-m.md`
- `catalog-title-index-n-z.md`

Each row should include title, year, media type, primary genres, IMDb ID
when available, and catalog source provenance. This would improve exact
ownership questions such as "do I have X?" without relying on a genre or
decade hit.

Add a franchise and series-group view if deterministic grouping can be
derived safely from existing canonical fields:

- `catalog-franchise-groups.md`

This would improve retrieval for questions about owned sequels,
collections, and viewing order candidates. Do not infer group membership
aggressively from titles unless the grouping logic is explicit and
auditable.

Add a compact "owned but not preference" guardrail document or ensure
the caveat remains present in every generated ownership view:

- `catalog-ownership-caveats.md`

This may be useful if generated files are split, because ChatGPT may
retrieve a narrow generated file without also retrieving the broader
streaming context.

Add an availability/provenance view only if the data already exists
canonically:

- `catalog-by-source.md`

This should answer "what came from Plex?" and similar factual questions.
It must not imply active availability outside the known source
provenance.

## Sources That Should Not Be Uploaded

Keep non-runtime maintenance documents out of upload:

- `sources/manual/index.md`
- `sources/manual/current-state.md`
- `sources/manual/decisions.md`
- `sources/manual/data-model.md`
- `sources/manual/event-schema.md`
- `sources/manual/glossary.md`
- `sources/manual/README.md`
- `sources/generated/README.md`

These are useful repository maintenance references, but they are not
needed for ordinary recommendation and ownership retrieval. Uploading
them would add process-heavy context that could distract from runtime
answers.

Consider not uploading a future `catalog-coverage-summary.md` unless the
ChatGPT Project regularly needs to reason about data completeness. It is
valuable for audits, but weaker for user-facing film guidance.

## Ownership Knowledge Optimization

The current upload bundle is good enough for broad factual ownership
knowledge, but it is not optimized for exact ownership lookup.

Strengths:

- Ownership caveats are repeated in generated views.
- Catalog summary gives compact high-level orientation.
- Genre and decade views support browsing.
- Uploadable manual context prevents common bad inferences from Plex
  membership.

Weaknesses:

- No alphabetic title index exists.
- No compact per-title row includes title, year, media type, primary
  genres, external ID, and provenance together.
- Genre retrieval is noisy because multi-genre records repeat heavily.
- Exact title lookup relies on whichever large generated view happens to
  retrieve.
- Discovery views overrepresent public critical scores compared with
  plain ownership facts.

## Proposed Future Source Structure

Manual uploaded runtime sources:

- `sources/manual/spoiler-policy.md`
- `sources/manual/recommendation-rules.md`
- `sources/manual/mid-series-advice.md`
- `sources/manual/streaming-context.md`

Generated uploaded ownership sources:

- `sources/generated/catalog-summary.md`
- `sources/generated/catalog-title-index-a-f.md`
- `sources/generated/catalog-title-index-g-m.md`
- `sources/generated/catalog-title-index-n-z.md`
- `sources/generated/catalog-genres-action-adventure.md`
- `sources/generated/catalog-genres-drama-crime-thriller-mystery.md`
- `sources/generated/catalog-genres-sci-fi-fantasy-horror.md`
- `sources/generated/catalog-genres-comedy-family-animation-romance.md`
- `sources/generated/catalog-genres-documentary-biography-history-music-sport-war-western.md`
- `sources/generated/catalog-genres-uncategorized.md`
- `sources/generated/catalog-by-decade.md`
- `sources/generated/catalog-critical-highlights.md`

Generated optional audit sources:

- `sources/generated/catalog-coverage-summary.md`
- `sources/generated/catalog-by-source.md`
- `sources/generated/catalog-franchise-groups.md`

Do not upload optional audit sources by default unless a concrete
runtime retrieval need is established.

## Concrete Recommendations

1. Keep the current manual uploaded documents.
2. Keep `catalog-summary.md`.
3. Replace `catalog-by-genre.md` with split genre-family documents.
4. Add alphabetic title index documents for exact ownership lookup.
5. Keep `catalog-by-decade.md` for now, but set a future split
   threshold.
6. Split `catalog-discovery.md` into critical highlights and optional
   coverage summary.
7. Consider removing metadata coverage lists from default uploads unless
   they answer a runtime question.
8. Repeat the ownership caveat in every generated ownership view.
9. Keep generated source production deterministic and offline.
10. Add tests that assert the expected generated filenames, frontmatter,
    and no-manual-edit invariants after the source split.

## Concerns

The upload bundle currently favors browse-style retrieval over exact
ownership lookup. That is workable for recommendations but less reliable
for questions like "do I have this movie?" or "which version/year do I
own?"

Splitting genre documents increases file count. This is worthwhile only
if each split remains semantically coherent and the upload workflow
continues to include generated files automatically.

Franchise grouping could be useful, but it risks false inference if
implemented from title strings alone. Treat it as a later milestone
unless canonical grouping fields are added.

Critical-score discovery views are factual but can bias future
recommendations toward public consensus. The recommendation rules
already warn against that; generated discovery should stay framed as
factual catalog browsing, not fit prediction.

## Next Implementation Milestone

Implement a deterministic generated-source restructure:

1. Add title-index generation split into `a-f`, `g-m`, and `n-z`.
2. Replace the monolithic genre document with genre-family documents.
3. Split discovery into critical highlights and optional coverage
   summary.
4. Preserve frontmatter, `upload_to_chatgpt: true`, source provenance,
   and ownership caveats.
5. Update generated-source tests to validate filenames, sections, and
   stable output.
6. Run `yarn build:sources`, `yarn run check`, and `yarn test`.
7. Commit the source-generation change before running `yarn build`, so
   the build tag reflects the finalized upload-impacting source set.
