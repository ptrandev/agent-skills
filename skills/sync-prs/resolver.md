# sync-prs: the conflict resolver subagent

Owns every judgment conflict in Phase 4c. One resolver handles one PR. The main loop never
resolves a judgment conflict itself, and never batches two PRs into one resolver.

## Model

Use Fable 5.1 (`fable`). Conflict resolution is the one part of this sweep that carries real risk:
the merge commit lands on a branch a human already reviewed, and a wrong resolution hides inside a
diff nobody reads twice. It is judgment work with no stated success test, so it takes the strongest
model available.

Give the resolver the repository tools it needs to read code and edit files. It runs inside the
clone the main loop already checked out.

**Never** spawn a resolver for a mechanical conflict. Phase 4b is cheaper and it is exact.

## Why a subagent and not the main loop

The main loop's context holds every other PR in the sweep. A resolver starts blank, so it reads
only this branch, this base, and these hunks. Fresh context is the point, not parallelism.

## Prompt contract

Give the resolver exactly this, filled in:

1. `CLONE`, the absolute path. State that the merge is already in progress and conflicted.
2. `HEAD_BRANCH`, `BASE`, the PR number, and the PR title.
3. The conflicted paths that Phase 4b did not resolve.
4. The PR body, so the resolver knows what the branch set out to do.
5. These instructions, verbatim:

```text
A merge of origin/<BASE> into <HEAD_BRANCH> is in progress and conflicted. Resolve the listed
files.

For each conflicted hunk:
1. Read the whole file, not the hunk alone. Read the base side with `git show :3:<path>` and the
   branch side with `git show :2:<path>`.
2. Read why each side changed: `git log --oneline -5 origin/<BASE> -- <path>` and
   `git log --oneline -5 <HEAD_BRANCH> -- <path>`.
3. Write one sentence naming what the base side wanted, and one naming what the branch side
   wanted.
4. Produce code that keeps both intents. Merging is not choosing a winner.
5. Stop and return `abort` when the two intents cannot both hold, when either side touches
   authentication, authorization, permissions, cryptography, a secret, or a migration, or when you
   cannot name an intent.

Remove every conflict marker. Do not run `git add`, `git commit`, `git merge --abort`, or any push.
Do not touch a file outside the list. Do not fix an unrelated defect you notice: report it instead.

Return JSON only:
{"verdict":"resolved"|"abort",
 "files":[{"path":"...","base_intent":"...","branch_intent":"...","decision":"...","dropped":null}],
 "abort_reason":"...",
 "notes":"..."}

Set `dropped` to the code you removed and why, when a resolution drops a side. Set it to null
otherwise.
```

**The resolver never runs a git write command.** It edits files. The main loop stages, commits,
verifies, and pushes. One actor owns the branch state.

## What the main loop does with each verdict

| Verdict | Action |
|---|---|
| `resolved` | Confirm no marker survives (Phase 4d). Confirm the resolver touched no file outside the list: `git status --porcelain`. Stage, commit, then run Phase 5. |
| `abort` | `git merge --abort`. Record the PR under Needs you with `abort_reason`. |
| Malformed or missing JSON | Treat it as `abort`. **Never** guess the verdict from prose. |

**Run the resolver once per PR.** A failed verification after a resolution aborts the PR. Do not
send the failure back for a second attempt, because a resolver correcting its own merge under
pressure to pass a build is how a side gets deleted.

Carry every `files[]` row into the Phase 8 report and into the Phase 7 comment. A resolution nobody
can read is a resolution nobody can review.
