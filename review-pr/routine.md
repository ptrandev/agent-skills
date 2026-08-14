# review-pr: Routine (cloud) setup

The primary way to run `/review-pr` unattended. A Claude Code **Routine** runs in a managed cloud
sandbox (Ubuntu, ~16 GB RAM / 30 GB disk / 4 vCPU) that **clones your repos and runs a setup step**,
so it has the real code + toolchain to verify findings, and enough memory to run the **Tier-3
dynamic walkthrough** headlessly. No machine on, no open session.

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
  Chromium; the image ships neither reliably. See §3.

## 1. Connect GitHub (no PAT)

Use the connected GitHub identity, not a pasted token. Either `/web-setup` (grants cloning) or the
**Claude GitHub App** (also needed if you add a GitHub event trigger). Reviews are attributed to
**your** GitHub user.

## 2. Create the routine (web form)

At **claude.ai/code/routines -> New routine**:

1. **Name + prompt.** Name `review-pr`; prompt in §4. Pick your model in the selector.
2. **Select repositories.** `Atllas-Inc/codebase` and `Atllas-Inc/aicc-queues` (cloned fresh from
   the default branch each run).
3. **Select an environment.** See §3.
4. **Select a trigger.** See §5.
5. **Connectors / Permissions tabs.** Strip connectors this routine doesn't need. **No branch-push
   toggle required** (read-only checkout).
6. **Create**, then **Run now** for the validation pass (§6).

## 3. Environment + setup script

Default **Trusted** network is fine (github.com + package registries reachable). Setup script (runs
once, cached). **The two repos differ: codebase is Yarn 3 Berry, aicc-queues is Gradle/JVM.**

```bash
# (a) install the skills this one reads/calls (public repo, no auth).
git clone --depth 1 https://github.com/ptrandev/claude-skills.git /tmp/claude-skills
mkdir -p "$HOME/.claude/skills"
for s in review-pr phillip phillip-sync codex gemini full-send ui-walkthrough; do
  cp -R "/tmp/claude-skills/$s" "$HOME/.claude/skills/$s"
done

# (b) toolchains for Tier-2 verification.
CODEBASE_DIR="${CODEBASE_DIR:-./codebase}"
AICC_DIR="${AICC_DIR:-./aicc-queues}"
if [ -f "$CODEBASE_DIR/package.json" ]; then
  ( cd "$CODEBASE_DIR" && corepack enable && yarn install --immutable ) \
    || echo "codebase: yarn install failed. Verify degrades to diff-only (no posting)"
fi
if [ -f "$AICC_DIR/build.gradle" ]; then
  ( cd "$AICC_DIR" && ./gradlew --no-daemon compileJava ) \
    || echo "aicc-queues: gradle compile failed. Verify degrades to diff-only"
fi

# (c) `gh`. The skill and /ui-walkthrough drive GitHub through `gh` in ~30 places, with no
#     fallback. The sandbox image does not ship it. Without this the routine cannot discover,
#     check out, or post anything.
command -v gh >/dev/null || {
  ( type -p curl >/dev/null || apt-get install -y curl ) \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
       -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
       > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && apt-get install -y gh
}
gh --version || echo "FATAL: gh missing. Discovery and posting will both fail."

# (d) headless browser for the Tier-3 dynamic walkthrough (trial-verify on first run).
#     Prefer the image's preinstalled browsers; `playwright install` is often forbidden here.
ls -d /opt/pw-browsers/chromium* /root/.cache/ms-playwright/chromium* 2>/dev/null | head -1 \
  || npx --yes playwright install --with-deps chromium \
  || echo "no chromium. Dynamic walkthrough disabled (static review only)"
```

Notes:
- **`gh` is a hard dependency, not a Tier-3 nicety.** Confirm `gh --version` and `gh auth status` in
  the first-run transcript. Both skills hard-exit on an unauthenticated `gh`
  ([SKILL.md](SKILL.md) Phase 1, `ui-walkthrough/SKILL.md` Phase 0), so installing the binary is
  only half the job. The connected GitHub identity authorizes **git** (cloning, pushing the
  evidence ref); it does not necessarily populate `gh`'s own credential. If `gh auth status` fails
  after install, set `GH_TOKEN` under **Environment variables** to a token with `repo` scope.
  A GitHub MCP server is not a substitute: `evidence-hosting.md`'s
  `body_html` read-back needs the `application/vnd.github.full+json` media type, which MCP does not
  expose, and MCP connections have been observed dropping mid-session.
- **A preinstalled Chromium that mismatches the repo's Playwright pin still drives the walkthrough.**
  It needs an explicit `executablePath`; see `ui-walkthrough/SKILL.md` Phase 0, *Cloud browser
  build*. Only a total absence of Chromium sets `CAN_LIVE_HEADLESS=false`.
- **No credentials to provision for the walkthrough.** Step (a) clones the **public** skills repo, so
  any gitignored credential file is absent here by construction, and nothing needs it: the Tier-3
  walkthrough logs in as a seeded e2e persona. Details in SKILL.md Phase 6.
- `codex` / `gemini` also need their CLIs + auth in the sandbox to actually run (set keys via
  **Environment variables**); without them the skill degrades to fewer reviewers, says so, and caps
  the verdict at `COMMENT`.
- The `codex`/`gemini` review CLIs and any non-default registries must be reachable. If a host is
  outside the Trusted allowlist, add it under **Network access -> Custom**.
- `--frozen-lockfile` is a Yarn 1 flag; codebase is **Berry -> `--immutable`**.

## 4. The prompt

The docs stress a **self-contained** prompt. Invoke the skill and state the guardrails:

```
Run the /review-pr skill. Review every open PR on Atllas-Inc/codebase and Atllas-Inc/aicc-queues
where I am the requested reviewer (and not the author). Apply Phillip's engineering bar: read
~/.claude/skills/phillip/RUBRIC.md, run the three-reviewer pass, and VERIFY every finding against
the checked-out head before it can post. Post the review autonomously (inline comments + verdict).
REQUEST_CHANGES only on a verified HIGH, APPROVE only on a clean fully-verified pass, else COMMENT.
NEVER post an unverified finding (route those to the report). The session starts on the default
branch, so `gh pr checkout <PR>` onto each PR head first. Be idempotent: skip PRs already reviewed
at the current head SHA. For UI PRs, run the Tier-3 headless walkthrough (externally stubbed, no
real external calls). End with the report and a "needs your eyes" list.
```

Keep it pointed at the skill so cloud and local stay identical. (For the first cycle or two, append
`--draft` so it assembles and reports **without** posting while you validate. See §6.)

## 5. Triggers

- **Schedule (primary):** **Hourly** (the minimum). `/schedule update` in the CLI for an off-minute
  cron like `23 * * * *`. The hourly sweep is the workhorse, idempotent via the reviews-API
  `commit_id`.
- **GitHub event (optional):** a `pull_request` trigger fires on PR updates, but its filters don't
  expose "which reviewer," and there's **no review-requested filter**, so it can't reliably mean
  "I was just added." The skill self-filters every run regardless; treat the event trigger as a
  best-effort accelerator and rely on the schedule. *(Whether `pull_request` exposes the
  `review_requested` action is research-preview-dependent. Confirm in the UI.)*

## 6. First-run validation (before trusting it to post)

`green` only means the session didn't crash. **Open the transcript.** Run the prompt with `--draft`
first and confirm:

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

Drop `--draft` once the drafts look right.

## 7. Limits to know (research preview)

- **1-hour minimum** schedule cadence; per-account daily routine-run cap; runs may start a few
  minutes late (consistent stagger).
- Requires a **Pro/Max/Team/Enterprise** plan with **Claude Code on the web** enabled.
- The cloud session is **headless**. It produces screenshots (attached to the PR), not a
  human-watchable live browser or video. For that, run `/review-pr` locally.

## 8. Codex and Gemini in the sandbox

SKILL.md Phase 4 launches both CLIs as concurrent background jobs. Their headless invocation differs
from a local, OAuth-authed run:

- **Codex, API-key environments.** When Codex is authed by API key (`OPENAI_API_KEY` /
  `CODEX_API_KEY`, e.g. this routine) rather than ChatGPT-plan OAuth, invoke it as
  `codex exec -s read-only -c model_reasoning_effort=high` with the **diff embedded in the prompt**
  (feed `/tmp/review-pr-$NAME-$PR.diff`). Do **not** use `/codex review` or `codex review` there: it
  requires OAuth (401s on an API key) and it reviews the **working tree**, which is empty in a
  detached read-only worktree. Detect via `gstack-codex-probe` or a present API key; when unsure,
  use `codex exec`.
- **Codex auth.** `codex exec` needs a materialized credential. An API key in the env is **not**
  enough: it 401s until a login writes `~/.codex/auth.json`. Run
  `printenv OPENAI_API_KEY | codex login --with-api-key` once. Bake it into the setup script in §3
  so it isn't re-discovered per run.
- **Gemini, headless.** Pass the diff **inline in the `-p` prompt**. Gemini's `-p` mode does not read
  file-path arguments and cannot reach paths outside its workspace, so a `/tmp/...` diff file is
  invisible to it, and it has no shell tool in the cloud sandbox. Embed the diff text directly (the
  `/gemini` skill's review mode already does this). On `RESOURCE_EXHAUSTED` or quota errors it
  degrades to a thinner voice. Say so in the report; the fix is enabling billing on the
  `GEMINI_API_KEY` project (the free tier is rate-capped).
