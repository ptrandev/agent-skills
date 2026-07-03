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
  substantial). Use for small or low-risk diffs to avoid overkill. "Claude-only" still means
  the blind sub-agent (reviewer #3), not an in-session pass -> keep the reviewer independent
  even when you skip the externals.
- Auto-scale by diff size: if the diff is trivial (docs-only, or under ~30 changed
  lines with no logic change), run Claude-only and say so -> do not spin up 12 external
  CLI calls to confirm a one-line change. On a truly trivial diff, spawning a sub-agent is
  also overkill -> reviewing inline is fine, but then label it `Claude (inline, not blind)`
  in the report so the independence claim stays honest.

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
# `git diff "$BASE"` compares BASE -> working tree (committed + staged + unstaged, tracked
# files). With a clean tree (e.g. full-send commits in Phase 4 first) this equals
# BASE...HEAD; with uncommitted work it also captures what you're about to ship. Guard the
# empty-BASE case (shallow/disconnected history) so the diff never expands to `...HEAD`.
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

Before the review loop, invoke the `phillip-sync` skill once to fold this repo's recent
resolved PR-review lessons into the rubric below:

- Run the `phillip-sync` skill (e.g. `/phillip-sync`).
- It self-guards: a 24h per-repo cooldown makes most runs an instant no-op, and it
  degrades to a single warning line if `gh` is missing/unauthenticated/offline or anything
  errors.
- PROCEED REGARDLESS of its outcome. Never block, fail, or retry the review because sync
  warned or did nothing -> the existing rubric in section 1 is always good enough to review
  against. Sync is an enhancement, not a gate.
- If sync reports it ADDED lines (e.g. "+N rubric" / "+N candidate"), re-Read this file
  (`~/.claude/skills/phillip/SKILL.md`) section 1 NOW. The rubric you were loaded with
  predates sync's edit THIS run, so the just-synced lines only take effect if you reread
  them. On a cooldown/empty no-op (the common case) skip the reread -> the in-context rubric
  is already current.

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
- Unhandled promise rejection: a fire-and-forget async chain (`void fn().then(...)`, an un-awaited write, or `Promise.all([...])` with no `.catch`) throws into the void on failure (RN redbox / a screen stuck on its skeleton), not a handled error -> attach `.catch` or await inside try/catch.  _(auto-synced from PR reviews 2026-06-19)_
- Inconsistent numeric basis: two related figures derived from different sources (a usage bar on plan-cap math vs an "X left" line that also counts purchased credits), or a count/total that excludes a category another view includes (cold leads under "all"; a rollup summing only the stuck subset) -> the numbers visibly contradict. Drive both from one source of truth.  _(auto-synced from PR reviews 2026-06-19)_
- Persisted/validated field != the field the user edits: a setup/save path drops an override the form collected (`performSetup` drops `smsSenderName`/`smsMeetingLink`), or validation gates on the shared DEFAULT while the user edited a per-agent OVERRIDE -> the change appears to save but silently never takes effect, or a feature enabled with its required field left blank saves then never fires. Drive validation AND persistence off the exact field bound to the input.  _(auto-synced from PR reviews 2026-06-25)_
- Nullish/falsy coalescing eats a legitimate `0` or `null`: a truthy check (`tokensAvailable ? ...`) hides the UI at exactly 0, or `input.x ?? existing.x` / `?? default` blocks the user clearing a field to null (e.g. a calling-window `schedule`) -> the edit looks saved but the zero/cleared state is silently dropped. Use explicit `!= null` / `!== undefined`.  _(auto-synced from PR reviews 2026-06-30)_
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
- Async try/finally cleanup race: `return thisAsyncCall()` inside `try { } finally { releaseLock() }` runs the finally BEFORE the returned promise settles, so the lock/cleanup fires while the async work is still running -> use `return await`. (PR #1632, 2026-06-19)
- React state update during render: calling a setter (e.g. `setTick`) inside a `useMemo` or the render body is a render-phase side effect (double-fires under StrictMode, unsupported going forward) -> move it to `useEffect`. (PR #1710, 2026-06-19)
- Firestore query treated as ordered without `orderBy`: `where('x','==',v).get()` then taking `docs[0]` as the "most recent" -> result order is by document id, not time. Add an explicit `orderBy(...).limit(1)`. (PR #1700, 2026-06-25)
- Access-level downgrade on route consolidation: merging two product pages into one unified route picks the looser guard (`OH Premium` -> `OH Free`), silently widening access to a paid surface. Re-check the access level whenever routes are merged. (PR #1700, 2026-06-25)
- Expensive object allocated per-render/per-call: `new Intl.DateTimeFormat(...)` (or a regex/formatter) built inside a frequently re-evaluated view, method, or row loop -> hoist to a module/static cache keyed by its args. (PR #1782, 2026-06-30)
- First-page-only pagination used as a gate: an external list API fetched with no `limit`/`paging.next` follow (Graph `/leadgen_forms` ~25/page) then treated as the complete set -> items past page 1 silently excluded (forms 26+ can't be enabled -> leads never called). Page through fully when the list gates behavior. (PR #1743, 2026-06-30)
<!-- phillip-sync:candidates END -->

## 2. The multi-round adversarial loop

Run rounds until convergence. Each round uses three independent reviewers: Codex, Gemini,
and a BLIND Claude sub-agent. You (the orchestrating session) are NOT a reviewer -> you are
the integrator/verifier. The Claude voice that counts as reviewer #3 is a fresh sub-agent
spawned via the Agent tool, because the orchestrating session has author bias: it carries
this conversation, the implementation reasoning, and (in self-review / full-send flows) the
fact that it wrote the code under review. A blind sub-agent starts with none of that, so it
is structurally as independent as the two external CLIs. That blindness is the whole point ->
do not collapse it back into an in-session pass.

### Per round (run the three reviewers in PARALLEL)

The reviewers are independent and the external CLIs are the slow part (each pass is
~1-5 min). Do NOT run them one-after-another -> start all three AT THE SAME TIME. This cuts a
round from the sum of all passes down to roughly the slowest single pass.

1. Launch BOTH external reviewers concurrently as background Bash jobs (`run_in_background:
   true`, one job per model). Group each model's review + challenge into its OWN job so that
   model runs its two passes back-to-back while the OTHER model runs in parallel:
   - Codex job  -> `codex review` then `codex` adversarial challenge -> `/tmp/phillip-codex.out`.
   - Gemini job -> `gemini` review then `gemini` adversarial challenge -> `/tmp/phillip-gemini.out`.

   Call the CLIs DIRECTLY (backgrounded) so both run at once -> nested `/codex` and `/gemini`
   Skill invocations CANNOT parallelize, because skill calls are sequential. The `codex` and
   `gemini` skills remain the source of truth for the exact CLI flags, the filesystem-boundary
   prompt, the diff-scope prompt, and auth handling -> mirror their review/challenge CLI calls
   here as background processes. (Read those skills once if you need the precise invocation.)
2. Reviewer #3 is a BLIND Claude sub-agent, launched via the Agent tool right after the two
   background jobs are running. The two CLIs keep working while the sub-agent works -> all
   three overlap, zero idle time. The sub-agent must derive everything from the repo, never
   from you. Feed it ONLY:
   - the role: "You are an independent code reviewer. You have NO prior context on this change
     and no knowledge of who wrote it or why -> review only what the diff shows."
   - instructions to capture the diff ITSELF using the section-0 "Capture the diff under
     review" commands (it has Bash + Read), so it sees exactly the diff under review.
   - instructions to Read section 1 (the review standard) of this file
     (`~/.claude/skills/phillip/SKILL.md`) and apply it -> including the severity taxonomy,
     the verification discipline, and the HONESTY RULE.
   - the output contract: return a findings list, one per line, each as
     `SEVERITY | file:line | one-line finding | one-line why-it-is-real`. It REVIEWS only; it
     does not edit, fix, or commit anything.

   Do NOT paste the conversation, the ticket, the implementation rationale, or any "what this
   is supposed to do" narrative into the sub-agent prompt -> that reintroduces the author bias
   the blindness exists to remove. Run it at full strength (it inherits this session's model;
   do not downgrade it).
3. Collect: once both background jobs finish, read `/tmp/phillip-codex.out` and
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

Keep the report terse. Cite lines. Name user impact. That is the bar.
