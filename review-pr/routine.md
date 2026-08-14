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
# Codex needs a materialized credential; an API key in the env alone 401s. See section 8.
if [ -n "$OPENAI_API_KEY" ]; then
  printenv OPENAI_API_KEY | codex login --with-api-key || echo "WARN: codex login failed"
else
  echo "WARN: OPENAI_API_KEY unset at setup time. Codex will refuse at run time."
fi
# Assert the credential FILE, not the exit code: both CLIs refuse with exit 0 (section 8).
[ -f "$HOME/.codex/auth.json" ] || echo "WARN: ~/.codex/auth.json absent. Codex will refuse."
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

Keep it pointed at the skill so cloud and local stay identical. Append `--draft` until the §6
checks pass, so it assembles and reports **without** posting.

## 5. Triggers

- **Schedule (primary):** **Hourly** (the minimum). `/schedule update` in the CLI for an off-minute
  cron like `23 * * * *`. The hourly sweep is idempotent via the reviews-API `commit_id`.
- **GitHub event (optional):** a `pull_request` trigger fires on PR updates, but its filters don't
  expose "which reviewer," and there's **no review-requested filter**, so it can't reliably mean
  "I was just added." The skill self-filters every run regardless; treat the event trigger as an
  accelerator and rely on the schedule. *(Whether `pull_request` exposes the
  `review_requested` action is research-preview-dependent. Confirm in the UI.)*

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

## 7. Limits to know (research preview)

- **1-hour minimum** schedule cadence; per-account daily routine-run cap; runs may start a few
  minutes late (consistent stagger).
- Requires a **Pro/Max/Team/Enterprise** plan with **Claude Code on the web** enabled.
- The cloud session is **headless**. It produces screenshots (attached to the PR), not a
  human-watchable live browser or video. For that, run `/review-pr` locally.

## 8. Codex and Gemini in the sandbox

SKILL.md Phase 4 launches both CLIs as concurrent background jobs. Their headless invocation differs
from a local, OAuth-authed run:

> **Both CLIs refuse with EXIT CODE 0 in this sandbox until their trust gates are bypassed**
> (verified 2026-08-14). Codex: *"Not inside a trusted directory and `--skip-git-repo-check` was not
> specified"*. Gemini: *"not running in a trusted directory"*. The refusal writes an empty output
> file and exits clean, so a run gating on exit status logs two reviewers that never ran, and a
> clean pass feeds `APPROVE`. **Gate on the output contract, never the exit code**
> ([SKILL.md](SKILL.md) Phase 4). The two flags below are mandatory here, not optional hardening.

- **Codex, API-key environments.** When Codex is authed by API key (`OPENAI_API_KEY` /
  `CODEX_API_KEY`, e.g. this routine) rather than ChatGPT-plan OAuth, invoke it as
  `codex exec -s read-only --skip-git-repo-check -c model_reasoning_effort=high` with the **diff
  embedded in the prompt**
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
  `/gemini` skill's review mode already does this). On `RESOURCE_EXHAUSTED` or quota errors it
  degrades to a thinner voice. Say so in the report; the fix is enabling billing on the
  `GEMINI_API_KEY` project (the free tier is rate-capped).
