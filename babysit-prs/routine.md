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

Commits and replies use your connected GitHub identity.

## Create the Routine

Open **claude.ai/code/routines**, choose **New routine**, and configure:

1. **Name and prompt:** use `babysit-prs` and the prompt below.
2. **Repositories:** add `Atllas-Inc/codebase` and `Atllas-Inc/aicc-queues`.
3. **Environment:** use the default Trusted network and the setup script below.
4. **Permissions:** enable unrestricted branch pushes for both repositories.
5. **Connectors:** remove connectors other than the GitHub access supplied by the Routine.
6. **Trigger:** choose one of the options below.
7. Create the Routine, then select **Run now** for validation.

## Setup script

The repositories use different toolchains. The script installs the skill and warms both:

```bash
rm -rf /tmp/agent-skills
git clone --depth 1 https://github.com/ptrandev/agent-skills.git /tmp/agent-skills
mkdir -p "$HOME/.claude/skills"
cp -R /tmp/agent-skills/babysit-prs "$HOME/.claude/skills/babysit-prs"

CODEBASE_DIR="${CODEBASE_DIR:-./codebase}"
AICC_DIR="${AICC_DIR:-./aicc-queues}"

if [ -f "$CODEBASE_DIR/package.json" ]; then
  ( cd "$CODEBASE_DIR" && corepack enable && yarn install --immutable ) \
    || echo "codebase: install failed; fixes degrade to triage-only"
else
  echo "codebase: clone not found; fixes degrade to triage-only"
fi

if [ -f "$AICC_DIR/build.gradle" ]; then
  ( cd "$AICC_DIR" && ./gradlew --no-daemon compileJava ) \
    || echo "aicc-queues: compile failed; fixes degrade to triage-only"
else
  echo "aicc-queues: clone not found; fixes degrade to triage-only"
fi
```

Replace the clone paths when the Routine uses different directories. Add Gradle or Maven hosts to
the Trusted network's custom allowlist when dependency downloads fail.

The environment caches successful setup. Its first run is slower.

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
| Schedule | Recommended. The minimum cadence is one hour; `17 * * * *` runs hourly off the hour. |
| GitHub event | Optional PR-level nudge. Review-comment and issue-comment events are unavailable. |
| API | Optional POST trigger for another system. |

A label-filtered pull-request event can provide a manual nudge, but the schedule remains the
backstop for review comments.

## Validate before enabling fixes

Open the run transcript. A green status only means the session completed.

1. Confirm the setup installed the skill and both project toolchains.
2. Confirm `/babysit-prs` ran instead of an improvised replacement.
3. Point the Routine at a PR with a trivial finding.
4. Confirm the fix commit reached the PR branch.
5. Confirm the thread received a reply and was resolved.

Until all five pass, treat the Routine as triage-only.

## Current limits

- Scheduled runs have a one-hour minimum cadence and can start a few minutes late.
- Account and webhook run limits depend on the current Claude plan.
- Routines are personal and are not shared with teammates.
- Visual evidence still requires a local `/babysit-prs` pass.
