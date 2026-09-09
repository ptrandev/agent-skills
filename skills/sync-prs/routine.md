# sync-prs: Routine setup

A Claude Code Routine runs this sweep on a schedule in a fresh cloud checkout. It merges the
default branch into each of your open PR branches, verifies the result, and pushes. It leaves
every conflict it cannot resolve mechanically for you.

Claude's [Routine documentation](https://code.claude.com/docs/en/routines) is the source of truth
for current product limits and UI labels.

## Before you start

1. Connect GitHub with `/web-setup`.
2. Confirm Claude Code on the web and Routines are enabled for the account.
3. Enable **Allow unrestricted branch pushes** for every target repository. The skill pushes merge
   commits to existing PR branches.

Commits use your connected GitHub identity. Git push keeps working in the sandbox even when the
GitHub API does not, so a blocked `gh` never blocks a push.

**Give this routine its own environment.** It shares the skills clone, `gh`, and the two project
toolchains with `babysit-prs`, but it is the routine that rewrites branch history for every open
PR at once. A separate environment keeps one broken edit from stopping both.

## Create the Routine

Open **claude.ai/code/routines**, choose **New routine**, and configure:

1. **Name and prompt:** use `sync-prs` and the prompt below.
2. **Repositories:** add `Atllas-Inc/codebase` and `Atllas-Inc/aicc-queues`.
3. **Environment:** use the default Trusted network and the setup script below.
4. **Permissions:** enable unrestricted branch pushes for both repositories.
5. **Connectors:** keep the GitHub connector attached. It supplies the MCP transport, which the run
   needs when `gh` cannot reach the repository API. Remove unrelated connectors.
6. **Trigger:** use the schedule below.
7. Create the Routine, then select **Run now** with `--dry-run` in the prompt for validation.

## Setup script

The script installs the skill, the shared reference files, `gh`, and both project toolchains. It
logs to `/var/log/sync-prs-setup.log`, because setup output never reaches the run transcript.

```bash
exec > >(tee -a /var/log/sync-prs-setup.log) 2>&1

rm -rf /tmp/agent-skills
git clone --depth 1 https://github.com/ptrandev/agent-skills.git /tmp/agent-skills
mkdir -p "$HOME/.claude/skills"
for item in sync-prs shared; do
  if [ -d "/tmp/agent-skills/skills/$item" ]; then
    rm -rf "$HOME/.claude/skills/$item"
    cp -R "/tmp/agent-skills/skills/$item" "$HOME/.claude/skills/$item"
  else
    echo "FATAL: skill '$item' is missing from the clone. The layout changed, or the clone failed."
    exit 1
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

git config --global user.name "${GIT_AUTHOR_NAME:-Phillip Tran}"
git config --global user.email "${GIT_AUTHOR_EMAIL:-donutdeflector@tuta.io}"

CODEBASE_DIR="${CODEBASE_DIR:-./codebase}"
AICC_DIR="${AICC_DIR:-./aicc-queues}"

if [ -f "$CODEBASE_DIR/package.json" ]; then
  ( cd "$CODEBASE_DIR" && corepack enable && yarn install --immutable ) ||
    echo "WARN: codebase install failed; verification and lockfile resolution degrade"
else
  echo "WARN: codebase clone not found; the run skips that repo"
fi

if [ -f "$AICC_DIR/build.gradle" ]; then
  ( cd "$AICC_DIR" && ./gradlew --no-daemon compileJava ) ||
    echo "WARN: aicc-queues compile failed; verification degrades"
else
  echo "WARN: aicc-queues clone not found; the run skips that repo"
fi
```

The `shared` copy is mandatory. `SKILL.md` reads the transport contract at
`../shared/github-transport.md`, which resolves next to the installed skill.

The `git config` lines matter here. A merge commit needs an author, and an unconfigured sandbox
fails `git commit` with `Please tell me who you are`.

The runner stops on an unhandled non-zero command. Keep every optional step guarded when you
change the script. Replace the two clone paths when the Routine uses different directories.

The environment caches setup for several days, so the first run is slower. Change a harmless
setup-script comment to force a newly published skill revision to load.

## Prompt

```text
Run /sync-prs across my open PRs on Atllas-Inc/codebase and Atllas-Inc/aicc-queues.

Include draft PRs. Merge the default branch into each PR branch that is behind. Resolve only
lockfile, import-list, and append-only conflicts. Abort every other conflict and leave the branch
untouched. Verify typecheck green before you push. Never force push and never rebase.

Each checkout starts on the default branch. Fetch and hard-reset each PR head before merging.
Finish with the report table and an explicit "Needs you" list.
```

Add `--dry-run` to the first line for a read-only validation run.

Keep the prompt pointed at the skill so improvements to [`SKILL.md`](SKILL.md) apply to every run.

## Schedule

Use this UTC cron expression:

```text
30 11,20 * * *
```

It runs twice a day, at 07:30 and 16:30 Toronto time. The morning slot picks up whatever landed on
the default branch overnight, so a conflict surfaces before you start work on the branch. The
afternoon slot picks up the day's merges.

**These slots are not fitted to measured merge traffic,** unlike the `babysit-prs` schedule. They
are a starting point. Refit them from the real merge times on the default branch after a month.

Two runs a day is the useful ceiling. A branch that is one merge behind is not blocked, so a
faster cadence spends run budget without shortening any wait that matters.

Cron expressions stay in UTC through daylight-saving changes, so each local time moves one hour
later from November to March. The web form offers presets only, so set a custom expression with
`/schedule update` in the CLI.

## Validate before enabling pushes

Open the run transcript. A green status only means the session completed.

1. Read `/var/log/sync-prs-setup.log`. Confirm the skill, the `shared` directory, `gh`, and both
   toolchains installed without a `WARN` line.
2. Run once with `--dry-run`. Confirm the table lists the PRs you expect, drafts included.
3. Confirm the report names `GH_TRANSPORT` per repo. Expect `mcp` in the cloud, because repository
   API calls through `gh` return 403 there.
4. Confirm the preflight resolved each clone to the cloud checkout, not to a `/Users/...` path.
5. Drop `--dry-run` and run against one repo with `--repo`. Confirm one merge commit per PR, and
   confirm the author is you.
6. Confirm no branch was force-pushed: `git reflog show origin/<branch>` holds only fast-forwards.
7. Confirm an aborted PR left its branch at the same SHA it started on.

Until all seven pass, keep `--dry-run` in the prompt.

## Troubleshooting

| Symptom | Check |
|---|---|
| Setup degrades silently | Read `/var/log/sync-prs-setup.log`. Setup output is absent from the run transcript. |
| `Please tell me who you are` on commit | The `git config --global` lines are missing from the setup script. |
| The run reports no clone and merges nothing | Confirm the Routine checkout directory names match `./codebase` and `./aicc-queues`. |
| Every GitHub call fails | Confirm the GitHub connector is attached. `gh auth status` passing does not prove repository API access. |
| Push rejected on every PR | Unrestricted branch pushes are off for that repository. |
| Old skill behavior appears | Change a setup-script comment to invalidate the cached environment. |

## Current limits

- Scheduled runs have a one-hour minimum cadence and can start a few minutes late.
- Account and webhook run limits depend on the current Claude plan.
- Routines are personal and are not shared with teammates.
- A conflict outside the safe list needs a local `/merge-master` pass on that branch.
