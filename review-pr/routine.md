# review-pr — Routine (cloud) setup

The primary way to run `/review-pr` unattended. A Claude Code **Routine** runs in a managed cloud
sandbox (Ubuntu, ~16 GB RAM / 30 GB disk / 4 vCPU) that **clones your repos and runs a setup step**,
so it has the real code + toolchain to verify findings, and enough memory to run the **Tier-3
dynamic walkthrough** headlessly. No machine on, no open session.

> Source of truth: <https://code.claude.com/docs/en/routines> (research preview — labels/limits may
> change). Configure at **claude.ai/code/routines**, the Desktop app (**Routines → New routine →
> Remote**), or `/schedule` in the CLI.

## How it differs from babysit-prs' Routine

- **No "unrestricted branch pushes" toggle needed.** `/review-pr` checks out PR branches **read-only**
  and never commits/pushes — it only POSTs reviews. It still needs GitHub **write** scope (the
  connected identity provides it) to submit reviews + inline comments.
- **It calls other skills**, so the setup script must install them into the sandbox: `phillip`
  (the rubric it reads), `phillip-sync`, `codex`, `gemini`.
- **It can run Tier-3 headlessly** (16 GB is enough for the stack) — install Playwright in setup.

## 1. Connect GitHub (no PAT)

Use the connected GitHub identity, not a pasted token. Either `/web-setup` (grants cloning) or the
**Claude GitHub App** (also needed if you add a GitHub event trigger). Reviews are attributed to
**your** GitHub user.

## 2. Create the routine (web form)

At **claude.ai/code/routines → New routine**:

1. **Name + prompt** — name `review-pr`; prompt in §4. Pick your model in the selector.
2. **Select repositories** — `Atllas-Inc/codebase` and `Atllas-Inc/aicc-queues` (cloned fresh from
   the default branch each run).
3. **Select an environment** — see §3.
4. **Select a trigger** — see §5.
5. **Connectors / Permissions tabs** — strip connectors this routine doesn't need. **No branch-push
   toggle required** (read-only checkout).
6. **Create**, then **Run now** for the validation pass (§6).

## 3. Environment + setup script

Default **Trusted** network is fine (github.com + package registries reachable). Setup script (runs
once, cached). **The two repos differ — codebase is Yarn 3 Berry, aicc-queues is Gradle/JVM:**

```bash
# (a) install the skills this one reads/calls (public repo, no auth).
git clone --depth 1 https://github.com/ptrandev/claude-skills.git /tmp/claude-skills
mkdir -p "$HOME/.claude/skills"
for s in review-pr phillip phillip-sync codex gemini full-send; do
  cp -R "/tmp/claude-skills/$s" "$HOME/.claude/skills/$s"
done

# (b) toolchains for Tier-2 verification.
CODEBASE_DIR="${CODEBASE_DIR:-./codebase}"
AICC_DIR="${AICC_DIR:-./aicc-queues}"
if [ -f "$CODEBASE_DIR/package.json" ]; then
  ( cd "$CODEBASE_DIR" && corepack enable && yarn install --immutable ) \
    || echo "codebase: yarn install failed — verify degrades to diff-only (no posting)"
fi
if [ -f "$AICC_DIR/build.gradle" ]; then
  ( cd "$AICC_DIR" && ./gradlew --no-daemon compileJava ) \
    || echo "aicc-queues: gradle compile failed — verify degrades to diff-only"
fi

# (c) headless browser for the Tier-3 dynamic walkthrough (trial-verify on first run).
npx --yes playwright install --with-deps chromium \
  || echo "playwright install failed — dynamic walkthrough disabled (static review only)"
```

Notes:
- `codex` / `gemini` also need their CLIs + auth in the sandbox to actually run (set keys via
  **Environment variables**); without them the skill degrades to fewer reviewers and says so.
- The `codex`/`gemini` review CLIs and any non-default registries must be reachable — if a host is
  outside the Trusted allowlist, add it under **Network access → Custom**.
- `--frozen-lockfile` is a Yarn 1 flag; codebase is **Berry → `--immutable`**.

## 4. The prompt

The docs stress a **self-contained** prompt. Invoke the skill and state the guardrails:

```
Run the /review-pr skill. Review every open PR on Atllas-Inc/codebase and Atllas-Inc/aicc-queues
where I am the requested reviewer (and not the author). Apply Phillip's engineering bar: read
phillip Section 1, run the three-reviewer pass, and VERIFY every finding against the checked-out
head before it can post. Post the review autonomously (inline comments + verdict) — REQUEST_CHANGES
only on a verified HIGH, APPROVE only on a clean fully-verified pass, else COMMENT. NEVER post an
unverified finding (route those to the report). The session starts on the default branch, so
`gh pr checkout <PR>` onto each PR head first. Be idempotent: skip PRs already reviewed at the
current head SHA. For UI PRs, run the Tier-3 headless walkthrough (externally stubbed — no real
external calls). End with the report and a "needs your eyes" list.
```

Keep it pointed at the skill so cloud and local stay identical. (For the first cycle or two, append
`--draft` so it assembles and reports **without** posting while you validate — see §6.)

## 5. Triggers

- **Schedule (primary):** **Hourly** (the minimum). `/schedule update` in the CLI for an off-minute
  cron like `23 * * * *`. The hourly sweep is the workhorse — idempotent via the reviews-API
  `commit_id`.
- **GitHub event (optional):** a `pull_request` trigger fires on PR updates, but its filters don't
  expose "which reviewer," and there's **no review-requested filter** — so it can't reliably mean
  "I was just added." The skill self-filters every run regardless; treat the event trigger as a
  best-effort accelerator and rely on the schedule. *(Whether `pull_request` exposes the
  `review_requested` action is research-preview-dependent — confirm in the UI.)*

## 6. First-run validation (before trusting it to post)

`green` only means the session didn't crash — **open the transcript**. Run the prompt with `--draft`
first and confirm:

1. **Discovery** lists the right PRs (requested-of-me, not authored-by-me).
2. **Setup worked:** `yarn install` / `gradle compile` ran, the skills installed, and `/review-pr`
   was actually invoked (not improvised).
3. **Externals ran** (codex + gemini) or it correctly degraded and said so.
4. **Findings are verified** against the checked-out head, and the printed payload's inline lines
   validate against `pulls/<n>/files` ranges (no 422s).
5. **Idempotency:** a second `--draft` run reproduces the same draft; after a real post, a re-run
   skips ("already reviewed at current head").
6. **Tier-3:** on a UI PR, confirm `npx playwright install` + a headless screenshot actually succeed
   in the sandbox. If not, the skill sets `CAN_LIVE_HEADLESS=false` and falls back to static review.

Drop `--draft` once the drafts look right.

## 7. Limits to know (research preview)

- **1-hour minimum** schedule cadence; per-account daily routine-run cap; runs may start a few
  minutes late (consistent stagger).
- Requires a **Pro/Max/Team/Enterprise** plan with **Claude Code on the web** enabled.
- The cloud session is **headless** — it produces screenshots (attached to the PR), not a
  human-watchable live browser or video. For that, run `/review-pr` locally.
