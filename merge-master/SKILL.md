---
name: merge-master
description: |
  Merges the latest origin/master into the current branch, resolves any merge
  conflicts, then commits and pushes. Use when asked to "merge master", "sync
  with master", "pull in latest master", "update my branch", or /merge-master.
---

# merge-master

Bring the current branch up to date with `master` and push. Never run on
`master`/`main` itself — if that's the current branch, stop and tell the user.

## Steps

1. **Preflight.** `git status --porcelain`. If the tree is dirty, stop and ask
   whether to stash or commit first — never clobber uncommitted work. Capture
   the current branch: `git rev-parse --abbrev-ref HEAD`.
2. **Fetch.** `git fetch origin master`.
3. **Merge.** `git merge origin/master`. If it merges cleanly, skip to step 5.
4. **Resolve conflicts.** For each conflicted file (`git diff --name-only
   --diff-filter=U`):
   - Read the file, understand both sides. Keep the intent of *both* changes —
     don't blindly take one side.
   - Edit to remove all `<<<<<<<`, `=======`, `>>>>>>>` markers.
   - `git add <file>` once resolved.
   - If any conflict is genuinely ambiguous (a real semantic clash where either
     choice changes behavior), stop and ask the user rather than guessing.
   - When all are staged, finalize with `git commit --no-edit` (keeps the
     default merge message).
5. **Verify.** `git status` — confirm no unmerged paths remain. If the repo has
   an obvious quick check (typecheck/lint/build), run it to confirm the merge
   didn't break the build; report failures, don't hide them.
6. **Push.** `git push`.

## Notes

- Prefer `git merge`, not rebase — the user asked to merge.
- Report what conflicted and how you resolved each one before finishing.
