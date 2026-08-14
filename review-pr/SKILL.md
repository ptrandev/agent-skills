---
name: review-pr
description: >
  Reviews GitHub PRs where you are the requested reviewer, applying Phillip's engineering bar.
  Posts inline comments and a verdict back to GitHub, and adjudicates existing bot review
  threads. The cross-review sibling of /phillip, which handles self-review. Autonomous by
  default.
---

# review-pr

The **reviewer side** of the PR loop. `/babysit-prs` addresses threads on PRs *you authored*.
`/phillip` self-reviews *your local diff*. **`/review-pr` reviews someone else's PR where you're the
requested reviewer** and posts the review to GitHub.

It is the **cross-review sibling of `/phillip`**: same engineering bar, same three-reviewer
discipline, same verification gate. The action is **post review comments + a verdict**, not
*implement fixes*. It **reads** `/phillip`'s rubric at runtime from
`~/.claude/skills/phillip/RUBRIC.md` rather than copying it, so `/phillip-sync` keeps both skills'
bar fresh automatically.

## Input / modes

`$ARGS`:

| Invocation | Behavior |
|---|---|
| `/review-pr` | All open PRs across both Targets repos where the current user is a requested reviewer (and not the author). |
| `/review-pr <PR#>` | That PR (resolves to `Atllas-Inc/codebase` unless `--repo`; PR#s are ambiguous across repos). |
| `/review-pr <URL>` | Parse owner/name/number from the GitHub URL (unambiguous). |
| `/review-pr quick` | Claude-only blind reviewer, auto-selected for trivial diffs at `/phillip`'s Mode thresholds (`~/.claude/skills/phillip/SKILL.md` section 0). Default = full three-reviewer. |
| `... --draft` | Opt **down**: assemble + report + print the exact payload, **don't submit**. |
| `... --no-approve` | Opt **down**: cap the verdict at `COMMENT`, never post `APPROVE`. |
| `... --no-live` | Opt **down**: skip the Tier-3 dynamic walkthrough even on a UI PR. |
| `... --no-resolve-bots` | Opt **down**: still validate bot comments, but **don't resolve** any (just reply). |

### Targets (default repos)

| Repo | Local clone | Verify depth |
|------|-------------|--------------|
| `Atllas-Inc/codebase` | `/Users/phillip/Git/codebase` | FULL (yarn typecheck/lint/vitest) |
| `Atllas-Inc/aicc-queues` | `/Users/phillip/Git/aicc-queues` | COMPILE-ONLY (`./gradlew compileJava`; integration tests need Redis+Postgres+Firebase) |

**Default reviewer = the `gh` authenticated login** (`ME`). Adding a repo later = one more row.

---

## Core safety model (do not weaken)

This skill posts to **other people's** PRs: outward-facing and socially high-stakes. Five invariants:

1. **Autonomous post by default; quality-gated.** It submits the review without a confirm step.
   `--draft` opts down to assemble-and-print-only. The autonomy is bounded by rail #2, not by a stop.
2. **Only verified findings reach GitHub.** A finding posts inline **only** if it was traced against
   the real code path **this session**. Unverified, "couldn't check", and low-confidence findings are
   **never posted**: they go to the local report's **NEEDS YOUR EYES** section. Nits (LOW) are held
   to the report as well. Only verified HIGH+MEDIUM post inline. A false `REQUEST_CHANGES` on a
   teammate is the exact failure mode this rail prevents.
3. **Conservative verdict** (table below): `REQUEST_CHANGES` only on a verified HIGH; `APPROVE` only
   on a clean **fully-verified** pass (and never with `--no-approve`); otherwise `COMMENT`.
4. **Skip self-authored PRs** (`author == ME`) and PRs already reviewed at the current head SHA
   (idempotency, Phase 2).
5. **Never review a draft PR.** A GitHub draft (`isDraft == true`) is work-in-progress and is
   **excluded end-to-end**: filtered at discovery (`select(.isDraft!=true)` / `draft:false`), skipped
   with a note when named explicitly ("PR #N is a draft, skipped. Re-request review when it's marked
   ready."), and **re-checked immediately before any post**. A PR flipped to draft mid-run is
   abandoned, never posted. Review **only open, ready-for-review** PRs.

### Severity → verdict

| Postable findings | `event` |
|---|---|
| ≥1 verified HIGH | `REQUEST_CHANGES` (inline every HIGH + MEDIUM) |
| verified MEDIUM only (no HIGH) | `COMMENT` |
| nothing verified / clean, **FULL** verify depth | `APPROVE` (default); `--no-approve` caps at `COMMENT` |
| nothing verified / clean, **reduced** depth (no clone / compile-only / no dynamic) | `COMMENT` ("no blocking issues; not fully verified"). **Never** auto-APPROVE. |
| aicc-queues HIGH resting on **runtime behavior** with **compile-only** evidence | downgrade to `COMMENT` + "compile-only evidence, runtime unverified. Please confirm." Never block on a compile alone. |

**Reviewer count gates `APPROVE` too.** A run with fewer than three reviewers caps at `COMMENT`,
whatever the verify depth. That covers `quick` mode (one blind Claude reviewer) and any run where
`/codex` or `/gemini` was missing (Tier 2b). One reviewer finding nothing is not evidence that a
teammate's PR is clean. State which reviewers ran in the review body.

---

## Writing style

The user's global writing rules, copied verbatim from `~/.claude/CLAUDE.md`. A headless run (a
Routine, a cloud sandbox, `claude -p`) never loads that file, so this copy is the binding one. It
governs every inline comment, review body, verdict, bot-thread reply, and report this skill writes.
When the rules change there, copy them here unchanged rather than paraphrasing.

Apply ASD-STE100 principles to **every** artifact a human reads, not just chat replies:
PR descriptions, PR review comments and verdicts, commit bodies, issue comments, Slack
messages, docs, and reports. Text posted to GitHub or Slack is read by teammates, so it
gets the same pass, not a looser one.

- One idea per sentence. Split any sentence carrying two or three.
- Remove information that does not help the reader act.
- Keep the evidence. Concision means fewer words per claim, never fewer claims:
  `file:line`, the command run, the actual numbers all stay.
- Never use the em dash. A period, comma, colon, or parentheses always works. Use
  `LABEL: text` for a header or severity separator, and a period or comma mid-sentence.
- Let the completed work show the result. No preamble, no self-congratulation.
- Include all necessary context. Concise and complete, not concise and partial.
- In any markdown that will be rendered (chat responses, PR/issue bodies, reports, docs),
  escape delimiter characters used literally, since two of them in one paragraph silently
  corrupt everything between: `\~` for "approximately" tildes (`~...~` is strikethrough in
  GFM) and `\$` for dollar amounts (`$...$` is inline LaTeX math in GitHub and VSCode
  preview). Literal `~`/`$` in code stay inside backticks instead.

It is binding on the orchestrator and on every sub-agent. A review posted to a colleague's PR is
the most public artifact this skill produces, so it gets the strictest pass.

---

## Phase 0: Preflight + capability detection

Establish identity, targets, and **what this environment can do**, so the same skill is correct
whether it runs in a cloud sandbox or on a local Mac.

```bash
# Probe the GitHub transport. Do NOT assume `gh` works just because it is installed.
if gh api user --jq .login >/dev/null 2>&1; then
  GH_TRANSPORT=cli; ME=$(gh api user --jq .login)
else
  GH_TRANSPORT=mcp    # fall through to the GitHub MCP tools; read ME from the MCP identity call
fi
SCRATCH=/private/tmp/review-pr; mkdir -p "$SCRATCH"    # NOT $TMPDIR, see below
```

**`gh auth status` is the wrong probe.** It reports on stored credentials, not on whether the API
is reachable. Probe with a real call (`gh api user`) so a 403 at the session boundary is caught
here rather than at Phase 8, after the whole review is assembled.

**`$SCRATCH` must live under `/private/tmp`.** The `browse` driver rejects screenshot paths outside
`/private/tmp` or the repo root, and it fails per-screenshot, so a `$TMPDIR`-based scratch dir
(macOS `$TMPDIR` is `/var/folders/…`) makes **every capture fail silently**. Phase 3 builds its
worktree path from `$SCRATCH`. The stack lock is a separate absolute literal, see
[stack-lifecycle.md](stack-lifecycle.md).

Resolve the **target repo set** (`--repo` override, else both Targets rows). For each, split
`OWNER=${REPO%/*}` / `NAME=${REPO#*/}` and map to its clone.

**Capability tiers** (probe and record booleans; later phases branch on them):

- **Tier 1, discover + post (`GH_TRANSPORT`):** `gh` **or** the GitHub MCP tools. **Not always
  available.** A cloud sandbox can have GitHub API access disabled at the session level, where every
  `gh api` call 403s with "GitHub access is not enabled for this session" no matter how `gh` was
  installed (verified 2026-08-14, routine sandbox). Installing the binary does not fix it. Record
  which transport won and route **every** GitHub call through it. Neither -> stop: there is nothing
  to discover from or post to. **Git transport is separate and unaffected**: the clone and
  `/ui-walkthrough`'s evidence-ref push still work when the API is blocked.
- **Tier 2, verify against real code (`CAN_VERIFY_<repo>`):** the repo's clone exists, is clean,
  and the toolchain runs. Probe `node`/`yarn` (codebase -> FULL) and `java`/`./gradlew`
  (aicc-queues -> COMPILE-ONLY). Without it a PR can still be reviewed from the diff, but **every
  finding drops to reduced confidence and posts nothing** (report-only, invariant 2).
- **Tier 2b, external reviewers:** `/codex` and `/gemini` skills present + their CLIs authed.
  Missing -> run with fewer reviewers and say so (same fallback as `/phillip`), and the verdict
  caps at `COMMENT`.
- **Tier 3, dynamic walkthrough**, two sub-capabilities:
  - `CAN_LIVE_HEADLESS`: can stand up the agents-portal stack + drive a **headless browser**.
    Requires a browser driver (`browse` binary locally, or headless Playwright/Chromium in cloud)
    **and enough memory to host the stack**. Heuristic gate: **skip if total RAM < ~8 GB** (Next.js
    + JVM Firebase emulators + API need it). A constrained runtime does static review only and flags
    UI PRs for a higher-capacity run.
    ```bash
    case "$(uname -s)" in
      Darwin) TOTAL_MB=$(sysctl -n hw.memsize 2>/dev/null | awk '{print int($1/1048576)}') ;;
      *)      TOTAL_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}') ;;
    esac
    TOTAL_MB=${TOTAL_MB:-0}
    [ "$TOTAL_MB" -ge 8000 ] && HAVE_RAM=1 || HAVE_RAM=0
    ```
    Branch on the OS. `free` does not exist on macOS, so a `free -m`-only probe returns
    `TOTAL_MB=0` there, sets `HAVE_RAM=0`, and disables the walkthrough on every local Mac run,
    which is the one runtime that also supports the video.
  - `CAN_VIDEO`: an OpenCap walkthrough video can be recorded. **Local macOS only**, and it is
    `/ui-walkthrough`'s to produce, not this skill's, see `ui-walkthrough/opencap.md`. This does
    **not** require a human watching: the capture is scoped to the browser window, so an unattended
    `/loop` records the same artifact as an attended run and nothing else on screen reaches GitHub.

**Refresh the rubric (non-blocking):** invoke `/phillip-sync` once (a 24 h cooldown makes it usually
a no-op). If it reports it ADDED lines, **re-Read** the rubric. Then **Read
`~/.claude/skills/phillip/RUBRIC.md` in full**: that rubric is what this skill reviews against. It
is three anchored tables (auto-synced rules, candidates, and a do-not-flag block of negative rules)
plus the severity taxonomy and the verification discipline. Skip any row whose `Repo` column names a
repo other than the one under review. *Read, don't reinvent.*

Print a per-repo readiness summary:
```
Preflight:  gh ✓ (ptrandev)   reviewers: codex ✓ gemini ✓   dynamic: headless ✓
  Atllas-Inc/codebase     clone ✓ clean ✓   verify FULL
  Atllas-Inc/aicc-queues  clone ✓ clean ✓   verify COMPILE-ONLY
```

---

## Phase 1: Discover PRs awaiting my review

Per repo (validated: `gh search prs --review-requested=<me>` works on gh 2.87+):

```bash
gh search prs --review-requested="$ME" --state=open --repo "$REPO" \
  --json number,title,author,url,isDraft \
  --jq '.[] | select(.author.login!="'"$ME"'") | select(.isDraft!=true) | "\(.number)\t\(.author.login)\t\(.title)"'
```

GraphQL fallback if the search flag is flaky in cloud:
`search(query:"is:pr is:open draft:false review-requested:'"$ME"' repo:'"$REPO"'", type:ISSUE, first:50)`.

If `$ARGS` named a PR#/URL, use it directly, but still confirm `ME` is a requested reviewer, is not
the author, and that the PR is not a draft (invariant 5).

Dispatch and staging for multi-PR runs are in [orchestration.md](orchestration.md), summarized under
*Orchestration* after Phase 9. A single-PR run needs neither.

---

## Phase 2: Idempotency gate (skip already-reviewed-at-this-head)

```bash
HEAD_SHA=$(gh api "repos/$OWNER/$NAME/pulls/$PR" --jq .head.sha)
gh api "repos/$OWNER/$NAME/pulls/$PR/reviews" \
  --jq "[.[] | select(.user.login==\"$ME\")] | sort_by(.submitted_at) | last | {state, commit_id}"
```

- No prior review by me -> **fresh review**.
- Prior review `commit_id == HEAD_SHA` -> **skip** (`PR #n: already reviewed at current head`).
- Prior review `commit_id != HEAD_SHA` -> **re-review the new push**, scoped incrementally to
  `git diff <old commit_id>...<HEAD_SHA>` (don't re-flag unchanged code). Old SHA unreachable
  (force-push) -> full re-review. Post against the **new** `commit_id`.

**Three-dot, and only after Phase 3's `git fetch origin "$BASE"` and `git fetch origin
"pull/$PR/head"`**, so both endpoints and their merge base are on disk. Two-dot (`..`) pulls in every
base-branch commit that landed between the two reviews, so on a rebased PR or an advanced base you
post findings on code the author never wrote.

**Bot threads on a skipped PR.** A Phase-2 skip **still runs Phase 5b** when the PR has unresolved
bot threads created after the prior review's `submitted_at`. Bot threads accumulate without a new
push (Gemini Code Assist re-runs, Copilot on request), so gating adjudication on the head SHA would
leave that noise unadjudicated forever. Such a run does Phase 3 (checkout, needed to verify) plus
Phase 5b only, and posts no review. No newer bot threads -> skip the PR entirely.

The reviews list **is** the idempotency state, no separate state file. This is what makes scheduled
re-runs safe.

---

## Phase 3: Fetch the PR's true diff + get its code on disk (read-only)

**The diff base is the one thing this skill MUST get right** (proven in testing): a clone's local
`master` is often stale or divergent, so `git merge-base master..HEAD` yields a garbage multi-hundred-
file diff. Always compute against a **freshly fetched** base, three-dot, and treat `gh pr diff` as
the source of truth:

```bash
BASE=$(gh api "repos/$OWNER/$NAME/pulls/$PR" --jq .base.ref)   # the PR's real base (usually master)
HEAD_SHA=$(gh api "repos/$OWNER/$NAME/pulls/$PR" --jq .head.sha)
gh pr diff "$PR" --repo "$REPO" > /tmp/review-pr-$NAME-$PR.diff         # authoritative diff
gh api "repos/$OWNER/$NAME/pulls/$PR/files" --paginate > /tmp/review-pr-$NAME-$PR-files.json  # patch ranges for anchoring
cd "$CLONE"; git fetch origin "$BASE" --quiet                          # FRESH base, or merge-base lies
git fetch origin "pull/$PR/head" --quiet
```

**Get the PR's code on disk without disturbing the user's clone.** If the clone is **clean**,
`gh pr checkout "$PR"` is fine. If it's **dirty** (don't switch their branch!), use an isolated
worktree at the head SHA. The skill must not stash or change branches under a dirty tree:

```bash
if [ -z "$(git status --porcelain)" ]; then
  gh pr checkout "$PR" --repo "$REPO"; WORKDIR="$CLONE"          # READ-ONLY, never commit/push
else
  WORKDIR="$SCRATCH/pr-$NAME-$PR"; git worktree add --detach "$WORKDIR" "$HEAD_SHA"
fi
# Sanity: the three-dot diff vs FRESH base must equal gh pr diff's file set (else base is wrong).
git -C "$WORKDIR" diff --name-only "origin/$BASE...$HEAD_SHA"
```

No clone at all -> review from `gh pr diff` alone at **reduced confidence** (post nothing,
report-only). Remove the worktree in Phase 9 (`git worktree remove --force "$WORKDIR"`).

---

## Phase 4: Three-reviewer pass (reuse /phillip's discipline, scoped to the PR diff)

Run the same fan-out as `/phillip` section 2, with the scope set to the **PR diff** and the action
set to "post comments", not "fix". Read that section for the parallelism rules. The one that is easy
to lose: launch the Codex and Gemini CLIs **directly as concurrent background Bash jobs**, because
nested `/codex` and `/gemini` **skill** invocations cannot parallelize (skill calls are sequential).
An agent that reaches for the skills instead runs the two models back to back and doubles the wall
clock of every review.

- **Codex** + **Gemini** as concurrent background Bash jobs. **Run them from `$WORKDIR` against the
  PR's true diff**: point them at the freshly-fetched base so they don't review the stale-master
  garbage (`git diff "origin/$BASE...$HEAD_SHA"`, or feed them `/tmp/review-pr-$NAME-$PR.diff`
  directly). Outputs to `/tmp/review-pr-codex-$NAME-$PR.out` / `-gemini-$NAME-$PR.out`. (All temp
  paths include `$NAME`: PR numbers repeat across repos, and parallel per-repo agents writing
  `/tmp/review-pr-$PR-*` would clobber each other.)
  - **Headless/sandbox invocation gotchas** (API-key `codex exec` instead of `codex review`, the
    `codex login --with-api-key` requirement, Gemini's inline-`-p` limitation, its
    `RESOURCE_EXHAUSTED` degradation): [routine.md](routine.md) section 8.
  - **Model selection:** honor `$CODEX_MODEL` / `$GEMINI_MODEL` when set, otherwise take the CLIs'
    own defaults. Never hardcode a version in this file. See the `/codex` and `/gemini` skills.
  - **A reviewer that refused is not a reviewer that found nothing. Never gate on exit status
    alone.** Gemini's trust-gate refusal exits **0** with no findings (verified 2026-08-14), so an
    exit-status check records a reviewer that never ran as a clean pass, and a clean pass is an
    input to `APPROVE`. Gate on the **output**: a reviewer counted as having run must have a
    non-empty output file that contains its findings contract. An empty file, a refusal, or a quota
    error means that reviewer is **missing**, which drops the count and caps the verdict at
    `COMMENT` (Tier 2b).
- A **blind Claude sub-agent** (Agent tool) launched simultaneously, exactly as `/phillip` section 2
  step 3 specifies it: same role text, same instruction to Read `~/.claude/skills/phillip/RUBRIC.md`
  and apply it, same `SEVERITY | file:line | finding | why-real` output contract. The delta for
  cross-review: its diff is the PR diff and it gets `$WORKDIR` to read the real code, and it is
  **never** given the PR description or the author's login. Author intent is exactly the bias
  blindness buys.

> Multi-reviewer earns its cost: in testing, a solo pass returned COMMENT while Codex + Gemini both
> independently caught a HIGH (an entitlement bypass) the solo pass missed -> verified ->
> REQUEST_CHANGES.

---

## Phase 5: Verify every finding (stricter than self-review)

`/phillip`'s verification gate applies unchanged: the two checks (is the finding real, is the
proposed fix sound) and the HONESTY RULE that only a finding you traced **this session** counts as
verified. Both live in `~/.claude/skills/phillip/RUBRIC.md`, read in Phase 0. Do not re-derive them.

What is specific to cross-review is the postable predicate and where everything else goes:

`postable = verified-real AND high-confidence AND severity ∈ {HIGH, MEDIUM}`

- Not real -> **reject with a one-line proof** (logged in the report, not posted).
- Real but unverifiable here (no clone / external API / ambiguous) -> **NEEDS YOUR EYES** (report
  only, **not** posted).
- LOW/nit -> held to the report (invariant 2).

The bar is higher than `/phillip` because a wrong post lands on a colleague's PR.

---

## Phase 5b: Adjudicate existing bot review threads (default on)

Part of a human reviewer's job is being the signal over the bot noise (Gemini Code Assist
auto-reviews every PR; Copilot when requested). Fetch the existing **bot** review threads and
**verify each against the real code**, exactly like your own findings. Reuse `/babysit-prs`' GraphQL
(`reviewThreads` -> `resolveReviewThread`) and `/full-send`'s bot-login table (logins differ across
the reviews / comments / GraphQL APIs; in GraphQL they drop `[bot]`, so match
`test("copilot|gemini-code-assist")`).

```bash
gh api graphql -f query='query($o:String!,$n:String!,$pr:Int!){repository(owner:$o,name:$n){
  pullRequest(number:$pr){reviewThreads(first:100){pageInfo{hasNextPage endCursor}
    nodes{ id isResolved
    comments(first:20){nodes{ databaseId author{login} body path line }}}}}}}' \
  -F o="$OWNER" -F n="$NAME" -F pr="$PR"
# hasNextPage -> paginate with endCursor; never silently truncate at 100 threads.
```

For each **unresolved bot** thread, trace it and act:

- **Legit** (verified real) -> **don't resolve** (the author should fix it). Surface it in your
  review summary ("Gemini's note on `X` is correct, please address") and **don't re-raise it as your
  own** finding (no duplicate noise).
- **False / irrelevant / already-handled** (verified wrong) -> **reply** with the one-line reason,
  then **resolve** it (`resolveReviewThread`). This is **default on**; `--no-resolve-bots` replies
  but leaves it unresolved.

Hard rules: **bot threads only** (never resolve a human's thread); **verified-only** (never resolve
on a guess, never resolve a *legit* bot comment); **reply-before-resolve** (always leave the why, an
evidence trail, never a silent dismissal); **re-check before acting** (re-fetch `isResolved` and the
last-comment author right before replying or resolving, because a concurrent run or the PR author
may have handled it already; if so, skip silently). Bot adjudication is a **separate** section and
**does not move your verdict**: a pile of bot false-positives must not push you toward
`REQUEST_CHANGES`. Your verdict stays driven by *your* verified findings.

---

## Phase 6: Dynamic walkthrough (auto for UI PRs, capacity-gated)

Run when `CAN_LIVE_HEADLESS` **AND** the PR is UI-touching **AND** not `--no-live`.

**UI-touching** = at least one `filename` in `/tmp/review-pr-$NAME-$PR-files.json` starts with
`apps/agents-portal/src/pages/` or `apps/agents-portal/src/components/`. It is a prefix test against
the PR's file list, not a shell glob. `aicc-queues` has no frontend, so its PRs are never UI PRs and
never reach this phase.

Otherwise **skip, and if it is a UI PR add a NEEDS-DYNAMIC-RUN note** to the report ("UI PR: run
/review-pr <n> on a ≥8 GB runtime (cloud Routine or local) for the live walkthrough"). `--no-live`
lands in the same place: the static review still posts, only the walkthrough is deferred.

**Delegate the walkthrough itself to `/ui-walkthrough --embedded`** rather than hand-rolling it here.
It walks every affected surface at **desktop + tablet + mobile**, runs deterministic detectors
(horizontal scroll, sub-44px touch targets, clipped text, console errors), publishes the
screenshots to GitHub via a verified mechanism (its Phase 7), and returns
`{blockers, mediums, nits, images, neutralNotes, coverage, markdown}`, posting nothing itself.
**This skill keeps the verdict**: merge its `blockers` into your findings (a live-confirmed defect
is still the highest-confidence tier), paste its `markdown` into the review body, and treat its
`neutralNotes` as infra notes, never findings.

**Stack lifecycle (lock, pinned ports, post-boot identity assertion, boot budget, teardown):
[stack-lifecycle.md](stack-lifecycle.md). Read it before booting.** It stays this skill's source of
truth. `/ui-walkthrough` Phase 4 reads it from there, so don't duplicate it.

**Boot mechanics are not this skill's to carry.** The driver, the stack boot, the pre-build, the
seeded personas, and the capture matrix all belong to `/ui-walkthrough` and are documented in its
`stack.md` and Phase 0. This section used to restate them, and the copies drifted. Do not re-add
them: fix them where they live.

**One rule stays this skill's own: never fire real Stripe/Vapi/Twilio.** The walkthrough runs
against the deterministic, externally-stubbed stack. A surface the stubbed stack cannot exercise is
a NEEDS-DYNAMIC-RUN note, never a reason to relax stubbing ([stack-lifecycle.md](stack-lifecycle.md),
*State isolation*).

- Also flag UI features shipping **without** the Playwright E2E specs the agents-portal behavioral
  contract requires. This criterion is **this** skill's: `/ui-walkthrough` puts it out of scope on
  purpose, so it is judged once, here.

A **live-confirmed** defect ("modal throws on submit", screenshot) is the **highest-confidence**
finding tier, so it is a strong basis for `REQUEST_CHANGES`. A clean walkthrough supports `APPROVE`.

---

## Phase 7: Assemble the review

Group postable findings into inline `comments[]` + a summary `body` + an `event` (verdict from the
table). The `body` states: reviewers used, verify depth, **whether a live walkthrough ran**, the
verdict rationale, and a link to the local report.

### Inline line-anchoring (get exactly right)

Each `comments[]` entry anchors to the unified diff with `path` + `line` + `side`:
- `side: "RIGHT"` + `line` = the new-file line (added/modified code, the common case); `LEFT` only
  for a deleted line; multi-line adds `start_line` + `start_side`.
- The line **must be inside a diff hunk** or GitHub returns **422**. Pre-validate each finding's line
  against the patch ranges in `/tmp/review-pr-$NAME-$PR-files.json`; a verified finding **outside** the
  diff -> fold it into the summary `body` as a `file:line` reference instead of an inline anchor.
- Build the JSON with `jq -n` (never hand-quote `body` text). Walkthrough screenshots are already
  published and embedded by `/ui-walkthrough` Phase 7 (assets pushed to a detached
  `refs/ui-walkthrough/pr-<n>` ref in the PR's own repo, embedded as
  `github.com/<o>/<r>/raw/<commit>/…`, the only embed form that renders for a viewer on a private
  repo). Paste its returned `markdown` into the review `body`; don't re-upload anything.

---

## Phase 8: Post (or draft)

- **Check-before-post (concurrent-run guard):** immediately before submitting, re-run the
  Phase 2 gate (one API call). If a review by `ME` at `HEAD_SHA` appeared since discovery, a
  concurrent run (Routine vs. local) already posted: skip with a note instead of
  double-reviewing.
- **default (autonomous):** submit ONE review:
  ```bash
  gh api "repos/$OWNER/$NAME/pulls/$PR/reviews" --method POST --input /tmp/review-pr-$NAME-$PR-payload.json
  # payload: { commit_id: HEAD_SHA, event, body, comments:[{path,line,side,body}, ...] }
  ```
  On a residual 422 for one comment, retry it folded into the `body` rather than failing the whole
  review. Record the posted review id + `commit_id`.
- **`--draft`:** write the report, **print the exact payload**, and stop. ("Re-run without `--draft`
  to submit.")

---

## Phase 9: Report

Write `${REVIEW_PR_PLANS_DIR:-$HOME/.claude/plans}/review-pr-<owner>-<repo>-<PR>-<date>.md`.

> **Headless/sandbox note.** Claude Code guards the entire `~/.claude/` tree as **sensitive**, so
> writing a report there prompts for permission **even under `bypassPermissions`**, which stalls an
> unattended routine (no one to approve). In a headless environment, set `REVIEW_PR_PLANS_DIR` to a
> path **outside `~/.claude/`** (e.g. `/root/review-pr-reports`); local runs keep the default so plans
> stay where you browse them.

```
### /review-pr -> Atllas-Inc/codebase#1773, <date>
Reviewers: Claude(blind) + Codex + Gemini   Verify: FULL   Dynamic: yes/skipped(reason)   Head: <sha>
Verdict: <event>   Mode: <post|draft>

| # | Sev | File:line | Finding | Source | Verified | Posted |
|---|-----|-----------|---------|--------|----------|--------|
...

NEEDS YOUR EYES (unverified, NOT posted):
- <file:line>: <finding>. <why it couldn't be verified here>

NEEDS DYNAMIC RUN (UI PR, this runtime lacks RAM):
- run /review-pr <n> on a ≥8 GB runtime for the live walkthrough

BOT THREADS ADJUDICATED (Gemini/Copilot):
- <file:line>: legit (surfaced in review, not resolved) | false -> replied + resolved | reason

Posted: review <id>, event=<event>, <k> inline comments; bot threads: <r> resolved, <l> surfaced; against <sha>.
```

Idempotency record = the posted review's `commit_id` (read back via the reviews API next run). Then
remove any worktree created in Phase 3 (`git worktree remove --force "$WORKDIR"`).

---

## Orchestration

Phases 0 through 9 above describe **one** PR.

- **Exactly one target PR: run Phases 3 through 9 inline.** No dispatch, no staging. This is the
  common case (`/review-pr <PR#>`) and nothing else in this section applies to it.
- **More than one PR: read [orchestration.md](orchestration.md) before dispatching.** It owns the
  per-PR sub-agent model, the orchestrator rules, the two-pass batch model (static parallel, then
  dynamic serial), the time budget and its never-drop-a-PR rule, and the nested-dispatch bounds.

One rule is load-bearing enough to keep here: **a review must stand on one PR's evidence alone.**
One agent spanning several PRs carries prior diffs and findings forward, so PR A's pattern biases
PR B's verdict. That is why each (repo, PR) gets its own sub-agent.

---

## Edge cases

| Case | Handling |
|---|---|
| Large diff | Chunk by file/workspace. Incomplete coverage caps the verdict at `COMMENT`. |
| Rate limits | Back off, then degrade to `--draft` behavior (assemble + report, post nothing). |

Every other case is handled where it is defined: stale local base and dirty clone -> Phase 3;
re-review after a push -> Phase 2; self-authored or already-reviewed-at-head -> invariant 4 +
Phase 2; draft PRs -> invariant 5; files outside the diff or no clone -> Phase 5 (can't verify,
don't post); bot adjudication -> Phase 5b; 422 anchor failure -> Phase 7; ports occupied, leaked
stack from a dead run, and boot budget -> [stack-lifecycle.md](stack-lifecycle.md).

---

## Running unattended

Runtime-agnostic by design (capability detection). Two homes:

- **Cloud Routine (primary):** [routine.md](routine.md). Managed 16 GB sandbox, hourly schedule.
  Runs the full loop including the **Tier-3 dynamic walkthrough** via headless Playwright
  (trial-verify once). Always-on, no machine needed.
- **Local Mac:** `/loop 2h /review-pr` or `claude -p "/review-pr"`. Same loop, plus the OpenCap
  video and sub-hourly cadence. The video needs no one present: it captures only the browser
  window, so the loop can run while the machine is being used for something else.

Idempotency (reviews-API `commit_id`) makes repeated runs safe, since each run only picks up PRs not
yet reviewed at their current head, and the Phase 8 check-before-post guard closes the in-flight
window where two overlapping runs both pass the gate. Stagger cadences anyway (Routine hourly,
local `/loop 2h`) so overlap stays rare.
