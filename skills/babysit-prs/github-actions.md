# babysit-prs: GitHub Actions setup

Use this option when review comments need an immediate response. The workflow runs in each target
repository and can serve every author without a local machine.

**Do not enable it until local `/babysit-prs` runs consistently make the right decisions.**

| | Local or Routine | GitHub Actions |
|---|---|---|
| Trigger | Manual or scheduled | Review and PR-comment events |
| Identity | Your GitHub login | A bot account or GitHub App |
| Scope | Your PRs | Any configured PR |
| Latency | Next run | Seconds |

Running both is safe. Use Actions for immediate responses and a scheduled Routine as a backstop.

## Safety requirements

- Skip events created by the bot to prevent reply loops.
- Use one concurrency group per PR.
- Grant only `contents: write` and `pull-requests: write`.
- Rebase onto the latest PR head. **Never** force-push or overwrite a branch a person is editing.
- Treat fork PRs as read-only because their event token cannot push fixes.
- Keep the resolution rules in [`SKILL.md`](SKILL.md): resolve only a thread the bot fixed and
  verified.

## Workflow

Add `.github/workflows/babysit-prs.yml` to each target repository. Adjust the install, test, bot
identity, and secrets for that repository.

```yaml
name: babysit-prs
on:
  pull_request_review_comment:
    types: [created]
  issue_comment:
    types: [created]

permissions:
  contents: write
  pull-requests: write

concurrency:
  group: babysit-${{ github.event.pull_request.number || github.event.issue.number }}
  cancel-in-progress: false

jobs:
  babysit:
    runs-on: ubuntu-latest
    if: >
      github.actor != 'atllas-babysit-bot' &&
      (github.event_name == 'pull_request_review_comment' ||
       github.event.issue.pull_request != null)
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: ${{ github.event.pull_request.head.ref || github.head_ref }}
          token: ${{ secrets.BABYSIT_BOT_TOKEN }}

      - name: Resolve PR number
        id: pr
        run: |
          echo "number=${{ github.event.pull_request.number || github.event.issue.number }}" >> "$GITHUB_OUTPUT"

      # Install project dependencies and the Claude Code CLI here.

      - name: Address review threads
        env:
          GH_TOKEN: ${{ secrets.BABYSIT_BOT_TOKEN }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          claude -p "/babysit-prs ${{ steps.pr.outputs.number }}" \
            --dangerously-skip-permissions
```

## Bot identity

| Option | Tradeoff |
|---|---|
| Dedicated bot account PAT | Fastest setup. Store a `repo`-scoped token as `BABYSIT_BOT_TOKEN`. |
| GitHub App | Finer permissions and higher limits, with more setup. Prefer for organization-wide use. |

**Do not use the default `GITHUB_TOKEN`.** Its pushes do not trigger downstream workflows, so CI
does not rerun on fix commits.

## Rollout

1. Run `/babysit-prs` locally or on a schedule and review every report.
2. Enable Actions for draft PRs after the escalations and fixes are consistently correct.
3. Expand it to all PRs after the draft-only run is trusted.
