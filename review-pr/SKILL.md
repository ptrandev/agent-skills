---
name: review-pr
description: |
  Reviews GitHub PRs where you are the requested reviewer on Atllas-Inc/codebase
  and Atllas-Inc/aicc-queues, applies Phillip's engineering bar (reuses /phillip's
  rubric + three independent reviewers), verifies every finding against the real
  code path, posts the review back to GitHub (inline comments + a verdict), and adjudicates
  existing bot review threads (Gemini/Copilot) — surfacing the legit ones, resolving verified-false
  noise. The cross-review sibling of /phillip (which is self-review). Autonomous by default; opt
  down with --draft (don't submit), --no-approve (cap at COMMENT), --no-live (skip the dynamic
  walkthrough), --no-resolve-bots (don't resolve bot threads). Idempotent and safe to re-run on a
  schedule. Use: /review-pr, /review-pr <PR#|URL>, /review-pr --repo <owner/name>,
  /review-pr quick. Triggers: "review the PRs I'm assigned", "review-pr".
---

# review-pr

The **reviewer side** of the PR loop. `/babysit-prs` addresses threads on PRs *you authored*;
`/phillip` self-reviews *your local diff*; **`/review-pr` reviews someone else's PR where you're the
requested reviewer** and posts the review to GitHub.

It is the **cross-review sibling of `/phillip`** — same engineering bar, same three-reviewer
discipline, same verification gate — but the action is **post review comments + a verdict**, not
*implement fixes*. It **reads** `/phillip`'s rubric at runtime (not a copy), so `/phillip-sync` keeps
both skills' bar fresh automatically.

## Input / modes

`$ARGS`:

| Invocation | Behavior |
|---|---|
| `/review-pr` | All open PRs across both Targets repos where the current user is a requested reviewer (and not the author). |
| `/review-pr <PR#>` | That PR (resolves to `Atllas-Inc/codebase` unless `--repo`; PR#s are ambiguous across repos). |
| `/review-pr <URL>` | Parse owner/name/number from the GitHub URL — unambiguous. |
| `/review-pr --repo <owner/name>` | Restrict to one repo; combinable with a PR#. |
| `/review-pr quick` | Claude-only blind reviewer (auto-selected for trivial diffs). Default = full three-reviewer. |
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

This skill posts to **other people's** PRs — outward-facing and socially high-stakes. Five invariants:

1. **Autonomous post by default; quality-gated.** It submits the review without a confirm step.
   `--draft` opts down to assemble-and-print-only. The autonomy is bounded by rail #2, not by a stop.
2. **Only verified findings reach GitHub.** A finding posts inline **only** if it was traced against
   the real code path **this session**. Unverified / "couldn't check" / low-confidence findings are
   **never posted** — they go to the local report's **NEEDS YOUR EYES** section. A false
   `REQUEST_CHANGES` on a teammate is the exact failure mode this rail prevents — it is what makes
   autonomous posting safe.
3. **Conservative verdict** (table below): `REQUEST_CHANGES` only on a verified HIGH; `APPROVE` only
   on a clean **fully-verified** pass (and never with `--no-approve`); otherwise `COMMENT`.
4. **Skip self-authored PRs** (`author == ME`) and PRs already reviewed at the current head SHA
   (idempotency). Nits (LOW) are held to the local report — only verified HIGH+MEDIUM post inline.
5. **Never review a draft PR.** A GitHub draft (`isDraft == true`) is work-in-progress and is
   **excluded end-to-end**: filtered at discovery (`select(.isDraft!=true)` / `draft:false`), skipped
   with a note when named explicitly, and **re-checked immediately before any post** — a PR flipped to
   draft mid-run is abandoned, never posted. Review **only open, ready-for-review** PRs.

### Severity → verdict

| Postable findings | `event` |
|---|---|
| ≥1 verified HIGH | `REQUEST_CHANGES` (inline every HIGH + MEDIUM) |
| verified MEDIUM only (no HIGH) | `COMMENT` |
| nothing verified / clean, **FULL** verify depth | `APPROVE` (default) — `--no-approve` caps at `COMMENT` |
| nothing verified / clean, **reduced** depth (no clone / compile-only / no dynamic) | `COMMENT` ("no blocking issues; not fully verified") — **never** auto-APPROVE |
| aicc-queues HIGH resting on **runtime behavior** with **compile-only** evidence | downgrade to `COMMENT` + "compile-only evidence, runtime unverified — please confirm" — never block on a compile alone |

---

## Phase 0 — Preflight + capability detection

Establish identity, targets, and **what this environment can do**, so the same skill is correct
whether it runs in a cloud sandbox or on a local Mac.

```bash
gh auth status || { echo "gh not authenticated — required"; exit 1; }
ME=$(gh api user --jq .login)
```

Resolve the **target repo set** (`--repo` override, else both Targets rows). For each, split
`OWNER=${REPO%/*}` / `NAME=${REPO#*/}` and map to its clone.

**Capability tiers** (probe and record booleans; later phases branch on them):

- **Tier 1 — discover + post:** `gh` + network. Always available.
- **Tier 2 — verify against real code (`CAN_VERIFY_<repo>`):** the repo's clone exists, is clean,
  and the toolchain runs. Probe `node`/`yarn` (codebase → FULL) and `java`/`./gradlew` (aicc-queues
  → COMPILE-ONLY). Without it a PR can still be reviewed from the diff, but **every finding drops to
  reduced confidence and posts nothing** (report-only — invariant 2).
- **Tier 2b — external reviewers:** `/codex` and `/gemini` skills present + their CLIs authed.
  Missing → run with fewer reviewers and say so (same fallback as `/phillip`).
- **Tier 3 — dynamic walkthrough**, two sub-capabilities:
  - `CAN_LIVE_HEADLESS` — can stand up the agents-portal stack + drive a **headless browser**.
    Requires a browser driver (`browse` binary locally, or headless Playwright/Chromium in cloud)
    **and enough memory to host the stack**. Heuristic gate — **skip if total RAM < ~8 GB** (Next.js
    + JVM Firebase emulators + API need it); a constrained runtime does static review only and flags
    UI PRs for a higher-capacity run.
    ```bash
    TOTAL_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}'); TOTAL_MB=${TOTAL_MB:-0}
    [ "$TOTAL_MB" -ge 8000 ] && HAVE_RAM=1 || HAVE_RAM=0   # macOS: use sysctl hw.memsize
    ```
  - `CAN_LIVE_WATCHED` — a **human** can watch live / capture video (OpenCap). **Local only.**

**Refresh the rubric (non-blocking):** invoke `/phillip-sync` once (24 h cooldown makes it usually a
no-op). If it reports it ADDED lines, **re-Read** the rubric. Then **Read Section 1 of
`~/.claude/skills/phillip/SKILL.md`** — that rubric is what this skill reviews against. *Read, don't
reinvent.*

Print a per-repo readiness summary:
```
Preflight:  gh ✓ (ptrandev)   reviewers: codex ✓ gemini ✓   dynamic: headless ✓
  Atllas-Inc/codebase     clone ✓ clean ✓   verify FULL
  Atllas-Inc/aicc-queues  clone ✓ clean ✓   verify COMPILE-ONLY
```

---

## Phase 1 — Discover PRs awaiting my review

Per repo (validated: `gh search prs --review-requested=<me>` works on gh 2.87+):

```bash
gh search prs --review-requested="$ME" --state=open --repo "$REPO" \
  --json number,title,author,url,isDraft \
  --jq '.[] | select(.author.login!="'"$ME"'") | select(.isDraft!=true) | "\(.number)\t\(.author.login)\t\(.title)"'
```

GraphQL fallback if the search flag is flaky in cloud:
`search(query:"is:pr is:open draft:false review-requested:'"$ME"' repo:'"$REPO"'", type:ISSUE, first:50)`.

If `$ARGS` named a PR#/URL, use it directly — but still confirm `ME` is a requested reviewer and not
the author, **and that the PR is not a draft**.

**Draft PRs are excluded from review.** A GitHub draft is work-in-progress; this skill reviews only
**open, ready-for-review** PRs. Discovery filters drafts out (`select(.isDraft!=true)` / `draft:false`),
and an explicitly-named draft (`/review-pr <PR#>`) is **skipped** with a note ("PR #N is a draft —
skipped; re-request review when it's marked ready"). Never post to a draft.

### Dispatch — one sub-agent per PR (context isolation)

Each (repo, PR) unit is reviewed in its **own sub-agent** (Agent tool) — running Phases 3–9 for a
single-PR run, or the staged split in the batch model below for multi-PR runs. A single agent
reviewing several PRs carries every prior PR's diff, findings, and code reads into the next
review — context bloat that dulls attention and cross-contaminates judgments (a pattern from
PR A biasing the verdict on PR B). A review must stand on one PR's evidence alone, so each PR
gets a fresh agent. The orchestrator (this session) stays thin: preflight → discover → gate →
dispatch → aggregate.

**Orchestrator rules:**

- **Run Phase 0 once** (identity, capability probes, `/phillip-sync`) and **run the Phase 2
  idempotency gate yourself** before dispatching — two cheap API calls per PR that avoid
  spawning agents for already-reviewed heads. Do **not** read diffs or repo files yourself.
- **Each dispatch prompt is self-contained:** repo, PR#, head SHA, clone path, the capability
  booleans (`CAN_VERIFY_<repo>`, externals present, `CAN_LIVE_*`), any opt-down flags from
  `$ARGS` (`--draft`, `--no-approve`, `--no-live`, `--no-resolve-bots`), the incremental range
  if Phase 2 found a prior review, and the rubric path. Tell the agent to execute Phases 3–9 of
  `~/.claude/skills/review-pr/SKILL.md` for **exactly that one PR**, reading phillip Section 1
  itself.
- **Nesting is expected:** the per-PR agent spawns its *own* blind Claude reviewer and runs its
  own Codex/Gemini background jobs (Phase 4). Blindness is preserved — the blind reviewer still
  never sees the PR description or author, regardless of what the per-PR agent knows.
- **Concurrency:** agents for **different repos run in parallel** (separate clones). Agents for
  PRs in the **same repo run sequentially** (shared clone, serial checkouts) — or in parallel
  only if each gets its own `git worktree` at its head SHA *and* verification deps are available
  in that worktree. **Tier-3 dynamic walkthroughs are globally serialized** regardless of repo
  parallelism — one live stack machine-wide via the Phase 6 stack lock (pinned ports, singleton
  `browse` daemon); an agent that finds the lock held defers with a NEEDS-DYNAMIC-RUN note.
- **Return contract:** each agent returns only the verdict line (event, head SHA, posted review
  id, inline-comment count), its report path, and its NEEDS-YOUR-EYES / NEEDS-DYNAMIC-RUN items
  — not its transcript.
- **Failure isolation:** a dead sub-agent marks its PR `skipped (agent failed)`; the others
  proceed.
- **Single-PR exception:** exactly one target PR → run Phases 3–9 inline, no dispatch.

### Batch execution model (multi-PR runs) — static parallel, then dynamic serial

More than one PR in scope → run the batch in **two staged passes** so the cheap work parallelizes
and the expensive serial work (stack boots) never blocks it. (Single-PR runs skip staging — Phases
3–9 inline, per the exception above. `--no-live` collapses this to Pass A only: every PR posts after
static.)

**Pass A — Static (parallel, all PRs).** Dispatch one sub-agent per PR (context isolation as above),
each running the **static** phases only — Phase 3 (checkout/worktree), Phase 4 (three-reviewer),
Phase 5 + 5b (bot adjudication), Phase 7 (assemble payload + verdict). It does **not** run Phase 6
(dynamic) or Phase 8 (post). Each returns its assembled-static payload, its verdict, and whether the
PR is **UI-touching** (`apps/agents-portal/src/pages|components`).
- **Non-UI PRs are complete after Pass A** → the orchestrator posts them immediately (Phase 8, with
  the invariant-5 draft re-check and `--draft` honored). Nothing dynamic to wait on.
- **UI PRs park** their static payload and enter the Pass-B queue.

**Pass B — Dynamic (serial, UI PRs only).** Drain the UI queue **one PR at a time** (the Phase 6
stack lock enforces one live stack machine-wide anyway), **ordered by UI-diff size, largest first**
(most surface = most walkthrough value, and a broken stack fails fast). For each PR: Phase 6
(pre-build packages → boot → drive → capture) → merge live findings into the parked static payload
(a live-confirmed defect can raise the verdict to `REQUEST_CHANGES`; a clean walkthrough supports
`APPROVE`) → **post the full review immediately** (Phase 8). Reviews land progressively, not in one
end-of-run batch.

**Time budget & degradation — never drop a PR.** Pass B is bounded by the session runtime. Any UI PR
**not reached** before the budget runs out **posts its Pass-A static review** with a
`NEEDS-DYNAMIC-RUN` note ("static review posted; dynamic walkthrough deferred — re-run
`/review-pr <n>` for the live pass"). Every in-scope PR always gets a posted review; only the
*walkthrough* is best-effort. The aggregate lists which PRs got dynamic vs static-only.

**Nested dispatch — a per-PR agent may spawn its own helpers, bounded.** It already does (the
blind reviewer is one), and the pattern extends to other **read-only** work when one PR is
itself too big for one context: chunked review of a large diff (the edge-case file/workspace
chunking maps to one reader agent per chunk, findings merged before Phase 5), parallel
verification of independent findings (each is read-only code tracing), or adjudicating a pile
of bot threads. Two hard rules:

- **Single writer per PR.** Only the per-PR agent posts the review, replies to threads,
  resolves bot threads, or touches the checkout. Helpers return findings/verdicts; invariant 2
  (only-verified-posts) is enforced in exactly one place.
- **Depth cap:** orchestrator → per-PR agent → helpers. No deeper, and no speculative spawning —
  a normal-sized PR runs Phases 4–5 inline (plus the blind reviewer it always spawns).

---

## Phase 2 — Idempotency gate (skip already-reviewed-at-this-head)

```bash
HEAD_SHA=$(gh api "repos/$OWNER/$NAME/pulls/$PR" --jq .head.sha)
gh api "repos/$OWNER/$NAME/pulls/$PR/reviews" \
  --jq "[.[] | select(.user.login==\"$ME\")] | sort_by(.submitted_at) | last | {state, commit_id}"
```

- No prior review by me → **fresh review**.
- Prior review `commit_id == HEAD_SHA` → **skip** (`PR #n: already reviewed at current head`).
- Prior review `commit_id != HEAD_SHA` → **re-review the new push**, scoped incrementally to
  `git diff <old commit_id>..<HEAD_SHA>` (don't re-flag unchanged code). Old SHA unreachable
  (force-push) → full re-review. Post against the **new** `commit_id`.

The reviews list **is** the idempotency state — no separate state file. This is what makes scheduled
re-runs safe.

---

## Phase 3 — Fetch the PR's true diff + get its code on disk (read-only)

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
worktree at the head SHA — the skill must not stash or change branches under a dirty tree:

```bash
if [ -z "$(git status --porcelain)" ]; then
  gh pr checkout "$PR" --repo "$REPO"; WORKDIR="$CLONE"          # READ-ONLY — never commit/push
else
  WORKDIR="$SCRATCH/pr-$NAME-$PR"; git worktree add --detach "$WORKDIR" "$HEAD_SHA"
fi
# Sanity: the three-dot diff vs FRESH base must equal gh pr diff's file set (else base is wrong).
git -C "$WORKDIR" diff --name-only "origin/$BASE...$HEAD_SHA"
```

No clone at all → review from `gh pr diff` alone at **reduced confidence** (post nothing; report-only).
Remove the worktree in Phase 9 (`git worktree remove --force "$WORKDIR"`).

---

## Phase 4 — Three-reviewer pass (reuse /phillip's discipline, scoped to the PR diff)

Run the same fan-out as `/phillip`, but the scope is the **PR diff** and the action is "post
comments," not "fix":

- **Codex** + **Gemini** as concurrent background Bash jobs. **Run them from `$WORKDIR` against the
  PR's true diff** — point them at the freshly-fetched base so they don't review the stale-master
  garbage (`git diff "origin/$BASE...$HEAD_SHA"`, or feed them `/tmp/review-pr-$NAME-$PR.diff`
  directly). Outputs to `/tmp/review-pr-codex-$NAME-$PR.out` / `-gemini-$NAME-$PR.out`. (All temp
  paths include `$NAME` — PR numbers repeat across repos, and parallel per-repo agents writing
  `/tmp/review-pr-$PR-*` would clobber each other.)
  - **Codex invocation (API-key envs).** When Codex is authed by API key (`OPENAI_API_KEY` /
    `CODEX_API_KEY`, e.g. the cloud routine) rather than ChatGPT-plan OAuth, invoke it as
    `codex exec -s read-only -c model_reasoning_effort=high` with the **diff embedded in the prompt**
    (feed `/tmp/review-pr-$NAME-$PR.diff`). Do **not** use `/codex review` / `codex review` there: it
    requires OAuth (401s on an API key) and reviews the **working tree**, which is empty in a detached
    read-only worktree. Detect via `gstack-codex-probe` or a present API key; when unsure, use
    `codex exec`. **Auth:** `codex exec` needs a materialized credential — an API key in the env is
    **not** enough (it 401s until a login writes `~/.codex/auth.json`). Run
    `printenv OPENAI_API_KEY | codex login --with-api-key` once (bake it into the environment setup so
    it isn't re-discovered per run).
  - **Gemini invocation (headless sandbox).** Pass the diff **inline in the `-p` prompt** — Gemini's
    `-p` mode does not read file-path arguments and cannot reach paths outside its workspace, so a
    `/tmp/...` diff file is invisible to it, and it has no shell tool in the cloud sandbox. Embed the
    diff text directly (the `/gemini` skill's review mode already does this). On `RESOURCE_EXHAUSTED` /
    quota errors it degrades to a thinner voice — say so in the report; the fix is enabling billing on
    the `GEMINI_API_KEY` project (the free tier is rate-capped).
  - **Models: default to latest, pin only when needed.** Codex's CLI default already tracks the
    latest (currently `gpt-5.6`), so leave it **unpinned** — pass no `-m` unless `$CODEX_MODEL` is
    set. Gemini defaults to the `gemini-pro-latest` rolling alias, which tracks latest *stable*; set
    `$GEMINI_MODEL` (e.g. `gemini-3.1-pro-preview`) only to opt into a **preview** ahead of GA, since
    `-latest` won't select a preview. Honor `-m "$CODEX_MODEL"` / `-m "$GEMINI_MODEL"` when set;
    never hardcode a version in this file.
- A **blind Claude sub-agent** (Agent tool) launched simultaneously: role = independent reviewer,
  given the PR diff + `$WORKDIR` to read real code, **Read phillip Section 1**, apply the severity
  taxonomy + verification discipline + HONESTY RULE, return `SEVERITY | file:line | finding | why-real`.
  **Do NOT** feed it the PR description or author — preserve blindness and avoid author-intent bias.
- `quick` mode = Claude blind sub-agent only. Missing external → run with fewer and say so.

> Multi-reviewer earns its cost: in testing, a solo pass returned COMMENT while Codex + Gemini both
> independently caught a HIGH (an entitlement bypass) the solo pass missed → verified → REQUEST_CHANGES.

---

## Phase 5 — Verify every finding (stricter than self-review)

Apply `/phillip`'s two-check gate to each finding: **(1) is the bug real?** open `file:line` in the
checked-out head, trace the actual flow. **(2) is any proposed fix sound?** Then the HONESTY RULE:
only mark a finding **verified** if you actually traced it this session. A finding is **postable**
only if `verified-real AND high-confidence AND severity ∈ {HIGH, MEDIUM}`.

- Not real → **reject with a one-line proof** (logged, not posted).
- Real but unverifiable here (no clone / external API / ambiguous) → **NEEDS YOUR EYES** (report
  only, **not** posted).
- LOW/nit → held to report (decision).

The bar is higher than `/phillip` because a wrong post lands on a colleague's PR.

---

## Phase 5b — Adjudicate existing bot review threads (default on)

Part of a human reviewer's job is being the signal over the bot noise (Gemini Code Assist
auto-reviews every PR; Copilot when requested). Fetch the existing **bot** review threads and
**verify each against the real code**, exactly like your own findings. Reuse `/babysit-prs`' GraphQL
(`reviewThreads` → `resolveReviewThread`) and `/full-send`'s bot-login table (logins differ across
the reviews / comments / GraphQL APIs; in GraphQL they drop `[bot]` — match
`test("copilot|gemini-code-assist")`).

```bash
gh api graphql -f query='query($o:String!,$n:String!,$pr:Int!){repository(owner:$o,name:$n){
  pullRequest(number:$pr){reviewThreads(first:100){pageInfo{hasNextPage endCursor}
    nodes{ id isResolved
    comments(first:20){nodes{ databaseId author{login} body path line }}}}}}}' \
  -F o="$OWNER" -F n="$NAME" -F pr="$PR"
# hasNextPage → paginate with endCursor; never silently truncate at 100 threads.
```

For each **unresolved bot** thread, trace it and act:

- **Legit** (verified real) → **don't resolve** (the author should fix it); surface it in your review
  summary ("Gemini's note on `X` is correct — please address") and **don't re-raise it as your own**
  finding (no duplicate noise).
- **False / irrelevant / already-handled** (verified wrong) → **reply** with the one-line reason,
  then **resolve** it (`resolveReviewThread`). This is **default on**; `--no-resolve-bots` replies
  but leaves it unresolved.

Hard rules: **bot threads only** (never resolve a human's thread); **verified-only** (never resolve
on a guess, never resolve a *legit* bot comment); **reply-before-resolve** (always leave the why —
an evidence trail, never a silent dismissal); **re-check before acting** (re-fetch `isResolved` and
the last-comment author right before replying/resolving — a concurrent run or the PR author may
have handled it already; if so, skip silently). Bot adjudication is a **separate** section and **does
not move your verdict** — a pile of bot false-positives must not push you toward `REQUEST_CHANGES`;
your verdict stays driven by *your* verified findings.

---

## Phase 6 — Dynamic walkthrough (auto for UI PRs, capacity-gated)

Run when `CAN_LIVE_HEADLESS` **AND** the PR touches `apps/agents-portal/src/pages|components` **AND**
not `--no-live`. Otherwise **skip and, if it's a UI PR, add a NEEDS-DYNAMIC-RUN note** to the report
("UI PR — run /review-pr <n> on a ≥8 GB runtime (cloud Routine / local) for the live walkthrough").

**Delegate the walkthrough itself to `/ui-walkthrough --embedded`** rather than hand-rolling it here.
It walks every affected surface at **desktop + tablet + mobile**, runs deterministic detectors
(horizontal scroll, sub-44px touch targets, clipped text, console errors), publishes the
screenshots to GitHub via a verified mechanism (its Phase 7), and returns
`{blockers, mediums, nits, images, neutralNotes, coverage, markdown}` — posting nothing itself.
**This skill keeps the verdict**: merge its `blockers` into your findings (a live-confirmed defect
is still the highest-confidence tier), paste its `markdown` into the review body, and treat its
`neutralNotes` as infra notes, never findings. The stack-lifecycle rules below stay **this file's**
source of truth — `/ui-walkthrough` Phase 4 reads them from here, so don't duplicate them there.

When it runs, reuse the `/full-send` Phase 8 / `/verify` + `/browse` pattern:
- **Pre-build shared workspace packages first** (required — the stack's `next build` can't resolve
  them otherwise): `yarn turbo run build --filter='./packages/*'` at the PR head. `scripts/e2e-stack.sh`
  does **not** build workspace packages, and a fresh `yarn install` leaves their `dist/` empty, so
  `next build` hard-fails resolving `loop-stats` (consumed by `loop-renderer`, etc.). Also confirm
  **Node 20** is active (per the repo's `.nvmrc`) before building — Node 22 breaks the `re2` native
  addon and risks build/runtime drift. *(Verified via cloud boot spike 2026-07-26: emulators + API
  boot fine headlessly; this pre-build is the one gap between a fresh clone and a healthy `:3000`.)*
- Bring up the **deterministic, externally-stubbed** stack — **never fire real
  Stripe/Vapi/Twilio/etc.** Two corrections to the obvious approach, both verified in the checkout:
  **`yarn e2e:stack` cannot host a walkthrough** (it boots emulators → seeds → builds → runs the
  Playwright suite → tears everything down; there is no persistent stack to drive), and
  **`yarn agents-portal` is not emulator-scoped** (`npm run set-dev`; emulator interception is
  env-var-driven via `e2e/.env.e2e`, so a process started outside that env talks to **real
  atllas-dev** — silently). Use `/ui-walkthrough` Phase 4's hold-open mechanism: run the real
  harness with a temporary hold spec in the **ephemeral checkout**, which keeps emulators + API +
  `next start` up inside `emulators:exec` while the browser is driven from outside.
  - **Prefix the boot with `env -u VSCODE_CWD`.** Claude Code running inside the VSCode extension
    host exports `VSCODE_CWD=/`, and `firebase-tools` reads exactly that variable as "I am the VS
    Code extension" (`lib/vsCodeUtils.js`), switching its template root to `lib/templates/` — a path
    the npm package doesn't ship. The emulators then die at startup with
    `ENOENT … lib/templates/hosting/init.js`, which reads like a corrupt `node_modules` and tempts a
    pointless multi-GB reinstall. A terminal-launched `claude` has no `VSCODE_CWD`, so this
    reproduces only from the IDE. Verified 2026-07-30.
- Log in as a **seeded** persona — **not** a real dev account. Reviewer mode always walks the sealed
  e2e stack, whose users are created per run by `apps/agents-portal/e2e/seed/seed.mjs` with
  credentials committed in `apps/agents-portal/e2e/.env.e2e`: `e2e-agent@e2e.test`
  (`E2E_TEST_USER_EMAIL`, has `core_premium: active` so it clears the paywall), `e2e-free@e2e.test`,
  `e2e-admin@e2e.test`. **Nothing to provision** — no gitignored file, no routine env vars. A real
  dev account like `phillip+premium@atllas.com` does **not exist** in the per-run emulator and fails
  at the login form. Better still, reuse the authenticated `storageState` the harness's per-persona
  setup projects already write, and skip the login form entirely.
- Navigate to the affected surface; exercise the **happy path + key error/empty/loading states**;
  capture the browser console + screenshots. Driver: **local** = `browse` (+ OpenCap video if
  `CAN_LIVE_WATCHED`); **cloud** = headless Playwright.
  - **Cloud Chromium launch (required in the sandbox): `args: ['--ssl-version-max=tls1.2']`.** The
    cloud egress path has a TLS-terminating middlebox that **resets Chromium's TLS 1.3 ClientHello**
    (larger than curl's — GREASE + post-quantum ML-KEM key share), so *every* HTTPS request fails
    with `net::ERR_CONNECTION_RESET` and the app hangs on its splash (e.g. `_app` can't load
    `js.stripe.com` → login form never mounts). Capping at TLS 1.2 shrinks the ClientHello enough to
    pass (verified 3/3 against the real target). Not a cert/proxy issue — cert-ignore/proxy flags do
    **not** help and aren't needed (Chromium auto-uses `$https_proxy`). If the walkthrough runs the
    app's `playwright.config.ts` harness, inject the arg into `use.launchOptions.args` in the
    **ephemeral clone** (local, uncommitted — never a repo change).
- Also flag UI features shipping **without** the Playwright E2E specs the agents-portal behavioral
  contract requires.

A **live-confirmed** defect ("modal throws on submit", screenshot) is the **highest-confidence**
finding tier → strong basis for `REQUEST_CHANGES`; a clean walkthrough supports `APPROVE`.

### Stack lifecycle (no preview env — local boot rules)

There is no preview deploy, so the walkthrough boots the PR's code locally. Booting someone
else's branch is the most failure-prone and highest-noise part of this skill; these rules exist to
keep its evidence trustworthy.

**One stack at a time, machine-wide.** Acquire a lock before boot; release in teardown:

```bash
LOCK="$SCRATCH/review-pr-stack.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  OLDPID=$(cat "$LOCK/pid" 2>/dev/null)
  if [ -n "$OLDPID" ] && kill -0 "$OLDPID" 2>/dev/null; then
    echo "stack busy (PR being walked by pid $OLDPID) — defer"; exit 0   # NEEDS-DYNAMIC-RUN note
  fi
  rm -rf "$LOCK" && mkdir "$LOCK"      # stale lock from a dead run — reclaim
fi
echo $$ > "$LOCK/pid"
```

Why sequential: the ports below are pinned (two stacks can't coexist), `browse` is a singleton
Chromium daemon (parallel walkthroughs interleave tabs/state), and one-stack failures triage
cleanly ("PR 1768's stack didn't boot") instead of becoming an interference puzzle. Walkthrough
volume is low — Tier 3 only fires for UI-touching PRs — so parallel stacks solve a problem this
skill doesn't have. **Orchestrator note:** per-repo agents may run in parallel (Phase 1), but
Tier-3 walkthroughs serialize on this lock; an agent that finds it held defers with a
NEEDS-DYNAMIC-RUN note rather than waiting.

**Pinned ports — free-or-abort preflight, and the repo already owns this check.** The stack's ports
come from repo config and are NOT relocatable without editing the checkout (FE `baseURL` is
hardcoded, emulator ports live in `firebase.json`). **Prefer the harness's own preflight** —
`scripts/e2e-stack.sh` runs `node scripts/e2e-preflight.mjs --ports
"${E2E_PREFLIGHT_PORTS:-4000,3000,9099,8080,9000,9199,8085}" --checkout "$ROOT"`, which fails loudly
naming the squatter's pid/command/cwd. A hand-maintained list here drifts from `firebase.json`, and
did: the set below previously omitted **9000** (the `database` emulator, which `--only` *does* start)
and included **4001** (the emulator UI, which `--only` does *not* start, so requiring it free is a
false blocker). Never set `E2E_KILL_SQUATTERS=1` — killing a process you don't own violates the
"provably ours" rule below.

If you need a pre-lock check before invoking the harness, match its list exactly:

```bash
BUSY=$(lsof -nP -iTCP:3000 -iTCP:4000 -iTCP:8080 -iTCP:8085 -iTCP:9000 -iTCP:9099 -iTCP:9199 \
       -sTCP:LISTEN 2>/dev/null | tail -n +2)
if [ -n "$BUSY" ]; then rm -rf "$LOCK"; echo "SKIP_WALKTHROUGH: ports occupied"; echo "$BUSY"; fi
```

Any port occupied → **do not boot, do not walk through** — release the lock, add a neutral
NEEDS-DYNAMIC-RUN note naming the port and likely cause ("is your dev stack running?"). This gate
is load-bearing, not hygiene: `playwright.config.ts` sets `reuseExistingServer: true`, so if
something already listens on :3000 (the user's dev server on `master`), the walkthrough would
**silently validate that code instead of the PR's** and produce screenshots "proving" whatever is
already running. A port conflict that errors is loud; validating the wrong stack is quiet — this
preflight converts the quiet failure into a loud skip. Kill a leftover only if it's provably ours:
its PID is in a previous run's `$LOCK/pid` **and** its command line matches the stack (`ps -p
<pid> -o command=` shows `next start` / `firebase emulators`). Anything else → skip, never kill.

**Post-boot identity assertion.** After the stack reports healthy, confirm :3000 is owned by a
process this run spawned (`lsof -nP -iTCP:3000 -sTCP:LISTEN` PID is a descendant of the stack we
started) before driving the browser. This is what makes walkthrough evidence attributable to the
PR's code rather than to whatever answered the port.

**State isolation** comes free from the existing harness — `yarn e2e:stack` runs
`firebase emulators:exec` with per-run in-memory emulators seeded by `e2e/seed/seed.mjs` (no
`--import`), and external services are stubbed. Never point the walkthrough at the dev database
or real services; if the stubbed stack can't exercise the surface, that's a NEEDS-DYNAMIC-RUN
note, not a reason to relax stubbing.

**Boot budget: ~120 s to healthy** (matches the Playwright `webServer` timeout). Miss it → tear
down, release the lock, neutral note ("stack didn't boot in budget"), move on. No retry spiral.

**Guaranteed teardown, and boot failures are never findings.** `emulators:exec` tears down the
emulators on its own exit; everything else this run started (API process, `next start`, browse
tabs) is killed by an EXIT trap that also releases the lock — teardown must not depend on the
walkthrough succeeding. And triage discipline: "didn't boot on my machine" ≠ "PR broken". Infra
failures (ports, budget, emulator crash) produce **neutral report notes only**; a posted finding
requires misbehavior observed **in the app, on a healthy, identity-verified stack**. If the stack
ever gains first-class port parameterization, move to a dedicated review-port block then — do not
`sed` ports into the checkout to force one now.

---

## Phase 7 — Assemble the review

Group postable findings into inline `comments[]` + a summary `body` + an `event` (verdict from the
table). The `body` states: reviewers used, verify depth, **whether a live walkthrough ran**, the
verdict rationale, and a link to the local report.

### Inline line-anchoring (get exactly right)

Each `comments[]` entry anchors to the unified diff with `path` + `line` + `side`:
- `side: "RIGHT"` + `line` = the new-file line (added/modified code — the common case); `LEFT` only
  for a deleted line; multi-line adds `start_line` + `start_side`.
- The line **must be inside a diff hunk** or GitHub returns **422**. Pre-validate each finding's line
  against the patch ranges in `/tmp/review-pr-$NAME-$PR-files.json`; a verified finding **outside** the
  diff → fold it into the summary `body` as a `file:line` reference instead of an inline anchor.
- Build the JSON with `jq -n` (never hand-quote `body` text). Walkthrough screenshots are already
  published and embedded by `/ui-walkthrough` Phase 7 (assets pushed to a detached
  `refs/ui-walkthrough/pr-<n>` ref in the PR's own repo, embedded as
  `github.com/<o>/<r>/raw/<commit>/…` — the only embed form that renders for a viewer on a private
  repo). Paste its returned `markdown` into the review `body`; don't re-upload anything.

---

## Phase 8 — Post (or draft)

- **Check-before-post (concurrent-run guard):** immediately before submitting, re-run the
  Phase 2 gate (one API call). If a review by `ME` at `HEAD_SHA` appeared since discovery, a
  concurrent run (Routine vs. local) already posted — skip with a note instead of
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

## Phase 9 — Report

Write `${REVIEW_PR_PLANS_DIR:-$HOME/.claude/plans}/review-pr-<owner>-<repo>-<PR>-<date>.md`.

> **Headless/sandbox note.** Claude Code guards the entire `~/.claude/` tree as **sensitive**, so
> writing a report there prompts for permission **even under `bypassPermissions`** — which stalls an
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

NEEDS YOUR EYES (unverified — NOT posted):
- <file:line> — <finding> — <why it couldn't be verified here>

NEEDS DYNAMIC RUN (UI PR, this runtime lacks RAM):
- run /review-pr <n> on a ≥8 GB runtime for the live walkthrough

BOT THREADS ADJUDICATED (Gemini/Copilot):
- <file:line> — legit (surfaced in review, not resolved) | false → replied + resolved | reason

Posted: review <id>, event=<event>, <k> inline comments; bot threads: <r> resolved, <l> surfaced; against <sha>.
```

Idempotency record = the posted review's `commit_id` (read back via the reviews API next run). Then
remove any worktree created in Phase 3 (`git worktree remove --force "$WORKDIR"`).

---

## Edge cases

Large diffs (chunk by file/workspace; incomplete coverage caps verdict at `COMMENT`); **stale local
base** (always fetch the PR's real base and three-dot diff — never trust local `master`); **dirty
clone** (use a worktree at the head SHA, never stash/switch the user's branch); bot adjudication
(verified-only, bot threads only, reply-before-resolve, never moves the verdict — Phase 5b); re-review
after a push (incremental, new `commit_id`); **draft PRs (skip — not ready for review)**; files outside the
diff/clone (can't verify → don't post); 422 anchor failure (fold to body); rate limits (back off →
draft); self-authored / already-reviewed-at-head (skip); **stack ports occupied** (free-or-abort:
skip the walkthrough with a neutral note — never boot onto busy ports, `reuseExistingServer: true`
would silently validate the wrong code); **leaked stack from a dead run** (reclaim only via stale
lockfile PID + command-line match; kill nothing else); **stack didn't boot in budget** (neutral
NEEDS-DYNAMIC-RUN note, never a posted finding).

---

## Running unattended

Runtime-agnostic by design (capability detection). Two homes:

- **Cloud Routine (primary)** — [routine.md](routine.md). Managed 16 GB sandbox, hourly schedule;
  runs the full loop including the **Tier-3 dynamic walkthrough** via headless Playwright
  (trial-verify once). Always-on, no machine needed.
- **Local Mac** — `/loop 2h /review-pr` or `claude -p "/review-pr"`; same loop, plus the
  human-watchable walkthrough + OpenCap video, and sub-hourly cadence.

Idempotency (reviews-API `commit_id`) makes repeated runs safe — each only picks up PRs not yet
reviewed at their current head — and the Phase 8 check-before-post guard closes the in-flight
window where two overlapping runs both pass the gate. Stagger cadences anyway (Routine hourly,
local `/loop 2h`) so overlap stays rare.
