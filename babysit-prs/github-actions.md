# babysit-prs: GitHub Actions bot (the comment-driven option)

This is an autonomous, event-driven bot that lives in the repo and fires the instant a review
comment lands, covering the whole team, no machine required. Pick it over a Routine per the runtime
table in "Running it unattended" in [SKILL.md](SKILL.md). Running **both** is fine: the Actions bot
for instant comment response, the Routine's hourly sweep as a backstop. Idempotency keeps them from
colliding.

**Do not enable this until the Phase 1 loop's resolution quality is trusted.** A bot that pushes
commits and resolves threads on every PR, unsupervised, is only safe once you've watched the same
judgment work by hand.

## How it differs from Phase 1

| | Phase 1 (local skill) | Phase 2 (Actions bot) |
|---|---|---|
| Trigger | You / a schedule | `pull_request_review_comment`, `issue_comment` events |
| Identity | Your `gh` login | A bot token / GitHub App |
| Scope | Your PRs | Any PR in the repo (configurable) |
| Latency | Next scheduled pass | Seconds after the comment |
| Supervision | You read each report | Fully autonomous |

Everything outside those rows is identical, and `SKILL.md` stays the spec the headless prompt
points at.

## Safety deltas to add for unattended CI

The three Phase-1 invariants still hold, plus:

- **Guard against loops.** Skip events authored by the bot itself (`github.actor == <bot login>`)
  or you'll trigger on your own replies forever.
- **Branch contention.** The bot must not push to a branch a human is actively editing. Push with
  `--force-with-lease` is *not* a fix here. Instead, rebase onto the latest head and bail (reply
  "your branch moved, leaving this for you") if it can't fast-forward cleanly.
- **Permissions.** `contents: write` + `pull-requests: write` only. Resolving threads needs the
  GraphQL `resolveReviewThread` mutation, available with `pull-requests: write`.
- **Rate / cost.** Concurrency-group per PR so rapid-fire comments collapse into one run.
- **Fork PRs.** `pull_request_review_comment` from forks has a read-only token. Detect and skip
  (triage-only) rather than failing.

## Reference workflow

The workflow is **per-repo**: it lives in each repo's `.github/workflows/`. Drop the same file
into **both** `Atllas-Inc/codebase` and `Atllas-Inc/aicc-queues` (and any future target). The only
per-repo differences are the install/test steps and the secrets each repo holds.

`.github/workflows/babysit-prs.yml`, illustrative. Adapt secrets, paths, and the run command to
however you invoke Claude Code headless in CI.

```yaml
name: babysit-prs
on:
  pull_request_review_comment:
    types: [created]
  issue_comment:
    types: [created]   # only acts when the comment is on a PR (guarded below)

permissions:
  contents: write
  pull-requests: write

concurrency:
  # Collapse rapid comments on the same PR into one run.
  group: babysit-${{ github.event.pull_request.number || github.event.issue.number }}
  cancel-in-progress: false

jobs:
  babysit:
    runs-on: ubuntu-latest
    # Skip the bot's own activity (loop guard) and non-PR issue comments.
    if: >
      github.actor != 'atllas-babysit-bot' &&
      (github.event_name == 'pull_request_review_comment' ||
       github.event.issue.pull_request != null)
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          # The PR head, so fixes commit to the right branch.
          ref: ${{ github.event.pull_request.head.ref || github.head_ref }}
          token: ${{ secrets.BABYSIT_BOT_TOKEN }}

      - name: Resolve PR number
        id: pr
        run: |
          echo "number=${{ github.event.pull_request.number || github.event.issue.number }}" >> "$GITHUB_OUTPUT"

      # Install deps / Claude Code CLI as your CI does. Then run the skill headless,
      # scoped to the single PR that triggered the event:
      - name: Address review threads
        env:
          GH_TOKEN: ${{ secrets.BABYSIT_BOT_TOKEN }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          claude -p "/babysit-prs ${{ steps.pr.outputs.number }}" \
            --dangerously-skip-permissions
```

## Token / identity options

- **PAT of a dedicated bot account** (`atllas-babysit-bot`) with `repo` scope: simplest; commits
  and resolutions show as that account. Store as `BABYSIT_BOT_TOKEN`.
- **GitHub App**: cleaner identity, per-repo install, finer permissions, higher rate limits.
  More setup. Preferred if this graduates to org-wide use.
- **Not the default `GITHUB_TOKEN`**: its pushes don't re-trigger downstream workflows (so CI
  wouldn't re-run on the bot's fix commit), and cross-PR thread resolution is awkward. Use a real
  bot token/App.

## Rollout suggestion

1. Run Phase 1 on a schedule for a couple of weeks; read every report.
2. When the "needs you" queue is consistently the *right* things to escalate (and the auto-fixes
   are consistently correct), enable this workflow on **draft PRs only** first (add an `if` on
   `github.event.pull_request.draft == true`).
3. Widen to all PRs once trusted.
