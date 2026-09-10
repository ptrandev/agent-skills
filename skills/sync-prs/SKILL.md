---
name: sync-prs
description: >
  Merges the default branch into every open PR you authored, draft and ready, across your
  repos. Resolves the conflicts, verifies green, and pushes without a force.
  Use for "sync my PRs", "merge master into my PRs", or "keep my branches up to date".
---

# sync-prs

Sweeps your open PRs and brings each branch up to date with its base branch. One PR at a time,
one merge commit each, no force push.

For a single branch you are sitting on, use `/merge-master` instead.

## Input

Treat text accompanying the skill invocation as the input:

- **Empty** → process **all** open PRs authored by the current GitHub user across **all default
  repos** (see Targets). Draft PRs are included.
- **One or more PR numbers** (e.g. `1768 1765`) → process only those. PR numbers resolve against
  the **first** default repo (`Atllas-Inc/codebase`) unless `--repo` is also given.
- `--repo <owner/name>` → restrict this run to one repo. Can be combined with PR numbers.
- `--dry-run` → report which PRs are behind and stop. Change no branch. Push nothing.
- `--ready-only` → skip draft PRs.

### Targets (default repos)

Process these unless `--repo` narrows the run: `Atllas-Inc/codebase` and `Atllas-Inc/aicc-queues`.

Each repo needs a clone. Resolve `CLONE` per repo, in this order, and take the first hit:

```bash
for candidate in "./$NAME" "$HOME/$NAME" "$HOME/Git/$NAME"; do
  [ -d "$candidate/.git" ] && CLONE="$candidate" && break
done
```

`./$NAME` is the Routine cloud checkout. `$HOME/Git/$NAME` is the local host. Confirm the `origin`
remote matches `$REPO` before you use a hit, because a name can collide.

## Core safety model (do not weaken these)

1. **Your PRs only. Never touch a PR you did not author.** Confirm `author == $ME` for every PR.
   Skip a PR number passed in the input that you do not own, and log a note.
2. **Never force push. Never rebase. Never amend.** Every change this skill makes is one merge
   commit on top of the PR head, pushed fast-forward. A push that is not a fast-forward means the
   branch moved under you. Abandon that PR and report it.
3. **Green before push.** Push a merge only after the repo's typecheck or build passes. A clean
   merge that breaks the build is a semantic conflict, not a success.
4. **Leave the branch as you found it when you stop.** Run `git merge --abort` on a conflict you
   will not resolve. Run `git reset --hard origin/$HEAD_BRANCH` when verification fails after a
   clean merge. Never leave conflict markers or an unpushed merge commit behind.
5. **Resolve a conflict only when you can state both sides' intent.** Write one sentence for each
   side before you edit. A hunk you cannot describe that way aborts the PR. The stop list in
   Phase 4 aborts regardless of how well you understand it.
6. **A resolution keeps both sides' intent.** Merging is not choosing a winner. Drop a side only
   when the base deleted the code the PR modified, and record that in the report.

---

## Preflight (runs first)

**Stop and say so when a required check fails.**

- Resolve the **target repo set** from the input. For each, split `OWNER=${REPO%/*}` and
  `NAME=${REPO#*/}`, then resolve `CLONE`.
- **Set `GH_TRANSPORT` before any other GitHub call. Read
  [../shared/github-transport.md](../shared/github-transport.md) first.** It owns the probe, the
  per-repo rule, and the `cli` to `mcp` operation mapping. Probe per repo:

  ```bash
  gh api "repos/$OWNER/$NAME" --jq .id >/dev/null 2>&1 && GH_TRANSPORT=cli || GH_TRANSPORT=mcp
  ```

  A failed `gh` probe in a Routine run is normal, not a defect. **Stop only when neither transport
  works.** Capture `ME`, the authenticated login, through the transport.
- Confirm each clone's working tree is clean: `git status --porcelain`. **Never stash. Never
  discard uncommitted work.** A dirty clone skips that repo. It does not block the other repo.
- Read each repo's default branch through the transport. **Never assume `master`.**
- Probe the verification command per repo (Phase 5). Record `CAN_VERIFY[$REPO]`.

**Git push works in a cloud sandbox even when the GitHub API does not.** A dead `gh` never blocks
a push.

## Phase 1: discover

List open PRs authored by `ME` in each target repo. Keep drafts unless `--ready-only` is set.

For each PR, read: number, title, `draft`, `headRefName`, `baseRefName`, `headRepositoryOwner`,
and labels.

## Phase 2: filter

Skip a PR and record the reason when any row matches.

| Condition | Reason to record |
|---|---|
| `author != $ME` | not yours |
| Head repo owner is not `$OWNER` | fork head, cannot push |
| `baseRefName` is not the repo default branch | stacked PR, base is another branch |
| The PR carries the label `no-auto-merge` | opted out |
| The branch already contains the base tip | already up to date |
| The PR is closed, merged, or in a merge queue | not open work |

Test the already-up-to-date row with git, not with the API `mergeable` field, which is computed
lazily and goes stale:

```bash
git fetch origin "$BASE" "$HEAD_BRANCH"
git merge-base --is-ancestor "origin/$BASE" "origin/$HEAD_BRANCH" && echo up-to-date
```

**Stop here when `--dry-run` is set.** Report the table from Phase 8 with a `would merge` row per
remaining PR.

## Phase 3: merge

Per PR, in the repo's clone:

```bash
git fetch origin "$BASE" "$HEAD_BRANCH"
git checkout "$HEAD_BRANCH"
git reset --hard "origin/$HEAD_BRANCH"
git merge "origin/$BASE"
```

The hard reset targets the remote head, so a stale local branch never leaks an old commit into the
merge. Go to Phase 5 when the merge is clean. Go to Phase 4 when it conflicts.

## Phase 4: conflicts

List conflicted files: `git diff --name-only --diff-filter=U`.

### 4a: stop list

**Abort the whole PR when any conflicted path matches a row.** Abort means `git merge --abort`,
then record the PR under Needs you with the path and the matching row.

| Path or content | Why a human decides |
|---|---|
| A database migration, or a schema definition it generates | Two migrations that conflict need an ordering decision with production consequences |
| Authentication, authorization, permission checks, cryptography, or a secret | A wrong merge here is a security hole that verification does not catch |
| More than ten conflicted files | The branch diverged far enough that a rebuild beats a merge |
| A hunk whose two sides you cannot each describe in one sentence | You cannot keep an intent you cannot name |

### 4b: mechanical conflicts

Resolve these inline. They need no judgment.

| Conflict | Resolution |
|---|---|
| A lockfile (`yarn.lock`, `package-lock.json`, `Cargo.lock`) | Take the base version, then regenerate: `git checkout --theirs <lock> && yarn install --no-immutable`. Abort the PR when the package manager is unavailable or the install fails. |
| A generated file with a generator in the repo | Take the base version, then re-run the generator. Abort the PR when the generator is unavailable. |
| Both sides added distinct whole lines to an import block, an export list, or a dependency list | Keep every line from both sides. Preserve the file's existing order. Remove exact duplicates only. |
| Both sides appended a new entry to an append-only file (`CHANGELOG.md`, a migration index) | Keep both entries. Put the base entry first. |

### 4c: judgment conflicts

Everything left is a real conflict: both sides changed the same code. **Delegate it. Read
[resolver.md](resolver.md) before you spawn the resolver.** That file owns the resolver's model,
its prompt contract, its return shape, and what the main loop does with each verdict.

One resolver handles one PR. **Never** give a resolver two PRs, and **never** resolve a judgment
conflict in the main loop, because the main loop's context holds every other PR in the sweep.

### 4d: commit

Confirm no marker survives before you commit:

```bash
git diff --check
grep -rn '^<<<<<<<\|^>>>>>>>' $(git diff --name-only --diff-filter=U) 2>/dev/null
```

Stage each resolved file with `git add <file>`. Commit once, after every conflicted file is
staged: `git commit --no-edit`. Append one line per resolved file to the merge message, naming the
file and the decision.

## Phase 5: verify

Run the repo's verification command. Skip this phase only when `CAN_VERIFY[$REPO]` is false, and
say so per PR in the report.

| Repo | Command |
|---|---|
| `Atllas-Inc/codebase` | `yarn ci:typecheck` in `apps/api` |
| `Atllas-Inc/aicc-queues` | `./gradlew --no-daemon compileJava` |
| Another repo | The typecheck, lint, or build script its `package.json` or build file defines |

**Do not push a failing merge.** On failure, run `git reset --hard "origin/$HEAD_BRANCH"` and
record the PR under Needs you with the first failing output line. A clean merge that fails
verification is a semantic conflict, and it needs a human. A resolved merge that fails
verification means the resolution was wrong. **Never** send it back for a second attempt.

Verification covers the merge, not the PR. A branch that already failed before the merge fails
after it too. When the failure looks pre-existing, check out `origin/$HEAD_BRANCH` detached and
run the same command there. Push the merge and record the failure as pre-existing when both runs
fail the same way.

## Phase 6: push

```bash
git push origin "$HEAD_BRANCH"
```

**Never pass `--force` or `--force-with-lease`.** A rejected push means the branch moved during
the run. Re-fetch once and retry the whole PR from Phase 3. On a second rejection, abandon that PR
and report it.

## Phase 7: comment

**Post no PR comment for a clean merge.** The merge commit is the record.

Post one comment, and only one, when the merge resolved a conflict, so a reviewer can check the
resolution. Include one row per resolved file, from the resolver's `files[]`:

> Merged `origin/<base>` into this branch.
>
> | File | Base side wanted | This branch wanted | Resolution |
> |---|---|---|---|
> | `apps/api/src/billing.ts` | ... | ... | ... |
>
> Verified with `<verification command>`.

Name any dropped code in its own line under the table. **Never** omit a `dropped` value from the
comment.

## Phase 8: report

One table for the whole run, ordered by repo, then PR number.

| PR | Repo | State | Result | Detail |
|---|---|---|---|---|
| #1768 | codebase | ready | merged and pushed | clean merge, typecheck green |
| #1765 | codebase | draft | skipped | already up to date |
| #1749 | codebase | ready | merged and pushed | resolved `apps/api/src/billing.ts`, typecheck green |
| #1751 | codebase | draft | **needs you** | aborted, conflict in a migration |

Close with an explicit **Needs you** list. One line per PR: the number, the reason, and the exact
next command to run. State the transport (`GH_TRANSPORT`) per repo, and name any repo where
verification was skipped.

List every resolved file separately, with the resolver's two intent sentences and its decision.
That list is the only place a human sees what a resolution chose, so **never** compress it to a
count.

## Idempotency

The skill is safe to run on a schedule. A PR already containing the base tip is skipped in
Phase 2, so a repeat run merges nothing and pushes nothing. A PR aborted for a conflict stays
aborted on every later run until a human resolves it, which is the intended behavior.

**Read [routine.md](routine.md) to run this on a schedule in the cloud.** It owns the Routine
setup script, the prompt, the cron expression, and the validation steps.
