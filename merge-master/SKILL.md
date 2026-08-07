---
name: merge-master
description: |
  Merges the latest origin/master into the current branch, resolves any merge
  conflicts, then commits and pushes. Use when asked to "merge master", "sync
  with master", "pull in latest master", "update my branch", or /merge-master.
---

# merge-master

Bring the current branch up to date with `master` and push.

## Steps

1. **Preflight.** `git status --porcelain`. If the tree is dirty, stop and ask
   whether to stash or commit first. Never clobber uncommitted work. Stashing
   is the user's job before re-invoking this skill: do not stash for them, and
   do not run `git stash pop` afterwards. Capture the current branch:
   `git rev-parse --abbrev-ref HEAD`. If the branch is `master` or `main`, stop
   and tell the user.
2. **Fetch.** `git fetch origin master`.
3. **Merge.** `git merge origin/master`. If it merges cleanly, skip to step 6.
4. **Resolve conflicts.** For each conflicted file (`git diff --name-only
   --diff-filter=U`):
   - Read the file, understand both sides. Keep the intent of *both* changes.
   - Edit to remove all `<<<<<<<`, `=======`, `>>>>>>>` markers.
   - `git add <file>` once resolved.
   - If either choice changes behavior, stop and ask the user.
5. **Commit the merge.** Once every conflicted file is staged, run
   `git commit --no-edit` (keeps the default merge message). This runs once per
   merge, not once per file.
6. **Verify.** `git status`. Confirm no unmerged paths remain. Run the repo's
   typecheck, lint, or build if one is configured. If it fails, stop before
   step 7. Report the failure and ask whether to push.
7. **Push.** `git push`. If push reports no upstream, use
   `git push -u origin <branch>` with the branch captured in step 1.
8. **Report.** State what conflicted and how you resolved each one.

## Notes

- Prefer `git merge`, not rebase. The user asked to merge.
