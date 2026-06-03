# OMDb Validation Report

## 2026-06-03 Real-Provider Validation

| Field              | Result                         |
| ------------------ | ------------------------------ |
| Run type           | Small real-provider validation |
| Requested limit    | 10                             |
| Requests attempted | 10                             |
| Successful writes  | 10                             |
| Unresolved lookups | 0                              |
| Files written      | `data/metadata-cache.json`     |

Conclusion: the real provider path is validated. A limited real-provider
hydration run successfully completed and wrote metadata records to the
cache without unresolved lookups.

Caveat: this validation run required manual `OMDB_API_KEY` injection
before the run. The current follow-up fixes repo-root `.env` loading for
local hydration CLI usage while preserving shell-provided `OMDB_API_KEY`
precedence.

## Source-Generation Notes

- OMDb raw provider payloads include `Year`, `Runtime`, `Rated`, and
  `Released`.
- The normalized catalog currently omits year, runtime, rating
  certificate, and release date.
- `catalog-by-decade` will likely require normalized `releaseYear`.
- Generated source documents should avoid blindly including OMDb `Plot`
  or other description fields because of spoiler risk.
