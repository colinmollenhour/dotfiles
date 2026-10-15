# Role: state

Trace the state machine changed by the patch.

- Business invariants and expected observable behavior
- Create/read/update/delete/restore and every permitted or forbidden transition
- Partial, stale, duplicated, missing, and boundary states
- Idempotency, retries, cache/session invalidation, and multi-row consistency
- Every entry point that creates or consumes the changed state
- The data that already exists when this change lands: rows a new nullable column or table leaves unpopulated, rows a backfill's filters exclude, and what — if anything — ever writes them
- Runtime guards stricter than the schema constraint or database-level check they mirror, so a legacy row becomes unsavable or unprocessable
- The window between a migration completing and deferred or queued work finishing: what writes the same state during that window, and whether the deferred work can still process rows another writer touched first
- Partial completion of a migration or backfill: connection or session state left modified, forward references to objects a later step creates, whether a re-run is idempotent, and whether one unprocessable record halts the remainder
- Whether a defect is reachable only where data predates the change, and therefore invisible to a test suite that builds its datastore from empty
