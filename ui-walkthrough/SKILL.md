---
name: ui-walkthrough
description: >
  Walks a PR's UI changes in a real browser, judges what it sees, and posts the screenshots back
  to GitHub as the PR's reviewer or as its author. Reports defects, never fixes them.
  Use for "walk the UI", "screenshot the PR", or "show me what changed visually".
---

# ui-walkthrough

## Input / modes

Treat text accompanying the skill invocation as the input:

| Invocation | Behavior |
|---|---|
| Empty | The PR for the current branch (`gh pr view --json number`). Errors when there is none. |
| `<PR#>` | That PR (resolves to `Atllas-Inc/codebase` unless `--repo`). |
| `<URL>` | Parse owner/name/number from the URL. Unambiguous. |
| `--author` / `--reviewer` | Force the role. Default: inferred from `author == ME` (see Phase 1). |
| `--viewports=desktop,tablet,mobile` | Default all three. Any subset. |
| `--personas=premium[,free,admin]` | Default `premium`. Each extra persona is one extra login, not a second stack boot. |
| `--target=e2e\|dev` | Which stack to walk. **Always defaults to `e2e`**, in every role and environment. `dev` runs only when this flag is typed, see *Target selection*. |
| `--lane=N` | Which port lane to boot on. Default: the first free lane. See [concurrency.md](concurrency.md). |
| `--surfaces=/a,/b` | Skip discovery, walk exactly these routes. Semantics in Phase 3. |
| `--no-post` | Assemble the report + print the exact payload, **post nothing**. |
| `--no-video` | Skip the OpenCap recording even when available (local macOS only, either role). Video also forces a **headed** browser, see [opencap.md](opencap.md). |
| `--embedded` | Called by another skill: return findings, **post nothing**. See [embedded.md](embedded.md). |

---

## Core invariants (do not weaken)

1. **Every finding is evidence-bound.** Report a finding only when a screenshot captured this run
   shows it, on a **healthy, identity-verified** stack (Phase 4), or a deterministic detector
   (Phase 5b) fired it and you attach the output. "Looks like it might overflow" is not a finding.
2. **Infra failure is never a finding.** Ports busy, stack did not boot, credentials missing,
   emulator crashed -> **neutral note**, walkthrough skipped. "Did not boot on my machine" is not
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
6. **Never boot onto a stack you did not start.** `playwright.config.ts` sets
   `reuseExistingServer: true`. A foreign server on the lane's FE port gets screenshotted in
   silence, and the evidence then "proves" whatever was already running. Free-or-abort (Phase 4).
7. **`e2e` is the target. `dev` is a typed opt-in.** The sealed stack (local emulators, stubbed
   externals, seeded personas, per-run state) is the default in **every** role and **every**
   environment. `dev` is a shared backend: it can fire real Stripe/Vapi/Twilio calls, its data
   drifts so the evidence is not reproducible, other users' records land in screenshots
   **published** to everyone with repo access, and one walkthrough occupies the port the operator's
   own dev server needs. `dev` therefore runs only when a human types `--target=dev` or exports
   `UIW_TARGET=dev`. **Never** infer it, **never** fall back to it, **never** use it in reviewer
   mode. **Never** staging, **never** production, under any role. `/full-send` holds the one
   autonomous exception, defined in `full-send/evidence.md`.
8. **Never take a lane you did not win.** Ports, the stack lock, the `browse` daemon, and the
   scratch dir are all lane-scoped so two walkthroughs can run at once
   ([concurrency.md](concurrency.md)). Take one lane, hold it for the whole run, release it in
   teardown. Never touch another lane's ports, processes, or lock.
9. **Never touch source, the index, or the PR branch.** Screenshots are published to a *detached
   custom ref* (Phase 7), built through an isolated `GIT_INDEX_FILE` so a dirty clone is safe.
10. **Never post a REVIEW to a draft PR**, and **never review your own**. Re-check both immediately
   before posting, not just at discovery. **Author mode is exempt from the draft half**: the rule
   exists to stop unrequested reviewer noise on unready work, and an author commenting evidence on
   their own draft is neither unrequested nor noise. Reviewer mode still skips drafts outright.
11. **Coverage is measured in changed components.** A route can render perfectly, return 200, and
   show none of the diff, because the changed component sits behind a tab, a state, or a document
   shape the fixture never created. Every changed file under `pages/`/`components/` must be proven
   on screen by a mount probe in at least one captured shot (the Phase 3 ledger, probed in 5a). A
   component that never mounted is reported as uncovered, by file name, in the posted Coverage
   block. It is never counted as walked because its route was captured.

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

Copied verbatim from `~/.claude/CLAUDE.md`, which a headless run never loads.
Binding on every body posted in Phase 8, both modes, and on the Phase 9 report.

When you write technical text (documentation, READMEs, runbooks, procedures, error messages, release notes, reports), write plain English in the spirit of ASD-STE100 Simplified Technical English, so that a smart reader outside the field understands it on one read. Obey these rules:

CLASSIFY FIRST. Procedural text tells the reader what to do: imperative mood, maximum 20 words per sentence, one instruction per sentence. Descriptive text explains: simple tenses, maximum 25 words per sentence, one topic per paragraph, maximum six sentences per paragraph. Never mix the two in one passage.

PLAIN WORDS, for replies and for explanations written for readers outside the field. Use the common word when one exists ("use", not "utilize"). Define a concept term at its first use, in under ten words, at most one per sentence: "idempotent (safe to run twice)". Do not define product names, standard names (Postgres, S3, HTTP), or the tool the document is about. Address the reader as "you". Lead with the point. Procedures and reference documents follow the rules above alone.

VERBS. Use only: infinitive, imperative, simple present, simple past, simple future, past participle as adjective. No present perfect ("has completed" → "completed"). No "-ing" verb forms ("making it easy" → new sentence). Active voice; passive only in descriptions when the agent is unknown. Approved modals: can, will, must. Banned: should, would, may, might, could. For "should": write "must" if required, delete if optional.

SENTENCES. Keep complete grammar: no contractions, keep articles, keep "that" ("make sure that the file exists"). Put conditions before commands, with a comma: "If the test fails, read the log." No semicolons: write two sentences. No em-dashes: an em-dash hides the logic between two statements. Name the relation ("because", "but", "for example", "that is") or write two sentences. Use a vertical list for more than two items or steps.

WORDS. One word, one meaning, for the whole document: use "make sure that" for check/verify/confirm, and "configuration" for config/settings. Noun chains of maximum three words. Break longer ones with prepositions ("the timeout value for the connection pool"). Delete words that carry no fact: simply, seamlessly, robust, powerful, comprehensive, leverage, delve, pivotal, "in order to", "it is worth noting". Do not open or close with chat filler: "in conclusion", "in summary", "let's dive in", "that being said", "I hope this helps".

AVOID THE AI DRIFTS. Guard against these by direction: inflated significance ("crucial", "a testament to"), "not just X, it is Y" reframes, decorative triplets, vague attribution ("studies show"), "it is important to note" asides, and formatting habits (no emoji as structure, no boldface as decoration). State the fact. The fact carries itself. Replace: utilize → use, prior to → before, in the event that → if, e.g. → for example. American spelling.

WARNINGS. Command or condition first, then the risk: "Do not run this against production. The command deletes rows."

NEVER TOUCH. Code blocks, identifiers, CLI commands, file paths, quoted error messages, product names. Each counts as one word toward sentence limits. Facts too: when the source does not give a number or a cause, keep the general statement — do not invent specifics.

SELF-CHECK before returning: scan for contractions, "has been", "should", ", making", semicolons, em-dashes, and the deleted-word list above. Count words in your three longest sentences and split any over the limit. Collapse synonym rotation.

REPLIES TO THE USER. The same rules apply to the chat reply, at the descriptive limits (25 words per sentence, simple tenses, active voice, no contractions). Start with the answer or the result. If a concept term is necessary, define it in a few words. Do not restate the request. Keep the whole reply to 5 sentences or fewer, code and lists excluded. Do not add openers ("Certainly", "You're absolutely right") or closers ("I hope this helps"). Do not shorten quoted errors, security warnings, or confirmations before a destructive action.

STRICT MODE. If the user names STE, ASD-STE100, or compliance, also apply the STE dictionary to the document: "make sure that" for check/verify/confirm, "operate" for run, "do" for execute, "show" for display, "but" for however, "because" for since. Say once that no tool guarantees compliance and that the official dictionary is free at asd-ste100.org.

Do not apply these rules to marketing copy or brand writing.

In any markdown that will be rendered (chat responses, PR/issue bodies, reports, docs),
escape delimiter characters used literally, since two of them in one paragraph silently
corrupt everything between: `\~` for "approximately" tildes (`~...~` is strikethrough in
GFM) and `\$` for dollar amounts (`$...$` is inline LaTeX math in GitHub and VSCode
preview). Literal `~`/`$` in code stay inside backticks instead.

---

## Phase 0: preflight + capability detection

Locate the directories containing the loaded `ui-walkthrough`, `full-send`, `review-pr`, and
`design-review` skills. Call them `UI_WALKTHROUGH_DIR`, `FULL_SEND_DIR`, `REVIEW_PR_DIR`, and
`DESIGN_REVIEW_DIR`. Use those directories for every skill file, credential file, reference, and
script path below.

Probe, record booleans, branch later. **Never assume a driver.**

```bash
# Probe a REPO call. `gh api user` passes while repo calls 403; see ../shared/github-transport.md.
if gh api "repos/$OWNER/$NAME" --jq .id >/dev/null 2>&1; then GH_TRANSPORT=cli; else GH_TRANSPORT=mcp; fi
SCRATCH=/private/tmp/ui-walkthrough; mkdir -p "$SCRATCH"     # NOT $TMPDIR, see below
```

`$SCRATCH` narrows to `$SCRATCH/lane-$LANE` once *Lane selection* has run. Do that before the first
capture, so two concurrent runs cannot overwrite each other's PNGs.

**Read [../shared/github-transport.md](../shared/github-transport.md) before any GitHub
call.** It owns the probe, the `cli`/`mcp` mapping, and `ME`, for this skill and `/review-pr` both.
**Never gate on `gh auth status`**: it passes in a sandbox where every `gh api` call 403s, so this
skill then exits only after booting a stack and capturing a full matrix. Two consequences here:
the evidence-ref push uses **git** and survives a blocked API (Phase 7), and the `body_html`
read-back cannot run under `mcp`, so report it as unverified rather than as passed.

**`$SCRATCH` must be under `/private/tmp`.** `browse` sandboxes screenshot output and rejects
anything outside `/private/tmp` or the repo root with
`Path must be within: /private/tmp, /Users/...`. macOS `$TMPDIR` is `/var/folders/…`, so a
`$TMPDIR`-based scratch dir fails **every capture**, one per screenshot, and the run looks healthy
until there are no images. Verified 2026-07-30.

Every lane lock is a **fixed absolute path** too, so this skill and `/review-pr` agree on lane 0's
lock whatever either process's `$TMPDIR` holds. Two different `$TMPDIR` values each take "the" lock
and boot two stacks onto the same ports. [concurrency.md](concurrency.md) owns the paths.

**Read [driver.md](driver.md) before driving anything.** It owns driver selection, the `browse`
build probe, the headed Playwright fallback, the cloud launch arguments, and the **capacity gate
that exits the run below \~8 GB RAM**. Carry `$B`, `$SHOT`, `BROWSE_CAN_HEAD`, and the RAM verdict
out of it.

### Video capability: `CAN_VIDEO`

**Read [opencap.md](opencap.md) before probing or recording.** It owns the probe, the
window-scoping rule, the journey, the sequence, the markers, the quota, and the teardown. Probe
there, carry one boolean, branch in **Phase 5c**. Video is **local macOS only, under either role**,
and **always** best-effort. **Never** let an `opencap` call block, fail, or slow the walkthrough.

### Target selection

**The target is `e2e`.** Every role, every environment, attended or not. Nothing derives it and
nothing falls back to it. `dev` runs only when the invocation carries `--target=dev`, or the session
exports `UIW_TARGET=dev`, or `/full-send` sets `UIW_ALLOW_DEV=1` under its own escape hatch
(`full-send/evidence.md`).

The asymmetry that used to justify a `dev` default is gone: `e2e` seeds its own personas, holds a
port lane of its own ([concurrency.md](concurrency.md)), and leaves the operator's `:3000` dev
server alone. A `dev` walkthrough occupies the machine the operator is working on.

```bash
case "$(uname)" in Darwin) ENVIRONMENT=local;; *) ENVIRONMENT=routine;; esac

# Attended probe. `[ -t 0 ]` is NOT usable: Claude Code's Bash tool gives every command a non-TTY
# stdin, so a TTY test marks an attended local session unattended.
# Every caller running with no operator MUST export UIW_UNATTENDED=1: /loop, /schedule,
# `claude -p`, and the /review-pr routine all set it.
ATTENDED=1
if [ "${UIW_UNATTENDED:-0}" = 1 ] || [ -n "${CI:-}" ] || [ "$ENVIRONMENT" = routine ]; then ATTENDED=0; fi

TARGET=e2e                                  # the only default, in every role and environment
if [ "${UIW_TARGET:-}" = dev ]; then TARGET=dev; fi   # session-wide operator opt-in
if [ "${ARG_TARGET:-}" = dev ]; then TARGET=dev; fi   # --target=dev typed on this invocation

if [ "$ROLE" = reviewer ] && [ "$TARGET" = dev ]; then
  echo "REFUSING --target=dev in reviewer mode (invariant 7). Using e2e."; TARGET=e2e
fi

if [ "$ENVIRONMENT" = routine ] && [ "$TARGET" = dev ]; then
  echo "REFUSING --target=dev off a local Mac (invariant 7). Using e2e."; TARGET=e2e
fi

# Unattended dev is refused outright, in EITHER role, and never downgraded to e2e:
# silently swapping environments would mislabel the evidence. UIW_ALLOW_DEV=1 is the single
# exception, set only by /full-send, which owns the conditions in full-send/evidence.md.
if [ "$ATTENDED" = 0 ] && [ "$TARGET" = dev ] && [ "${UIW_ALLOW_DEV:-0}" != 1 ]; then
  echo "SKIP: --target=dev in an unattended run fires real Stripe/Vapi/Twilio calls with nobody watching."
  exit 0
fi
```

**The posted comment always names the target**, so a reader can weigh the evidence:
`Stack: e2e (emulators, stubbed, seeded)` or
`Stack: local dev (real atllas-dev data, not reproducible)`.

### Lane selection

**Read [concurrency.md](concurrency.md) before Phase 4.** It owns lane allocation, the port map, the
per-lane lock, `browse` daemon scoping, the codebase capability probe, and lane teardown. Carry
`$LANE`, `$LOCK`, `$SCRATCH`, `$BASE_URL`, `$WORKDIR`, and `$B_ENV` out of it.

The lane is infra, so it belongs in the readiness line and the neutral notes, **never** in a
finding and never in the posted `Stack:` line.

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
`UIW_DEV_PREMIUM_PASSWORD`, then `$UI_WALKTHROUGH_DIR/dev-credentials.md`
(`DEV_PREMIUM_*`), then `$FULL_SEND_DIR/dev-credentials.md` (legacy `DEV_EMAIL` /
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
ui-walkthrough:  gh ✓ (ptrandev)  driver: browse ✓ (headed, for video)  RAM 32GB ✓  lane 0 (fe :3000, browse :6499)  persona: premium (e2e-agent@e2e.test)  video: opencap ✓ window-scoped desktop journey
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
  When you are not one, disclose it in the **top-level `body` of the review payload** (the summary body
  posted to `POST /repos/{o}/{r}/pulls/{n}/reviews`), never in an inline comment. One line, at the
  top: `Not a requested reviewer. Posting a UI walkthrough for context.`
- `draft == true` -> **reviewer mode skips** ("PR #N is a draft, re-run when it is ready").
  **Author mode proceeds** (invariant 10). Re-checked in Phase 8.
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
- Hit at an **older** head -> proceed. Scope discovery to `git diff <old-head>..<HEAD_SHA>` so the
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

- **No matching files -> exit early with a neutral note.** Not a UI PR, so nothing to walk.
- **`pages/**` -> route directly.** `pages/foo/bar.tsx` -> `/foo/bar`. `index.tsx` -> the directory
  root. `_app`/`_document` -> treat as *global* (walk the app's 3 highest-traffic routes instead,
  since a global change affects everything).
- **`components/**` -> walk importers transitively up to `pages/`.** grep for the component's
  import specifier, follow re-exports, stop at the first `pages/` file. A component with no page
  ancestor (dead code, or only used in tests) -> note it. **Never** invent a route.
- **Dynamic segments (`[id].tsx`): never construct the URL.** Navigate to the parent list page and
  click the first row. A hand-built `/agents/123` 404s against per-run seeded emulator data, and a
  404 screenshot looks exactly like a real bug (invariant 2 violation waiting to happen).
- **Cap: 8 surfaces.** More than that -> walk the 8 with the largest diff and list the dropped
  routes in the report *and* the posted comment. Name any changed component the drop leaves with no
  route, because the cap then costs coverage and not only breadth.

**Diff size of a route** is the sum of `added + deleted` lines from
`gh pr diff "$PR" --repo "$REPO" --numstat` over **every changed file the route reaches**: the page
file plus each changed component in its transitive import graph (the graph the `components/**` rule
walks). A component shared by three pages counts its full numstat toward all three. Ties break by
route path, ascending, so the cap is deterministic across re-runs.

**Read [coverage.md](coverage.md) before Phase 4.** It owns the component ledger, the ladder that
reaches a component the default walk never mounts, the `--surfaces` semantics, and fixture
derivation. Carry the ledger to Phase 5a and Phase 9.

---

## Phase 4: boot the PR's code (evidence integrity)

**Read [stack.md](stack.md) before booting the stack.** It owns both boot procedures, the hold
spec, the host-environment scrub, backgrounding, pre-warm, login, the checkout-strategy
table, and the deference to `/review-pr`'s stack lifecycle. The two rules that decide everything else:

- **`--target=e2e`** (the default, and the only target unless a human typed otherwise): `yarn
  e2e:stack` held open by an injected hold spec, on the lane won in Phase 0. Local emulators,
  stubbed externals, seeded personas, deterministic.
- **`--target=dev`** (typed opt-in only, author + local + attended): `yarn agents-portal` against
  real atllas-dev. Richer data, dev overlays to suppress, no external stubbing, and real data in
  published shots. **Lane 0 only**, because `yarn agents-portal` has no port parameterization.

Three additions specific to this skill:

- **A `dev` run can reuse a running dev server**, only after asserting it serves *this branch*
  (`git rev-parse HEAD` == PR head **and** clean tree). Note in the comment that evidence came from a
  dev server, not the sealed stack. `yarn agents-portal` is **not** emulator-scoped and can point at
  real dev. An `e2e` run never reuses anything on its lane (invariant 6).
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
| **5a** | the screenshot matrix (surface × viewport × states) + the ledger mount probes | no |
| **5b** | the deterministic detectors | no |
| **5c** | one desktop user journey | **yes**, `CAN_VIDEO` only |

**Read [capture.md](capture.md) before capturing anything.** It owns all three passes, the sub-agent
delegation contract, and the detector set. The 5a+5b sub-agent is given that file and not this one.

---

## Phase 6: evaluate

**Read [evaluate.md](evaluate.md) before classing anything.** It owns both passes, the attribution
procedure, the numeric BLOCKER thresholds, the console-error ladder, and the judged pass. Only 6a
can produce a BLOCKER.

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
were linked rather than embedded. Capture at scale 1. Use retina for a hero shot only.

---

## Phases 8 and 9: post, report, teardown

**Read [post-and-report.md](post-and-report.md) before posting.** It owns the re-check gate, both
mode payloads, the two body templates, the local report format, and the teardown checklist.

Three rules from it that the earlier phases depend on, so they stay here too:

- **Re-check `draft` and `author` immediately before posting** (invariant 10), not just at discovery.
- **Post through `GH_TRANSPORT`** ([../shared/github-transport.md](../shared/github-transport.md)).
- **Teardown is the Phase 4 EXIT trap, and it runs whether or not the walkthrough succeeded.**

---

## Being called by another skill

**Read [embedded.md](embedded.md) when the invocation carries `--embedded`.** It owns the return
shape, the fields the caller must never synthesize, and the contract with `/review-pr` and
`/full-send`. Embedded mode posts nothing, so "only-verified-posts" stays enforced in the caller.

---

## Edge cases

Every edge case is decided in the phase that owns it. One case belongs to no phase: **the assets
ref grows server-side**. Prune it per [evidence-hosting.md](evidence-hosting.md) *Pruning*, which
owns that procedure.

---

## Running unattended

Runtime-agnostic by design (Phase 0 capability detection). Two homes, same skill:

- **Cloud routine**: piggyback on `/review-pr`'s routine (`review-pr/routine.md`), which installs the
  skills, the toolchains, and headless Chromium. **Nothing to configure:** the target is forced to
  `e2e` and its personas are seeded per run with credentials committed in the checkout. That is
  deliberate: the routine provisions skills by cloning the **public** repo, so a gitignored
  credential file is absent by construction, and a file-based credential path then disables
  every walkthrough in silence. Driver is headless Chromium with `args: ['--ssl-version-max=tls1.2']` (Phase 0).
- **Local Mac**: `/ui-walkthrough <PR#>` directly, or `/loop 2h /ui-walkthrough`. The target is
  `e2e` in both roles, on the first free lane, so a run never takes the `:3000` the operator's own
  dev server needs. Adds the OpenCap video. A `/loop` or `/schedule` run must export
  `UIW_UNATTENDED=1`, which sets `ATTENDED=0` and refuses `--target=dev` (Phase 0). Recording does
  **not** make a run attended, and does not occupy the machine: see [opencap.md](opencap.md).

The Phase 2 marker makes repeated runs safe: each picks up only PRs not yet walked at their current
head, and Phase 8's re-check closes the window where two overlapping runs both pass the gate.
