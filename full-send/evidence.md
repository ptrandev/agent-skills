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
/ui-walkthrough <PR_NUMBER> --author --embedded --target=e2e
```

**`--target=e2e` is mandatory, in every mode.** Pass it on every invocation, attended or not. Do
not pass `--target=dev`, and do not drop the flag and let `/ui-walkthrough` auto-select: its author
+ local + attended default is `dev`, so an attended run would silently walk real `atllas-dev` data.
Three reasons this phase always wants the sealed stack:

- **The evidence is published.** Phase 8d posts the screenshots to the PR. Real dev data means
  other users' records on a page everyone with repo access can read.
- **The evidence must be reproducible.** Dev data drifts, so a reviewer re-walking the same PR next
  week sees a different screen. Seeded personas do not drift.
- **The run must behave the same headless and attended.** full-send's default path is a headless
  `claude -p` run, where `/ui-walkthrough` **refuses** `--target=dev` outright and produces a
  neutral note instead of evidence. Forcing `e2e` gives one behavior in both modes.

`e2e` is safe unattended: emulators, `E2E_STUB_EXTERNAL`, and personas seeded per run with
credentials committed in the checkout. There is nothing to provision and no real Stripe/Vapi/Twilio
call fires.

**Stack boot.** No full-send phase boots a stack. `/ui-walkthrough` boots or reuses one, following
`/review-pr`'s stack lifecycle rules: see `review-pr/stack-lifecycle.md`. Port safety is that
skill's too: it never kills a process holding a port, so a squatter from another worktree yields a
neutral note rather than a dead process. Read the note and report it.

**Credentials.** Nothing to provision. On `e2e` the personas come from
`apps/agents-portal/e2e/seed/seed.mjs` with credentials committed in the checkout, so no phase here
reads a credential file. `full-send/dev-credentials.md` is now unused by this phase: it stays only
as `/ui-walkthrough`'s last fallback for a hand-run `--target=dev`. Leave the file in place, and
never point this phase at it.

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

State coverage honestly: surfaces walked vs dropped, personas, and the stack that produced the
evidence, which is always `e2e (emulators, stubbed, seeded)`. The walkthrough names its own target
in the returned `markdown`. If that line says `dev`, the flag did not take: stop, do not post real
dev data, and re-run with `--target=e2e`. Record the comment URL; Phase 9 references it.

### Step 8e: Tear down

Nothing to do here. `/ui-walkthrough` owns the e2e stack it booted and tears it down in its own
EXIT trap. Do not kill any process this phase did not start: a dev server the user had running on
`:3000` is not this phase's, and they may still want it.
