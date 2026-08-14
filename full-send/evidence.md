# full-send Phase 8: Evidence (screenshots and video)

Loaded from `SKILL.md` Phase 8 only when the change touches UI.

**Skip gate.** Skip this phase when `git diff --name-only "origin/$BASE"...HEAD` shows no frontend
source files. Atllas default: no files under `apps/agents-portal/src/pages/` or
`apps/agents-portal/src/components/`. In any other repo, substitute that repo's frontend source
dirs. **Never** let an unmatched hardcoded path skip the phase silently: when the gate skips, say
which paths it checked in the Phase 9 report.

This phase produces two parts:

- **Screenshots** of every affected surface at desktop/tablet/mobile. They are the only responsive
  coverage.
- A **walkthrough video**: one desktop user journey through the change, recorded with
  [OpenCap](https://opencap.dev), scoped to the browser window and indexed by markers. It is
  desktop-only.

The video is **best-effort**. Capture screenshots only when OpenCap is not installed, is not logged
in, or lacks the screen-recording permission. **Never** block the PR on the video.

**Delegate the capture to `/ui-walkthrough`.** **Do not** hand-roll it here. That skill owns surface
discovery, the three-viewport matrix, the deterministic detectors, and publishing images to GitHub
so they render in a comment, which `gh` cannot do.

```
/ui-walkthrough <PR_NUMBER> --author --embedded --target=e2e
```

**`--target=e2e` is mandatory, in every mode.** Pass it on every invocation, attended or not. **Do
not** pass `--target=dev`. **Do not** drop the flag and let `/ui-walkthrough` auto-select: its
author + local + attended default is `dev`, so an attended run silently walks real `atllas-dev`
data. This phase always wants the sealed stack:

- **The evidence is published.** Phase 8d posts the screenshots to the PR. Real dev data means
  other users' records on a page everyone with repo access can read.
- **The evidence must be reproducible.** Dev data drifts. Seeded personas do not.
- **The run must behave the same headless and attended.** full-send's default path is a headless
  `claude -p` run, where `/ui-walkthrough` **refuses** `--target=dev` outright and produces a
  neutral note instead of evidence.

`e2e` is safe unattended: emulators, `E2E_STUB_EXTERNAL`, and personas seeded per run. No real
Stripe/Vapi/Twilio call fires.

**Stack boot.** **Never** boot a stack in a full-send phase. `/ui-walkthrough` boots or reuses one,
following the stack lifecycle rules in `review-pr/stack-lifecycle.md`. Port safety is that skill's
too: it never kills a process holding a port, so a squatter from another worktree yields a neutral
note rather than a dead process. Read the note and report it.

**Credentials.** Nothing to provision. On `e2e` the personas come from
`apps/agents-portal/e2e/seed/seed.mjs` with credentials committed in the checkout, so no phase here
reads a credential file. **Never** point this phase at `full-send/dev-credentials.md`. Leave that
file in place: it is `/ui-walkthrough`'s last fallback for a hand-run `--target=dev`.

**Draft PRs.** full-send always opens drafts. The walkthrough's draft gate is scoped to *reviewer*
mode (`ui-walkthrough` invariant 9, which names this phase as the caller it protects). `--author`
proceeds on a draft. A run reporting "skipped, PR is a draft" means the walkthrough is on a stale
copy of that invariant and this phase produced nothing. Treat that as a failure, not a skip.

It returns `{blockers, mediums, nits, images, neutralNotes, video, coverage, markdown}` and **posts
nothing**: this phase stays the single writer.

**Empty states.** `/ui-walkthrough` derives fixtures from the PR's own e2e specs and reports a
surface it could not populate. Caller-side decision: an unpopulated surface is a real gap to fix
before review, not a cosmetic note.

### Step 8c: The video comes back with the walkthrough

**Do not** start a recording here. `/ui-walkthrough` owns it and returns
`video: {url, sessionId, viewport, beats, jumps, truncated} | null`, a contract owned by
`ui-walkthrough/opencap.md`. `VIDEO_LINK` is `video.url`, or empty when `video` is `null`, in which
case the reason is already in `neutralNotes` and Step 8d prints it.

`video.viewport` is always `desktop`. It describes the recording, never the run's coverage: read
`coverage.viewports` for that, and keep the two next to each other in the posted body. A video link
with no viewport coverage beside it reads as a desktop-only walkthrough.

Read each returned PNG with the Read tool. Judge the screenshots yourself before they go on the PR.

### Step 8d: Attach the evidence to the PR

Post one comment built from the returned `markdown`. Its image URLs are already published and
rendering, so **do not** re-upload anything.

```bash
gh pr comment "$PR_NUMBER" --body "$(cat <<EOF
## Walkthrough evidence

**Video (desktop journey):** ${VIDEO_LINK:-_(no video this run, see the neutral note for why)_}

$WALKTHROUGH_MARKDOWN
EOF
)"
```

State coverage honestly: surfaces walked vs dropped, personas, and the stack that produced the
evidence, which is always `e2e (emulators, stubbed, seeded)`. The walkthrough names its own target
in the returned `markdown`. When that line says `dev`, the flag did not take: **stop**, **do not**
post real dev data, and re-run with `--target=e2e`. Record the comment URL. Phase 9 references it.

### Step 8e: Tear down

Nothing to do here. `/ui-walkthrough` owns the e2e stack it booted and tears it down in its own
EXIT trap. **Do not** kill any process this phase did not start: a dev server the user had running
on `:3000` is not this phase's.
