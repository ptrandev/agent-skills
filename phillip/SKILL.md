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

- Model: confirm this session runs the most capable model this build offers. If not, tell the
  user to run `/model` and pick it. **Do not** hardcode a version, names change and Claude has
  no rolling "latest" alias.
- Effort: if `/effort` exists, use its top level. If not, proceed at default.
- When the `Agent` tool is in your tool list, open your reasoning with the keyword
  `ultracode`.

### Mode

- `/phillip` (default) -> full multi-round loop, all three reviewers.
- `/phillip quick` -> one round. Claude-only under 200 changed lines. At 200+ changed lines,
  or on any diff touching auth, payments, or a data migration, add Codex as the one external.
  "Claude-only" still means the blind sub-agent (reviewer #3), not an in-session pass.
- Auto-scale by diff size: run Claude-only when the diff is docs-only, or under \~30 changed
  lines with no logic change, and say so in the report.
- Under 10 changed lines, review inline instead of spawning a sub-agent, then label it
  `Claude (inline, not blind)` in the report so the independence claim stays honest.

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

Before the review loop, invoke the `phillip-sync` skill once (e.g. `/phillip-sync`) to fold
this repo's recent resolved PR-review lessons into the rubric.

- PROCEED REGARDLESS of its outcome. **Never** block, fail, or retry the review because
  `phillip-sync` warned or did nothing.
- If `phillip-sync` reports it ADDED lines (e.g. "+N rubric" / "+N candidate"), re-Read
  `~/.claude/skills/phillip/RUBRIC.md` NOW, because the rubric you were loaded with predates
  that edit. On a cooldown/empty no-op (the common case) skip the re-Read.

## 1. The review standard

**Read `~/.claude/skills/phillip/RUBRIC.md` in full before any reviewer runs.** It owns the
review standard: what to catch, what NOT to flag, the severity taxonomy (HIGH / MEDIUM / low),
the verification discipline, and the HONESTY RULE that the rest of this file references.

Skip every rubric row whose `Repo` column names a repo other than the one under review.

## 2. The multi-round adversarial loop

Run rounds until convergence. Each round uses three independent reviewers: Codex, Gemini,
and a BLIND Claude reviewer in its own context (an Agent-tool sub-agent, or a `claude -p`
subprocess). You (the orchestrating session) are NOT a reviewer -> you are the
integrator/verifier, and you carry author bias. **Do not** collapse reviewer #3 back into an
in-session pass.

### Per round (run the three reviewers in PARALLEL)

1. **Read `~/.claude/skills/codex/SKILL.md` and `~/.claude/skills/gemini/SKILL.md` first.**
   They own the exact CLI flags, the filesystem-boundary prompt, the diff-scope prompt, and
   auth handling. A wrong flag writes an empty output file, which reads as a dry round when it
   is not one.
2. Launch BOTH external reviewers concurrently as background Bash jobs (`run_in_background:
   true`, one job per model), mirroring the review/challenge CLI calls you just read. Group
   each model's review + challenge into its OWN job so that model runs its two passes
   back-to-back while the OTHER model runs in parallel:
   - Codex job  -> `codex review` then `codex` adversarial challenge -> `/tmp/phillip-codex.out`.
   - Gemini job -> `gemini` review then `gemini` adversarial challenge -> `/tmp/phillip-gemini.out`.

   Call the CLIs DIRECTLY (backgrounded) so both run at once -> nested `/codex` and `/gemini`
   Skill invocations CANNOT parallelize, because skill calls are sequential.

   ALL THREE reviewers review against the rubric, not a generic bar. Add this line to the
   Codex prompt: "Read `~/.claude/skills/phillip/RUBRIC.md` and apply it, skipping any row
   whose Repo column names a repo other than this one."

   **Never give Gemini that line. Paste the rubric TEXT into its `-p` prompt instead**, the
   same way the diff is pasted. Gemini cannot reach `~/.claude` (outside its workspace), and
   the `/gemini` skill's `FS_BOUNDARY` prompt orders it to ignore that tree anyway. A path
   instruction there silently no-ops, and Gemini reviews against a generic bar (verified
   2026-08-24). Codex is unaffected, it reads the real filesystem.
3. Reviewer #3 is a BLIND Claude reviewer, launched right after the two background jobs are
   running: an Agent-tool sub-agent, or a `claude -p` subprocess when this session has no Agent
   tool (see "Reviewer #3 without the Agent tool" below). It must derive everything from the
   repo, never from you. Feed it ONLY:
   - the role: "You are an independent code reviewer. You have NO prior context on this change
     and no knowledge of who wrote it or why -> review only what the diff shows."
   - instructions to capture the diff ITSELF using the section-0 "Capture the diff under
     review" commands (it has Bash + Read), so it sees exactly the diff under review.
   - instructions to Read `~/.claude/skills/phillip/RUBRIC.md` and apply it -> including the
     severity taxonomy, the verification discipline, and the HONESTY RULE, and to skip any
     row whose Repo column names a repo other than this one.
   - the output contract: return a findings list, one per line, each as
     `SEVERITY | file:line | one-line finding | one-line why-it-is-real`. It REVIEWS only; it
     does not edit, fix, or commit anything.

   Do NOT paste the conversation, the ticket, the implementation rationale, or any "what this
   is supposed to do" narrative into the sub-agent prompt. Run it at full strength (it
   inherits this session's model; do not downgrade it).
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
| You cannot background jobs in this environment | Issue the Codex and Gemini CLI calls as two Bash calls in a SINGLE message (the harness runs independent calls concurrently). Worst case, invoke the `/codex` and `/gemini` skills sequentially: still correct, just slower. |
| The Agent tool is unavailable (older harness, or you are yourself a sub-agent, which has no Agent tool) | Run reviewer #3 as a `claude -p` subprocess. See "Reviewer #3 without the Agent tool" below. Fall back to an INLINE pass only when that subprocess also fails. |
| The gemini skill is not installed (no `~/.claude/skills/gemini/SKILL.md`) or its CLI auth is missing | Run with Codex + Claude and state in the report "Gemini unavailable -> ran with 2 reviewers." Same for Codex if it is absent. **Do not** silently drop a reviewer. |

### Reviewer #3 without the Agent tool

A `claude -p` subprocess is a **separate process with an empty context**, so it is genuinely
blind. Prefer it over an inline pass whenever the Agent tool is missing. Sub-agents get no Agent
tool, so any nested run (`/review-pr` per-PR agents, `/full-send`) takes this path.

Write the same blind-reviewer prompt from step 3 to a file, then run the CLI from the directory
holding the code under review:

```bash
timeout 900 claude -p "$(cat /tmp/phillip-blind-prompt.txt)" \
  --add-dir "$HOME/.claude/skills/phillip" \
  --allowed-tools "Read" "Grep" "Glob" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git show:*)" \
  --model "$BLIND_MODEL" < /dev/null > /tmp/phillip-blind.out 2>&1
```

- `--add-dir` is **mandatory**: without it the subprocess cannot Read `RUBRIC.md`, and it reviews
  against a generic bar (verified 2026-08-24).
- `--allowed-tools` must list every tool by name. In `-p` mode an unlisted tool is denied with no
  prompt, so an omitted `Read` yields a review of nothing.
- `< /dev/null` stops it blocking on stdin as a background job.
- Set `$BLIND_MODEL` to this session's model, never a smaller one.
- Gate on the **output**, not the exit code: `/tmp/phillip-blind.out` must carry the
  `SEVERITY | file:line | ...` contract. An empty or contract-free file means reviewer #3 did not
  run, so report it missing.
- Label the source `Claude (blind, subprocess)`. Label an inline pass
  `Claude (inline, not blind)`. **Never** claim a blind reviewer you did not run in a separate
  process or agent, it violates the HONESTY RULE.

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

- Loop until one dry round AFTER the last fix.
- The confirmation/dry round IS scoped to the lines changed by fixes applied since the last
  round (a delta re-check), and it still fans out to ALL THREE reviewers. Keep the full-diff
  scope for any round that is still finding issues.
- Hard cap at 3 rounds. If round 3 still surfaces verified HIGH/MEDIUM issues, stop,
  implement them, and flag in the report that the change is churny and the final fixes
  are UNCONFIRMED (no dry round followed them).
- **Do not** start another round after a dry round.

## 3. Final review report

Write the report to a stable file AND print it. Save to
`~/.claude/plans/phillip-<branch-slug>-<YYYY-MM-DD>.md` (create the dir if needed).
`<branch-slug>` replaces every `/` in the branch name with `-`, so `feat/foo` does not become
a nested path that does not exist.

```
### Phillip self-review -> <branch>, <date>
Reviewers: Claude (blind|blind, subprocess|inline, not blind) + Codex + Gemini   Rounds run: <n>
Stopped because: dry round / 3-round cap

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
  - If it stopped on the 3-round cap (not a dry round), the verdict is "Needs human
    review -> cap hit, final-round fixes unconfirmed," never "Ready for PR," regardless
    of the unresolved count.
  - Otherwise, say what remains and why.
