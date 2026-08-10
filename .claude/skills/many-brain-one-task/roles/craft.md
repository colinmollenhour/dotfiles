# Role: craft

Trace whether the change leaves the codebase honest.

- Dead code: new functions with no callers, unreachable branches, predicates that cannot change a result
- Duplication: logic copied between call sites where a canonical helper exists or should
- Contracts the code cannot satisfy: documented return values that never occur, comments describing a previous revision, comments orphaned or falsified by the change
- Violations of applicable repository instruction files, quoted exactly
- Missing test coverage for a new invariant guard, a new fallback or demotion branch, or a class reachable only through a queue, cron, or plugin registration
- Strings that defeat an existing mechanism, such as messages assembled before being passed to translation

Whether the change should have been split, or does more than its stated goal, belongs to `merits` — do not raise it here.
