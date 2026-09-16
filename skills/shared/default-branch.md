# Resolving a repo's default branch

Owns the one ladder every skill uses to find a repo's default branch. Read it before any command
that names a base branch. **Never assume `master`.**

Four repos, split two and two: `Atllas-Inc/codebase` and `Atllas-Inc/aicc-queues` use `master`,
`Atllas-Inc/neema-simple-hyzl` and `Atllas-Inc/pointsgpt` use `main`. `git fetch origin master` in a
`main` repo fails with `couldn't find remote ref master`, so a hardcoded name is a bug waiting for
the next repo.

## The ladder

Authoritative answers come first. The `main`/`master` probes are a guess, and a repo can carry both
refs, so they run only when nothing authoritative answered.

```bash
DEFAULT=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
[ -z "$DEFAULT" ] && DEFAULT=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null)
[ -z "$DEFAULT" ] && DEFAULT=$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p')
[ -z "$DEFAULT" ] && for b in main master; do
  git rev-parse --verify --quiet "origin/$b" >/dev/null 2>&1 && DEFAULT=$b && break
done
[ -z "$DEFAULT" ] && for b in main master; do
  git rev-parse --verify --quiet "$b" >/dev/null 2>&1 && DEFAULT=$b && break
done
```

Verified 2026-09-16: `master` for `codebase`, `aicc-queues` and `agent-skills`, `main` for
`neema-simple-hyzl` and `pointsgpt`, `main` for a local repo with no remote, and empty outside a
git repository with no stderr noise.

Steps 2 and 3 need the network. A run with neither `gh` nor a reachable remote falls through to the
ref probes, which is why they stay in the ladder.

## What to do when it comes back empty

The ladder owns the resolution. **Each skill owns its own failure policy**, because the right
answer differs.

| Skill | Policy on empty |
|---|---|
| `merge-master` | Stop and say so. Merging the wrong branch rewrites the user's work. |
| `full-send` | Stop with a FATAL. An empty base poisons every later diff and the `gh pr create` base. |
| `phillip` | Fall back to `master` and review anyway. A wrong base costs a noisy diff, not a bad write. |
| `gemini` | Fall back to `master`. Same reasoning. |
| Anything that writes | Stop. |
| Anything that only reads | Fall back, and say which branch it used. |
