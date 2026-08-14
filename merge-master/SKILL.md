---
name: merge-master
description: >
  Merges origin/master into the current branch, resolves any conflicts, then commits and
  pushes. Use for "merge master", "sync with master", or "update my branch".
---

# merge-master

## Steps

1. **Preflight.** `git status --porcelain`. **Stop and ask** whether to stash or
   commit first when the tree is dirty. **Never** clobber uncommitted work.
   Stashing is the user's job before re-invoking this skill. **Do not** stash for
   them. **Do not** run `git stash pop` afterwards. Capture the current branch:
   `git rev-parse --abbrev-ref HEAD`. **Stop and tell the user** when the branch
   is `master` or `main`.
2. **Fetch.** `git fetch origin master`.
3. **Merge.** `git merge origin/master`. Skip to step 6 when it merges cleanly.
4. **Resolve conflicts.** For each conflicted file (`git diff --name-only
   --diff-filter=U`):
   - Read the file. Understand both sides. Keep the intent of *both* changes.
   - Edit to remove all `<<<<<<<`, `=======`, `>>>>>>>` markers.
   - `git add <file>` once resolved.
   - **Stop and ask the user** when either choice changes behavior.
5. **Commit the merge.** Run `git commit --no-edit` once every conflicted file is
   staged (this keeps the default merge message). Run it once per merge, not
   once per file.
6. **Verify.** `git status`. Confirm no unmerged paths remain. Run the repo's
   typecheck, lint, or build when one is configured. **Stop** before step 7 when
   it fails. Report the failure and ask whether to push.
7. **Push.** `git push`. Use `git push -u origin <branch>` with the branch
   captured in step 1 when push reports no upstream.
8. **Report.** State what conflicted and how you resolved each one.

## Notes

- Use `git merge`. **Never** rebase.
