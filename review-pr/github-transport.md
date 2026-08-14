# GitHub transport: `gh` CLI or MCP

Owns every GitHub call both `/review-pr` and `/ui-walkthrough` make. Read it in Phase 0, set
`GH_TRANSPORT` once, and route every later GitHub operation through the mapping below. The phases
name operations; this file owns how each one is issued.

## Two transports, one probe

| Transport | What it is | Fails when |
|---|---|---|
| `cli` | the `gh` binary against the GitHub API | the sandbox disables GitHub API access for the session |
| `mcp` | the GitHub MCP connector's tools | the connector is not attached, or it drops mid-session |

```bash
if gh api user --jq .login >/dev/null 2>&1; then GH_TRANSPORT=cli; else GH_TRANSPORT=mcp; fi
```

**Probe with a real API call, never `gh auth status`.** `gh auth status` reports on stored
credentials, not reachability, so it passes in a sandbox where every `gh api` call 403s with
*"GitHub access is not enabled for this session"* (verified 2026-08-14, routine sandbox). Installing
`gh` and setting `GH_TOKEN` do not fix that: it is a session-level block, not a credential problem.

**Attaching the GitHub connector does not enable `gh`.** The connector supplies MCP tools. The `gh`
CLI needs the sandbox's own API proxy, which is a separate switch with no per-routine control. A run
can have working MCP and a dead `gh` at the same time, which is the normal cloud case.

**Git transport is independent of both, and it keeps working.** Cloning, `git fetch`, and
`/ui-walkthrough`'s evidence-ref push all succeed while the API is blocked. Never conclude from a
failed `gh` call that the run cannot reach GitHub at all.

## Operation mapping

Tool **names** vary by MCP server version, so discover them at runtime (`ToolSearch` for `github`)
rather than hardcoding. The names below are what the 2026-08-14 sandbox exposed. Match on the
operation, not the string.

| Operation | `cli` | `mcp` |
|---|---|---|
| identity (`ME`) | `gh api user --jq .login` | the connector's authenticated-user call |
| discover review-requested | `gh search prs --review-requested="$ME" --state=open --repo "$REPO"` | list PRs per repo, then filter on `requested_reviewers` **and** `requested_teams` |
| PR head / base / draft / author | `gh api repos/$OWNER/$NAME/pulls/$PR --jq …` | get pull request |
| existing reviews (idempotency) | `gh api repos/$OWNER/$NAME/pulls/$PR/reviews` | list PR reviews |
| changed files + patch ranges | `gh api repos/$OWNER/$NAME/pulls/$PR/files --paginate` | get PR files |
| the diff | `gh pr diff "$PR" --repo "$REPO"` | **git**, see below |
| check out the head | `gh pr checkout "$PR"` | **git**, see below |
| bot review threads | `gh api graphql` (Phase 5b query) | list review comments; resolve via the review-thread write tool |
| post the review | `gh api …/pulls/$PR/reviews --method POST` | the PR-review write toolset (`pull_request_review_write`): open a pending review, add each inline comment, submit with the event |
| post a comment (author mode) | `gh pr comment` | add issue comment |

**Two operations never need the API.** Both work under either transport, so prefer them always:

```bash
git fetch origin "pull/$PR/head:review-pr-$PR" && git checkout "review-pr-$PR"   # replaces gh pr checkout
git diff "origin/$BASE...$HEAD_SHA" > "/tmp/review-pr-$NAME-$PR.diff"            # replaces gh pr diff
```

Fetch the base fresh first. `$BASE` and `$HEAD_SHA` come from the PR read, so they are transport-
dependent; the diff itself is not.

## What `mcp` cannot do

- **The `body_html` read-back is unavailable.** It needs the `application/vnd.github.full+json`
  media type, which MCP does not expose, so `/ui-walkthrough`'s "the images were not stripped" check
  (`evidence-hosting.md`) cannot run. **Say so in the report.** Never write it as verified.
- **Inline anchoring still 422s on a line outside a diff hunk.** The pre-validation against patch
  ranges is mandatory under both transports, not a `cli` detail.

## Rules

1. **Probe once, in Phase 0. Record `GH_TRANSPORT` in the report.** A reader must be able to tell
   which path produced the review, because the two differ in what was verified.
2. **Never mix transports inside one run.** A half-`gh`, half-MCP run reads two different auth
   identities, and idempotency checks against the wrong one double-post.
3. **Neither transport available -> stop.** There is nothing to discover from or post to. That is a
   neutral note, never a finding.
4. **A dropped MCP connection mid-run is infra, not a finding** (invariant 2). Re-probe once. Still
   dead -> report what was assembled and post nothing.
