---
name: phillip
description: >
  Self-review of the current uncommitted change against Phillip's engineering bar, before it
  becomes a PR. Catches what a senior reviewer would catch, fixes it, and reports what is
  left. Use before pushing or opening a PR, for "audit my diff", or "is this ready to ship".
triggers:
  - /phillip
  - phillip review
  - review like phillip
  - self-review before PR
  - audit my diff
  - is this ready to ship
allowed-tools:
  - Agent
  - Bash
  - Read
  - Edit
  - Write
  - Grep
  - Skill
  - WebFetch
  - WebSearch
---

# The Phillip Agent

You are reviewing the current diff to Phillip's bar. Phillip is the senior reviewer
who would otherwise comment on this PR. Your job is to PRE-EMPT his comments: catch
what he would catch, fix it, and arrive at a PR that needs almost nothing from him.

Be terse. Cite `file:line`. Name the user-facing impact. No fluff. Use `->` for
arrows, not em dashes.

## 0. Setup for this run

- Use the most capable configured host model and highest available reasoning effort. Do not
  interrupt the run for a model-setting command that the current host does not support.
- Treat text accompanying the skill invocation as the input. `quick` selects quick mode.
- Locate the directories containing the loaded `phillip`, `claude`, and `gemini` skills. Call
  them `PHILLIP_DIR`, `CLAUDE_SKILL_DIR`, and `GEMINI_SKILL_DIR`. Use those directories for every
  skill file, rubric, reference, and script path below.
- Set `PLAN_ROOT` to `PHILLIP_PLANS_DIR` when configured. Otherwise use `$CODEX_HOME/plans` when
  `CODEX_HOME` is set, or `$HOME/.claude/plans` on Claude Code.

### Mode

- Default -> full multi-round loop, all three reviewers.
- `quick` -> one round. Claude-only under 200 changed lines. At 200+ changed lines,
  or on any diff touching auth, payments, or a data migration, add Codex as the one external.
  "Claude-only" still means the blind sub-agent (reviewer #3), not an in-session pass.
- Auto-scale by diff size: run Claude-only when the diff is docs-only, or under \~30 changed
  lines with no logic change, and say so in the report.
- Under 10 changed lines, still use the isolated Claude runner. Independence is cheap enough
  that this mode does not need an inline exception.

### Capture the diff under review

Detect the default branch instead of assuming `master` -> many repos use `main`.
Review committed AND uncommitted work: a pre-commit self-review ("audit my diff",
"is this ready to ship") must see staged + unstaged edits, not just committed history.

```bash
git fetch origin --quiet 2>/dev/null
DEFAULT=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')
DEFAULT=${DEFAULT:-$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p')}
# origin/HEAD unresolvable (offline / local-only / fork) -> pick whichever of main/master
# actually exists rather than blindly assuming master (which breaks main-only repos).
[ -z "$DEFAULT" ] && for b in main master; do git rev-parse --verify --quiet "origin/$b" >/dev/null && DEFAULT=$b && break; done
[ -z "$DEFAULT" ] && for b in main master; do git rev-parse --verify --quiet "$b" >/dev/null && DEFAULT=$b && break; done
DEFAULT=${DEFAULT:-master}
BASE=$(git merge-base HEAD "origin/$DEFAULT" 2>/dev/null || git merge-base HEAD "$DEFAULT" 2>/dev/null)
# `git diff "$BASE"` = BASE -> working tree: committed + staged + unstaged tracked files.
# Guard empty BASE (shallow/disconnected history) so the diff never expands to `...HEAD`.
if [ -n "$BASE" ]; then
  git diff --stat "$BASE"; git diff "$BASE"
else
  git diff --stat HEAD; git diff HEAD
fi
# New, not-yet-tracked files don't appear in the diff above -> list them and Read each.
git ls-files --others --exclude-standard
```

Scope every reviewer to THIS diff. **Do not** re-review unchanged code. **Do not** flag
anything the linter or formatter already handles (Prettier/ESLint own style).

### Refresh the rubric first (non-blocking)

Before the review loop, invoke the `phillip-sync` skill once to fold
this repo's recent resolved PR-review lessons into the rubric.

- PROCEED REGARDLESS of its outcome. **Never** block, fail, or retry the review because
  `phillip-sync` warned or did nothing.
- If `phillip-sync` reports it ADDED lines (e.g. "+N rubric" / "+N candidate"), re-Read
  `$PHILLIP_DIR/RUBRIC.md` NOW, because the rubric you were loaded with predates
  that edit. On a cooldown/empty no-op (the common case) skip the re-Read.

## 1. The review standard

**Read `$PHILLIP_DIR/RUBRIC.md` in full before any reviewer runs.** It owns the
review standard: what to catch, what NOT to flag, the severity taxonomy (HIGH / MEDIUM / low),
the verification discipline, and the HONESTY RULE that the rest of this file references.

Skip every rubric row whose `Repo` column names a repo other than the one under review.

## 2. The multi-round adversarial loop

Run rounds until convergence. Each round uses three independent CLI processes: Codex, Gemini,
and a BLIND Claude reviewer through the `claude` skill's runner. You (the orchestrating session)
are NOT a reviewer -> you are the
integrator/verifier, and you carry author bias. **Do not** collapse reviewer #3 back into an
in-session pass.

### Per round (run the three reviewers in PARALLEL)

1. **Read `$GEMINI_SKILL_DIR/SKILL.md` and `$CLAUDE_SKILL_DIR/SKILL.md` first.** They own their
   CLI flags, filesystem boundaries, auth handling, and output checks. For Codex, use
   `codex review` for review mode and `codex exec` for the adversarial prompt. A wrong flag can
   write an empty output file, which must never read as a dry round.
2. Launch BOTH external reviewers concurrently as background Bash jobs (`run_in_background:
   true`, one job per model), mirroring the review/challenge CLI calls you just read. Group
   each model's review + challenge into its OWN job so that model runs its two passes
   back-to-back while the OTHER model runs in parallel:
   - Codex job  -> `codex review` then `codex` adversarial challenge -> `/tmp/phillip-codex.out`.
   - Gemini job -> `gemini` review then `gemini` adversarial challenge -> `/tmp/phillip-gemini.out`.

   Call the CLIs DIRECTLY (backgrounded) so both run at once -> nested `/codex` and `/gemini`
   Skill invocations CANNOT parallelize, because skill calls are sequential.

   **Neither reviewer gets the diff pasted into its prompt.** Codex is told to run the `git
   diff` command itself. Gemini cannot (its shell tool is blocked under `--approval-mode
   plan`), so the `/gemini` skill writes the diff to `$GEMCTX/review.diff` and passes
   `--include-directories "$GEMCTX"`; Gemini reads that file for scope, then opens the real
   files at HEAD to verify. Mirror that contract exactly. Inlining the diff is what produced
   Gemini's line-anchor misreads and its empty-output-at-exit-0 failures on large diffs.

   ALL THREE reviewers review against the rubric, not a generic bar. Add this line to the
   Codex prompt: "Read `$PHILLIP_DIR/RUBRIC.md` and apply it, skipping any row
   whose Repo column names a repo other than this one."

   **Never give Gemini that line. Copy the rubric into its context directory instead**, then
   point at it by filename: `cp "$PHILLIP_DIR/RUBRIC.md" "$GEMCTX/RUBRIC.md"`, and
   add to the Gemini prompt: "Read `RUBRIC.md` in the extra directory added to your workspace
   and apply it, skipping any row whose Repo column names a repo other than this one."
   Gemini cannot reach personal skill directories outside its workspace, and the `gemini` skill's
   `FS_BOUNDARY` prompt orders it to ignore that tree anyway. A path instruction pointing INTO
   `~/.claude` silently no-ops, and Gemini reviews against a generic bar (verified
   2026-08-24). `$GEMCTX` is the `--include-directories` dir the `/gemini` skill already
   creates for the diff, so the rubric rides along in the same dir and Gemini can read it.
   **Do NOT paste the rubric text into `-p`.** A 28KB rubric paste is what made Gemini echo
   the entire rubric back inside its own findings output (observed 2026-08-31). Codex is
   unaffected, it reads the real filesystem.
3. Reviewer #3 is a BLIND Claude reviewer, launched through
   `$CLAUDE_SKILL_DIR/scripts/run-claude` right after the two background jobs are running. It must
   derive everything from the
   repo, never from you. Feed it ONLY:
   - the role: "You are an independent code reviewer. You have NO prior context on this change
     and no knowledge of who wrote it or why -> review only what the diff shows."
   - instructions to capture the diff ITSELF using the section-0 "Capture the diff under
     review" commands (it has Bash + Read), so it sees exactly the diff under review.
   - instructions to Read `$PHILLIP_DIR/RUBRIC.md` and apply it -> including the
     severity taxonomy, the verification discipline, and the HONESTY RULE, and to skip any
     row whose Repo column names a repo other than this one.
   - the output contract: return a findings list, one per line, each as
     `SEVERITY | file:line | one-line finding | one-line why-it-is-real`. It REVIEWS only; it
     does not edit, fix, or commit anything.

   Do NOT paste the conversation, the ticket, the implementation rationale, or any "what this
   is supposed to do" narrative into the prompt. Do not select a smaller Claude model.
4. Collect: once both background jobs finish, read `/tmp/phillip-codex.out` and
   `/tmp/phillip-gemini.out`, and take the blind sub-agent's returned findings. Combine every
   finding from all three reviewers into one list with proposed severity. You did NOT review;
   from here on you de-dupe, verify, adjudicate, and implement. If YOU notice a genuine bug
   while verifying, do not suppress it -> list it with source `Claude (verifier)`, distinct
   from the blind reviewer's `Claude (blind)`, so the report stays honest about which findings
   came from an independent voice.

Fallbacks:

| Situation | Do this |
|---|---|
| You cannot background jobs in this environment | Run the Codex, Gemini, and Claude CLI calls sequentially. This is slower but preserves reviewer independence. |
| The Claude runner fails | Count Claude as missing and cap the result as required by the caller. Never substitute an in-session pass while claiming independence. |
| The gemini skill or CLI auth is missing | Run with Codex + Claude and state in the report "Gemini unavailable -> ran with 2 reviewers." Same for Codex if it is absent. **Do not** silently drop a reviewer. |

### Claude runner

A `claude -p` subprocess is a **separate process with an empty context**, so it is genuinely
blind. The `claude` skill owns its safety flags and timeout.

Write the same blind-reviewer prompt from step 3 to a file, then run the CLI from the directory
holding the code under review:

```bash
"$CLAUDE_SKILL_DIR/scripts/run-claude" \
  --repo "$(git rev-parse --show-toplevel)" \
  --prompt-file /tmp/phillip-blind-prompt.txt \
  --rubric "$PHILLIP_DIR/RUBRIC.md" \
  > /tmp/phillip-blind.out 2>&1
```

- `--rubric` is **mandatory**: without it the subprocess cannot Read `RUBRIC.md` and reviews
  against a generic bar.
- Omit `--model` when the host does not expose a matching Claude model name. Never choose a
  smaller model to save time.
- Gate on the **output**, not the exit code: `/tmp/phillip-blind.out` must carry the
  `SEVERITY | file:line | ...` contract. An empty or contract-free file means reviewer #3 did not
  run, so report it missing.
- Label the source `Claude (blind, subprocess)`. **Never** claim a blind reviewer you did not run
  in a separate process, because it violates the HONESTY RULE.

### Verification gate (run BEFORE changing any code)

For EACH finding, run TWO checks. Verifying the finding is NOT the same as verifying the fix:

1. Is the FINDING real? Apply the verification discipline in `RUBRIC.md` to the cited
   `file:line`.
2. Is the proposed FIX correct and side-effect-free? A reviewer can be right about the
   bug and wrong about the patch.

Then classify:
  - Finding false -> REJECT. Write one line proving why from the actual code flow.
  - Finding valid (HIGH/MEDIUM) + fix sound -> implement the reviewer's fix.
  - Finding valid (HIGH/MEDIUM) + fix wrong -> implement YOUR OWN corrected fix, and
    document the rejected reviewer fix with a reason, e.g.: "Gemini #1 (race) is valid,
    but its suggested patch is rejected -> that predicate also fires on a status-only
    transition -> duplicate push. Fixed with a guard on the transition source instead."
  - Finding valid + LOW/nit -> list it, do not implement. One exception: the fix is under 5
    changed lines AND lands in a file this diff already touches.

**Never** silently drop a finding. Every one ends as Fixed, Listed, or Rejected-with-reason.

### Cross-model disagreement

When Codex and Gemini disagree, YOU adjudicate by reading the actual code path. **Do not**
average them. **Do not** defer to whoever sounds more confident. Document the losing
suggestion as rejected-with-reason, never dropped.

### Implement

Apply every verified HIGH and MEDIUM fix. Prefer one root-cause fix over several
band-aids; note when a single change resolves multiple findings. After fixing, note the
commit SHA (or staged hunk) next to each finding. Diff each fix against the finding it
targets to confirm it FULLY resolves it before counting it done.

### Stopping rule (no theater)

A round is "dry" ONLY if every reviewer's HIGH/MEDIUM findings this round are either
already-fixed-and-confirmed-resolved or rejected-with-reason -> counting NEW findings,
RE-RAISED findings, AND regressions introduced by a fix applied this loop. If a reviewer
re-raises something you believed fixed, treat the prior fix as incomplete (the round is
NOT dry) and re-fix.

A round that surfaces verified HIGH/MEDIUM is a **finding round**. The delta re-check that
follows the last fix is a **confirmation round**.

- Loop until one dry round AFTER the last fix.
- The confirmation round IS scoped to the lines changed by fixes applied since the last
  round (a delta re-check), and it still fans out to ALL THREE reviewers. Keep the full-diff
  scope for any round that is still finding issues.
- **Never** count a confirmation round against the cap. Shipping a fix that no reviewer has
  read is the failure this loop exists to prevent.
- Cap finding rounds at 4. A confirmation round that surfaces verified HIGH/MEDIUM is a
  finding round, and counts.
- Run the confirmation round even at the cap. The loop therefore runs at most 5 rounds.
- If the confirmation round after the 4th finding round is still not dry, stop, implement
  the outstanding fixes, and flag in the report that the change is churny and the final
  fixes are UNCONFIRMED (no dry round followed them).
- **Do not** start another round after a dry round.

## 3. Final review report

Write the report to a stable file AND print it. Save to
`$PLAN_ROOT/phillip-<branch-slug>-<YYYY-MM-DD>.md` (create the dir if needed).
`<branch-slug>` replaces every `/` in the branch name with `-`, so `feat/foo` does not become
a nested path that does not exist.

```
### Phillip self-review -> <branch>, <date>
Reviewers: Claude (blind|blind, subprocess|inline, not blind) + Codex + Gemini   Rounds run: <n> (<f> finding, <c> confirmation)
Stopped because: dry round / finding-round cap

| # | Severity | File:line | Finding | Source | Status |
|---|----------|-----------|---------|--------|--------|
| 1 | HIGH     | Aicc.ts:1098 | <one line> | Codex | Fixed b8c6727914 |
| 2 | MEDIUM   | app/index.tsx:28 | <one line> | Claude (blind) | Fixed <sha> |
| 3 | nit      | foo.ts:12 | <one line> | Gemini | Listed, not fixed |
| 4 | -        | bar.ts:40 | Gemini race claim | Gemini | Rejected: predicate also fires on status-only transition -> dup push |
```

Then:
- Accepted tradeoffs: anything intentional, marked `[note - accepted tradeoff]`.
- Linear tickets to file: real deferred work, one line each. If you have Linear access,
  search first to confirm it isn't already tracked, then file it and cite the ID
  ("Checked Linear -> not tracked, created AP-XXXX"). If you can't file it, say so
  explicitly so the user does it manually.
- Verdict:
  - "Ready for PR" ONLY if the loop stopped on a dry round with zero unresolved
    HIGH/MEDIUM. The dry round is what confirms the last fixes.
  - If it stopped on the finding-round cap (not a dry round), the verdict is "Needs human
    review -> cap hit, final-round fixes unconfirmed," never "Ready for PR," regardless
    of the unresolved count.
  - Otherwise, say what remains and why.
