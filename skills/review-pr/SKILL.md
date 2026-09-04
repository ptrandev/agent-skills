---
name: review-pr
description: >
  Reviews GitHub PRs where you are the requested reviewer, applying Phillip's engineering bar.
  Posts inline comments and a verdict to GitHub, and adjudicates bot review threads. The
  cross-review sibling of /phillip, which handles self-review. Autonomous by default.
  Use for "review this PR", "review the PRs waiting on me", or "review-pr".
---

# review-pr

`/babysit-prs` addresses threads on PRs *you authored*. `/phillip` self-reviews *your local diff*.
**`/review-pr` reviews someone else's PR where you are the requested reviewer** and posts the review
to GitHub. The action is **post review comments + a verdict**, not *implement fixes*.

## Input / modes

Treat text accompanying the skill invocation as the input:

| Invocation | Behavior |
|---|---|
| Empty | All open PRs across both Targets repos where the current user is a requested reviewer (and not the author). |
| `<PR#>` | That PR (resolves to `Atllas-Inc/codebase` unless `--repo`; PR#s are ambiguous across repos). |
| `<URL>` | Parse owner/name/number from the GitHub URL (unambiguous). |
| `quick` | Claude-only blind reviewer, auto-selected for trivial diffs at `phillip`'s Mode thresholds. Default = full three-reviewer. |
| `... --draft` | Opt **down**: assemble + report + print the exact payload, **submit nothing**. |
| `... --no-approve` | Opt **down**: cap the verdict at `COMMENT`, never post `APPROVE`. |
| `... --no-live` | Opt **down**: skip the Tier-3 dynamic walkthrough even on a UI PR. |
| `... --no-resolve-bots` | Opt **down**: still validate bot comments, but **resolve none**. Reply only. |

### Targets (default repos)

| Repo | Local clone | Verify depth |
|------|-------------|--------------|
| `Atllas-Inc/codebase` | `/Users/phillip/Git/codebase` | FULL (yarn typecheck/lint/vitest) |
| `Atllas-Inc/aicc-queues` | `/Users/phillip/Git/aicc-queues` | COMPILE-ONLY (`./gradlew compileJava`; integration tests need Redis+Postgres+Firebase) |

**Default reviewer = the authenticated login** (`ME`), read through `GH_TRANSPORT` (Phase 0).

---

## Core safety model (do not weaken)

This skill posts to **other people's** PRs. Five invariants:

1. **Autonomous post by default, quality-gated.** It submits the review without a confirm step.
   `--draft` opts down to assemble-and-print-only.
2. **Only verified findings reach GitHub.** A finding posts inline **only** if it was traced against
   the real code path **this session**. Unverified, "couldn't check", and low-confidence findings are
   **never posted**: they go to the local report's **NEEDS YOUR EYES** section. Nits (LOW) are held
   to the report as well. Only verified HIGH+MEDIUM post inline.
3. **Conservative verdict** (table below). `REQUEST_CHANGES` fires only on a verified HIGH.
   `APPROVE` fires only on a clean **fully-verified** pass, and never with `--no-approve`. Every
   other case is `COMMENT`.
4. **Skip self-authored PRs** (`author == ME`) and PRs already reviewed at the current head SHA
   (idempotency, Phase 2).
5. **Never review a draft PR.** A GitHub draft (`isDraft == true`) is work-in-progress and is
   **excluded end-to-end**: filtered at discovery (`select(.isDraft!=true)` / `draft:false`), skipped
   with a note when named explicitly ("PR #N is a draft, skipped. Re-request review when it is
   marked ready."), and **re-checked immediately before any post**. A PR flipped to draft mid-run is
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
`/codex` or `/gemini` was missing (Tier 2b). State which reviewers ran in the review body.

---

## Writing style

Copied verbatim from `~/.claude/CLAUDE.md`, which a headless run never loads.
Binding on every inline comment, review body, verdict, bot-thread reply, and report this
skill writes, orchestrator and sub-agents alike.

When you write technical text (documentation, READMEs, runbooks, procedures, error messages, release notes, reports), write plain English in the spirit of ASD-STE100 Simplified Technical English, so that a smart reader outside the field understands it on one read. Obey these rules:

CLASSIFY FIRST. Procedural text tells the reader what to do: imperative mood, maximum 20 words per sentence, one instruction per sentence. Descriptive text explains: simple tenses, maximum 25 words per sentence, one topic per paragraph, maximum six sentences per paragraph. Never mix the two in one passage.

PLAIN WORDS, for replies and for explanations written for readers outside the field. Use the common word when one exists ("use", not "utilize"). Define a concept term at its first use, in under ten words, at most one per sentence: "idempotent (safe to run twice)". Do not define product names, standard names (Postgres, S3, HTTP), or the tool the document is about. Address the reader as "you". Lead with the point. Procedures and reference documents follow the rules above alone.

VERBS. Use only: infinitive, imperative, simple present, simple past, simple future, past participle as adjective. No present perfect ("has completed" → "completed"). No "-ing" verb forms ("making it easy" → new sentence). Active voice; passive only in descriptions when the agent is unknown. Approved modals: can, will, must. Banned: should, would, may, might, could. For "should": write "must" if required, delete if optional.

SENTENCES. Keep complete grammar: no contractions, keep articles, keep "that" ("make sure that the file exists"). Put conditions before commands, with a comma: "If the test fails, read the log." No semicolons: write two sentences. No em-dashes: an em-dash hides the logic between two statements. Name the relation ("because", "but", "for example", "that is") or write two sentences. Use a vertical list for more than two items or steps.

WORDS. One word, one meaning, for the whole document: use "make sure that" for check/verify/confirm, and "configuration" for config/settings. Noun chains of maximum three words. Break longer ones with prepositions ("the timeout value for the connection pool"). Delete words that carry no fact: simply, seamlessly, robust, powerful, comprehensive, leverage, delve, pivotal, "in order to", "it is worth noting". Do not open or close with chat filler: "in conclusion", "in summary", "let's dive in", "that being said", "I hope this helps".

AVOID THE AI DRIFTS. Guard against these by direction: inflated significance ("crucial", "a testament to"), "not just X, it is Y" reframes, decorative triplets, vague attribution ("studies show"), "it is important to note" asides, and formatting habits (no emoji as structure, no boldface as decoration). State the fact. The fact carries itself. Replace: utilize → use, prior to → before, in the event that → if, e.g. → for example. American spelling.

WARNINGS. Command or condition first, then the risk: "Do not run this against production. The command deletes rows."

NEVER TOUCH. Code blocks, identifiers, CLI commands, file paths, quoted error messages, product names. Each counts as one word toward sentence limits. Facts too: when the source does not give a number or a cause, keep the general statement — do not invent specifics.

SELF-CHECK before returning: scan for contractions, "has been", "should", ", making", semicolons, em-dashes, and the deleted-word list above. Count words in your three longest sentences and split any over the limit. Collapse synonym rotation.

REPLIES TO THE USER. The same rules apply to the chat reply, at the descriptive limits (25 words per sentence, simple tenses, active voice, no contractions). Start with the answer or the result. If a concept term is necessary, define it in a few words. Do not restate the request. Keep the whole reply to 5 sentences or fewer, code and lists excluded. Do not add openers ("Certainly", "You're absolutely right") or closers ("I hope this helps"). Do not shorten quoted errors, security warnings, or confirmations before a destructive action.

STRICT MODE. If the user names STE, ASD-STE100, or compliance, also apply the STE dictionary to the document: "make sure that" for check/verify/confirm, "operate" for run, "do" for execute, "show" for display, "but" for however, "because" for since. Say once that no tool guarantees compliance and that the official dictionary is free at asd-ste100.org.

Do not apply these rules to marketing copy or brand writing.

In any markdown that will be rendered (chat responses, PR/issue bodies, reports, docs),
escape delimiter characters used literally, since two of them in one paragraph silently
corrupt everything between: `\~` for "approximately" tildes (`~...~` is strikethrough in
GFM) and `\$` for dollar amounts (`$...$` is inline LaTeX math in GitHub and VSCode
preview). Literal `~`/`$` in code stay inside backticks instead.

---

## Phase 0: Preflight + capability detection

Locate the directories containing the loaded `review-pr`, `phillip`, `claude`, `gemini`, and
`ui-walkthrough` skills. Call them `REVIEW_PR_DIR`, `PHILLIP_DIR`, `CLAUDE_SKILL_DIR`,
`GEMINI_SKILL_DIR`, and `UI_WALKTHROUGH_DIR`. Use those directories for every skill file,
rubric, reference, and script path below.

```bash
# Probe a REPO call. `gh api user` passes while repo calls 403; see ../shared/github-transport.md.
if gh api "repos/$OWNER/$NAME" --jq .id >/dev/null 2>&1; then GH_TRANSPORT=cli; else GH_TRANSPORT=mcp; fi
SCRATCH=/private/tmp/review-pr; mkdir -p "$SCRATCH"    # NOT $TMPDIR, see below
```

**Read [../shared/github-transport.md](../shared/github-transport.md) before any GitHub call.** It owns the probe, the
`cli`/`mcp` operation mapping, and what each transport cannot do. Set `GH_TRANSPORT` here, take `ME`
from that file's identity row, and route every later GitHub operation through it.

**`$SCRATCH` must live under `/private/tmp`.** The `browse` driver rejects screenshot paths outside
`/private/tmp` or the repo root, and it fails per-screenshot, so a `$TMPDIR`-based scratch dir
(macOS `$TMPDIR` is `/var/folders/…`) makes **every capture fail silently**. Phase 3 builds its
worktree path from `$SCRATCH`. The stack lock is a separate absolute literal, owned by
[stack-lifecycle.md](stack-lifecycle.md).

Resolve the **target repo set** (`--repo` override, else both Targets rows). For each, split
`OWNER=${REPO%/*}` / `NAME=${REPO#*/}` and map to its clone.

**Capability tiers** (probe and record booleans):

- **Tier 1, discover + post (`GH_TRANSPORT`):** `gh` **or** the GitHub MCP tools, per
  [../shared/github-transport.md](../shared/github-transport.md). **Not always available**, and a cloud run commonly has
  working MCP with a dead `gh`. Neither -> stop.
- **Tier 2, verify against real code (`CAN_VERIFY_<repo>`):** the repo's clone exists, is clean,
  and the toolchain runs. Probe `node`/`yarn` (codebase -> FULL) and `java`/`./gradlew`
  (aicc-queues -> COMPILE-ONLY). Without it, review from the diff, drop **every finding to reduced
  confidence**, and **post nothing** (report-only, invariant 2).
- **Tier 2b, external reviewers:** the `codex` and `gemini` CLIs present + authed. **The skills are
  not required**, because Phase 4 runs the CLIs directly. Missing -> run with fewer reviewers and
  say so (same fallback as `/phillip`), and the verdict caps at `COMMENT`.
- **Tier 3, dynamic walkthrough**, two sub-capabilities:
  - `CAN_LIVE_HEADLESS`: can stand up the agents-portal stack + drive a **headless browser**.
    Requires a browser driver (`browse` binary locally, or headless Playwright/Chromium in cloud)
    **and enough memory to host the stack**. Heuristic gate: **skip if total RAM < \~8 GB** (Next.js
    + JVM Firebase emulators + API need it). On a constrained runtime, run static review only and
    flag UI PRs for a higher-capacity run.
    ```bash
    case "$(uname -s)" in
      Darwin) TOTAL_MB=$(sysctl -n hw.memsize 2>/dev/null | awk '{print int($1/1048576)}') ;;
      *)      TOTAL_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}') ;;
    esac
    TOTAL_MB=${TOTAL_MB:-0}
    [ "$TOTAL_MB" -ge 8000 ] && HAVE_RAM=1 || HAVE_RAM=0
    ```
    Branch on the OS. `free` does not exist on macOS, so a `free -m`-only probe returns
    `TOTAL_MB=0` there, sets `HAVE_RAM=0`, and disables the walkthrough on every local Mac run.
  - `CAN_VIDEO`: an OpenCap walkthrough video can be recorded. **Local macOS only.**
    `/ui-walkthrough` produces it (`ui-walkthrough/opencap.md`), not this skill. An unattended
    `/loop` records the same artifact as an attended run: the capture is scoped to the browser
    window, so nothing else on screen reaches GitHub.

**Refresh the rubric (non-blocking):** invoke `phillip-sync` once (a 24 h cooldown makes it a no-op
when it ran in the last 24 h). If it reports it ADDED lines, **re-Read** the rubric. **It is a
no-op under `GH_TRANSPORT=mcp`**: it mines resolved threads through `gh api graphql`, which a cloud
sandbox blocks, so the rubric there is whatever shipped. Note it and continue, never block on it. Then **Read
`$PHILLIP_DIR/RUBRIC.md` in full**. It owns the rules this skill reviews against: three
anchored tables (auto-synced rules, candidates, and a do-not-flag block of negative rules) plus the
severity taxonomy and the verification discipline. Skip any row whose `Repo` column names a repo
other than the one under review.

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

GraphQL fallback when the search flag fails in cloud:
`search(query:"is:pr is:open draft:false review-requested:'"$ME"' repo:'"$REPO"'", type:ISSUE, first:50)`.

If the invocation input named a PR#/URL, use it directly, but still confirm `ME` is a requested reviewer, is not
the author, and that the PR is not a draft (invariant 5).

A single-PR run needs no dispatch and no staging. Route a multi-PR run through *Orchestration* after
Phase 9.

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
  `git diff <old commit_id>...<HEAD_SHA>` (**never re-flag unchanged code**). Old SHA unreachable
  (force-push) -> full re-review. Post against the **new** `commit_id`.

**Use three-dot, and only after Phase 3's `git fetch origin "$BASE"` and `git fetch origin
"pull/$PR/head"`**, so both endpoints and their merge base are on disk. **Never use two-dot
(`..`)**: it pulls in every base-branch commit that landed between the two reviews, so on a rebased
PR or an advanced base you post findings on code the author never wrote.

**Bot threads on a skipped PR.** A Phase-2 skip **still runs Phase 5b** when the PR has unresolved
bot threads created after the prior review's `submitted_at`. Bot threads accumulate without a new
push (Gemini Code Assist re-runs, Copilot on request). Gating adjudication on the head SHA then
leaves that noise unadjudicated forever. Such a run does Phase 3 (checkout, needed to verify) plus
Phase 5b only, and posts no review. No newer bot threads -> skip the PR entirely.

The reviews list **is** the idempotency state, no separate state file.

---

## Phase 3: Fetch the PR's true diff + get its code on disk (read-only)

**Get the diff base right** (proven in testing): a stale or divergent local `master` makes
`git merge-base master..HEAD` yield a garbage multi-hundred-file diff. Always compute against a
**freshly fetched** base, three-dot, and treat `gh pr diff` as the source of truth:

```bash
BASE=$(gh api "repos/$OWNER/$NAME/pulls/$PR" --jq .base.ref)   # the PR's real base (usually master)
HEAD_SHA=$(gh api "repos/$OWNER/$NAME/pulls/$PR" --jq .head.sha)
gh pr diff "$PR" --repo "$REPO" > /tmp/review-pr-$NAME-$PR.diff         # authoritative diff
gh api "repos/$OWNER/$NAME/pulls/$PR/files" --paginate > /tmp/review-pr-$NAME-$PR-files.json  # patch ranges for anchoring
cd "$CLONE"; git fetch origin "$BASE" --quiet                          # FRESH base, or merge-base lies
git fetch origin "pull/$PR/head" --quiet
```

**Get the PR's code on disk without disturbing the user's clone.** Clean clone ->
`gh pr checkout "$PR"`. Dirty clone -> an isolated worktree at the head SHA. **Never stash or
change branches under a dirty tree.**

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
report-only). Remove the worktree in Phase 9.

---

## Phase 4: Three-reviewer pass (reuse /phillip's discipline, scoped to the PR diff)

Run the same fan-out as `/phillip` section 2, with the scope set to the **PR diff** and the action
set to "post comments", not "fix". Read that section for the parallelism rules. **Launch the Codex
and Gemini CLIs directly as concurrent background Bash jobs.** Nested `/codex` and `/gemini`
**skill** invocations cannot parallelize (skill calls are sequential), so they run the two models
back to back. **Do not invoke the `/codex` or `/gemini` skills for this pass.**

- **Codex** + **Gemini** as concurrent background Bash jobs. **Run them from `$WORKDIR` against the
  PR's true diff**: point them at the freshly-fetched base so they never review the stale-master
  garbage (`git diff "origin/$BASE...$HEAD_SHA"`, or feed them `/tmp/review-pr-$NAME-$PR.diff`
  directly). Outputs to `/tmp/review-pr-codex-$NAME-$PR.out` / `-gemini-$NAME-$PR.out`. (All temp
  paths include `$NAME`: PR numbers repeat across repos, and parallel per-repo agents writing
  `/tmp/review-pr-$PR-*` clobber each other.)
  - **Headless/sandbox invocation gotchas** (API-key `codex exec` instead of `codex review`, the
    two trust-gate flags, the `< /dev/null` redirect, Gemini's inline-`-p` limitation, its
    `RESOURCE_EXHAUSTED` degradation): [routine.md](routine.md) section 8. **`RUBRIC.md` sits
    outside Gemini's workspace, so "Read the rubric" silently no-ops there.** Section 8 owns the
    fix. Apply it on every run, local included. Codex is unaffected.
  - **Materialize the Codex credential here, not in setup.** A routine's setup step runs in a
    build phase, and `~/.codex/auth.json` written there does **not** survive into the run container
    (verified 2026-08-14: absent at session start with `OPENAI_API_KEY` set). Check for the file
    and create it in this phase when it is missing:
    ```bash
    [ -f "$HOME/.codex/auth.json" ] || printenv OPENAI_API_KEY | codex login --with-api-key
    ```
    Skip it when `OPENAI_API_KEY` is unset, and count Codex as missing.
  - **Model selection:** honor `$CODEX_MODEL` / `$GEMINI_MODEL` when set, otherwise take the CLIs'
    own defaults. **Never hardcode a version in this file.** The `/codex` and `/gemini` skills own
    the defaults.
  - **A reviewer that refused is not a reviewer that found nothing. Never gate on exit status
    alone.** Gemini's trust-gate refusal exits **0** with no findings (verified 2026-08-14), so an
    exit-status check records a reviewer that never ran as a clean pass, and a clean pass is an
    input to `APPROVE`. Gate on the **output**: a reviewer counted as having run must have a
    non-empty output file that contains its findings contract. An empty file, a refusal, or a quota
    error means that reviewer is **missing**, which drops the count and caps the verdict at
    `COMMENT` (Tier 2b).
- A **blind Claude reviewer** launched simultaneously through
  `$CLAUDE_SKILL_DIR/scripts/run-claude`, exactly as `phillip` section 2 specifies it: same role
  text, same instruction to Read `$PHILLIP_DIR/RUBRIC.md`
  and apply it, same `SEVERITY | file:line | finding | why-real` output contract. The delta for
  cross-review: its diff is the PR diff and it gets `$WORKDIR` to read the real code, and it is
  **never** given the PR description or the author's login.
  - Run the Claude subprocess from `$WORKDIR`. Pass `--rubric "$PHILLIP_DIR/RUBRIC.md"`.
    Count timeout, refusal, empty output, or contract-free output as a missing reviewer. Never
    substitute an inline pass while claiming a blind reviewer.

---

## Phase 5: Verify every finding (stricter than self-review)

`/phillip`'s verification gate applies unchanged: the two checks (is the finding real, is the
proposed fix sound) and the HONESTY RULE that only a finding you traced **this session** counts as
verified. Both live in `$PHILLIP_DIR/RUBRIC.md`, read in Phase 0. **Do not re-derive
them.**

`postable = verified-real AND high-confidence AND severity ∈ {HIGH, MEDIUM}`

- Not real -> **reject with a one-line proof** (logged in the report, not posted).
- Real but unverifiable here (no clone / external API / ambiguous) -> **NEEDS YOUR EYES** (report
  only, **not** posted).
- LOW/nit -> held to the report (invariant 2).

---

## Phases 5b and 6: bot threads, then the dynamic walkthrough

**Read [bot-adjudication.md](bot-adjudication.md) before touching a bot thread.** It owns the fetch,
the verification, the four outcomes, and the re-check before replying or resolving. Default on.
`--no-resolve-bots` replies but resolves nothing.

**Read [walkthrough.md](walkthrough.md) when the PR is UI-touching.** It owns the run condition, the
prefix test, and the delegation to `/ui-walkthrough --embedded`. This skill keeps the verdict. A
live-confirmed defect is the highest-confidence finding tier. A clean walkthrough supports `APPROVE`.


## Phase 7: Assemble the review

Group postable findings into inline `comments[]` + a summary `body` + an `event` (verdict from the
table). The `body` states: reviewers used, verify depth, **whether a dynamic walkthrough ran**, the
verdict rationale, and a link to the local report.

### Inline line-anchoring (get exactly right)

Each `comments[]` entry anchors to the unified diff with `path` + `line` + `side`:
- `side: "RIGHT"` + `line` = the new-file line, for added or modified code, which is the common
  case. `LEFT` applies only to a deleted line. A multi-line anchor adds `start_line` + `start_side`.
- The line **must be inside a diff hunk** or GitHub returns **422**. Pre-validate each finding's line
  against the patch ranges in `/tmp/review-pr-$NAME-$PR-files.json`. Fold a verified finding
  **outside** the diff into the summary `body` as a `file:line` reference, not an inline anchor.
- Build the JSON with `jq -n`. **Never hand-quote `body` text.** Walkthrough screenshots are already
  published and embedded by `/ui-walkthrough` Phase 7 (assets pushed to a detached
  `refs/ui-walkthrough/pr-<n>` ref in the PR's own repo, embedded as
  `github.com/<o>/<r>/raw/<commit>/…`, the only embed form that renders for a viewer on a private
  repo). Paste its returned `markdown` into the review `body`. **Never re-upload anything.**

---

## Phase 8: Post (or draft)

- **Check-before-post (concurrent-run guard):** immediately before submitting, re-run the
  Phase 2 gate (one API call). If a review by `ME` at `HEAD_SHA` appeared since discovery, a
  concurrent run (Routine vs. local) already posted: skip with a note instead of
  double-reviewing.
- **default (autonomous):** submit ONE review, through `GH_TRANSPORT`
  ([../shared/github-transport.md](../shared/github-transport.md), *post the review*):
  ```bash
  gh api "repos/$OWNER/$NAME/pulls/$PR/reviews" --method POST --input /tmp/review-pr-$NAME-$PR-payload.json
  # payload: { commit_id: HEAD_SHA, event, body, comments:[{path,line,side,body}, ...] }
  ```
  Under `mcp` the same payload becomes a pending review, one add-comment call per entry, then a
  submit carrying the `event`. On a residual 422 for one comment, retry it folded into the `body`
  rather than failing the whole review. Record the posted review id + `commit_id`.
- **Labels, every posted verdict.** After the review submits, set the PR's state label through
  `GH_TRANSPORT` ([../shared/github-transport.md](../shared/github-transport.md), *labels*). Pick the row by the posted
  `event` and by how many findings the review actually posted:

  | Posted verdict | Add | Remove |
  |---|---|---|
  | `APPROVE` | `Code Approved` | `Pending Code Review`, `Code Review Made Comments` |
  | `REQUEST_CHANGES` | `Code Review Made Comments` | `Pending Code Review`, `Code Approved` |
  | `COMMENT`, ≥1 finding posted (inline or in the body) | `Code Review Made Comments` | `Pending Code Review`, `Code Approved` |
  | `COMMENT`, 0 findings posted | none | none |

  ```bash
  ADD='Code Review Made Comments'; REMOVE=('Pending Code Review' 'Code Approved')
  gh api "repos/$OWNER/$NAME/issues/$PR/labels" --method POST -f "labels[]=$ADD" \
    || echo "label '$ADD' is not defined in this repo"
  for L in "${REMOVE[@]}"; do
    gh api "repos/$OWNER/$NAME/issues/$PR/labels/$(jq -rn --arg l "$L" '$l|@uri')" --method DELETE \
      || echo "label '$L' was not set"
  done
  ```
  A label the repo does not define returns 422 on add, and a removal of an unset label returns 404:
  log either and continue, because the review is already posted. **Never change labels on a skipped
  or drafted run**, and never on the 0-finding `COMMENT` row. Record the label change in the report.
- **`--draft`:** write the report, **print the exact payload**, and stop. ("Re-run without `--draft`
  to submit.") **Change no labels.**

---

## Phase 9: Report

Write `${REVIEW_PR_PLANS_DIR:-${CODEX_HOME:-$HOME/.claude}/plans}/review-pr-<owner>-<repo>-<PR>-<date>.md`.

> **Headless/sandbox note.** Claude Code guards the entire `~/.claude/` tree as **sensitive**, so
> writing a report there prompts for permission **even under `bypassPermissions`**, which stalls an
> unattended routine (no one to approve). In a headless environment, set `REVIEW_PR_PLANS_DIR` to a
> path **outside `~/.claude/`**, for example `/root/review-pr-reports`. Local runs keep the default,
> so plans stay where you browse them.

```
### /review-pr -> Atllas-Inc/codebase#1773, <date>
Reviewers: Claude(blind|blind,subprocess|inline,not blind) + Codex + Gemini   Verify: FULL   Dynamic: yes/skipped(reason)   Head: <sha>
Verdict: <event>   Mode: <post|draft>

| # | Sev | File:line | Finding | Source | Verified | Posted |
|---|-----|-----------|---------|--------|----------|--------|
...

NEEDS YOUR EYES (unverified, NOT posted):
- <file:line>: <finding>. <why it couldn't be verified here>

NEEDS DYNAMIC RUN (UI PR, this runtime lacks RAM):
- run /review-pr <n> on a ≥8 GB runtime for the dynamic walkthrough

BOT THREADS ADJUDICATED (Gemini/Copilot):
- <file:line>: legit (surfaced in review, not resolved) | false -> replied + resolved | reason

Posted: review <id>, event=<event>, <k> inline comments; bot threads: <r> resolved, <l> surfaced; against <sha>.
Labels: <added/removed, or "unchanged (<reason>)">.
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

**A review must stand on one PR's evidence alone**, so give each (repo, PR) its own sub-agent.

---

## Edge cases

| Case | Handling |
|---|---|
| Large diff | Chunk by file/workspace. Incomplete coverage caps the verdict at `COMMENT`. |
| Rate limits | Back off, then degrade to `--draft` behavior (assemble + report, post nothing). |

Every other case is handled where it is defined. Stack cases, which belong to no phase, are owned
by [stack-lifecycle.md](stack-lifecycle.md): ports occupied, a leaked stack from a dead run, and
the boot budget.

---

## Running unattended

Two homes:

- **Cloud Routine (primary): read [routine.md](routine.md) before creating the routine.** It owns
  the sandbox setup script, the routine prompt, the triggers, first-run validation, and the headless
  Codex/Gemini invocation. Managed 16 GB sandbox, hourly schedule. Runs the full loop including the
  **Tier-3 dynamic walkthrough** via headless Playwright (trial-verify once).
- **Local Mac:** `/loop 2h /review-pr` or `claude -p "/review-pr"`. Same loop, plus the OpenCap
  video and sub-hourly cadence.

Stagger cadences (Routine hourly, local `/loop 2h`) so overlap stays rare.
