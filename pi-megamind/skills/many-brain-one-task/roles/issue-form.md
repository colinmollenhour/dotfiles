## Output form (required)

Each defect candidate uses this block. Bare `key: value` lines. Use `anchor:`
(file line, symbol, or hunk) — not `line:`. `### C:` / markdown lists are not parsed.

<<<ISSUE>>>
role: <this role>
file: <repo-relative path>
anchor: <line or symbol>
severity: critical|high|medium|low
confidence: high|medium|low
invariant: <what must hold>
trigger: <how it breaks>
harm: <user-visible cost>
evidence: <file:line and what you read>
fix: <smallest correction>
<<<END>>>

End the review with `VERDICT: <n> candidates` in the **final assistant message**.
Zero candidates is allowed only after you opened the changed files.
