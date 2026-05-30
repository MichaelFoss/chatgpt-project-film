Reviewed the repo read-only. No files changed, no tests changed, no
schemas changed, nothing staged.

# Metadata Enrichment Design Proposal

## 1. Inputs

Read:

- `events/catalog.events.ndjson`
- `data/metadata-cache.json`
- committed app configuration, likely `.appconfig.jsonc` when introduced
- local environment secrets, never committed, such as `OMDB_API_KEY`

Required configuration:

- enabled providers, ordered by priority
- provider-specific limits, delays, and retry caps
- refresh policy
- dry-run/report-only mode default
- maximum records per run
- whether failed lookups should update cache

Secrets should stay outside the repo and only be read at runtime.

## 2. Outputs

Write:

- `data/metadata-cache.json` only
- no direct writes to `data/catalog.json`
- no event rewrites
- no generated source or `dist/` writes

Reports:

- terminal summary
- optional JSON report for automation, e.g. `tmp/enrichment-report.json`
  or stdout-only initially
- report fields should include scanned events, eligible IDs, skipped
  IDs, missing metadata, invalid metadata, refreshed metadata,
  successful lookups, failed lookups, unchanged records, rate-limit
  stops, and fatal errors

## 3. Metadata Discovery

Missing metadata:

- replay valid unique `catalog.add` events
- ignore duplicate catalog-add actions after reporting them
- for each canonical ID, missing means no corresponding key exists in
  `data/metadata-cache.json`

Invalid metadata:

- cache record exists but is malformed
- `record.canonicalId` does not match key
- `isValid !== true`
- provider metadata cannot map into required catalog fields:
  - `canonicalId`
  - `mediaType`
  - `title`
  - `genres`
- provider response says no result, invalid API response, or unsupported
  media type

Refreshes should exist, but should be conservative.

Refresh rules:

- never refresh `metadataLookup: "skip"`
- never refresh manual records unless explicitly requested
- never replace valid metadata with failed or invalid metadata
- allow explicit `--refresh imdb:tt...`
- allow age-based refresh only if configured, e.g. records older than N
  days
- preserve prior valid record if refresh fails
- refresh should be opt-in, not default behavior

## 4. Provider Abstraction

Each provider should implement a small contract:

```text
provider.id
provider.supports(canonicalId)
provider.lookup({ canonicalId, config, signal })
provider.validateResponse(response)
provider.toMetadataRecord({ canonicalId, response, fetchedAt })
```

Lookup result categories should be explicit:

- found valid metadata
- found invalid/unusable metadata
- not found
- retryable failure
- permanent failure
- rate limited

Provider registration:

- committed registry maps provider IDs to provider modules
- config chooses enabled providers and priority
- enrichment resolves provider by canonical ID support and config order

Future providers:

- OMDb supports `imdb:tt...` directly
- TMDb may support IMDb lookup, TMDb IDs, or secondary matching later
- manual provider is not networked; it represents existing manually
  authored records
- provider-native payloads should remain in `metadata`, not normalized
  away

## 5. Cache Updates

New records:

- create one record per canonical ID
- store valid provider payload when found
- store invalid/not-found/failure details only when no prior valid
  record exists
- include `lastUpdatedAt`
- include `provider`
- include provenance

Existing records:

- valid existing record:
  - replace only with newer valid metadata under explicit refresh rules
  - never replace with failure, not-found, or invalid metadata
- invalid existing record:
  - replace with valid metadata
  - may replace with newer invalid/failure details to advance retry
    state
- manual valid record:
  - preserve unless operator explicitly allows replacement

Provenance:

```text
provenance.source: provider-lookup | manual-entry | manual-seed
provenance.provider: omdb | tmdb | manual
provenance.fetchedAt
provenance.lookupKey
provenance.toolVersion or scriptVersion
provenance.note
```

Request state:

- retry count
- last attempted timestamp
- error source: transport, provider, application, rate-limit
- status code when available
- provider error code/message when available

## 6. Failure Handling

Network failures:

- record retryable failure only if no valid cache exists
- increment retry count
- do not modify valid records

Provider failures:

- distinguish provider error response from transport error
- preserve provider message in `request.error`
- do not infer facts from partial failures

Invalid responses:

- store as invalid only when no valid prior record exists
- include enough diagnostic detail for manual review
- do not emit placeholder metadata

Rate limits:

- stop or pause according to config
- report remaining unprocessed IDs
- avoid treating rate limit as title failure
- do not burn retry counts the same way as normal failures unless
  configured

Missing titles:

- store not-found state for `auto` items when no valid prior record
  exists
- report as manual-review candidates
- never create a catalog placeholder

## 7. CLI Design

Proposed commands:

```bash
yarn enrich:metadata --dry-run
yarn enrich:metadata
yarn enrich:metadata --limit 25
yarn enrich:metadata --provider omdb
yarn enrich:metadata --id imdb:tt0112573
yarn enrich:metadata --refresh imdb:tt0112573
yarn enrich:metadata --report json
```

Recommended workflow:

1. append catalog events
2. run `yarn enrich:metadata --dry-run`
3. inspect missing/invalid/eligible IDs
4. run `yarn enrich:metadata --limit N`
5. run `yarn build:catalog`
6. review catalog report
7. run normal checks/build workflow

Report format should mirror the current catalog report style, with
stable sections and counts first, then IDs.

## 8. Testing Strategy

Unit tests:

- event replay eligibility
- metadataLookup skip behavior
- missing/invalid detection
- provider selection
- cache update rules
- provenance creation
- retry and rate-limit classification
- refresh eligibility

Provider mocking:

- providers tested through fake provider objects
- no tests require real API keys
- fixture payloads for OMDb success, not found, malformed response, rate
  limit, and provider error
- transport layer mocked separately from provider mapping

Integration tests:

- temp repo with event stream and cache
- dry-run writes nothing
- enrichment writes only `metadata-cache.json`
- valid existing records survive failures
- invalid records are replaced by valid provider result
- `metadataLookup: "skip"` is reported but not looked up
- catalog build after enrichment remains offline

## 9. Architectural Boundaries

Enrichment must never:

- edit `events/catalog.events.ndjson`
- write `data/catalog.json`
- write generated source docs or `dist/`
- infer watched, liked, completed, owned intentionally, or recommended
  status
- add spoilers or plot-derived preference facts
- silently resolve conflicting title identity
- contact providers during dry-run unless explicitly requested as a
  lookup preview

Catalog generation must never:

- contact metadata providers
- read API keys
- mutate `data/metadata-cache.json`
- create placeholder catalog items
- depend on current time, network, or provider availability
- treat metadataLookup as permission to enrich inline

## 10. Future Evolution

Lock down now:

- enrichment is the only networked metadata phase
- catalog generation remains offline and deterministic
- `metadata-cache.json` is the sole durable provider-response store
- valid records are not replaced by failures
- provider payloads are preserved
- provenance is required for all enrichment-created records
- dry-run/reporting behavior exists before write behavior

Keep flexible:

- exact committed config filename
- exact JSON report destination
- provider priority rules
- refresh cadence
- provider-specific payload schemas
- whether to add TMDb IDs or cross-provider identity maps later
- whether failed lookup history remains embedded in latest record or
  moves to a separate append-only request log later

The stable contract is: enrichment reads events plus cache, optionally
contacts configured providers, updates only `data/metadata-cache.json`,
and reports every decision; catalog generation remains a pure offline
projection from events plus cache.
