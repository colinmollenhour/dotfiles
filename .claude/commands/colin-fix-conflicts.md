---
allowed-tools: Bash(git status:*), Bash(git show:*), Bash(git diff:*), Bash(git add:*), Bash(git rm:*), Bash(git checkout:*), Bash(grep:*), Read, Edit
description: Inspect and resolve git merge conflicts intelligently
---

# Fix Git Merge Conflicts

Inspect and resolve git merge conflicts intelligently, preserving important changes from both branches.

## Step 1: Assess the Situation

Run `git status` to identify:
- Files with merge conflicts (listed under "Unmerged paths")
- The type of conflict for each file (e.g., "both modified", "deleted by us", "deleted by them")

## Step 2: Handle Each Conflict Type

### Both Modified
For files modified in both branches:
1. Read the file to see the conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
2. Understand what each side changed and why
3. Edit the file to combine changes appropriately, removing conflict markers
4. `git add <file>` to mark as resolved

### Deleted by Us (we deleted, they modified)
This means our branch deleted the file but the incoming branch has changes:
1. **IMPORTANT**: Use `git show MERGE_HEAD:<filepath>` to see the incoming version
2. Determine if the incoming changes should be:
   - **Discarded**: The deletion was intentional and changes aren't needed → `git rm <file>`
   - **Kept**: The file should be restored with incoming changes → `git checkout MERGE_HEAD -- <file> && git add <file>`
   - **Merged elsewhere**: Changes should be applied to a different file (e.g., consolidated test files) → Apply changes manually to the target file, then `git rm <original-file>`

### Deleted by Them (they deleted, we modified)
This means the incoming branch deleted the file but we have changes:
1. Use `git show HEAD:<filepath>` to see our version
2. Determine if our changes should be:
   - **Discarded**: Accept the deletion → `git rm <file>`
   - **Kept**: Restore our version → `git add <file>`

### Added by Both
Both branches added a file with the same name:
1. Compare both versions: `git show HEAD:<filepath>` vs `git show MERGE_HEAD:<filepath>`
2. Merge the content appropriately

## Step 3: Look for Related Files

Before finalizing a deletion, check if:
- The deleted file's functionality was moved/consolidated elsewhere
- There are related test files that cover the same functionality
- The incoming changes contain improvements that should be applied to the consolidated location

Example: If `registration-flow.spec.ts` was deleted because its tests were consolidated into `auth-flows.spec.ts`, check if the incoming changes to `registration-flow.spec.ts` have improvements that should be merged into `auth-flows.spec.ts`.

## Step 4: Verify Resolution

1. Run `git status` to confirm "All conflicts fixed"
2. Review staged changes with `git diff --staged`
3. Ensure no conflict markers remain: `grep -r "<<<<<<" . --include="*.ts" --include="*.vue" --include="*.js"`

## Common Pitfalls

1. **Forgetting MERGE_HEAD**: After `git rm`, you can't use `:3:<file>` syntax. Always use `git show MERGE_HEAD:<file>` to see incoming changes before removing.

2. **Not checking for consolidated files**: When a file is deleted, search for where its functionality might have moved (use `grep` to find function names, test descriptions, etc.)

3. **Losing incoming improvements**: Even if we intentionally deleted a file, the incoming branch may have bug fixes or improvements that should be applied elsewhere.

4. **Not staging manual merges**: After manually applying changes to a different file, remember to `git add` that file too.

## Quick Reference Commands

```bash
# See incoming version of a file
git show MERGE_HEAD:<filepath>

# See our version of a file
git show HEAD:<filepath>

# See what changed in incoming branch for a file
git diff HEAD...MERGE_HEAD -- <filepath>

# Accept their version completely
git checkout MERGE_HEAD -- <filepath>

# Accept our version completely (for "deleted by them")
git add <filepath>

# Accept deletion
git rm <filepath>

# Check for remaining conflict markers
grep -rn "<<<<<<\|======\|>>>>>>" --include="*.ts" --include="*.vue" --include="*.js" .
```
