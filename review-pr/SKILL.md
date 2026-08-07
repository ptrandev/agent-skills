---
name: review-pr
description: |
  Reviews GitHub PRs where you are the requested reviewer on Atllas-Inc/codebase
  and Atllas-Inc/aicc-queues, applies Phillip's engineering bar (reuses /phillip's
  rubric + three independent reviewers), verifies every finding against the real
  code path, posts the review back to GitHub (inline comments + a verdict), and adjudicates
  existing bot review threads (Gemini/Copilot): surfacing the legit ones, resolving verified-false
  noise. The cross-review sibling of /phillip (which is self-review). Autonomous by default; opt
  down with --draft (don't submit), --no-approve (cap at COMMENT), --no-live (skip the dynamic
  walkthrough), --no-resolve-bots (don't resolve bot threads). Idempotent and safe to re-run on a
  schedule. Use: /review-pr, /review-pr <PR#|URL>, /review-pr --repo <owner/name>,
  /review-pr quick. Triggers: "review the PRs I'm assigned", "review-pr".
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
gh auth status || { echo "gh not authenticated: required"; exit 1; }
ME=$(gh api user --jq .login)
SCRATCH=/private/tmp/review-pr; mkdir -p "$SCRATCH"    # NOT $TMPDIR, see below
```

**`$SCRATCH` must live under `/private/tmp`.** The `browse` driver rejects screenshot paths outside
`/private/tmp` or the repo root, and it fails per-screenshot, so a `$TMPDIR`-based scratch dir
(macOS `$TMPDIR` is `/var/folders/…`) makes **every capture fail silently**. Phase 3 builds its
worktree path from `$SCRATCH`. The stack lock is a separate absolute literal, see
[stack-lifecycle.md](stack-lifecycle.md).

Resolve the **target repo set** (`--repo` override, else both Targets rows). For each, split
`OWNER=${REPO%/*}` / `NAME=${REPO#*/}` and map to its clone.

**Capability tiers** (probe and record booleans; later phases branch on them):

- **Tier 1, discover + post:** `gh` + network. Always available.
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

Dispatch and staging for multi-PR runs are in *Orchestration*, after Phase 9.

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

When it runs, reuse the `/full-send` Phase 8 / `/verify` + `/browse` pattern:
- **Pre-build shared workspace packages first** (required, the stack's `next build` can't resolve
  them otherwise): `yarn turbo run build --filter='./packages/*'` at the PR head. `scripts/e2e-stack.sh`
  does **not** build workspace packages, and a fresh `yarn install` leaves their `dist/` empty, so
  `next build` hard-fails resolving `loop-stats` (consumed by `loop-renderer`, etc.). Also confirm
  **Node 20** is active (per the repo's `.nvmrc`) before building. Node 22 breaks the `re2` native
  addon and risks build/runtime drift. *(Verified via cloud boot spike 2026-07-26: emulators + API
  boot fine headlessly; this pre-build is the one gap between a fresh clone and a healthy `:3000`.)*
- Bring up the **deterministic, externally-stubbed** stack. **Never fire real
  Stripe/Vapi/Twilio/etc.** Two corrections to the obvious approach, both verified in the checkout:
  **`yarn e2e:stack` cannot host a walkthrough** (it boots emulators -> seeds -> builds -> runs the
  Playwright suite -> tears everything down; there is no persistent stack to drive), and
  **`yarn agents-portal` is not emulator-scoped** (`npm run set-dev`; emulator interception is
  env-var-driven via `e2e/.env.e2e`, so a process started outside that env talks to **real
  atllas-dev**, silently). Use `/ui-walkthrough` Phase 4's hold-open mechanism: run the real
  harness with a temporary hold spec in the **ephemeral checkout**, which keeps emulators + API +
  `next start` up inside `emulators:exec` while the browser is driven from outside.
  - **Prefix the boot with `env -u VSCODE_CWD`.** Claude Code running inside the VSCode extension
    host exports `VSCODE_CWD=/`, and `firebase-tools` reads exactly that variable as "I am the VS
    Code extension" (`lib/vsCodeUtils.js`), switching its template root to `lib/templates/`, a path
    the npm package doesn't ship. The emulators then die at startup with
    `ENOENT … lib/templates/hosting/init.js`, which reads like a corrupt `node_modules` and tempts a
    pointless multi-GB reinstall. A terminal-launched `claude` has no `VSCODE_CWD`, so this
    reproduces only from the IDE. Verified 2026-07-30.
- Log in as a **seeded** persona, **not** a real dev account. Reviewer mode always walks the sealed
  e2e stack, whose users are created per run by `apps/agents-portal/e2e/seed/seed.mjs` with
  credentials committed in `apps/agents-portal/e2e/.env.e2e`: `e2e-agent@e2e.test`
  (`E2E_TEST_USER_EMAIL`, has `core_premium: active` so it clears the paywall), `e2e-free@e2e.test`,
  `e2e-admin@e2e.test`. **Nothing to provision**: no gitignored file, no routine env vars. A real
  dev account like `phillip+premium@atllas.com` does **not exist** in the per-run emulator and fails
  at the login form. Better still, reuse the authenticated `storageState` the harness's per-persona
  setup projects already write, and skip the login form entirely.
- Navigate to the affected surface; exercise the **happy path + key error/empty/loading states**;
  capture the browser console + screenshots. Driver: **local** = `browse` (+ OpenCap video if
  `CAN_VIDEO`, which also means `browse --headed`, see `ui-walkthrough/opencap.md`); **cloud** =
  headless Playwright.
  - **Cloud Chromium launch (required in the sandbox): `args: ['--ssl-version-max=tls1.2']`.** The
    cloud egress path has a TLS-terminating middlebox that **resets Chromium's TLS 1.3 ClientHello**
    (larger than curl's: GREASE + post-quantum ML-KEM key share), so *every* HTTPS request fails
    with `net::ERR_CONNECTION_RESET` and the app hangs on its splash (e.g. `_app` can't load
    `js.stripe.com` -> login form never mounts). Capping at TLS 1.2 shrinks the ClientHello enough to
    pass (verified 3/3 against the real target). Not a cert/proxy issue: cert-ignore and proxy flags
    do **not** help and aren't needed (Chromium auto-uses `$https_proxy`). If the walkthrough runs
    the app's `playwright.config.ts` harness, inject the arg into `use.launchOptions.args` in the
    **ephemeral clone** (local, uncommitted, never a repo change).
- Also flag UI features shipping **without** the Playwright E2E specs the agents-portal behavioral
  contract requires.

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

Phases 0 through 9 above describe **one** PR. This section is how a run drives several.

Review each (repo, PR) in its own sub-agent (Agent tool). One agent across several PRs carries prior
diffs and findings forward, so PR A's pattern biases PR B's verdict. A review must stand on one PR's
evidence alone. The orchestrator (this session) stays thin: preflight -> discover -> gate ->
dispatch -> aggregate.

**Orchestrator rules:**

- **Run Phase 0 once** (identity, capability probes, `/phillip-sync`) and **run the Phase 2
  idempotency gate yourself** before dispatching: two cheap API calls per PR that avoid spawning
  agents for already-reviewed heads. Do **not** read diffs or repo files yourself.
- **Each dispatch prompt is self-contained:** repo, PR#, head SHA, clone path, the capability
  booleans (`CAN_VERIFY_<repo>`, externals present, `CAN_LIVE_*`), any opt-down flags from `$ARGS`
  (`--draft`, `--no-approve`, `--no-live`, `--no-resolve-bots`), the incremental range if Phase 2
  found a prior review, and the rubric path `~/.claude/skills/phillip/RUBRIC.md`. Tell the agent to
  execute Phases 3 through 9 of `~/.claude/skills/review-pr/SKILL.md` for **exactly that one PR**,
  reading the rubric itself.
- **Nesting is expected:** the per-PR agent spawns its *own* blind Claude reviewer and runs its own
  Codex/Gemini background jobs (Phase 4). Blindness is preserved: the blind reviewer still never
  sees the PR description or author, regardless of what the per-PR agent knows.
- **Concurrency:** agents for **different repos run in parallel** (separate clones). Agents for PRs
  in the **same repo run sequentially** (shared clone, serial checkouts). Do **not** split same-repo
  PRs across `git worktree`s to parallelize them: a fresh worktree's `node_modules` is empty, so
  "verification deps present" there means a full `yarn install` per worktree (minutes and gigabytes
  each). Without that install Tier 2 drops to reduced confidence and the run posts nothing
  (invariant 2).
- **Tier-3 dynamic walkthroughs are globally serialized** regardless of repo parallelism: one live
  stack machine-wide via the stack lock (pinned ports, singleton `browse` daemon). An agent that
  finds the lock held defers with a NEEDS-DYNAMIC-RUN note. See
  [stack-lifecycle.md](stack-lifecycle.md).
- **Return contract:** each agent returns only the verdict line (event, head SHA, posted review id,
  inline-comment count), its report path, and its NEEDS-YOUR-EYES / NEEDS-DYNAMIC-RUN items, not its
  transcript.
- **Failure isolation:** a dead sub-agent marks its PR `skipped (agent failed)`; the others proceed.
- **Single-PR exception:** exactly one target PR -> run Phases 3 through 9 inline, no dispatch.

### Batch execution model (multi-PR runs): static parallel, then dynamic serial

More than one PR in scope -> run the batch in **two staged passes** so the cheap work parallelizes
and the expensive serial work (stack boots) never blocks it. (Single-PR runs skip staging: Phases 3
through 9 inline, per the exception above. `--no-live` collapses this to Pass A only, and every PR
posts after static.)

**Pass A, static (parallel, all PRs).** Dispatch one sub-agent per PR (context isolation as above),
each running the **static** phases only: Phase 3 (checkout/worktree), Phase 4 (three-reviewer),
Phase 5 + 5b (bot adjudication), Phase 7 (assemble payload + verdict). It does **not** run Phase 6
(dynamic) or Phase 8 (post). Each returns its assembled-static payload, its verdict, and whether the
PR is **UI-touching** (the Phase 6 prefix test).
- **Non-UI PRs are complete after Pass A** -> the orchestrator posts them immediately (Phase 8, with
  the invariant-5 draft re-check and `--draft` honored). Nothing dynamic to wait on.
- **UI PRs park** their static payload and enter the Pass-B queue.

**Pass B, dynamic (serial, UI PRs only).** Drain the UI queue **one PR at a time** (the stack lock
enforces one live stack machine-wide anyway), **ordered by UI-diff size, largest first** (most
surface = most walkthrough value, and a broken stack fails fast). For each PR: Phase 6 (pre-build
packages -> boot -> drive -> capture) -> merge live findings into the parked static payload (a
live-confirmed defect can raise the verdict to `REQUEST_CHANGES`; a clean walkthrough supports
`APPROVE`) -> **post the full review immediately** (Phase 8). Reviews land progressively, not in one
end-of-run batch.

**Time budget and degradation: never drop a PR.** Pass B is bounded by the session runtime. Any UI PR
**not reached** before the budget runs out **posts its Pass-A static review** with a
`NEEDS-DYNAMIC-RUN` note ("static review posted; dynamic walkthrough deferred. Re-run
`/review-pr <n>` for the live pass"). Every in-scope PR always gets a posted review; only the
*walkthrough* is best-effort. The aggregate lists which PRs got dynamic vs static-only.

### Nested dispatch: a per-PR agent may spawn its own helpers, bounded

It already does (the blind reviewer is one), and the pattern extends to other **read-only** work when
one PR is itself too big for one context: chunked review of a large diff (one reader agent per chunk,
findings merged before Phase 5), parallel verification of independent findings (each is read-only
code tracing), or adjudicating a pile of bot threads. Two hard rules:

- **Single writer per PR.** Only the per-PR agent posts the review, replies to threads, resolves bot
  threads, or touches the checkout. Helpers return findings and verdicts; invariant 2
  (only-verified-posts) is enforced in exactly one place.
- **Depth cap:** orchestrator -> per-PR agent -> helpers. No deeper, and no speculative spawning: a
  normal-sized PR runs Phases 4 and 5 inline (plus the blind reviewer it always spawns).

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
