# Role: failure

Trace what happens when operations fail, overlap, receive hostile input, or run against production-sized data. A complete pass reports on **both** halves below; a thread that returns only adversarial candidates and no scale assessment is incomplete.

**Adversarial and concurrent**

- Errors after partial side effects, transaction boundaries, cleanup, retries, cancellation, and timeouts
- Races, lost updates, TOCTOU behavior, ordering assumptions, and duplicate delivery
- Authentication, authorization, tenant isolation, injection, unsafe deserialization, XSS/SSRF/CSRF, and data exposure

A concurrency or race candidate must name both concurrent paths, the interleaving, and the specific absent guard — lock, unique constraint, transaction boundary, or queue de-duplication — and must check the repository's documented deploy topology before assuming two code versions run simultaneously.

**Scale and cost**

- Query plans: correlated subqueries and lateral joins re-evaluated per outer row, derived tables or views that cannot use an index, count and pagination queries that inherit an expensive join from the query they wrap
- Index coverage for every new or changed predicate, sort order, and keyset cursor
- N+1 patterns, per-row work inside a loop that already holds a lock, repeated single-row writes where a batch API already exists in the repository
- Unbounded work or retention on reachable production paths: scans over history-wide tables, drain or cleanup loops with a per-run ceiling and no continuation cursor, artifacts written with no retention policy
- Blocking I/O on hot paths, superlinear work over growable collections, allocation inside hot loops
- Lockstep-deploy hazards and dependency compatibility, judged from the repository's own manifests rather than model memory

**Evidence standard for cost claims.** A cost claim needs a measurement or an explicit marker. First determine whether the repository offers a read-only query or profiling entry point: check the root and nearest instruction files, the README, the scripts section of whatever manifest the project uses, and any developer CLI or `bin/` helper the repository documents. If one exists, use it to obtain a query plan, index listing, or row count, and paste that output into the finding. Issue read-only statements only; never construct a connection string or credentials the repository does not already document, and never modify data. If no documented entry point exists, or the host denies it, state `unverified — no query plan obtained` in the finding and cap its severity at `medium`.
