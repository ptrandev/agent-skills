# full-send Phase 8: Evidence (screenshots and video)

Loaded from `SKILL.md` Phase 8 only when the change touches UI.

**Skip gate.** Skip this phase when `git diff --name-only "origin/$BASE"...HEAD` shows no frontend
source files. Atllas default: no files under `apps/agents-portal/src/pages/` or
`apps/agents-portal/src/components/`. In any other repo, substitute that repo's frontend source
dirs. Never let an unmatched hardcoded path skip the phase silently: if the gate skips, say which
paths it checked in the Phase 9 report.

This phase produces the reviewer's visual context: **screenshots** of every affected surface at
desktop/tablet/mobile, and a continuous **walkthrough video** of the same flow recorded with
[OpenCap](https://opencap.dev), scoped to the browser window and indexed by markers. The video is
**best-effort**: if OpenCap isn't installed, isn't logged in, or lacks the screen-recording
permission, capture screenshots only and never block the PR.

**Delegate the capture to `/ui-walkthrough`.** Do not hand-roll it here. That skill owns surface
discovery, the three-viewport matrix, the deterministic detectors, and (the part `gh` can't do)
publishing images to GitHub so they actually render in a comment.

```
/ui-walkthrough <PR_NUMBER> --author --embedded
```

**Do not pass `--target=dev`.** `/ui-walkthrough` auto-selects the target: author + local -> `dev`,
author + routine or unattended -> `e2e`. It **refuses** `--target=dev` in an unattended run and
falls back to a neutral note, not to `e2e`. full-send's default path is a headless `claude -p` run,
so a hardcoded flag turns this phase into a neutral note instead of evidence. Pass the flag only
after confirming a human is attending this run.

**Stack boot.** No full-send phase boots a stack. `/ui-walkthrough` boots or reuses one, following
`/review-pr`'s stack lifecycle rules: see `review-pr/stack-lifecycle.md`. Port safety is that
skill's too: it never kills a process holding a port, so a squatter from another worktree yields a
neutral note rather than a dead process. Read the note and report it.

**Credentials.** full-send does not read `full-send/dev-credentials.md` itself.
`/ui-walkthrough` reads it as the last fallback for `--target=dev` (legacy `DEV_EMAIL` /
`DEV_PASSWORD`), after its own `ui-walkthrough/dev-credentials.md`. Leave the file in place.

**Draft PRs.** full-send always opens drafts. The walkthrough's draft gate is scoped to *reviewer*
mode (`ui-walkthrough` invariant 9, which names this phase as the caller it protects); `--author`
proceeds on a draft. A run reporting "skipped, PR is a draft" means the walkthrough is on a stale
copy of that invariant and this phase produced nothing. Treat that as a failure, not a skip.

It returns `{blockers, mediums, nits, images, neutralNotes, video, coverage, markdown}` and **posts
nothing**: this phase stays the single writer.

**Empty states.** `/ui-walkthrough` derives fixtures from the PR's own e2e specs and reports a
surface it could not populate. Caller-side decision: an unpopulated surface is a real gap to fix
before review, not a cosmetic note. An empty/fallback state screenshots perfectly and shows none of
your change.

### Step 8c: The video comes back with the walkthrough

Do not start a recording here. `/ui-walkthrough` owns it and returns
`video: {url, sessionId, markers, truncated} | null`. See `ui-walkthrough/opencap.md`.
`VIDEO_LINK` is `video.url`, or empty when `video` is `null`, in which case the reason is already in
`neutralNotes` and Step 8d prints it.

Use the Read tool on each returned PNG so the screenshots enter the conversation and you can judge
them yourself before they go on the PR.

### Step 8d: Attach the evidence to the PR

Post one comment built from the returned `markdown` (its image URLs are already published and
rendering, do not re-upload anything):

```bash
gh pr comment "$PR_NUMBER" --body "$(cat <<EOF
## Walkthrough evidence

**Video:** ${VIDEO_LINK:-_(no video this run, see the neutral note for why)_}

$WALKTHROUGH_MARKDOWN
EOF
)"
```

State coverage honestly: surfaces walked vs dropped, personas, and which stack produced the
evidence. When the walkthrough selected `dev`, say so: that is real dev data, so it is not
reproducible, and other users' records must not appear in a published screenshot. Record the
comment URL; Phase 9 references it.

### Step 8e: Tear down

Leave the dev server running, the user may want to inspect the UI. Do not kill it.
`/ui-walkthrough` tears down only what *it* started; a dev server it merely reused is left alone,
and one it started in author mode is left up for the same reason.
