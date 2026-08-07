---
name: phillip
description: >
  Reviews the current code change to Phillip's engineering bar before it becomes a PR.
  Runs multiple rounds of adversarial review with three independent reviewers (Claude,
  OpenAI Codex via /codex, Google Gemini via /gemini), verifies every finding against
  the real code path, implements all HIGH and MEDIUM severity findings, rejects false
  positives with a written reason, and loops until a clean round. Produces a final
  review report. Use before pushing or opening a PR, or when asked to "review like
  Phillip", "self-review", "phillip review", "audit my diff", or "is this ready to ship".
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
  user to run `/model` and pick it. Do NOT hardcode a version, names change and Claude has no
  rolling "latest" alias.
- Effort: if `/effort` exists, use its top level. If not, proceed at default.
- Multi-agent orchestration is available when the `Agent` tool is in your tool list. When it
  is, open your reasoning with the keyword `ultracode`.

### Mode

- `/phillip` (default) -> full multi-round loop, all three reviewers.
- `/phillip quick` -> one round. Claude-only under 200 changed lines. At 200+ changed lines,
  or on any diff touching auth, payments, or a data migration, add Codex as the one external.
  "Claude-only" still means the blind sub-agent (reviewer #3), not an in-session pass.
- Auto-scale by diff size: if the diff is docs-only, or under \~30 changed lines with no logic
  change, run Claude-only and say so -> do not spin up 12 external CLI calls to confirm a
  one-line change.
- Under 10 changed lines, spawning a sub-agent is also overkill -> review inline, but then
  label it `Claude (inline, not blind)` in the report so the independence claim stays honest.

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

Scope every reviewer to THIS diff. Do not re-review unchanged code. Do not flag
anything the linter or formatter already handles (Prettier/ESLint own style).

### Refresh the rubric first (non-blocking)

Before the review loop, invoke the `phillip-sync` skill once (e.g. `/phillip-sync`) to fold
this repo's recent resolved PR-review lessons into the rubric.

- It self-guards: a 24h per-repo cooldown makes most runs an instant no-op, and it
  degrades to a single warning line if `gh` is missing/unauthenticated/offline or anything
  errors.
- PROCEED REGARDLESS of its outcome. Never block, fail, or retry the review because sync
  warned or did nothing. Sync is an enhancement, not a gate.
- If sync reports it ADDED lines (e.g. "+N rubric" / "+N candidate"), re-Read
  `~/.claude/skills/phillip/RUBRIC.md` NOW. The rubric you were loaded with predates sync's
  edit THIS run, so the just-synced rows only take effect if you reread them. On a
  cooldown/empty no-op (the common case) skip the reread.

## 1. The review standard

The rubric lives in `~/.claude/skills/phillip/RUBRIC.md`. READ IT NOW, in full, before any
reviewer runs. It carries the auto-synced rules, the do-not-flag rules, the curated
categories, the Atllas-monorepo-only categories, the severity taxonomy (HIGH / MEDIUM / low),
and the verification discipline plus the HONESTY RULE that the rest of this file references.

Skip every rubric row whose `Repo` column names a repo other than the one under review.
`phillip-sync` maintains that file; there is no separate canonical copy to chase down.

## 2. The multi-round adversarial loop

Run rounds until convergence. Each round uses three independent reviewers: Codex, Gemini,
and a BLIND Claude sub-agent spawned via the Agent tool. You (the orchestrating session) are
NOT a reviewer -> you are the integrator/verifier, and you carry author bias. Do not collapse
reviewer #3 back into an in-session pass.

### Per round (run the three reviewers in PARALLEL)

Each external pass is \~1-5 min. Do NOT run them one-after-another -> start all three AT THE
SAME TIME.

1. FIRST, Read `~/.claude/skills/codex/SKILL.md` and `~/.claude/skills/gemini/SKILL.md`. This
   read is MANDATORY, not optional. They are the source of truth for the exact CLI flags, the
   filesystem-boundary prompt, the diff-scope prompt, and auth handling. A wrong flag writes
   an empty output file, which reads as a dry round when it is not one.
2. Launch BOTH external reviewers concurrently as background Bash jobs (`run_in_background:
   true`, one job per model), mirroring the review/challenge CLI calls you just read. Group
   each model's review + challenge into its OWN job so that model runs its two passes
   back-to-back while the OTHER model runs in parallel:
   - Codex job  -> `codex review` then `codex` adversarial challenge -> `/tmp/phillip-codex.out`.
   - Gemini job -> `gemini` review then `gemini` adversarial challenge -> `/tmp/phillip-gemini.out`.

   Call the CLIs DIRECTLY (backgrounded) so both run at once -> nested `/codex` and `/gemini`
   Skill invocations CANNOT parallelize, because skill calls are sequential.

   ALL THREE reviewers review against the rubric, not a generic bar. Add this line to the
   Codex prompt and the Gemini prompt: "Read `~/.claude/skills/phillip/RUBRIC.md` and apply
   it, skipping any row whose Repo column names a repo other than this one."
3. Reviewer #3 is a BLIND Claude sub-agent, launched via the Agent tool right after the two
   background jobs are running. The sub-agent must derive everything from the repo, never
   from you. Feed it ONLY:
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

Fallback if you cannot background jobs in your environment: issue the Codex and Gemini CLI
calls as two Bash calls in a SINGLE message (the harness runs independent calls
concurrently); worst case, invoke the `/codex` and `/gemini` skills sequentially -> still
correct, just slower. Parallelism is a speedup, never a correctness requirement.

Fallback if the Agent tool is unavailable (older harness / sub-agents unsupported): run
reviewer #3 as an INLINE Claude pass on the diff, exactly as the orchestrator would, AND state
in the report "reviewer #3 ran inline, not blind (Agent tool unavailable)." Never claim a
blind third reviewer you did not actually run as a sub-agent -> that violates the HONESTY RULE.

If the gemini skill is not installed (no `~/.claude/skills/gemini/SKILL.md`) or its CLI
auth is missing, do NOT silently drop a reviewer: run with Codex + Claude and state in
the report "Gemini unavailable -> ran with 2 reviewers." Same for Codex if it's absent.

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

Never silently drop a finding; every one ends as Fixed, Listed, or Rejected-with-reason.

### Cross-model disagreement

When Codex and Gemini disagree, YOU adjudicate by reading the actual code path -> do not
average them, do not defer to whoever sounds more confident. The losing suggestion is
documented as rejected-with-reason, not dropped.

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
- Do not start another round just to feel thorough. A dry round means done.

## 3. Final review report

Write the report to a stable file AND print it. Save to
`~/.claude/plans/phillip-<branch-slug>-<YYYY-MM-DD>.md` (create the dir if needed).
`<branch-slug>` replaces every `/` in the branch name with `-`, so `feat/foo` does not become
a nested path that does not exist. This survives the session and can be pasted into the PR
body as proof the self-review ran.

```
### Phillip self-review -> <branch>, <date>
Reviewers: Claude (blind) + Codex + Gemini   Rounds run: <n>
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
