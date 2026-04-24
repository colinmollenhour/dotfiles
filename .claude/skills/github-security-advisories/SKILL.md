---
name: github-security-advisories
description: Manage GitHub Security Advisory workflows from vulnerability report to private fork patch. Use when validating security reports, preparing GHSA fields, creating advisory fixes, committing patches, or pushing to GHSA private forks. Triggers include GHSA, GitHub Security Advisory, HackerOne report, vulnerability report, private fork, CVE, CVSS, security advisory draft.
---

# GitHub Security Advisories

Use this skill for end-to-end GitHub Security Advisory (GHSA) handling: validate a vulnerability report, identify and implement a safe fix, commit it, prepare advisory form content, ask for the GHSA private fork/advisory identifier, and push the fix branch to the private fork.

## Core rules

- Treat vulnerability details as sensitive until the advisory is public.
- Do not push exploit details or fixes to the public `origin` unless the user explicitly asks.
- Prefer private GHSA forks for advisory patch branches.
- Name GHSA remotes after the advisory ID, e.g. `GHSA-hfqq-c3qm-38x8`, not generic names like `ghsa`.
- Ask before pushing if the user has not provided the GHSA private fork URL or advisory ID.
- Keep proof-of-concept details appropriate to the audience. Use full detail for private advisory drafts; recommend softened details for public advisories if useful.
- Use `TodoWrite` to track each workflow stage.

## Workflow

### Step 1: Receive and validate the report

When the user provides a vulnerability report:

1. Identify the claimed vulnerability class, affected component, exploit path, prerequisites, and impact.
2. Inspect the codebase directly:
   - Locate the referenced files/functions/templates.
   - Verify the data flow from attacker-controlled input to sensitive sink.
   - Check whether existing escaping, validation, authorization, CSRF, CSP, framework behavior, or browser behavior invalidates the claim.
   - Search for equivalent or similar patterns in nearby code.
3. Produce a verdict:
   - `Valid`, `Likely valid`, `Needs more evidence`, or `Invalid`.
   - Include prerequisites and any scope limitations.
   - Call out overclaimed impact or incorrect suggested fixes.

For XSS specifically:

- Identify the exact browser context: HTML text, HTML attribute, JavaScript string, URL, CSS, JSON, etc.
- Recommend context-correct output encoding. For JavaScript values, prefer JSON encoding over hand-built quoted strings.

### Step 2: Plan and suggest the fix

Before editing when the fix is non-trivial:

1. Summarize the root cause.
2. Identify the minimal patch.
3. Identify similar templates/files/sinks to harden in the same patch.
4. Explain why the chosen encoding/validation is correct for the sink context.

For JavaScript-context values:

- Prefer emitting values as JSON literals:

```php
<?php echo Mage::helper('core')->jsonEncode($value) ?>
```

instead of:

```php
"<?php echo $value ?>"
```

- Do not rely on HTML escaping alone for JavaScript contexts unless the project convention requires it and the behavior is verified.

### Step 3: Create an appropriately named branch

Use a branch name that references the report or advisory without leaking more than necessary. Examples:

```bash
git switch -c hackerone-3673977-product-name-stored-xss
```

or:

```bash
git switch -c GHSA-hfqq-c3qm-38x8
```

Before creating the branch:

```bash
git status --short
git branch --show-current
```

Do not overwrite unrelated local work.

### Step 4: Implement the fix

1. Patch the vulnerable location.
2. Patch equivalent/similar vulnerable locations discovered during validation.
3. Keep the change small and reviewable.
4. Avoid broad rewrites unrelated to the advisory.
5. Preserve existing coding style.

After edits, inspect the diff carefully:

```bash
git diff --check
git diff
```

Run available focused tests or syntax checks. If local tooling is unavailable, state that clearly.

### Step 5: Commit the patch

Commit only advisory-related files.

Suggested commit message format:

```text
Fix stored XSS in MSRP JavaScript templates
```

or:

```text
Fix <vulnerability class> in <component>
```

Commands:

```bash
git status --short
git add <files>
git diff --cached --check
git diff --cached
git commit -m "Fix <issue> in <component>"
git status --short
git log -1 --oneline
```

### Step 6: Prepare GitHub Security Advisory fields

Provide copy/paste-ready content for the GitHub Security Advisory form.

Include:

- Title
- Ecosystem
- Package name
- Affected versions
- Patched versions
- Vulnerability type / CWE
- Severity
- CVSS vector and score
- Summary
- Description
- Impact
- Attack requirements / prerequisites
- Affected components/files
- Remediation
- Workarounds
- Credits
- Commit/patch reference
- Suggested advisory slug
- Disclosure timeline template
- References
- Private-safe proof of concept, if appropriate

Be explicit about uncertainty:

- If the patched version is unknown, use `[PATCHED_VERSION]` placeholders.
- If exact introduced version is unknown, avoid overclaiming; suggest a conservative range.
- If CVSS depends on threat model, provide a recommended vector plus alternates.

### Step 7: Ask for the GHSA private fork label/URL

After committing and preparing advisory fields, ask the user for the GHSA private fork details if not already provided.

Ask for one of:

- The advisory URL, e.g. `https://github.com/OWNER/REPO/security/advisories/GHSA-hfqq-c3qm-38x8`
- The private fork SSH URL, e.g. `git@github.com:OWNER/REPO-ghsa-hfqq-c3qm-38x8.git`
- The GHSA ID/label, e.g. `GHSA-hfqq-c3qm-38x8`

Do not guess the private fork URL unless the repo owner/name pattern is obvious and the user confirms.

### Step 8: Add the private fork remote using the GHSA ID as remote name

Derive the remote name from the advisory ID:

```text
GHSA-hfqq-c3qm-38x8
```

If the user provides an advisory URL:

```text
https://github.com/OpenMage/magento-lts/security/advisories/GHSA-hfqq-c3qm-38x8
```

then remote name is:

```text
GHSA-hfqq-c3qm-38x8
```

If the user provides a private fork URL like:

```text
git@github.com:OpenMage/magento-lts-ghsa-hfqq-c3qm-38x8.git
```

infer remote name:

```text
GHSA-hfqq-c3qm-38x8
```

Check existing remotes:

```bash
git remote -v
```

If a generic GHSA remote already exists, rename it to the advisory ID when appropriate:

```bash
git remote rename ghsa GHSA-hfqq-c3qm-38x8
```

If the correctly named remote does not exist, add it:

```bash
git remote add GHSA-hfqq-c3qm-38x8 git@github.com:OWNER/REPO-ghsa-hfqq-c3qm-38x8.git
```

If the remote exists but points elsewhere, stop and ask before changing it.

### Step 9: Push the fix branch to the private fork

Push the current fix branch to the GHSA remote:

```bash
git branch --show-current
git push -u GHSA-hfqq-c3qm-38x8 HEAD
```

or explicitly:

```bash
git push -u GHSA-hfqq-c3qm-38x8 <branch-name>
```

Report:

- Remote name
- Remote URL
- Branch name
- Commit SHA
- PR URL from push output, if GitHub prints one

### Step 10: Final response

Summarize succinctly:

- Validation verdict
- Files patched
- Commit SHA/message
- Advisory fields prepared
- GHSA remote/branch pushed
- Any checks that could not be run

## GHSA field template

Use this template when preparing advisory content.

```markdown
## Title
<short vulnerability title>

## Ecosystem
Composer | npm | pip | Maven | Go | other

## Package name
<package name>

## Affected versions
<range or placeholder>

## Patched versions
<PATCHED_VERSION or placeholder>

## Weaknesses
- CWE-79: Improper Neutralization of Input During Web Page Generation ('Cross-site Scripting')
- CWE-116: Improper Encoding or Escaping of Output

## Severity / CVSS
Recommended: <Low|Medium|High|Critical>

CVSS v3.1: <vector>
Score: <score>

Rationale:
- AV: ...
- AC: ...
- PR: ...
- UI: ...
- S: ...
- C/I/A: ...

## Summary
<brief overview>

## Description
<technical root cause and vulnerable data flow>

## Impact
<what attacker can do and who is affected>

## Preconditions
- <condition 1>
- <condition 2>

## Affected components
- `<file or component>`

## Remediation
Upgrade to <PATCHED_VERSION> or apply <commit/patch>.

## Workarounds
- <temporary mitigation>

## Credits
<reporter / platform / report id>

## References
- <repo>
- <commit>
- <GHSA URL after publication>
```

## Remote naming examples

Correct:

```text
GHSA-hfqq-c3qm-38x8 git@github.com:OpenMage/magento-lts-ghsa-hfqq-c3qm-38x8.git
```

Incorrect:

```text
ghsa git@github.com:OpenMage/magento-lts-ghsa-hfqq-c3qm-38x8.git
```

## Common gotchas

- `escapeHtml()` is not a universal fix; output encoding must match the sink context.
- JavaScript string literals should not be assembled manually from untrusted values.
- Advisory private forks are separate remotes; avoid pushing security fixes to public origin prematurely.
- GitHub advisory IDs are uppercase `GHSA-...`; private fork repo names often use lowercase `ghsa-...`.
- Keep local remote names uppercase and exact to the advisory ID for clarity.
- If a branch already tracks a generic remote, update tracking after renaming or pushing to the correctly named remote.
