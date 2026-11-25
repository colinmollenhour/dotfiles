---
name: colin-feature-export
disable-model-invocation: true
slash: true
description: Create an implementation guide for a feature in this repo so you can port it to another repo
argument-hint: Describe the feature, sources, etc...
allowed-tools: Bash(git show:*), Bash(git diff:*), Bash(git log:*), Bash(grep:*), Read, Edit
---

# Export a feature to a sibling project

Write `./FEATURE-{FEATURE_NAME}.md` for the feature identified by `$ARGUMENTS`. The reader has the sibling project and the guide, and may have no access to the source repository.

Trace the feature from its entry points through UI, backend, persistence, and tests. Use git history to identify the introducing commits, integration edits, and follow-up fixes. Verify against the current tree so the guide exports the working implementation.

Include these details where the feature needs them:

- Behavior, example usage, prerequisites, related features, and the commits that explain important decisions.
- Every new or modified implementation and test file, with its path, purpose, complete code, imports, and types. For modified files identify the additions and where they integrate with existing logic.
- Dependencies and versions, configuration changes, environment variable names, database schema and migrations. Use placeholders for deployment-specific values.
- Test fixtures, helpers, test-only endpoints, cleanup changes, and the scenarios they cover. Explain timing or isolation choices that address observed failures.
- Dependency-ordered porting steps, project-specific verification commands, expected outcomes, and pitfalls found during development.

Check the finished guide against both the feature diff and its current callers. A reader should be able to port the feature and exercise it from the guide alone.
