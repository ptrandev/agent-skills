# review-pr: Routine (cloud) setup

The primary way to run `/review-pr` unattended. A Claude Code **Routine** runs in a managed cloud
sandbox (Ubuntu, \~16 GB RAM / 30 GB disk / 4 vCPU) that **clones your repos and runs a setup step**,
so it has the real code + toolchain to verify findings, and enough memory to run the **Tier-3
dynamic walkthrough** headlessly.

> Source of truth: <https://code.claude.com/docs/en/routines> (research preview, so labels and limits
> may change). Configure at **claude.ai/code/routines**, the Desktop app (**Routines -> New routine
> -> Remote**), or `/schedule` in the CLI.

## How it differs from babysit-prs' Routine

- **No "unrestricted branch pushes" toggle needed.** `/review-pr` checks out PR branches **read-only**
  and never commits or pushes. It only POSTs reviews. It still needs GitHub **write** scope (the
  connected identity provides it) to submit reviews + inline comments.
- **It calls other skills**, so the setup script must install them into the sandbox: `phillip`
  (whose `RUBRIC.md` it reads), `phillip-sync`, `codex`, `gemini`.
- **It can run Tier-3 headlessly** (16 GB is enough for the stack). Setup must supply `gh` and a
  Chromium (§3); the image ships neither reliably.

## 1. Connect GitHub (no PAT)

Use the connected GitHub identity, not a pasted token. Either `/web-setup` (grants cloning) or the
**Claude GitHub App** (also needed if you add a GitHub event trigger). Reviews are attributed to
**your** GitHub user.

## 2. Create the routine (web form)

At **claude.ai/code/routines -> New routine**:

1. **Name + prompt.** Name `review-pr`; prompt in §4. Pick your model in the selector.
2. **Select repositories.** `Atllas-Inc/codebase` and `Atllas-Inc/aicc-queues` (cloned fresh from
   the default branch each run).
3. **Select an environment** (§3).
4. **Select a trigger** (§5).
5. **Connectors / Permissions tabs.** Strip connectors this routine doesn't need. **No branch-push
   toggle required** (read-only checkout).
6. **Create**, then **Run now** for the validation pass (§6).

## 3. Environment + setup script

Keep the default **Trusted** network (github.com + package registries reachable). Setup script (runs
once, cached). **The two repos differ: codebase is Yarn 3 Berry, aicc-queues is Gradle/JVM.**

> **The runner aborts the whole script on the first non-zero command.** Verified 2026-08-13: a
> `cp` of a non-existent skill directory ended setup at that line, and steps (b) onward never ran.
> So **every** step needs a guard: `|| echo …`, an `if`, or a `[ -d … ]` test. A step that is
> allowed to fail must say so in its own line. **Do not add a bare command to this script.**

```bash
# (a) install the skills this one reads/calls (public repo, no auth).
#     `codex` is a gstack skill and is NOT in this repo. Do not add it to this list:
#     the cp fails and takes the whole setup script with it.
rm -rf /tmp/claude-skills      # a leftover dir makes `git clone` fail, which ends setup
git clone --depth 1 https://github.com/ptrandev/claude-skills.git /tmp/claude-skills
mkdir -p "$HOME/.claude/skills"
for s in review-pr phillip phillip-sync gemini full-send ui-walkthrough; do
  if [ -d "/tmp/claude-skills/$s" ]; then
    cp -R "/tmp/claude-skills/$s" "$HOME/.claude/skills/$s"
  else
    echo "WARN: skill '$s' is not in the repo, skipped"
  fi
done

# (b) Node 20, BEFORE any install. The image ships Node 22 with no nvm, which breaks the `re2`
#     native addon and fails the Tier-3 pre-build (stack-lifecycle.md). Installing it after
#     `yarn install` is too late: the addon is already built against the wrong ABI.
if ! node -v 2>/dev/null | grep -q '^v20\.'; then
  { curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs ; } \
    || echo "WARN: Node 20 install failed. Tier-3 pre-build will fail on re2 under $(node -v)"
fi
node -v || echo "WARN: no node at all. Tier-2 verification and Tier-3 both unavailable."

# (c) toolchains for Tier-2 verification.
CODEBASE_DIR="${CODEBASE_DIR:-./codebase}"
AICC_DIR="${AICC_DIR:-./aicc-queues}"
if [ -f "$CODEBASE_DIR/package.json" ]; then
  ( cd "$CODEBASE_DIR" && corepack enable && yarn install --immutable ) \
    || echo "codebase: yarn install failed. Verify degrades to diff-only (no posting)"
  # `yarn install` leaves packages/*/dist empty, and the Tier-3 `next build` then hard-fails
  # resolving loop-stats. stack-lifecycle.md owns this step; pre-build it once here.
  ( cd "$CODEBASE_DIR" && yarn turbo run build --filter='./packages/*' ) \
    || echo "WARN: workspace pre-build failed. Tier-3 boot will fail on packages/*/dist"
fi
if [ -f "$AICC_DIR/build.gradle" ]; then
  ( cd "$AICC_DIR" && ./gradlew --no-daemon compileJava ) \
    || echo "aicc-queues: gradle compile failed. Verify degrades to diff-only"
fi

# (d) `gh`. The skill and /ui-walkthrough drive GitHub through `gh` in ~30 places. Install it,
#     but see the note below: the API may be blocked at the session level regardless, in which
#     case the run must fall back to the GitHub MCP tools.
if ! command -v gh >/dev/null; then
  { ( type -p curl >/dev/null || apt-get install -y curl ) \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
         -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
         > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y gh ; } || echo "WARN: gh install failed"
fi
gh --version || echo "FATAL: gh missing. Discovery and posting will both fail."

# (e) external reviewer CLIs. The container is ephemeral, so an install that happened in a
#     previous session is gone: without this, Tier 2b silently drops to one reviewer every run
#     and the verdict caps at COMMENT. Verified missing at boot 2026-08-14.
npm i -g @openai/codex @google/gemini-cli || echo "WARN: reviewer CLI install failed (Tier 2b degrades)"
# Codex needs a materialized credential; an API key in the env alone 401s. Do it here as a
# best-effort warm start, but it is NOT durable: this build phase's $HOME does not reach the run
# container (verified 2026-08-14). SKILL.md Phase 4 re-creates the file at run time, which is the
# load-bearing copy. Set OPENAI_API_KEY under Environment variables so BOTH can succeed.
if [ -n "$OPENAI_API_KEY" ]; then
  printenv OPENAI_API_KEY | codex login --with-api-key || echo "WARN: codex login failed"
else
  echo "WARN: OPENAI_API_KEY unset. Codex cannot authenticate at setup or at run time."
fi
codex --version  || echo "WARN: codex missing (Tier 2b degrades to fewer reviewers)"
gemini --version || echo "WARN: gemini missing (Tier 2b degrades to fewer reviewers)"

# (f) headless browser for the Tier-3 dynamic walkthrough (trial-verify on first run).
#     Prefer the image's preinstalled browsers; `playwright install` is often forbidden here.
#     Test the captured path, NOT the pipeline's status: `ls ... | head -1` exits 0 on no match,
#     which would short-circuit an `||` chain and silently skip the install.
PW_EXEC=$(ls -d /opt/pw-browsers/chromium* /root/.cache/ms-playwright/chromium* 2>/dev/null | head -1)
if [ -n "$PW_EXEC" ]; then
  echo "chromium: preinstalled at $PW_EXEC (pass as executablePath)"
else
  npx --yes playwright install --with-deps chromium \
    || echo "no chromium. Dynamic walkthrough disabled (static review only)"
fi
```

Notes:
- **The setup script does not re-run every session, so the skills it clones go stale.** Per
  <https://code.claude.com/docs/en/cloud-environments>, the script runs on the **first** session in an
  environment. Anthropic then snapshots the filesystem and reuses that snapshot, skipping the script.
  It re-runs only when you change the environment's setup script or its allowed network hosts, or when
  the cache expires after **roughly seven days**. So step (a)'s `git clone` of `ptrandev/claude-skills`
  can be up to a week behind master. **After pushing a skill change the next run must have, edit the
  environment's setup script to invalidate the snapshot.** Bumping a trailing comment is enough.
- **`gh` cannot reach the API here, and that is not fixable from GitHub's side. Do not chase it.**
  Verified 2026-08-14: every repo call 403s with *"an org admin must connect the Claude GitHub App
  for this organization"*, and all GraphQL is blocked. **That message is misleading.** The same day,
  against `Atllas-Inc`: the `claude` app (id 1236702) **is** installed org-wide, `repository_selection=all`,
  with `pull_requests: write`; the org has **no** IP allow list and **no** SAML blocking; and the
  maintainer's own token reads both repos and runs GraphQL fine. The org is configured correctly.
  The sandbox's `gh` credential is simply a different credential, provisioned for **git** rather
  than for the API. That is why the clone works and the evidence-ref push works while `gh api`
  does not. No install, no `GH_TOKEN`, no org change, and no per-routine toggle alters it.
  **`mcp` is the supported cloud path**, and it served discovery and thread reads fine. Under it,
  Phase 8 needs `pull_request_review_write` and Phase 5b needs `resolve_review_thread`.
  **Probe a repo read** (`gh api repos/$OWNER/$NAME`). **Never probe with `gh auth status` or
  `gh api user`**: both pass while every repo call 403s.
- **MCP costs one verification.** `evidence-hosting.md`'s `body_html` read-back needs the
  `application/vnd.github.full+json` media type, which MCP does not expose. Under `GH_TRANSPORT=mcp`
  the "images survived" check cannot run. Say so in the report rather than implying it passed.
- **A preinstalled Chromium that mismatches the repo's Playwright pin still drives the walkthrough.**
  It needs an explicit `executablePath` (`ui-walkthrough/SKILL.md` Phase 0, *Cloud browser build*).
  Only a total absence of Chromium sets `CAN_LIVE_HEADLESS=false`.
- **No credentials to provision for the walkthrough.** Step (a) clones the **public** skills repo, so
  any gitignored credential file is absent here by construction, and nothing needs it: the Tier-3
  walkthrough logs in as a seeded e2e persona ([SKILL.md](SKILL.md) Phase 6).
- **Both external reviewers run here, and neither needs a gstack skill.** Step (a) cannot install
  the `codex` skill, which ships with gstack. Tier 2b does not need it: §3 installs and authenticates
  both CLIs, §8 owns the sandbox invocation contract, and Phase 4 runs the CLIs directly
  ([SKILL.md](SKILL.md) Phase 4). A failed `codex login` trips the `WARN` in §3, and the run then
  reports fewer reviewers and caps the verdict at `COMMENT`.
- `codex` / `gemini` also need their CLIs + auth in the sandbox to actually run (set keys via
  **Environment variables**); without them the skill degrades to fewer reviewers, says so, and caps
  the verdict at `COMMENT`.
- The `codex`/`gemini` review CLIs and any non-default registries must be reachable. If a host is
  outside the Trusted allowlist, add it under **Network access -> Custom**.
- `--frozen-lockfile` is a Yarn 1 flag; codebase is **Berry -> `--immutable`**.

## 4. The prompt

The docs stress a **self-contained** prompt. Invoke the skill and state the guardrails:

```
Use maximum reasoning effort and rigor throughout — treat this as a high-stakes review.

Run the /review-pr skill and POST the review to GitHub autonomously (inline comments + verdict).
REQUEST_CHANGES only on a verified HIGH, APPROVE only on a clean fully-verified pass, else COMMENT.
NEVER post an unverified finding: route those to the report instead.

Review every OPEN, READY-FOR-REVIEW PR on Atllas-Inc/codebase and Atllas-Inc/aicc-queues where I am
the requested reviewer (and NOT the author). NEVER review a GitHub draft PR (isDraft) — exclude
drafts entirely at discovery and never post to one.

This routine fires five times each weekday, so most runs will find nothing new. Be idempotent: skip
any PR that already carries a review by me at its current head SHA, and exit quickly with a one-line
report when nothing is outstanding.

Follow the skill's TWO-PHASE BATCH MODEL: Pass A — static review ALL PRs in parallel (Phases 3–5,7);
non-UI PRs are complete after static. Pass B — process UI PRs (apps/agents-portal) ONE AT A TIME,
largest UI diff first: pre-build workspace packages (`yarn turbo run build --filter='./packages/*'`)
under Node 20, boot `yarn e2e:stack`, run the headless Playwright walkthrough, merge live findings,
and assemble that PR's full review. Any UI PR not reached in the runtime budget gets its static
review + a NEEDS-DYNAMIC-RUN note — never drop a PR.

Apply Phillip's engineering bar (read phillip Section 1), run the full three-reviewer pass (Claude +
codex + gemini; note any reviewer that fails rather than silently dropping it), and VERIFY every
finding against the checked-out head. End with the aggregate report, an explicit "needs your eyes"
list, a line stating which reviewers actually ran, and a line stating which PRs got a dynamic
walkthrough vs static-only.
```

This block mirrors the prompt deployed on `trig_01DTU43x2w86zkJzwqLDZj1t`. **The routine is the
source of truth. Re-read it with `RemoteTrigger` `get` before trusting this copy.**

Keep it pointed at the skill so cloud and local stay identical. **The live prompt posts.** Add
`--draft` to opt back down to assemble-and-report-only whenever §6 needs re-validating.

## 5. Triggers

**Schedule only.** `9 2,12,16,20,23 * * 1-5` (UTC), five runs each weekday. The slots are fitted to
measured demand, not to anyone's working hours. Re-fit them with §5a when the team or its rhythm
changes.

| UTC | Thailand | Pacific | Eastern | events this slot sweeps |
|---|---|---|---|---|
| 02:09 | 9:21am | 7:21pm | 10:21pm | 5 |
| 12:09 | 7:21pm | 5:21am | 8:21am | 15 |
| 16:09 | 11:21pm | 9:21am | 12:21pm | 13 |
| 20:09 | 3:21am | 1:21pm | 4:21pm | 11 |
| 23:09 | 6:21am | 4:21pm | 7:21pm | 8 |

Each run sweeps the whole queue. Idempotency via the reviews-API `commit_id` is what keeps most runs
cheap: at 2.4 events per weekday they find nothing new and exit.

Five runs per weekday against the **15-run daily account cap** (Max) leaves headroom for `Run now`.

**Push notifications are off** (`notifications.channel.push = false`), because most runs report
nothing to do.

### 5a. Why these five slots (measured 2026-08-27)

Fit against 31 days of real timeline events on both repos: 177 PRs total.

**Exclude `ME`'s own PRs before fitting.** The skill skips self-authored PRs, and `ME` wrote 93 of
the 177. A first fit on all `ReviewRequestedEvent`s naming `ME` used 74 events, 13 of which sat on
`ME`'s own PRs and can never produce a run.

The signal to fit is the **effective start**: `max(ready-for-review, review-requested-of-ME)` on PRs
by other people. That is the first moment the routine could act, since it never touches a draft.
**52 events, 2.4 per weekday.** Dependabot's 11 PRs are excluded; refit including them if the routine
should review dependency bumps.

**Events cluster at end-of-day and peak at 11:00 UTC. Nothing arrives 02:00-08:00 UTC.**

```
UTC 00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23
     3  2  0  0  0  0  0  0  0  1  2  9  3  1  2  8  2  3  0  6  2  1  5  2
```

Scoring is mean hours from effective start to review posted, including the observed \~25 min of
stagger plus run time:

| Schedule | Runs | Mean | p90 | Max |
|---|---|---|---|---|
| `10,16,21` (the original) | 3 | 5.1h | 11.7h | 12.8h |
| `02,13,20` | 3 | 3.0h | 5.2h | 6.8h |
| `02,12,16,20` | 4 | 2.1h | 4.1h | 5.8h |
| **`02,12,16,20,23`** | **5** | **1.7h** | **3.5h** | **4.3h** |

**Re-timing beats adding runs.** An earlier six-run schedule placed by reasoning about who is at
their desk scored 3.0h and lost to a four-run schedule fitted to the data at 2.1h. **Never place
these slots from working hours alone.** People send a PR for review when they finish a task, not
while they work, and the two distributions differ by hours.

The optimum is a broad basin, not a spike: moving any single slot by one hour costs at most 0.4h of
mean wait, and a bootstrap over 200 resamples put the chosen slots within 0.25h of that sample's own
optimum in 85% of draws. Sample caveats: \~50 events is modest, and Friday is quiet (5 events against
24 on Wednesday).

**Re-fit procedure.** Pull `READY_FOR_REVIEW_EVENT` and `REVIEW_REQUESTED_EVENT` through
`gh api graphql` over the last month. Drop PRs authored by `ME`. Take `max(ready, requested-of-ME)`
per PR. Then pick the N hours minimising mean wait to the next slot. Repeat after any change to team
shape or working hours.

### 5b. Timezone and DST

**Cron is stored in UTC and does not track DST.** Thailand has no DST and the US zones shift on the
first Sunday of November (`2026-11-01T06:00Z`). The slots are fitted to UTC demand, so **leave the
cron alone through the transition** and re-fit from fresh data instead. Only re-cut by hand if you
have moved the schedule back to fixed local times.

**The dashboard's Custom-cron summary line is NOT timezone-converted.** For `9 10,16,21 * * 1-5` it
read *"At 10:09 AM, 04:09 PM and 09:09 PM, Monday through Friday"*, which is the cron fields rendered
verbatim as UTC, four hours off local. Note the missing zone suffix: a preset schedule renders
converted **and labelled** (*"Runs weekdays at 6:00 AM EDT"*), a Custom cron renders raw and
unlabelled. **Trust the "Next run" line instead**, which is real local time.

**Verify the timezone from the API, never from the UI.** Compare `cron_expression` against
`next_run_at` in one `RemoteTrigger` `get` response. `next_run_at` is an unambiguous UTC timestamp,
so it settles the reading on its own. Confirmed 2026-08-27: cron `9 10,16,21 * * 1-5` returned
`next_run_at: 2026-08-27T21:09:00Z`, and the earlier `0 10 * * 1-5` fired at `10:10:51Z`. A local
reading of that second one would put it at `14:00Z`.

### 5c. Why not a GitHub event trigger

**Measured 2026-08-27.** A `pull_request` trigger exposes no "which reviewer" filter. The filter
fields are author, title, body, base branch, head branch, labels, is-draft, is-merged. So
`pull_request.review_requested` fires when **anyone** is requested on the repo. Against 2.4 events per
weekday that the routine can actually act on (§5a), most fires would be no-ops, and each one starts a
session that costs a run against the daily cap.

Three `RemoteTrigger` API gaps, if you ever revisit event triggers:

- The API does **not** validate the `events` strings. A typo returns HTTP 200 and creates a trigger
  that never fires.
- `RemoteTrigger` `get` on the routine does **not** list its webhook triggers.
- There is **no** delete action for a webhook trigger. **Delete them at
  <https://claude.ai/code/routines>.**

**An update that omits `notifications` can clear it.** Verified 2026-08-27: a `job_config` update
reset `push` from `true` to `false` with no mention of notifications in the request. **Send
`notifications` in every update, and check the value in the response.**

## 6. First-run validation (before trusting it to post)

`green` only means the session didn't crash. **Open the transcript.** Run the prompt with `--draft`
first and confirm:

0. **`GH_TRANSPORT` is recorded**, and every GitHub call used it. Expect `mcp` here until the
   sandbox stops blocking the API. A run that says `cli` on a blocked sandbox never probed.
1. **Discovery** lists the right PRs (requested-of-me, not authored-by-me).
2. **Setup worked:** `yarn install` / `gradle compile` ran, the skills installed, and `/review-pr`
   was actually invoked (not improvised).
3. **Externals ran** (codex + gemini) or it correctly degraded and said so.
4. **Findings are verified** against the checked-out head, and the printed payload's inline lines
   validate against `pulls/<n>/files` ranges (no 422s).
5. **Idempotency:** a second `--draft` run reproduces the same draft; after a real post, a re-run
   skips ("already reviewed at current head").
6. **Tier-3, on a real UI PR, end to end.** RAM and a Chromium directory are **not** evidence that
   Tier-3 works. Confirm all four, in the transcript:
   - a headless screenshot actually renders (with `executablePath` if the pin mismatches),
   - the stack **boots inside the budget** in `stack-lifecycle.md`. `next build` is the long pole
     and is the least-tested piece of the cloud path.
   - the detached-ref push is accepted (`git push --dry-run` on rung 1, then rung 2),
   - the posted body's images survive the `body_html` read-back (`evidence-hosting.md`).

   If any fails, the skill sets `CAN_LIVE_HEADLESS=false` and falls back to static review.

Drop `--draft` after every check above passes.

**Current state, 2026-08-27: the deployed prompt posts, and checks 3 and 6 were never signed off.**
The live runs are watched instead. To return to validation, add `--draft` to the §4 prompt.

## 7. Limits to know (research preview)

- **1-hour minimum** schedule cadence. Runs start a few minutes late on a consistent stagger: the
  `0 10` slot fired at `10:10:51Z`.
- **Daily run cap, per account, shared across every routine**: Pro 5, Max 15, Team and Enterprise 25
  (<https://claude.com/blog/introducing-routines-in-claude-code>). One-off runs do not count. Past the
  cap, further runs need usage credits enabled at <https://claude.ai/settings/usage>. Read the live
  remaining count at <https://claude.ai/code/routines>. This routine spends **5 of 15** on Max.
- GitHub webhook events carry separate per-routine and per-account **hourly** caps. Those numbers are
  not published.
- Requires a **Pro/Max/Team/Enterprise** plan with **Claude Code on the web** enabled.
- The cloud session is **headless**. It produces screenshots (attached to the PR), not a
  human-watchable live browser or video. For that, run `/review-pr` locally.

## 8. Codex and Gemini CLI invocation

SKILL.md Phase 4 launches both CLIs as concurrent background jobs. The trust-gate, stdin, and auth
items below are headless-only. The Gemini workspace-boundary item binds on **every** run, local
included.

> **Both CLIs refuse with EXIT CODE 0 in this sandbox until their trust gates are bypassed**
> (verified 2026-08-14). Codex: *"Not inside a trusted directory and `--skip-git-repo-check` was not
> specified"*. Gemini: *"not running in a trusted directory"*. The refusal writes an empty output
> file and exits clean, so a run gating on exit status logs two reviewers that never ran, and a
> clean pass feeds `APPROVE`. **Gate on the output contract, never the exit code**
> ([SKILL.md](SKILL.md) Phase 4). The two flags below are mandatory here, not optional hardening.
>
> **`codex exec` also hangs reading stdin as a background job, so redirect it: `< /dev/null`**
> (verified 2026-08-14). It then leaves a **39-byte** output file holding no findings. That is why
> the gate is the findings contract and **not** a non-empty test: 39 bytes passes "non-empty" and
> reads as a reviewer that ran clean.

- **Codex, API-key environments.** When Codex is authed by API key (`OPENAI_API_KEY` /
  `CODEX_API_KEY`, e.g. this routine) rather than ChatGPT-plan OAuth, invoke it as
  `codex exec -s read-only --skip-git-repo-check -c model_reasoning_effort=high < /dev/null` with
  the **diff embedded in the prompt**
  (feed `/tmp/review-pr-$NAME-$PR.diff`). Do **not** use `/codex review` or `codex review` there: it
  requires OAuth (401s on an API key) and it reviews the **working tree**, which is empty in a
  detached read-only worktree. Detect via `gstack-codex-probe` or a present API key; when unsure,
  use `codex exec`.
- **Codex auth.** `codex exec` needs a materialized credential. An API key in the env is **not**
  enough: it 401s until a login writes `~/.codex/auth.json`. Run
  `printenv OPENAI_API_KEY | codex login --with-api-key` once. Bake it into the setup script in §3
  so it isn't re-discovered per run.
- **Gemini, headless.** Invoke it as `gemini --skip-trust`, or it refuses on the trust gate and
  exits 0. Pass the diff **inline in the `-p` prompt**. Gemini's `-p` mode does not read
  file-path arguments and cannot reach paths outside its workspace, so a `/tmp/...` diff file is
  invisible to it, and it has no shell tool in the cloud sandbox. Embed the diff text directly (the
  `/gemini` skill's review mode already does this). **Embed the `RUBRIC.md` text the same way, and
  never send Gemini the rubric's path.** The rubric sits outside its workspace, and the `/gemini`
  skill's `FS_BOUNDARY` prompt orders it to ignore `~/.claude/` on top of that. A path instruction
  no-ops silently, so Gemini reviews against the prompt's summary of the bar only (verified
  2026-08-24, PR #2010). On `RESOURCE_EXHAUSTED` or quota errors it
  degrades to a thinner voice. Say so in the report; the fix is enabling billing on the
  `GEMINI_API_KEY` project (the free tier is rate-capped).
