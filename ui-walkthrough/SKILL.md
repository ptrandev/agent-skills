---
name: ui-walkthrough
description: >
  Walks a PR's UI changes in a real browser, judges what it sees, and posts the screenshots back
  to GitHub as the PR's reviewer or as its author. Reports defects, never fixes them.
  Use for "walk the UI", "screenshot the PR", or "show me what changed visually".
---

# ui-walkthrough

## Input / modes

`$ARGS`:

| Invocation | Behavior |
|---|---|
| `/ui-walkthrough` | The PR for the current branch (`gh pr view --json number`). Errors if there isn't one. |
| `/ui-walkthrough <PR#>` | That PR (resolves to `Atllas-Inc/codebase` unless `--repo`). |
| `/ui-walkthrough <URL>` | Parse owner/name/number from the URL. Unambiguous. |
| `--author` / `--reviewer` | Force the role. Default: inferred from `author == ME` (see Phase 1). |
| `--viewports=desktop,tablet,mobile` | Default all three. Any subset. |
| `--personas=premium[,free,admin]` | Default `premium`. Each extra persona is one extra login, not a second stack boot. |
| `--target=e2e\|dev` | Which stack to walk. Default is **role- and environment-derived**, see *Target selection*. |
| `--surfaces=/a,/b` | Skip discovery, walk exactly these routes. Semantics in Phase 3. |
| `--no-post` | Assemble the report + print the exact payload, **don't post**. |
| `--no-video` | Skip the OpenCap recording even when available (local macOS only, either role). Video also forces a **headed** browser, see [opencap.md](opencap.md). |
| `--embedded` | Called by another skill: return findings, **post nothing**. See *Being called by another skill*. |

---

## Core invariants (do not weaken)

1. **Every finding is evidence-bound.** A finding may only be reported if it is visible in a
   screenshot captured this run, on a **healthy, identity-verified** stack (Phase 4), or was fired
   by a deterministic detector (Phase 5b) whose output is attached. "Looks like it might overflow"
   is not a finding.
2. **Infra failure is never a finding.** Ports busy, stack didn't boot, credentials missing,
   emulator crashed -> **neutral note**, walkthrough skipped. "Didn't boot on my machine" is not
   "PR is broken".
3. **Only *detected* defects can block.** Deterministic detector output (Phase 5b: horizontal
   scroll, touch target < 44px, console error, clipped text) can drive `REQUEST_CHANGES`. **Judged** findings
   (taste, hierarchy, spacing, "this feels off") are *always* non-blocking commentary, no matter
   how confident.
4. **The role determines the post primitive.** GitHub **422s** `REQUEST_CHANGES`/`APPROVE` on your
   own PR, so author mode is structurally comment-only. Reviewer mode posts a review.
5. **This skill never posts `APPROVE`.** It looked at pixels, not logic. Approval is `/review-pr`'s
   call. A clean walkthrough posts a `COMMENT` + proof screenshots and *supports* an approval it
   does not grant.
6. **Never boot onto a stack you didn't start.** `playwright.config.ts` sets
   `reuseExistingServer: true`, so a foreign server on `:3000` would be silently screenshotted and
   the evidence would "prove" whatever was already running. Free-or-abort (Phase 4).
7. **Reviewer mode never leaves the sealed stack.** `--target=e2e` only: stubbed externals
   (`E2E_STUB_EXTERNAL`), per-run emulator state. Walking *someone else's unreviewed code* against a
   shared backend can fire real Stripe/Vapi/Twilio calls and write to shared dev data, and dev data
   would land in screenshots **published** to everyone with repo access. `--target=dev` is an
   author-mode, local, attended opt-in. **Never** staging, **never** production, under any role.
8. **Never touch source, the index, or the PR branch.** Screenshots are published to a *detached
   custom ref* (Phase 7), built through an isolated `GIT_INDEX_FILE` so a dirty clone is safe.
9. **Never post a REVIEW to a draft PR**, and **never review your own**. Re-check both immediately
   before posting, not just at discovery. **Author mode is exempt from the draft half**: the rule
   exists to stop unrequested reviewer noise on unready work, and an author commenting evidence on
   their own draft is neither unrequested nor noise. Reviewer mode still skips drafts outright.

### Severity -> what happens

| Class | Source | Reviewer mode | Author mode |
|---|---|---|---|
| **BLOCKER** | detector fired, or the surface failed to render, or a console error attributed to this PR | inline on the diff + `REQUEST_CHANGES` | flagged in the comment as self-caught |
| **MEDIUM** | judged inconsistency, visible in a screenshot | inline + `COMMENT` | listed in the comment |
| **NIT** | polish | local report only | local report only |
| clean | none | proof comment + `COMMENT` | walkthrough comment |

**A screenshot alone produces a BLOCKER only when the surface fails to render**: blank page, error
page, or an HTTP 4xx/5xx response for the route. Every layout, spacing, contrast, alignment, and
hierarchy judgment is **MEDIUM at most**, in both modes, however obvious it looks.

---

## Writing style

The user's global writing rules, copied verbatim from `~/.claude/CLAUDE.md`. A headless run (a
Routine, a cloud sandbox, `claude -p`) never loads that file, so this copy is the binding one. It
governs every body posted in Phase 8, both modes, and the Phase 9 report. When the rules change
there, copy them here unchanged rather than paraphrasing.

Apply ASD-STE100 principles to **every** artifact a human reads, not just chat replies:
PR descriptions, PR review comments and verdicts, commit bodies, issue comments, Slack
messages, docs, and reports. Text posted to GitHub or Slack is read by teammates, so it
gets the same pass, not a looser one.

- One idea per sentence. Split any sentence carrying two or three.
- Remove information that does not help the reader act.
- Keep the evidence. Concision means fewer words per claim, never fewer claims:
  `file:line`, the command run, the actual numbers all stay.
- Never use the em dash. A period, comma, colon, or parentheses always works. Use
  `LABEL: text` for a header or severity separator, and a period or comma mid-sentence.
- Let the completed work show the result. No preamble, no self-congratulation.
- Include all necessary context. Concise and complete, not concise and partial.
- In any markdown that will be rendered (chat responses, PR/issue bodies, reports, docs),
  escape delimiter characters used literally, since two of them in one paragraph silently
  corrupt everything between: `\~` for "approximately" tildes (`~...~` is strikethrough in
  GFM) and `\$` for dollar amounts (`$...$` is inline LaTeX math in GitHub and VSCode
  preview). Literal `~`/`$` in code stay inside backticks instead.

---

## Phase 0: preflight + capability detection

Probe, record booleans, branch later. **Never assume a driver.**

```bash
# Probe a REPO call. `gh api user` passes while repo calls 403; see github-transport.md.
if gh api "repos/$OWNER/$NAME" --jq .id >/dev/null 2>&1; then GH_TRANSPORT=cli; else GH_TRANSPORT=mcp; fi
SCRATCH=/private/tmp/ui-walkthrough; mkdir -p "$SCRATCH"     # NOT $TMPDIR, see below
```

**Read [../review-pr/github-transport.md](../review-pr/github-transport.md) before any GitHub
call.** It owns the probe, the `cli`/`mcp` mapping, and `ME`, for this skill and `/review-pr` both.
**Never gate on `gh auth status`**: it passes in a sandbox where every `gh api` call 403s, so this
skill would exit only after booting a stack and capturing a full matrix. Two consequences here: the
evidence-ref push uses **git** and is unaffected by a blocked API (Phase 7), and the `body_html`
read-back cannot run under `mcp`, so report it as unverified rather than as passed.

**`$SCRATCH` must be under `/private/tmp`.** `browse` sandboxes screenshot output and rejects
anything outside `/private/tmp` or the repo root with
`Path must be within: /private/tmp, /Users/...`. macOS `$TMPDIR` is `/var/folders/…`, so a
`$TMPDIR`-based scratch dir fails **every capture**, one per screenshot, and the run looks healthy
until there are no images. Verified 2026-07-30.

The stack lock is a **fixed absolute path** too, `/private/tmp/ui-walkthrough/review-pr-stack.lock`,
so this skill and `/review-pr` agree on it whatever either process's `$TMPDIR` is. Two `$TMPDIR`s
would each take "the" lock and boot two stacks onto the same pinned ports.

**Read [driver.md](driver.md) before driving anything.** It owns driver selection, the `browse`
build probe, the headed Playwright fallback, the cloud launch arguments, and the **capacity gate
that exits the run below \~8 GB RAM**. Carry `$B`, `$SHOT`, `BROWSE_CAN_HEAD`, and the RAM verdict
out of it.

### Video capability: `CAN_VIDEO`

**Read [opencap.md](opencap.md) before probing or recording.** It owns the probe, the
window-scoping rule, the journey, the sequence, the markers, the quota, and the teardown. Probe
there, carry one boolean, branch in **Phase 5c**. Video is **local macOS only, under either role**,
and **always** best-effort: no `opencap` call may block, fail, or slow the walkthrough.

### Target selection

Two stacks are reachable. The default is derived **role first, then environment**, because the risk
isn't symmetric. `--target=` overrides; `UIW_TARGET` forces one for a whole session.

| Role | Environment | Default target | Why |
|---|---|---|---|
| **author** | local Mac | **`dev`** | Your branch, your data, attended. No emulator boot, no `next build`, so much faster, and often already running. Richer data than seed fixtures, which makes better reviewer evidence. |
| **author** | routine | `e2e` | No session, no creds, unattended. |
| **reviewer** | *either* | **`e2e`** | Invariant 7. Unreviewed code must not write to a shared backend, dev data drifts (so evidence isn't reproducible), and dev data would be published in the screenshots. |

```bash
case "$(uname)" in Darwin) ENVIRONMENT=local;; *) ENVIRONMENT=routine;; esac

# Attended probe. `[ -t 0 ]` is NOT usable: Claude Code's Bash tool gives every command a non-TTY
# stdin, so a TTY test marks an attended local session unattended and deletes the dev default.
# Every caller running with no operator MUST export UIW_UNATTENDED=1: /loop, /schedule,
# `claude -p`, and the /review-pr routine all set it.
ATTENDED=1
[ "${UIW_UNATTENDED:-0}" = 1 ] && ATTENDED=0
[ -n "${CI:-}" ] && ATTENDED=0
[ "$ENVIRONMENT" = routine ] && ATTENDED=0

TARGET="${UIW_TARGET:-$( [ "$ROLE" = author ] && [ "$ENVIRONMENT" = local ] \
                        && [ "$ATTENDED" = 1 ] && echo dev || echo e2e )}"

[ "$ROLE" = reviewer ] && [ "$TARGET" = dev ] && {
  echo "REFUSING --target=dev in reviewer mode (invariant 7). Using e2e."; TARGET=e2e; }

# Unattended dev is refused outright, in EITHER role, and never downgraded to e2e:
# silently swapping environments would mislabel the evidence.
[ "$ATTENDED" = 0 ] && [ "$TARGET" = dev ] && {
  echo "SKIP: --target=dev in an unattended run fires real Stripe/Vapi/Twilio calls with nobody watching."
  exit 0; }
```

**The posted comment always names the target**, so a reader can weigh the evidence:
`Stack: e2e (emulators, stubbed, seeded)` or
`Stack: local dev (real atllas-dev data, not reproducible)`.

### Credentials

**Read [dev-credentials.example.md](dev-credentials.example.md) before choosing a persona or
provisioning `--target=dev` credentials.** It owns the persona table, the seeded accounts, and why a
real dev account cannot log into the e2e stack.

**`--target=e2e`: nothing to provision.** `apps/agents-portal/e2e/seed/seed.mjs` creates the personas
in the local emulator with credentials **committed** in `apps/agents-portal/e2e/.env.e2e` (dummy,
non-secret, no external reach). Read them from the checkout at runtime:

```bash
set -a; . "$WORKDIR/apps/agents-portal/e2e/.env.e2e"; set +a
case "$PERSONA" in
  premium) EMAIL="$E2E_TEST_USER_EMAIL"; PASSWORD="$E2E_TEST_USER_PASSWORD";;   # e2e-agent, core_premium active
  free)    EMAIL="e2e-free@e2e.test";    PASSWORD="$E2E_SEED_PASSWORD";;
  admin)   EMAIL="$E2E_ADMIN_EMAIL";     PASSWORD="$E2E_ADMIN_PASSWORD";;
esac
```

**`--target=dev`: credential file required.** Resolution order: `UIW_DEV_PREMIUM_EMAIL` /
`UIW_DEV_PREMIUM_PASSWORD`, then `~/.claude/skills/ui-walkthrough/dev-credentials.md`
(`DEV_PREMIUM_*`), then `~/.claude/skills/full-send/dev-credentials.md` (legacy `DEV_EMAIL` /
`DEV_PASSWORD`). Parse without `eval`, because passwords contain shell metacharacters:

```bash
while IFS='=' read -r k v; do case "$k" in
  DEV_PREMIUM_EMAIL) : "${EMAIL:=$v}";; DEV_PREMIUM_PASSWORD) : "${PASSWORD:=$v}";;
  DEV_EMAIL) : "${EMAIL:=$v}";; DEV_PASSWORD) : "${PASSWORD:=$v}";;
  DEV_BASE_URL) : "${BASE_URL:=$v}";; esac
done < <(grep -E '^[A-Z][A-Z0-9_]*=' "$CREDS_FILE")
```

Nothing resolvable -> **skip with a neutral note** naming what was missing, never a silent fall back
to `e2e`. Print a readiness line (never echo a password):
```
ui-walkthrough:  gh ✓ (ptrandev)  driver: browse ✓ (headed, for video)  RAM 32GB ✓  persona: premium (e2e-agent@e2e.test)  video: opencap ✓ window-scoped desktop journey
```

When video is off, say *why* on the same line (`video: ✗ (headless browse daemon running)`,
`video: ✗ (screen-recording permission)`, `video: ✗ (--no-video)`), so the operator fixes it in one
step instead of rediscovering it at Phase 5c.

---

## Phase 1: resolve role + PR

```bash
PR_JSON=$(gh api "repos/$OWNER/$NAME/pulls/$PR" --jq '{author:.user.login, draft:.draft, head:.head.sha, base:.base.ref, headRepo:.head.repo.full_name}')
```

- `author == ME` -> **author mode** (comment only, invariant 4).
- `author != ME` -> **reviewer mode**, which does **not** require you to be a requested reviewer.
  If you aren't one, disclose it in the **top-level `body` of the review payload** (the summary body
  posted to `POST /repos/{o}/{r}/pulls/{n}/reviews`), never in an inline comment. One line, at the
  top: `Not a requested reviewer. Posting a UI walkthrough for context.`
- `draft == true` -> **reviewer mode skips** ("PR #N is a draft, re-run when it's ready");
  **author mode proceeds** (invariant 9). Re-checked in Phase 8.
- `--author`/`--reviewer` override the inference, except that **author mode can never be forced
  into posting a review**: GitHub 422s it, and the run falls back to a comment with a note.

---

## Phase 2: idempotency gate

Re-runs must not spam. The state lives in the posted comment, not a state file, so it survives
across machines and between local and routine runs. Embed a marker in every body this skill posts:

```
<!-- ui-walkthrough head=<HEAD_SHA> viewports=<list> personas=<list> -->
```

Before working, look for it:

```bash
gh api "repos/$OWNER/$NAME/issues/$PR/comments" --paginate \
  --jq ".[] | select(.user.login==\"$ME\") | select(.body | contains(\"ui-walkthrough head=$HEAD_SHA\")) | .html_url"
```

Compare the requested `viewports x personas` set against the set in the marker of the newest hit at
this head:

- Hit with the **same** set -> **skip** ("already walked at this head").
- Hit at an **older** head -> proceed; scope discovery to `git diff <old-head>..<HEAD_SHA>` so the
  new comment covers what changed since, and link the prior comment.
- **Not a subset** of the posted set (broader in either dimension: previously desktop-only and now
  `--viewports=all`, or a persona never walked) -> proceed, walking only the missing combinations.
- **A subset** of the posted set (narrower re-run: fewer viewports, fewer personas, or both) ->
  **skip** and print the prior comment's URL. The posted evidence is already a superset, so a
  narrower re-run can only duplicate it. Override by targeting a new head, not by re-running.

---

## Phase 3: surface discovery

Turn changed files into a list of routes to walk. Cap it, and **say what you capped**: a silent
truncation reads as full coverage.

```bash
gh pr diff "$PR" --repo "$REPO" --name-only > "$SCRATCH/files-$NAME-$PR.txt"
grep -E '^apps/agents-portal/src/(pages|components)/' "$SCRATCH/files-$NAME-$PR.txt"
```

- **No matching files -> exit early with a neutral note.** Not a UI PR; nothing to walk.
- **`pages/**` -> route directly.** `pages/foo/bar.tsx` -> `/foo/bar`; `index.tsx` -> the directory
  root; `_app`/`_document` -> treat as *global* (walk the app's 3 highest-traffic routes instead,
  since a global change affects everything).
- **`components/**` -> walk importers transitively up to `pages/`.** grep for the component's
  import specifier, follow re-exports, stop at the first `pages/` file. A component with no page
  ancestor (dead code, or only used in tests) -> note it, don't invent a route.
- **Dynamic segments (`[id].tsx`): never construct the URL.** Navigate to the parent list page and
  click the first row. A hand-built `/agents/123` 404s against per-run seeded emulator data, and a
  404 screenshot looks exactly like a real bug (invariant 2 violation waiting to happen).
- **Cap: 8 surfaces.** More than that -> walk the 8 with the largest diff and list the dropped
  routes in the report *and* the posted comment.

**Diff size of a route** is the sum of `added + deleted` lines from
`gh pr diff "$PR" --repo "$REPO" --numstat` over **every changed file the route reaches**: the page
file plus each changed component in its transitive import graph (the graph the `components/**` rule
walks). A component shared by three pages counts its full numstat toward all three. Ties break by
route path, ascending, so the cap is deterministic across re-runs.

### `--surfaces=/a,/b`

Explicit routes replace discovery. Three consequences, all deliberate:

- **The not-a-UI-PR early exit does not apply.** Walk the listed routes even when the diff touches no
  `pages/`/`components/` file. Say `explicit --surfaces, discovery skipped` in the Coverage block.
- **The 8-surface cap still applies.** More than 8 -> walk the first 8 in the order given, list the
  rest as dropped. The cap bounds run time and comment size, which explicit routes don't change.
- **Fixture derivation still runs**, keyed off the PR's changed specs (`e2e/tests/**`), not off
  discovered routes. With no changed spec covering a listed route, an unpopulated surface is a
  **neutral note** ("no fixture, route not in this PR's diff"), not the MEDIUM below. That MEDIUM is
  reserved for a surface this PR actually changes.

### Fixtures: the surface must have DATA, or you screenshot the wrong thing

On the e2e stack the only data is what something seeds, and there's no `--import`, so nothing
carries over. A surface with no data renders its **fallback or empty state**, which screenshots
perfectly and shows **none of the PR's changes**. Fixtures live in **two** places, and the global
one is usually not the relevant one:

| Source | Scope | How to tell |
|---|---|---|
| `e2e/seed/seed.mjs` | global, every run | personas, teams, baseline docs |
| `e2e/seed/*` helpers (e.g. `seedClient` -> `setDoc`/`PERSONAS`, `stripeRecoverySeed`) | **per-spec**, seeded in `beforeEach`, deleted in `afterEach` | feature data for a specific surface |

*Worked example:* the revenue-recovery analytics surface has **zero** `seed.mjs` hits. Its data comes
from `recovery-attribution-snapshots` / `revenuecat-connections` docs that its own spec seeds. Walk
it without that and you get the books-based hero: the fallback, not the feature.

**Derive the fixture from the PR's own specs.** A UI PR that touches `e2e/tests/**` hands you the
exact setup its surface needs.

1. For each changed spec, read its imports from `e2e/seed/*` and its `beforeEach`.
2. **Call the same helpers from the hold spec** ([stack.md](stack.md)) before it holds, so the
   surface is populated when your browser arrives. Reuse the repo's helpers, never hand-write
   fixture docs, and never `page.route`-mock: the specs deliberately don't, and mocked evidence
   isn't evidence.
3. Mirror their invariants. That spec keeps `computedAt` **fresh**, because a stale snapshot
   triggers a background refresh that overwrites the seed mid-run. Copy those, or your data
   evaporates mid-walkthrough.

**Assert the surface is populated before capturing**, using a marker element from the spec's own
assertions. Not populated -> say so, capture the empty state **labelled as such**, and never report
the fallback as a defect. Personas see different data **by design** (`e2e-agent` premium vs
`e2e-free`), so attribute an empty surface to the persona before calling it missing.

Only when *no* fixture path exists anywhere: capture the empty state, label it `no seeded fixture`,
and raise a **MEDIUM**: *"no fixture exists, so neither this walkthrough nor the E2E suite can
exercise this UI."*

---

## Phase 4: boot the PR's code (evidence integrity)

**Read [stack.md](stack.md) before booting the stack.** It owns both boot procedures, the hold
spec, the `env -u VSCODE_CWD` emulator bug, backgrounding, pre-warm, login, the checkout-strategy
table, and the deference to `/review-pr`'s stack lifecycle. The two rules that decide everything else:

- **`--target=dev`** (author, local, attended): `yarn agents-portal` against real atllas-dev. Fast,
  richer data, dev overlays to suppress, no external stubbing, and real data in published shots.
- **`--target=e2e`** (everything else, and reviewer mode always): `yarn e2e:stack` held open by an
  injected hold spec. Local emulators, stubbed externals, seeded personas, deterministic.

Three additions specific to this skill:

- **Author mode may reuse a running dev server**, only after asserting it serves *this branch*
  (`git rev-parse HEAD` == PR head **and** clean tree). Note in the comment that evidence came from a
  dev server, not the sealed stack: `yarn agents-portal` is **not** emulator-scoped and may point at
  real dev. Reviewer mode never reuses (invariant 6).
- **The capture matrix runs at scale 1.** `viewport --scale N` rebuilds the browser context per the
  `browse` docs, which can drop the session, so take any retina hero shot **last** and re-auth if it
  dropped. A **recorded** run has no retina hero shot at all (`--scale` is unsupported headed).
  **Never trade the video for the hero shot.**
- **Log in before the recording starts** (Phase 5c). Credentials must never reach the video, and the
  ordering is the only thing that guarantees it.

---

## Phase 5: capture

Three passes, in this order:

| Pass | What it does | Recorded |
|---|---|---|
| **5a** | the screenshot matrix, every surface × every viewport × states | no |
| **5b** | the deterministic detectors | no |
| **5c** | one desktop user journey | **yes**, `CAN_VIDEO` only |

**Read [capture.md](capture.md) before capturing anything.** It owns all three passes, the sub-agent
delegation contract, and the detector set. The 5a+5b sub-agent is given that file and not this one.

---

## Phase 6: evaluate

Two passes.

### 6a: attribute and class the detector output (may block)

Phase 5b already measured. This pass decides whose defect each firing is, and only this pass can
produce a BLOCKER. Re-measuring live is expected here: the browser is still up, and attribution
needs the page.

**Navigate back before re-measuring.** The 5a+5b walk ends on whatever surface and viewport it
finished with, and it runs in a sub-agent, so this session never saw it move. Go to the firing's
own `surface` + `viewport` first, and reload after the viewport change. Measuring the wrong page
silently produces a confident, wrong attribution.

#### Attribution: a detector number says a defect exists, not whose it is

**Attribute by MEASURING, not by reading the diff.**

- **Name the outermost offender, not every descendant.** An overflowing ancestor makes its children
  report overflow too. Keep only elements whose `right > innerWidth` that no already-kept element
  `contains`. The culprit is usually one node.
- **Delete this PR's own elements in the live page and re-measure:**

  ```js
  const before = measure()
  document.querySelectorAll('[data-testid="thing-the-pr-added"]').forEach(e => e.remove())
  const after = measure()   // before - after is the PR's contribution
  ```

**The threshold is numeric, not a feeling.** With `delta = before - after`:

| Measurement | Class | What to say |
|---|---|---|
| `delta >= 8px` **and** `delta >= 10%` of `before` | **BLOCKER** | "PR contributes `<delta>`px of `<before>`px overflow" |
| `delta < 8px` **or** `delta < 10%` of `before` | **MEDIUM** | "pre-existing, PR contributes `<delta>`px" |
| the offending element is not in the diff at all | **MEDIUM** | "pre-existing, element `<sel>` is outside this PR" |
| the element **is** the PR's, but an existing sibling (same component, same size prop) measures **identically** | **MEDIUM** | shared-styling issue whose fix moves both, not a regression. Quote the sibling's measurement as proof. |

The same 8px / 10% rule applies to clipped text (`scrollWidth - clientWidth`). A touch target is
attributed by identity, not size: the element must be one the diff adds or restyles, else MEDIUM.

#### Console errors need the same attribution, and they do not get it for free

`console --clear` scopes the read to the surface, not to the PR, and a pre-existing Stripe or
analytics 404 must never post `REQUEST_CHANGES` on an unrelated PR. Attribute before classing:

1. Resolve the error's source file from its stack frame or `location.url`, mapped through the
   sourcemap to a repo path.
2. Source path is in `gh pr diff --name-only` -> **BLOCKER**. Quote the message and the resolved
   `file:line`.
3. Source path resolves **outside** the diff (vendor chunk, third-party script, an untouched
   module) -> **MEDIUM**, labelled "may be pre-existing, source outside the diff".
4. Source unresolvable (cross-origin script, no sourcemap) -> cross-check against the base branch:
   load the same surface from a base-branch build and re-read `console --errors`. Same message
   present -> **MEDIUM**, "present on `<base>` too". Absent -> **BLOCKER**.
5. Base-branch build not affordable this run -> **MEDIUM** plus a neutral note saying the
   cross-check was skipped. An unattributed console error is never a BLOCKER.

### 6b: judged pass (designer's eye, never blocks)

**Read the rubric, don't reinvent it.** `~/.claude/skills/design-review/SKILL.md` §*Design Audit
Checklist* (grep `### Design Audit Checklist`) carries \~80 items across 10 categories. The ones
judgeable from a screenshot are **4. Spacing & Layout**, **5. Interaction States**, **6. Responsive
Design**, and the contrast items in **3**. Read those at runtime so `/design-review`'s rubric stays
the single source of truth, including its mobile rule: *"A stacked desktop layout on mobile is not
responsive design, it's lazy. Evaluate whether the mobile layout makes design sense."*

Use the Read tool on each PNG, so the judgment is made **against the image**, not against the DOM.

**A screenshot is not a style measurement.** A frame can catch a MUI ripple or transition
mid-animation and look like a contrast failure. Before reporting one, read the *resting*
`getComputedStyle` in each state (idle / hover / selected / selected+hover) and compute the real
WCAG ratio. A "low contrast" finding that measures 5.24:1 is a false positive published under the
skill's own evidence-bound invariant.

**Out of scope** (don't duplicate `/review-pr`): missing Playwright E2E specs, code-level findings,
anything not visible on screen.

---

## Phase 7: publish the evidence

**Read [evidence-hosting.md](evidence-hosting.md) before publishing the screenshots.** It owns the
URL-form table, the `body_html` media-type trap, the detached-ref push script, the exit-status rule,
the fallback ladder, and ref pruning.

**Budget: <= 12 embedded images and <= 8 MB per run**, because screenshots live in the repo forever.
Push every captured shot to the ref, then **embed in this priority order and link the rest**:

1. Every BLOCKER shot, with the state that shows the defect.
2. One desktop full-page shot per surface walked.
3. The mobile shot of each surface whose diff changes responsive behavior.
4. One tablet shot, only if a finding is tablet-only.
5. Everything else: linked, not embedded.

Drop from the bottom of that list until both limits hold, and say in the Coverage block how many
were linked rather than embedded. Capture at scale 1; retina only for a hero shot.

---

## Phases 8 and 9: post, report, teardown

**Read [post-and-report.md](post-and-report.md) before posting.** It owns the re-check gate, both
mode payloads, the two body templates, the local report format, and the teardown checklist.

Three rules from it that the earlier phases depend on, so they stay here too:

- **Re-check `draft` and `author` immediately before posting** (invariant 9), not just at discovery.
- **Post through `GH_TRANSPORT`** ([../review-pr/github-transport.md](../review-pr/github-transport.md)).
- **Teardown is the Phase 4 EXIT trap, and it runs whether or not the walkthrough succeeded.**

---

## Being called by another skill

With `--embedded`, post nothing and **return** to the caller:

```
{ blockers: [...], mediums: [...], nits: [...],
  images: [{surface, viewport, state, url}], neutralNotes: [...],
  video: {url, sessionId, viewport, surfaces, surfacesUnreached, beats, jumps, truncated} | null,
  coverage: {surfacesWalked, surfacesTotal, dropped, personas, viewports},
  markdown: "<ready-to-paste evidence section>" }
```

**`video` is this skill's to produce, not the caller's.** Recording starts *after* the headed
browser exists, is logged in, is sized at 1440×900, and the matrix and detectors have already run,
facts only this skill holds. A caller wrapping its own `record start` around the delegated call
records the wrong window at the wrong size, with the login in frame and the matrix instead of the
journey. `video` is `null` whenever `CAN_VIDEO` was 0, with the reason in `neutralNotes`. The
`markdown` block already embeds the link when there is one.

**`video.viewport` is always `desktop`, and it does not describe the run's coverage.** Read
`coverage.viewports` for that. A caller that renders the video link without the coverage block
implies a desktop-only walkthrough.

**`video.surfaces` equals `coverage.surfacesWalked` on every healthy run**, because the journey
covers all of them. `video.surfacesUnreached` is normally empty. A non-empty one means a surface
never rendered. The caller reads that as a defect, never as a shortened video.

- **`/review-pr` Phase 6**: call it instead of hand-rolling a walkthrough. `/review-pr` owns the
  verdict (it can `APPROVE`; this skill can't) and merges `blockers` into its own findings, which
  is exactly its documented "live-confirmed defect is the highest-confidence tier" rule. Its
  `stack-lifecycle.md` stays the source of truth that [stack.md](stack.md) reads. On a **local**
  `/review-pr` run this returns a `video`, so its review body must carry `coverage` beside the
  link. Its usual home is a headless routine, where `video` is `null`.
- **`/full-send` Phase 8**: call it in author mode for evidence, replacing the desktop-only
  screenshot pass. It already reads `dev-credentials.md` and already posts a comment; this returns
  a richer, multi-viewport `markdown` block for it.
- **Single writer:** the caller posts. Embedded mode never writes to GitHub, so
  "only-verified-posts" stays enforced in one place.

---

## Edge cases

Each of these is decided in the phase that owns it: not a UI PR and dynamic routes with no seeded
row (Phase 3), no fixture for a surface (Phase 3), draft and own-PR-forced-to-reviewer (Phases 1
and 8), ports occupied and stack death mid-matrix ([stack.md](stack.md) and invariant 2), missing
credentials (Phase 0), unattended `--target=dev` (Phase 0), `--scale` dropping the session
(Phase 4), fork PR with no push access (Phase 7 ladder rung 3).

One more case: **the assets ref grows server-side**. Prune it per
[evidence-hosting.md](evidence-hosting.md) *Pruning*, which owns that procedure.

---

## Running unattended

Runtime-agnostic by design (Phase 0 capability detection). Two homes, same skill:

- **Cloud routine**: piggyback on `/review-pr`'s routine (`review-pr/routine.md`), which installs the
  skills, the toolchains, and headless Chromium. **Nothing to configure:** the target is forced to
  `e2e` and its personas are seeded per run with credentials committed in the checkout. That is
  deliberate: the routine provisions skills by cloning the **public** repo, so a gitignored
  credential file is absent by construction and a file-based credential path would silently disable
  every walkthrough. Driver is headless Chromium with `args: ['--ssl-version-max=tls1.2']` (Phase 0).
- **Local Mac**: `/ui-walkthrough <PR#>` directly, or `/loop 2h /ui-walkthrough`. Author-mode runs
  default to `--target=dev` (fast, real data, attended); reviewer-mode runs stay on `e2e`. Adds the
  OpenCap video. A `/loop` or `/schedule` run must export `UIW_UNATTENDED=1`, which sets
  `ATTENDED=0` and refuses `--target=dev` (Phase 0). Recording does **not** make a run attended, and
  does not occupy the machine: see [opencap.md](opencap.md).

The Phase 2 marker makes repeated runs safe: each picks up only PRs not yet walked at their current
head, and Phase 8's re-check closes the window where two overlapping runs both pass the gate.
