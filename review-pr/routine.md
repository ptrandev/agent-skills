# review-pr: Routine setup

A Claude Code Routine can run `/review-pr` unattended against fresh cloud checkouts. It posts
reviews but never edits or pushes PR branches. A sufficiently provisioned environment can also run
the headless UI walkthrough.

Claude's [Routine documentation](https://code.claude.com/docs/en/routines) is the source of truth
for current product limits and UI labels.

## Before you start

1. Connect GitHub with `/web-setup`. Install the Claude GitHub App too when using GitHub event
   triggers.
2. Confirm Claude Code on the web and Routines are enabled for the account.
3. Prepare `OPENAI_API_KEY` and `GEMINI_API_KEY` as Routine environment variables. Without
   them, the review uses fewer independent reviewers and cannot approve.

Reviews use your connected GitHub identity. The Routine does not need unrestricted branch-push
permission.

## Create the Routine

Open **claude.ai/code/routines**, choose **New routine**, and configure:

1. **Name and prompt:** use `review-pr` and the prompt below.
2. **Repositories:** add `Atllas-Inc/codebase` and `Atllas-Inc/aicc-queues`.
3. **Environment:** use the default Trusted network, add both API keys, and paste the setup script.
4. **Connectors:** keep the GitHub connector used for review posting. Remove unrelated connectors.
5. **Permissions:** leave unrestricted branch pushes disabled.
6. **Trigger:** use the schedule below.
7. Create the Routine, then select **Run now** for a draft validation.

## Setup script

The setup script installs the skills, the shared reference files, reviewer CLIs, project
toolchains, and a headless browser. It logs to `/var/log/review-pr-setup.log`.

The `shared` copy is mandatory. `SKILL.md` reads the transport contract at
`../shared/github-transport.md`, which resolves next to the installed skill.

```bash
exec > >(tee -a /var/log/review-pr-setup.log) 2>&1

rm -rf /tmp/agent-skills
git clone --depth 1 https://github.com/ptrandev/agent-skills.git /tmp/agent-skills
mkdir -p "$HOME/.claude/skills"
for item in review-pr phillip phillip-sync gemini full-send ui-walkthrough shared; do
  if [ -d "/tmp/agent-skills/$item" ]; then
    rm -rf "$HOME/.claude/skills/$item"
    cp -R "/tmp/agent-skills/$item" "$HOME/.claude/skills/$item"
  else
    echo "WARN: '$item' is unavailable"
  fi
done

if [ ! -x /usr/bin/node ]; then
  { curl -fsSL https://deb.nodesource.com/setup_24.x | bash - &&
    apt-get install -y nodejs; } ||
    echo "WARN: Node 24 install failed; dynamic walkthrough unavailable"
fi

for shadow in /opt/node22/bin /opt/node20/bin /usr/local/bin; do
  for binary in node npm npx; do
    if [ -e "$shadow/$binary" ] && [ "$shadow/$binary" != "/usr/bin/$binary" ]; then
      ln -sfn "/usr/bin/$binary" "$shadow/$binary" ||
        echo "WARN: could not repoint $shadow/$binary"
    fi
  done
done
echo 'export PATH=/usr/bin:$PATH' > /etc/profile.d/node24.sh ||
  echo "WARN: profile.d is not writable"

NODE_ABI="$(node -p 'process.versions.modules' 2>/dev/null || true)"
if [ "$NODE_ABI" = "137" ]; then
  echo "node OK: $(command -v node) $(node -v), ABI $NODE_ABI"
else
  echo "FATAL: expected Node 24 ABI 137; dynamic walkthrough unavailable"
fi

CODEBASE_DIR="${CODEBASE_DIR:-./codebase}"
AICC_DIR="${AICC_DIR:-./aicc-queues}"

if [ -f "$CODEBASE_DIR/package.json" ]; then
  ( cd "$CODEBASE_DIR" && corepack enable && yarn install --immutable ) ||
    echo "WARN: codebase install failed; review degrades to diff-only"
  ( cd "$CODEBASE_DIR" && yarn rebuild re2 ) ||
    echo "WARN: re2 rebuild failed"
  ( cd "$CODEBASE_DIR" && node -e "require('re2')" ) ||
    echo "WARN: re2 cannot load; dynamic walkthrough unavailable"
  if [ "$NODE_ABI" = "137" ]; then
    ( cd "$CODEBASE_DIR" && yarn turbo run build --filter='./packages/*' ) ||
      echo "WARN: workspace pre-build failed; dynamic walkthrough unavailable"
  fi
fi

if [ -f "$AICC_DIR/build.gradle" ]; then
  ( cd "$AICC_DIR" && ./gradlew --no-daemon compileJava ) ||
    echo "WARN: aicc-queues compile failed; review degrades to diff-only"
fi

if ! command -v gh >/dev/null; then
  { ( type -p curl >/dev/null || apt-get install -y curl ) &&
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg &&
    echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list &&
    apt-get update && apt-get install -y gh; } ||
    echo "WARN: gh install failed"
fi
gh --version || echo "WARN: gh unavailable; GitHub operations require MCP"

npm install -g @openai/codex @google/gemini-cli ||
  echo "WARN: reviewer CLI install failed"
if [ -n "$OPENAI_API_KEY" ]; then
  printenv OPENAI_API_KEY | codex login --with-api-key ||
    echo "WARN: Codex authentication failed"
else
  echo "WARN: OPENAI_API_KEY is unset"
fi
codex --version || echo "WARN: Codex unavailable"
gemini --version || echo "WARN: Gemini unavailable"

CHROMIUM_DIR="$(ls -d /opt/pw-browsers/chromium* /root/.cache/ms-playwright/chromium* 2>/dev/null |
  head -1)"
if [ -n "$CHROMIUM_DIR" ]; then
  echo "chromium: $CHROMIUM_DIR"
else
  npx --yes playwright install --with-deps chromium ||
    echo "WARN: Chromium unavailable; dynamic walkthrough disabled"
fi
```

The runner stops on an unhandled non-zero command. Keep optional steps guarded when changing the
script. The two repository paths must match the directories created by the Routine.

The environment caches setup for several days. Change a harmless setup-script comment when a newly
published skill revision must be loaded immediately.

## Prompt

```text
Use maximum reasoning effort and run /review-pr autonomously.

Review every open, ready, non-draft PR in Atllas-Inc/codebase and Atllas-Inc/aicc-queues where I am
the requested reviewer and not the author. Post inline findings and the skill's verdict to GitHub.
Apply the skill's state labels and bot-thread rules.

Skip a PR already reviewed by me at its current head. Review all PRs statically in parallel, then
walk UI PRs one at a time. Post static reviews with a NEEDS-DYNAMIC-RUN note when the runtime budget
cannot reach a walkthrough.

Finish with the aggregate report, the reviewers that ran, the PRs walked dynamically, and an
explicit "needs your eyes" list.
```

Add `--draft` while validating. Remove it only after the checks below pass.

## Schedule

Use this UTC cron expression:

```text
9 2,12,16,20,23 * * 1-5
```

It runs five times each weekday and leaves room under a 15-run daily account limit for manual runs.
The slots were fitted to recent review-request traffic. Refit them when the team or its working
pattern changes.

Custom cron expressions remain in UTC through daylight-saving changes. Verify the dashboard's
**Next run** timestamp rather than its unlabeled summary. Disable push notifications because most
runs have nothing to review.

A GitHub event trigger cannot filter by requested reviewer, so it spends runs on unrelated review
requests. Prefer the queue-wide schedule.

## Validate before posting

Run the prompt with `--draft`, then inspect the transcript:

1. Confirm discovery includes only ready PRs requested of you and excludes your own PRs.
2. Confirm the report names `GH_TRANSPORT`. In the cloud environment, expect MCP when repository
   API calls through `gh` return 403.
3. Confirm Codex and Gemini ran or the verdict correctly degraded.
4. Confirm each finding was verified against the checked-out head and each inline line is in a diff
   hunk.
5. Run the draft twice and confirm the result is idempotent.
6. On a UI PR, confirm the stack boots, Chromium renders a screenshot, and evidence publishing
   succeeds.

Remove `--draft` only after every applicable check passes.

## Troubleshooting

| Symptom | Check |
|---|---|
| Setup or a capability silently degrades | Read `/var/log/review-pr-setup.log`. Setup output is not included in the run transcript. |
| Old skill behavior appears | Invalidate the cached environment by changing the setup script. |
| `gh api repos/<owner>/<repo>` returns 403 | Use the GitHub MCP transport. A successful `gh auth status` does not prove repository API access. |
| Fewer reviewers run | Check both API-key environment variables, CLI versions, and the Codex login line in the setup log. |
| UI walkthrough is skipped | Check for Node ABI 137, a Chromium path, successful workspace builds, and a healthy e2e stack. |
| Screenshot HTML cannot be verified | MCP does not expose the media type needed for the `body_html` read-back. Report that the check was unavailable. |

The exact headless Codex and Gemini invocation contract lives in
[`SKILL.md`](SKILL.md). Keep trust-gate flags, workspace boundaries, diff delivery, and output
validation there rather than duplicating them in this setup guide.

## Current limits

- Scheduled runs have a one-hour minimum cadence and can start a few minutes late.
- Account and webhook run limits depend on the current Claude plan.
- The cloud session can capture screenshots but cannot provide a live browser or local video.
- A UI PR that cannot complete the dynamic pass still receives its static review and a
  `NEEDS-DYNAMIC-RUN` note.
