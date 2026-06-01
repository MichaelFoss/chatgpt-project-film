# Catalog Hydration Task Plan

Purpose:

Implement safe, capped catalog metadata hydration from catalog events
into `data/metadata-cache.json`, using a permanent mock provider first
and OMDb only after the hydration workflow is proven.

This task plan is intended to be executed one task at a time by Codex.

## Repository Facts (Do Not Change)

- Catalog membership is event-sourced.
- Catalog membership derives exclusively from
  `events/catalog.events.ndjson`.
- The repository currently contains 705 `catalog.add` events:
  - 704 imported from Plex.
  - 1 manual event.
- Plex import establishes catalog membership only.
- Plex import does not imply watched status, watch history, preference,
  rating, completion, intentional ownership, or recommendation.
- `data/metadata-cache.json` is the durable metadata cache.
- `data/catalog.json` is a generated projection from catalog events plus
  metadata cache.
- Catalog generation must remain offline and deterministic.
- Metadata enrichment infrastructure exists but bulk hydration is
  incomplete.

## Global Rules

- Complete exactly one unchecked task at a time.
- Stop after each task for human review.
- Mark completed tasks with `[x]`.
- Show a concise diff summary after each task.
- Do not modify `events/catalog.events.ndjson`.
- Do not modify catalog membership.
- Do not modify generated catalog data unless a task explicitly requires
  a generated output check.
- Hydration write mode may write only to `data/metadata-cache.json`.
- Catalog generation must never contact metadata providers.
- Hydration must never infer watched, liked, rated, completed, owned
  intentionally, or recommended state.
- Every write-mode hydration run must have a maximum request cap.
- Real provider use must be opt-in.
- Tests must not require a real network request or real API key.
- Keep the mock provider as permanent test/development infrastructure.

## Phase 1 - Hydration Architecture and Provider Contract

- [ ] Define the provider contract and hydration architecture:
  - Create or update hydration modules without changing event schemas.
  - Define a metadata provider interface with explicit provider IDs.
  - Provider contract should support canonical ID lookup.
  - Provider contract should include `supports(canonicalId)` behavior.
  - Provider contract should include `lookup(...)` behavior.
  - Lookup result categories must include:
    - found valid metadata
    - not found
    - invalid response
    - retryable failure
    - permanent failure
    - rate limited
    - timed out
  - Result objects should carry enough detail for reporting without
    leaking secrets.
  - Add provider selection by canonical ID support and requested
    provider ID.
  - Do not implement OMDb in this phase.
  - Add unit tests for provider selection and result classification.

## Phase 2 - Permanent Mock Provider

- [ ] Implement a permanent mock metadata provider:
  - Provider ID should be `mock`.
  - Mock provider must require no API key.
  - Mock provider must never contact the network.
  - Mock provider must support deterministic lookup by canonical ID.
  - Mock provider should use fixtures or an in-memory fixture map.
  - Mock provider fixtures must cover:
    - successful valid metadata
    - not found
    - invalid response
    - retryable failure
    - permanent failure
    - rate limited
    - timeout simulation
  - Mock provider should support optional per-lookup artificial delay.
  - Mock delay must be configurable for tests and CLI use.
  - Mock delay should be disabled by default.
  - Mock delay should exercise the same timeout and retry paths used by
    real providers.
  - Add tests proving mock lookup behavior is deterministic.
  - Add tests proving timeout simulation works without real network
    access.

## Phase 3 - Hydration Planning

- [ ] Implement hydration plan mode:
  - Add `yarn hydrate:metadata:plan`.
  - Plan mode reads:
    - `events/catalog.events.ndjson`
    - `data/metadata-cache.json`
  - Plan mode must not write files.
  - Plan mode must not contact real providers.
  - Plan mode should not require an API key.
  - Plan mode should report:
    - total catalog events
    - unique canonical catalog IDs
    - duplicate event count, if any
    - existing valid metadata records
    - missing metadata records
    - skipped records
    - invalid cache records
    - eligible lookup count
    - ineligible lookup count
  - Plan mode should distinguish `metadataLookup: "auto"` from
    `metadataLookup: "skip"`.
  - Add tests for planning behavior using temp files or fixtures.

## Phase 4 - Hydration Write Mode with Mock Provider

- [ ] Implement capped write mode using the mock provider only:
  - Add `yarn hydrate:metadata:write`.
  - Write mode updates only `data/metadata-cache.json`.
  - Write mode must support `--provider mock`.
  - Write mode must support `--limit N`.
  - Write mode must support `--id canonicalId` for targeted hydration.
  - Write mode must support `--dry-run`.
  - Write mode must require an explicit cap or apply a conservative
    default cap.
  - Default cap should be 25 requests per run.
  - Hard maximum cap should be 100 requests per run unless configuration
    explicitly changes it later.
  - Write mode must stop when the cap is reached.
  - Write mode must report how many eligible records remain after the
    run.
  - Write mode must not contact OMDb or any real provider in this phase.
  - Add tests proving only missing eligible records are requested.
  - Add tests proving the request cap is enforced.
  - Add tests proving `--id` hydrates only the requested canonical ID.
  - Add tests proving `--dry-run` writes nothing.

## Phase 5 - Cache Update Semantics

- [ ] Implement durable metadata cache update behavior:
  - Valid provider results create metadata cache records.
  - Existing valid metadata records are preserved by default.
  - Existing valid metadata records must not be replaced by failures.
  - Invalid existing records may be replaced by valid provider results.
  - `metadataLookup: "skip"` records must not be looked up.
  - Not-found results must not create placeholder catalog items.
  - Failure results must be reported.
  - Failure persistence should be conservative.
  - Failure persistence must not destroy valid metadata.
  - Cache writes should be stable and deterministic.
  - Add tests for:
    - missing record becomes valid record
    - valid record survives retryable failure
    - valid record survives rate-limit result
    - skipped record is not requested
    - invalid record can be replaced by valid result
    - not-found result does not create placeholder catalog data

## Phase 6 - Request Limits, Delays, Timeouts, and Retries

- [ ] Implement request-control behavior shared by mock and real
      providers:
  - Support per-run request cap.
  - Support delay between requests.
  - Support provider timeout.
  - Support provider retry cap.
  - Apply controls consistently to mock and real providers.
  - Mock provider artificial delay must be usable to test timeout
    behavior.
  - Mock provider failure fixtures must be usable to test retry
    behavior.
  - Rate-limit results should stop or pause the run according to
    configured behavior.
  - Rate-limit results should not be treated as title failures.
  - Retry caps must prevent infinite retry loops.
  - Add tests for:
    - limit enforcement
    - configured delay behavior
    - timeout behavior using mock delay
    - retry cap behavior using mock retryable failure
    - rate-limit stop behavior

## Phase 7 - CLI Reporting

- [ ] Make hydration CLI output reviewable:
  - Report provider used.
  - Report requested cap.
  - Report effective cap.
  - Report requests attempted.
  - Report successful writes.
  - Report not-found count.
  - Report invalid response count.
  - Report retryable failure count.
  - Report permanent failure count.
  - Report timeout count.
  - Report rate-limit count.
  - Report skipped count.
  - Report remaining eligible records.
  - Report cache records written.
  - Output should make it obvious whether another run is safe.
  - Add tests for report summary formatting where practical.

## Phase 8 - OMDb Provider

- [ ] Implement the OMDb provider after the mock workflow is stable:
  - Provider ID should be `omdb`.
  - OMDb provider must be opt-in.
  - OMDb provider must read API key from environment only.
  - Do not commit secrets.
  - No test may require a real OMDb API key.
  - Support IMDb canonical IDs such as `imdb:tt0112573`.
  - Provider should reject unsupported canonical IDs cleanly.
  - Map OMDb responses into the existing metadata cache schema.
  - Preserve provider-native payload where appropriate.
  - Validate required catalog fields before writing.
  - Handle OMDb not-found responses.
  - Handle OMDb invalid or malformed responses.
  - Handle transport failures.
  - Handle timeout failures.
  - Handle rate-limit-like provider failures if detectable.
  - Add tests using fixture payloads only.

## Phase 9 - Catalog Rebuild Integration

- [ ] Verify hydration integrates with catalog generation:
  - Hydration must not directly write `data/catalog.json`.
  - `yarn build:catalog` must consume `data/metadata-cache.json`
    offline.
  - Catalog generation must not read API keys.
  - Catalog generation must not contact metadata providers.
  - Add or update workflow documentation for:
    1. run hydration plan
    2. run hydration write with a cap
    3. inspect metadata cache diff
    4. run catalog build
    5. inspect catalog diff
    6. run checks/tests
  - Add tests or validation checks proving catalog generation remains
    offline.

## Phase 10 - Real Hydration Safety Documentation

- [ ] Document safe real-provider hydration workflow:
  - Document that OMDb is limited to 1,000 requests per day on the free
    tier.
  - Document that normal real runs should use conservative caps.
  - Recommend starting real runs with a small cap, such as 10 or 25.
  - Document how to resume the next day after hitting provider limits.
  - Document how to inspect metadata cache diffs before rebuilding
    catalog.
  - Document that real hydration should not be run automatically in
    tests.
  - Document that the mock provider should be used for local workflow
    testing.

## Phase 11 - Validation

- [ ] Validate the completed hydration feature:
  - Run `yarn check`.
  - Run `yarn test`.
  - Run mock hydration plan.
  - Run mock hydration write with a small cap.
  - Confirm write mode updates only `data/metadata-cache.json`.
  - Run catalog build from mock-hydrated metadata.
  - Confirm catalog generation remains offline.
  - Do not run real OMDb hydration unless explicitly requested by the
    user.
  - Report concise validation results.

## Completion Criteria

- Hydration can be planned without network access.
- Hydration can be written safely with the mock provider.
- Hydration writes only to `data/metadata-cache.json`.
- Request caps are enforced.
- Delay, timeout, retry, and rate-limit behavior are covered through
  provider-level behavior.
- OMDb provider exists but is opt-in.
- Tests do not require network access or API keys.
- Catalog generation remains offline.
- Existing catalog events are untouched.
- The feature is ready for cautious capped real-provider hydration.
