# babysit-prs: Routine setup

A Claude Code Routine can sweep review threads on a schedule, make safe fixes, and verify them in a
fresh cloud checkout. It cannot capture local screenshots or video, so it leaves threads requiring
visual proof open.

Claude's [Routine documentation](https://code.claude.com/docs/en/routines) is the source of truth
for current product limits and UI labels.

## Before you start

1. Connect GitHub with `/web-setup`. Install the Claude GitHub App too when using GitHub event
   triggers.
2. Confirm Claude Code on the web and Routines are enabled for the account.
3. Plan to enable **Allow unrestricted branch pushes** for every target repository. The skill must
   push fixes to existing PR branches.

Commits and replies use your connected GitHub identity. Git push keeps working in the sandbox even
when the GitHub API does not, so a blocked `gh` never blocks a fix.

**Give this routine its own environment. Do not share the `review-pr` environment.** The two setup
scripts overlap only on the skills clone, `gh`, and the two project toolchains. `review-pr` also
pins Node 24, rebuilds `re2`, pre-builds the workspace, installs Chromium, and installs two
reviewer CLIs with API keys, none of which this skill uses. A shared environment puts those API
keys in reach of this run, and lets one broken edit stop both routines. A shared environment
does share its cache, which is the one argument for merging them. It does not outweigh the blast
radius, because this routine is the one that pushes commits.

## Create the Routine

Open **claude.ai/code/routines**, choose **New routine**, and configure:

1. **Name and prompt:** use `babysit-prs` and the prompt below.
2. **Repositories:** add `Atllas-Inc/codebase` and `Atllas-Inc/aicc-queues`.
3. **Environment:** use the default Trusted network and the setup script below.
4. **Permissions:** enable unrestricted branch pushes for both repositories.
5. **Connectors:** keep the GitHub connector attached. It supplies the MCP transport, which the
   run needs when `gh` cannot reach the repository API. Remove unrelated connectors.
6. **Trigger:** choose one of the options below.
7. Create the Routine, then select **Run now** for validation.

## Setup script

The script installs the skill, the shared reference files, `gh`, and both project toolchains. It
logs to `/var/log/babysit-prs-setup.log`, because setup output never reaches the run transcript.

```bash
exec > >(tee -a /var/log/babysit-prs-setup.log) 2>&1

rm -rf /tmp/agent-skills
git clone --depth 1 https://github.com/ptrandev/agent-skills.git /tmp/agent-skills
mkdir -p "$HOME/.claude/skills"
for item in babysit-prs shared; do
  if [ -d "/tmp/agent-skills/$item" ]; then
    rm -rf "$HOME/.claude/skills/$item"
    cp -R "/tmp/agent-skills/$item" "$HOME/.claude/skills/$item"
  else
    echo "WARN: '$item' is unavailable"
  fi
done

if ! command -v gh >/dev/null; then
  { ( type -p curl >/dev/null || apt-get install -y curl ) &&
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg &&
    echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list &&
    apt-get update && apt-get install -y gh; } ||
    echo "WARN: gh install failed; the run needs the GitHub MCP transport"
fi
gh --version || echo "WARN: gh unavailable; the run needs the GitHub MCP transport"

CODEBASE_DIR="${CODEBASE_DIR:-./codebase}"
AICC_DIR="${AICC_DIR:-./aicc-queues}"

if [ -f "$CODEBASE_DIR/package.json" ]; then
  ( cd "$CODEBASE_DIR" && corepack enable && yarn install --immutable ) ||
    echo "WARN: codebase install failed; fixes degrade to triage-only"
else
  echo "WARN: codebase clone not found; fixes degrade to triage-only"
fi

if [ -f "$AICC_DIR/build.gradle" ]; then
  ( cd "$AICC_DIR" && ./gradlew --no-daemon compileJava ) ||
    echo "WARN: aicc-queues compile failed; fixes degrade to triage-only"
else
  echo "WARN: aicc-queues clone not found; fixes degrade to triage-only"
fi
```

The `shared` copy is mandatory. `SKILL.md` reads the transport contract at
`../shared/github-transport.md`, which resolves next to the installed skill.

The runner stops on an unhandled non-zero command. Keep every optional step guarded when you change
the script. Replace the two clone paths when the Routine uses different directories. Add Gradle or
Maven hosts to the Trusted network allowlist when dependency downloads fail.

The environment caches setup for several days, so the first run is slower. Change a harmless
setup-script comment to force a newly published skill revision to load.

## Prompt

```text
Run /babysit-prs across my open PRs on Atllas-Inc/codebase and Atllas-Inc/aicc-queues.

Address unresolved bot and teammate threads. Fix only safe, mechanical, test-covered findings.
Reply to every handled thread. Resolve only threads you fixed and verified green. Leave questions,
judgment calls, and anything needing visual proof open for me.

Each checkout starts on the default branch. Fetch and check out each PR head before editing.
Be idempotent: skip threads whose latest reply is already mine. Finish with the report table and an
explicit "Needs you" list.
```

Keep the prompt pointed at the skill so improvements to [`SKILL.md`](SKILL.md) apply to every run.

## Triggers

| Trigger | Use |
|---|---|
| Schedule | Recommended. See the cron expression below. |
| GitHub event | Optional PR-level nudge. Review-comment and issue-comment events are unavailable. |
| API | Optional POST trigger for another system. |

A label-filtered pull-request event can provide a manual nudge, but the schedule remains the
backstop for review comments.

## Schedule

Every run costs one of the account's daily routine runs, and most runs find nothing, so fit the
slots to real traffic instead of running hourly. Use this UTC cron expression:

```text
17 11,18,23 * * *
```

It runs three times a day, at 07:00, 14:00, and 19:00 Toronto time. The web form offers presets
only, so set a custom expression with `/schedule update` in the CLI.

### What the slots were fitted to

Two different populations arrive on `ptrandev` PRs, and they need different slots.

| Source | Volume | Toronto arrival | Blocks a merge |
|---|---|---|---|
| `gemini-code-assist[bot]` and Copilot | 82 review comments in the 60 days ending 2026-09-04, 1.4 per day | 12:00 to 19:00, and a second block from 20:00 to 01:00 | No |
| Teammates | 11 actionable reviews in the 13 months ending 2026-09-04 | 8 of the 11 fall between 06:00 and 09:00 | Yes, for `CHANGES_REQUESTED` |

Bots comment within minutes of a push, so their arrival tracks your own working hours. Teammate
reviews cluster in the early morning, which is the European afternoon. A schedule fitted to bot
volume alone misses the teammate window completely, and teammate reviews are the ones that hold a
merge.

Measured against both populations:

| Toronto slots | UTC cron | Bot mean wait | Teammate mean wait | Teammate worst |
|---|---|---|---|---|
| 02:00, 15:00, 19:00 | `17 6,19,23 * * *` | 2.4 h | 7.2 h | 11.7 h |
| **07:00, 14:00, 19:00** | **`17 11,18,23 * * *`** | **3.4 h** | **2.4 h** | **6.0 h** |
| 02:00, 07:00, 15:00, 19:00 | `17 6,11,19,23 * * *` | 2.1 h | 2.9 h | 7.0 h |

The chosen row costs one hour of bot latency and saves nearly five hours of teammate latency. Add
the fourth slot when the daily run budget allows it.

**Treat the teammate numbers as a weak fit.** Eleven events over 13 months is too few to be
confident. The 06:00 to 09:00 concentration holds because it reflects one colleague's timezone, not
because the sample is large. Refit after the next quarter of review traffic.

**Run every day, not weekdays only.** Three of the 82 bot comments landed on a weekend. A
weekday-only schedule leaves those waiting up to 35 hours, and saves only 2 runs per week per slot.

Cron expressions stay in UTC through daylight-saving changes, so each local time moves one hour
later from November to March. Refit the slots when the volume or the working pattern changes.

## Setup script

The script installs the skill, the shared reference files, `gh`, and both project toolchains. It
logs to `/var/log/babysit-prs-setup.log`, because setup output never reaches the run transcript.

```bash
exec > >(tee -a /var/log/babysit-prs-setup.log) 2>&1

rm -rf /tmp/agent-skills
git clone --depth 1 https://github.com/ptrandev/agent-skills.git /tmp/agent-skills
mkdir -p "$HOME/.claude/skills"
for item in babysit-prs shared; do
  if [ -d "/tmp/agent-skills/$item" ]; then
    rm -rf "$HOME/.claude/skills/$item"
    cp -R "/tmp/agent-skills/$item" "$HOME/.claude/skills/$item"
  else
    echo "WARN: '$item' is unavailable"
  fi
done

if ! command -v gh >/dev/null; then
  { ( type -p curl >/dev/null || apt-get install -y curl ) &&
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg &&
    echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list &&
    apt-get update && apt-get install -y gh; } ||
    echo "WARN: gh install failed; the run needs the GitHub MCP transport"
fi
gh --version || echo "WARN: gh unavailable; the run needs the GitHub MCP transport"

CODEBASE_DIR="${CODEBASE_DIR:-./codebase}"
AICC_DIR="${AICC_DIR:-./aicc-queues}"

if [ -f "$CODEBASE_DIR/package.json" ]; then
  ( cd "$CODEBASE_DIR" && corepack enable && yarn install --immutable ) ||
    echo "WARN: codebase install failed; fixes degrade to triage-only"
else
  echo "WARN: codebase clone not found; fixes degrade to triage-only"
fi

if [ -f "$AICC_DIR/build.gradle" ]; then
  ( cd "$AICC_DIR" && ./gradlew --no-daemon compileJava ) ||
    echo "WARN: aicc-queues compile failed; fixes degrade to triage-only"
else
  echo "WARN: aicc-queues clone not found; fixes degrade to triage-only"
fi
```

The `shared` copy is mandatory. `SKILL.md` reads the transport contract at
`../shared/github-transport.md`, which resolves next to the installed skill.

The runner stops on an unhandled non-zero command. Keep every optional step guarded when you change
the script. Replace the two clone paths when the Routine uses different directories. Add Gradle or
Maven hosts to the Trusted network allowlist when dependency downloads fail.

The environment caches setup for several days, so the first run is slower. Change a harmless
setup-script comment to force a newly published skill revision to load.

## Prompt

```text
Run /babysit-prs across my open PRs on Atllas-Inc/codebase and Atllas-Inc/aicc-queues.

Address unresolved bot and teammate threads. Fix only safe, mechanical, test-covered findings.
Reply to every handled thread. Resolve only threads you fixed and verified green. Leave questions,
judgment calls, and anything needing visual proof open for me.

Each checkout starts on the default branch. Fetch and check out each PR head before editing.
Be idempotent: skip threads whose latest reply is already mine. Finish with the report table and an
explicit "Needs you" list.
```

Keep the prompt pointed at the skill so improvements to [`SKILL.md`](SKILL.md) apply to every run.

## Triggers

| Trigger | Use |
|---|---|
| Schedule | Recommended. See the cron expression below. |
| GitHub event | Optional PR-level nudge. Review-comment and issue-comment events are unavailable. |
| API | Optional POST trigger for another system. |

A label-filtered pull-request event can provide a manual nudge, but the schedule remains the
backstop for review comments.

## Schedule

Every run costs one of the account's daily routine runs, and most runs find nothing, so fit the
slots to real traffic instead of running hourly. Use this UTC cron expression:

```text
17 6,19,23 * * *
```

It runs three times a day, at 02:00, 15:00, and 19:00 Toronto time. The web form offers presets
only, so set a custom expression with `/schedule update` in the CLI.

The slots were fitted to 82 inbound review comments on `ptrandev` PRs across both repositories over
the 60 days ending 2026-09-04, which is 1.4 per day. 77 of the 82 came from
`gemini-code-assist[bot]`, which comments within minutes of a push, so arrival tracks working hours
rather than a reviewer's schedule. Against that history the three slots give a mean wait of 2.4
hours, a 90th-percentile wait of 4.9 hours, and a worst case of 11.7 hours.

Two alternatives from the same fit:

| Runs per day | UTC cron | Toronto | Mean wait | p90 | Worst |
|---|---|---|---|---|---|
| 2 | `17 6,22 * * *` | 02:00, 18:00 | 4.1 h | 7.4 h | 14.7 h |
| 3 | `17 6,19,23 * * *` | 02:00, 15:00, 19:00 | 2.4 h | 4.9 h | 11.7 h |
| 4 | `17 5,9,19,23 * * *` | 01:00, 05:00, 15:00, 19:00 | 1.9 h | 3.3 h | 6.9 h |

**Run every day, not weekdays only.** Three of the 82 comments landed on a weekend. A weekday-only
schedule leaves those waiting up to 35 hours, and saves only 2 runs per week per slot.

Cron expressions stay in UTC through daylight-saving changes, so each local time moves one hour
later from November to March. Refit the slots when the volume or the working pattern changes.

## Validate before enabling fixes

Open the run transcript. A green status only means the session completed.

1. Read `/var/log/babysit-prs-setup.log`. Confirm the skill, the `shared` directory, `gh`, and both
   project toolchains installed without a `WARN` line.
2. Confirm `/babysit-prs` ran instead of an improvised replacement.
3. Confirm the report names `GH_TRANSPORT` per repo. Expect `mcp` in the cloud, because repository
   API calls through `gh` return 403 there.
4. Confirm the preflight resolved each clone to the cloud checkout, not to a `/Users/...` path.
5. Point the Routine at a PR with a trivial finding.
6. Confirm the fix commit reached the PR branch.
7. Confirm the thread received a reply and was resolved.

Until all seven pass, treat the Routine as triage-only.

## Troubleshooting

| Symptom | Check |
|---|---|
| Setup degrades silently | Read `/var/log/babysit-prs-setup.log`. Setup output is absent from the run transcript. |
| The run reports no clone and fixes nothing | Confirm the Routine checkout directory names match `./codebase` and `./aicc-queues`. |
| Every GitHub call fails | Confirm the GitHub connector is attached. `gh auth status` passing does not prove repository API access. |
| Thread listing or resolve fails while other calls work | GraphQL can be blocked while REST works. Expect the MCP fallback, per [../shared/github-transport.md](../shared/github-transport.md). |
| Old skill behavior appears | Change a setup-script comment to invalidate the cached environment. |

## Current limits

- Scheduled runs have a one-hour minimum cadence and can start a few minutes late.
- Account and webhook run limits depend on the current Claude plan.
- Routines are personal and are not shared with teammates.
- Visual evidence still requires a local `/babysit-prs` pass.
