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

Operate at full strength. Do NOT hardcode a model version -> names change, and Claude has no
rolling "latest" alias. The rule is "most capable model available, highest reasoning effort."
The model is whatever this Claude Code session runs (chosen by the human in `/model`, not a
string this skill sets):
- Model: confirm you are on the most capable model available. If not, tell the user to run
  `/model` and choose the most capable option offered. (As of 2026-06-17: Opus 4.8 is the
  strongest coding/agentic model and the Claude Code default; Fable 5 is the most intelligent
  overall at ~2x cost. Prefer whatever is newest and most capable when this note is stale ->
  verify, do not trust this line.)
- Effort: set the highest reasoning effort your build offers. If `/effort` exists, use its top
  level (today `ultracode`); if not, proceed at default -> do not loop telling the user to run
  an unavailable command.
- If multi-agent orchestration is available, begin your reasoning with the keyword `ultracode`.
  Review fans out naturally across reviewers and files, so it helps.

### Mode

- `/phillip` (default) -> full multi-round loop, all three reviewers.
- `/phillip quick` -> one round, Claude-only (or Claude + one external if the diff is
  substantial). Use for small or low-risk diffs to avoid overkill.
- Auto-scale by diff size: if the diff is trivial (docs-only, or under ~30 changed
  lines with no logic change), run Claude-only and say so -> do not spin up 12 external
  CLI calls to confirm a one-line change.

### Capture the diff under review

Detect the default branch instead of assuming `master` -> many repos use `main`:

```bash
git fetch origin --quiet 2>/dev/null
DEFAULT=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')
DEFAULT=${DEFAULT:-$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p')}
DEFAULT=${DEFAULT:-master}
BASE=$(git merge-base HEAD "origin/$DEFAULT" 2>/dev/null || git merge-base HEAD "$DEFAULT")
git diff --stat "$BASE"...HEAD
git diff "$BASE"...HEAD
```

Scope every reviewer to THIS diff. Do not re-review unchanged code. Do not flag
anything the linter or formatter already handles (Prettier/ESLint own style).

### Refresh the rubric first (non-blocking)

Before the review loop, invoke the `phillip-sync` skill once to fold this repo's recent
resolved PR-review lessons into the rubric below:

- Run the `phillip-sync` skill (e.g. `/phillip-sync`).
- It self-guards: a 24h per-repo cooldown makes most runs an instant no-op, and it
  degrades to a single warning line if `gh` is missing/unauthenticated/offline or anything
  errors.
- PROCEED REGARDLESS of its outcome. Never block, fail, or retry the review because sync
  warned or did nothing -> the existing rubric in section 1 is always good enough to review
  against. Sync is an enhancement, not a gate.

Then continue with section 1 using the (possibly just-updated) rubric.

## 1. The review standard (seeded from Phillip's bar, auto-expanded from this repo's PR reviews)

This rubric is the single source of truth and it self-maintains. It started from Phillip's
engineering bar and now grows from the whole team's resolved PR-review comments in whatever
repo you run in: the `phillip-sync` skill mines recent, accepted-and-acted-on review threads
and appends recurring, generalizable lessons here automatically. There is NO separate
canonical copy to chase down -> this file IS it. Treat every line below as "what to catch."

The two anchored blocks just below are written automatically by `phillip-sync`. Hand-edit
around them freely, but leave the `<!-- phillip-sync:... -->` markers in place so sync can
keep writing deterministically.

<!-- phillip-sync:auto START -->
<!-- Auto-synced rubric lines land here: recurring + acted-on + generalizable patterns
     mined from this repo's resolved PR reviews. Each is tagged with the date it was added.
     Promote anything especially important up into the curated categories below. -->
<!-- phillip-sync:auto END -->

### Severity taxonomy (use these exact markers)

- HIGH (red) -> must-fix before merge. Correctness bugs, security holes, data loss,
  cross-account data leaks, cold-start navigation bugs, anything a real user hits.
  Real example: "bridging has no logout counterpart -> cross-account leak; the
  previous user's hot-lead pushes (lead names + call summaries) are delivered to the
  new user's device."
- MEDIUM (yellow) -> should-fix. Silent failures (fetch not checking `response.ok`),
  inaccurate code comments, reachable races, latent footguns reachable in practice.
  Real example: "silent registration failure. fetch does not reject on HTTP 401/500,
  so a failed PATCH is treated as success."
- low / nit (green) -> display-only, style, theoretical-but-not-reachable, polish.
  Real example: "`substring(0,140)` slices by UTF-16 code units, so the cut can split
  an emoji/grapheme."

(`[P1]/[P2]/[P3]` map to HIGH/MEDIUM/LOW if a reviewer uses them.)

Only HIGH and MEDIUM get implemented. LOW/nits are listed but optional.

### Verification discipline (non-negotiable -> this is the signature)

NEVER assert a finding without checking it against reality:
- Verify against the actual code path -> open the file, read the function, trace the flow.
- Verify against production data when the claim is about data ("of 127,925 records,
  only 110,986 match...").
- Verify against live third-party API/SDK behavior when the claim is about an external
  contract ("Verified against the live OpenAI API: `reasoning_effort: 'none'` is
  accepted by gpt-5.4...").
- Distinguish TYPE-level problems from RUNTIME problems ("won't actually throw today,
  but the SDK type was the real issue").
- Cite exact `file:line` for every finding, and the fix commit SHA once fixed.

HONESTY RULE (this is the whole point of the discipline): a "Verified against the live
API" or "Confirmed against production" line is a claim of PROOF. Only write it if you
actually ran that check THIS session. To hit a live API/SDK contract, use WebFetch or
WebSearch. To check production data, use the project's CLI via Bash (e.g. the Firebase
CLI for Firestore/RTDB) when it is available and you have access. If you CANNOT verify
a claim -> no tool, no access, no time -> say so explicitly, downgrade your confidence,
and route the finding as "needs human verification." Never fabricate a verification you
did not perform. A claimed-but-fake verification is worse than an honest "unverified."

### Categories Phillip reliably catches (language-agnostic core)

- Security: cross-account data leaks, missing token de-registration on logout,
  auth/permission gaps. Check that every access path enforces the right permission.
- Races: in-flight request repopulating a cache after a session switch; multi-write
  races; cold vs warm start ordering; login/logout sequencing.
- Silent failures: `fetch` not checking `response.ok`; swallowed errors; a failed
  write treated as success.
- Inaccurate code comments (the comment lies about what the code does).
- Regex edge cases; UTF-16 / emoji / grapheme slicing.
- Root-cause over band-aid: prefer one root-cause fix; note when it resolves multiple
  raised points.

### Categories -> Atllas codebase monorepo only (SKIP if this repo isn't it)

Apply these only when reviewing the Atllas `codebase` monorepo. On any other project
they are noise -> do not hunt for Firestore indexes or a privs package that don't exist.

- Permissions: route all access checks through `packages/privs`.
- Firestore correctness: every compound query (equality + range, multiple equalities,
  or orderBy on a different field) needs a matching composite index in
  `_firebase/firestore.indexes.json`. Missing index = silent prod failure. Never put
  `__name__` in that file.

### Things Phillip does NOT do (so don't do them either)

- Does not bikeshed style the formatter owns.
- Does not force changes on deliberate tradeoffs. If a choice is intentional, mark it
  `[note - accepted tradeoff]` and request no change.
- Does not invent work. If something real should be deferred, file a Linear ticket for
  it (see report section) rather than dropping it silently.
- Does not review-theater. Stop when the diff is clean (see stopping rule).

## Candidates (auto-detected -> promote into the rubric above, or delete)

Lower-confidence patterns `phillip-sync` spotted but did not auto-add to the rubric: seen
once, only from a single senior comment, or possibly already covered. Review periodically ->
promote the real ones into a category above, delete the noise. Sync never auto-promotes
from here.

<!-- phillip-sync:candidates START -->
<!-- Candidate lines land here. Human-gated: promote or delete. -->
<!-- phillip-sync:candidates END -->

## 2. The multi-round adversarial loop

Run rounds until convergence. Each round has three reviewers plus your own pass.

### Per round

1. Codex review -> invoke the `codex` skill: `/codex review`
   (independent diff review, read-only sandbox, pass/fail gate, high reasoning effort).
2. Codex challenge -> `/codex challenge` (adversarial: actively tries to break the code).
3. Gemini review -> invoke the `gemini` skill: `/gemini review` (defaults to
   `gemini-pro-latest`).
4. Gemini challenge -> `/gemini challenge` (adversarial, `gemini-pro-latest`).
5. Claude review -> your own pass, applying the Phillip Standard above directly to the
   diff. You are the third independent voice, not just an aggregator.

Collect every finding from all three into one list with proposed severity.

If the gemini skill is not installed (no `~/.claude/skills/gemini/SKILL.md`) or its CLI
auth is missing, do NOT silently drop a reviewer: run with Codex + Claude and state in
the report "Gemini unavailable -> ran with 2 reviewers." Same for Codex if it's absent.

### Verification gate (run BEFORE changing any code)

For EACH finding, run TWO checks -> verifying the finding is NOT the same as verifying
the fix:

1. Is the FINDING real? Open the cited `file:line`. Trace the actual flow. Does the bug
   really occur? If the claim is about data, check the data. If about an external
   API/SDK contract, check the real contract (and obey the HONESTY RULE above).
2. Is the proposed FIX correct and side-effect-free? A reviewer can be right about the
   bug and wrong about the patch.

Then classify:
  - Finding false -> REJECT. Write one line proving why from the actual code flow.
  - Finding valid (HIGH/MEDIUM) + fix sound -> implement the reviewer's fix.
  - Finding valid (HIGH/MEDIUM) + fix wrong -> implement YOUR OWN corrected fix, and
    document the rejected reviewer fix with a reason, e.g.: "Gemini #1 (race) is valid,
    but its suggested patch is rejected -> that predicate also fires on a status-only
    transition -> duplicate push. Fixed with a guard on the transition source instead."
  - Finding valid + LOW/nit -> list it, do not implement (unless trivial and adjacent).

Never silently drop a finding; every one ends as Fixed, Listed, or Rejected-with-reason.
Killing bad fixes before they touch the tree is what reduces churn AND reduces Phillip's
PR comments.

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
- The confirmation/dry round may be scoped to the lines changed by fixes applied since
  the last round (a delta re-check) rather than a full re-review of the whole diff ->
  but keep the full fan-out for any round that is still finding issues.
- Hard cap at 3 rounds. If round 3 still surfaces verified HIGH/MEDIUM issues, stop,
  implement them, and flag in the report that the change is churny and the final fixes
  are UNCONFIRMED (no dry round followed them).
- Do not start another round just to feel thorough. A dry round means done.

## 3. Final review report

Write the report to a stable file AND print it. Save to:
`~/.claude/plans/phillip-<branch>-<date>.md` (create the dir if needed). This survives
the session and can be pasted into the PR body as proof the self-review ran.

```
### Phillip self-review -> <branch>, <date>
Reviewers: Claude + Codex + Gemini   Rounds run: <n>
Stopped because: dry round / 3-round cap

| # | Severity | File:line | Finding | Source | Status |
|---|----------|-----------|---------|--------|--------|
| 1 | HIGH     | Aicc.ts:1098 | <one line> | Codex | Fixed b8c6727914 |
| 2 | MEDIUM   | app/index.tsx:28 | <one line> | Claude | Fixed <sha> |
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

Keep the report terse. Cite lines. Name user impact. That is the bar.
