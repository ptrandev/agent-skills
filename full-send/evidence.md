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

**`--target=e2e` is mandatory, in every mode.** Pass it on every invocation, attended or not. Pass
it explicitly even though it is now `/ui-walkthrough`'s own default, so this phase's intent survives
a change there. This phase always wants the sealed stack:

- **The evidence is published.** Phase 8d posts the screenshots to the PR. Real dev data means
  other users' records on a page everyone with repo access can read.
- **The evidence must be reproducible.** Dev data drifts. Seeded personas do not.
- **The run must not occupy the machine.** `e2e` takes a port lane
  (`ui-walkthrough/concurrency.md`), so it leaves the operator's own `:3000` dev server alone and
  runs beside other sessions. `dev` binds `:3000` and `:4000` and blocks both.

`e2e` is safe unattended: emulators, `E2E_STUB_EXTERNAL`, and personas seeded per run. No real
Stripe/Vapi/Twilio call fires.

### The `dev` escape hatch: seed first, and it is almost never the answer

`/full-send` is the **only** caller allowed to choose `dev` on its own (`ui-walkthrough` invariant
7). The reason to want it is always the same: the changed surface renders empty on `e2e` because
nothing seeds its data. **That is a seed gap, not a target problem, and the seed is part of the
feature.**

Work the ladder in order. Stop at the first rung that produces evidence:

1. **Seed the surface in the PR.** Add the fixture to the feature's own spec in
   `apps/agents-portal/e2e/tests/**`, using an `e2e/seed/*` helper in `beforeEach`, exactly as the
   surrounding specs do. Commit it. `/ui-walkthrough` Phase 3 derives its fixtures from the PR's
   specs, so the surface populates on the next run and stays populated for every future reviewer.
2. **Extend `e2e/seed/seed.mjs`** when the data belongs to every persona, not to one spec. Commit
   that too.
3. **Capture the empty state, labelled.** A surface with no data is honest evidence when the PR does
   not own the data. Say so in the comment.
4. **`dev`, only if rungs 1 through 3 are all impossible**, and only when a human is watching.

Rung 4 requires **all** of these. Any one missing means stop at rung 3:

```
--target=dev + UIW_ALLOW_DEV=1     # UIW_ALLOW_DEV is what lifts the unattended refusal
```

- The run is on a local Mac, in author mode, and **lane 0 is free** (`dev` cannot take another lane).
- Rungs 1 and 2 were attempted and are genuinely blocked. Name the blocker in the PR comment.
- **No other user's data reaches a screenshot.** Capture narrower element shots on any surface that
  lists records you do not own.
- The comment says `Stack: local dev (real atllas-dev data, not reproducible)` and says why `e2e`
  could not show the change.

**Never** take rung 4 to save time, to skip writing a seed, or because the `e2e` boot was slow. Those
are reasons to fix rung 1. A missing seed shipped now is a surface no reviewer can ever verify.

**Stack boot.** **Never** boot a stack in a full-send phase. `/ui-walkthrough` boots or reuses one,
following the stack lifecycle rules in `review-pr/stack-lifecycle.md`. Ports are that skill's too:
it claims a lane (`ui-walkthrough/concurrency.md`) and never kills a process holding a port, so a
squatter from another worktree yields a neutral note rather than a dead process. Read the note and
report it. **Never** pass `--lane=N`: let the walkthrough take the first free lane, so two
`/full-send` runs can proceed at once.

**Credentials.** Nothing to provision on `e2e`. The personas come from
`apps/agents-portal/e2e/seed/seed.mjs` with credentials committed in the checkout, so no phase here
reads a credential file. `full-send/dev-credentials.md` is read by `/ui-walkthrough` alone, and only
on the rung-4 escape hatch above. Leave the file in place. **Never** read it here.

**Draft PRs.** full-send always opens drafts. The walkthrough's draft gate is scoped to *reviewer*
mode (`ui-walkthrough` invariant 10, which names this phase as the caller it protects). `--author`
proceeds on a draft. A run reporting "skipped, PR is a draft" means the walkthrough is on a stale
copy of that invariant and this phase produced nothing. Treat that as a failure, not a skip.

It returns `{blockers, mediums, nits, images, neutralNotes, video, coverage, markdown}` and **posts
nothing**: this phase stays the single writer.

**Empty states.** `/ui-walkthrough` derives fixtures from the PR's own e2e specs and reports a
surface it could not populate. Caller-side decision: an unpopulated surface is a real gap to fix
before review, not a cosmetic note.

**Uncovered components block the evidence claim.** `coverage.componentsUncovered` lists every
changed UI file no screenshot mounted (`ui-walkthrough` invariant 11). A non-empty list means this
phase has not covered the change. Fix it at the source: seed the document shape that reaches the
panel in the feature's own spec (rung 2 above), then re-run the walkthrough. Only when the ladder is
exhausted may the phase post, and then it names each uncovered file and its reason in the comment.
Never report the change as walked because its route was captured.

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
evidence. The walkthrough names its own target in the returned `markdown`. When that line says
`dev` and this phase did **not** take the rung-4 escape hatch, the flag did not take: **stop**,
**do not** post real dev data, and re-run with `--target=e2e`. On a deliberate rung-4 run, keep the
`dev` line and add the blocker that forced it. Record the comment URL. Phase 9 references it.

### Step 8e: Tear down

Nothing to do here. `/ui-walkthrough` owns the e2e stack it booted and tears it down in its own
EXIT trap. **Do not** kill any process this phase did not start: a dev server the user had running
on `:3000` is not this phase's.
