---
name: full-send
description: |
  End-to-end feature workflow: Linear ticket (or raw idea) → implement →
  /phillip self-review → commit → draft PR → automated bot review (Copilot and/or
  Gemini Code Assist) → address all threads → UI screenshots + walkthrough video.
  Autonomous (zero stops) by default; opt into an interactive grill with
  /full-send interactive <TICKET-ID>. Use with /full-send <TICKET-ID>, just
  /full-send, or /full-send <free-text idea>.
---

# full-send

Takes a ticket — or a raw idea — from nothing to a fully-reviewed draft PR in one shot.

## Input

`$ARGS` may contain a leading **mode keyword**, then either a ticket ID (e.g. `AP-1234`) or
free-text describing the work. Parse them in this order:

1. **Mode keyword** (optional, first token):
   - `interactive` / `ask` / `careful` → **interactive mode** (front-load a grill, see Phase 0.5).
   - `auto` → explicit **autonomous mode** (the default; this alias exists only for symmetry).
   - No keyword → **autonomous mode**.
2. **Remaining `$ARGS`:**
   - A ticket ID (e.g. `AP-1234`) → fetch it (Phase 0).
   - Free-text with no ticket ID → treat as a **raw idea/spec** and synthesize a ticket (Phase 0).
   - Empty → ask once for a ticket ID or an idea before starting.

### Modes

Two modes, encoding the global working principle (*ask when interactive; pick the most reasonable
interpretation and record it when unattended*):

- **Autonomous (default)** — zero stops. For anything ambiguous, pick the most reasonable
  interpretation, proceed, and record it in an **Assumptions** block carried onto the PR.
- **Interactive** — exactly **one** stop: a thorough up-front grill (Phase 0.5) that removes
  ambiguity before any code is written. After the grill's plan is approved, the run is autonomous
  through Phase 9, identical to the default flow.

### Bail-out (the one exception to zero-stops)

"Zero stops" means *don't pause for preferences* — it does **not** mean ship broken code. Stop
and report instead of proceeding when the run hits an **unrecoverable** state, specifically:

- Typecheck, lint, or tests cannot be made green after a genuine fix attempt, and the failure is
  caused by this change (not pre-existing).
- The implementation cannot satisfy the acceptance criteria (the ticket is wrong, blocked, or
  needs a decision only a human can make).
- A `git` rebase/push conflict can't be resolved cleanly.

On bail-out: commit/stash what's safe, leave the branch intact (so it can be resumed), and report
exactly where it stopped, why, and what's needed to continue. Do **not** open or finalize a PR
around known-broken code. A trivial/blocked ambiguity is not a bail-out — record an assumption and
keep going.

---

## Preflight — dependency check (runs first)

Before doing any work, check the tools this run will use and print a **readiness summary** up
front. The point is early visibility: anything optional that's missing is surfaced now — at
second zero — so the user can install it *if they want that feature*, rather than discovering the
gap 20 minutes later at Phase 8.

**Required** (if any is missing, stop and say so clearly — the run can't complete without it):
- `gh` CLI, authenticated (`gh auth status`) — needed for the PR and bot review.
- Linear MCP available — needed to fetch/create/update the ticket.
- The `browse` binary (see Phase 8b) — only required if the change touches UI and screenshots are expected.

**Optional** (note what's missing and how to enable it, then continue — these degrade gracefully):
- **OpenCap** (walkthrough video): `command -v opencap` and `opencap config doctor`. If missing →
  video will be skipped. To enable: install OpenCap and run `opencap login` once.
- **`/grilling` skill** (interactive mode only): confirm `grilling` is in the available skills.
  If missing and the run is interactive → fall back to an inline clarification Q&A. To enable:
  install the grilling skill.

Print a compact summary, e.g.:

```
Preflight:  gh ✓   Linear ✓   browse ✓   OpenCap ✗ (run `opencap login` to enable video)   grilling ✓
```

**Mode behavior:**
- **Autonomous (default):** print the summary and proceed immediately — **do not wait** (zero
  stops). Missing optional tools simply mean those features are skipped this run; the early print
  still gives the user a chance to interrupt and install if they care.
- **Interactive:** present the summary as part of the up-front interaction, so the user can fix
  any optional gaps before the Phase 0.5 grill begins.

> The operative OpenCap gate still runs at Phase 8b.1 (it sets `OPENCAP_OK` right before
> recording, after the headed session is up). This preflight is the early-warning pass.

---

## Resume — idempotency check (runs after Preflight)

This skill is safe to re-run on the same ticket (it often crashes or is interrupted mid-way — e.g.
during Phase 7's multi-minute poll). Before doing work, establish what's already done and **skip
completed phases** rather than redoing them. Determine state from the world, not memory:

```bash
# Is there already a branch / PR for this ticket?
git rev-parse --verify "$TICKET_ID" 2>/dev/null && echo "branch exists"
gh pr list --head "$TICKET_ID" --json number,url,isDraft --jq '.[0]' 2>/dev/null   # existing PR?
```

Apply these skip rules:
- **Ticket already In Progress / assigned** → don't reassign (Phase 0 is a no-op).
- **Branch exists with commits** → resume on it; don't recreate it (Phase 1).
- **PR already open** → reuse its number; skip `gh pr create` (Phase 6), go straight to processing
  reviews/CI (Phases 7+).
- **Bot threads already resolved / commits already pushed** → don't duplicate replies or commits.

The guiding rule: every phase should check "is this already true?" and become a no-op if so. When
in doubt, prefer reading current state (`git`, `gh`, Linear) over assuming a fresh run.

---

## Phase 0 — Ticket / Spec

**If a ticket ID was supplied:**

1. Fetch the ticket from Linear using the Linear MCP.
2. Extract: title, description, acceptance criteria.
3. Assign the ticket to the current user and set status to **In Progress**.

**If a raw idea/spec was supplied instead (no ticket ID):** synthesize a ticket, then proceed
as if it had been fetched:

1. Derive a concise **title**, a **description**, and an explicit **acceptance-criteria** list
   from the idea.
2. Create the Linear issue via the same Linear MCP used for fetch/update (the create-issue tool).
3. Assign it to the current user and set status to **In Progress**.
4. Mode-specific handling of the derived acceptance criteria:
   - **Autonomous:** keep the inferred AC and record everything you inferred in an
     **Assumptions** block (carry it to the PR body in Phase 6 and the Done summary in Phase 9).
   - **Interactive:** treat the AC as provisional — finalize it after the grill (Phase 0.5).

---

## Phase 0.5 — Interactive grill (interactive mode only)

**Skip this entire phase in autonomous mode.** In interactive mode, before writing any code:

1. Invoke `/grilling` via the Skill tool, scoped to this ticket/idea — interrogate edge cases,
   scope boundaries, data shapes, non-goals, and any unclear acceptance criteria until you are
   confident you understand exactly what to build.
2. Fold the answers back into the Linear ticket: update the description and acceptance criteria
   (Linear MCP update tool) so the ticket reflects the clarified spec.
3. State the resulting implementation plan inline (same numbered-list format as Phase 2) and get
   a single explicit go-ahead.

**This is the one and only stop in interactive mode.** After the go-ahead, run autonomously
through Phase 9 exactly like the default flow — no further per-phase checkpoints.

---

## Phase 1 — Branch

Always branch from an **up-to-date base** so you don't build on a stale `master` and hit avoidable
conflicts later. Detect the base branch (`master`/`main`), fetch it, and branch from the fresh ref:

```bash
BASE=$(git remote show origin | sed -n 's/.*HEAD branch: //p')   # usually master
git fetch origin "$BASE"
```

If the current branch is the base or unrelated, create a new branch (named after the ticket ID,
preserving original casing per CLAUDE.md) from the freshly fetched base:

```bash
git checkout -b $TICKET_ID "origin/$BASE"
```

If the branch already exists, switch to it — **this is a resume** (see the Resume section); rebase
it onto the latest base if it has diverged, and stop to report if the rebase conflicts rather than
forcing through it.

---

## Phase 2 — Plan

Check for an existing plan file in `~/.claude/plans/` referencing this ticket ID.

- **Plan exists:** read it and proceed.
- **No plan:** scan the codebase, identify all files to create or modify, and state the implementation plan inline as a numbered list (types → SDK → API → frontend state → UI → tests). Do not write a file. Do not wait for approval — proceed immediately.

---

## Phase 3 — Implement

Execute the plan. Follow all conventions in CLAUDE.md and CLAUDE.local.md.

- Read every file before editing it.
- Never add abstractions or features beyond what the ticket requires.
- When modifying a shared package (sdk, privs, common, ui), rebuild it: `cd packages/<name> && yarn build`.
- Add `data-testid` attributes to every new interactive element.
- **Cover the new behavior with tests.** Add or extend tests that exercise the code paths this
  ticket introduces (the acceptance criteria are the checklist), following the workspace's
  existing test patterns and file conventions. If a touched area genuinely has no test
  infrastructure, note that rather than scaffolding a framework from scratch. Screenshots prove it
  renders; tests prove it works.
- Use TaskCreate to track sub-steps; mark each complete as you finish it.

---

## Phase 4 — Verify

Run typechecks and lint. Fix all errors before continuing.

```bash
# API
cd apps/api && yarn ci:typecheck 2>&1 | tail -30

# Frontend
cd apps/agents-portal && yarn lint 2>&1 | tail -30
```

If a typecheck error is pre-existing and unrelated to this ticket, note it and do not fix it.

Then run the test suite for each affected workspace. Detect the workspace(s) from the changed
files and run whatever test script the package actually defines (check its `package.json`
`scripts` — skip with a note if it has no test script):

```bash
# API
cd apps/api && yarn test 2>&1 | tail -30

# Frontend
cd apps/agents-portal && yarn test 2>&1 | tail -30
```

Treat failures like typecheck errors: **fix** test failures caused by this change; **note and
skip** pre-existing or unrelated failures rather than fixing them. Confirm the new tests written
in Phase 3 actually run and pass (a green suite that never exercises the new path doesn't count).

If typecheck, lint, or the tests **cannot be made green** after a genuine fix attempt and the
failure is caused by this change, **bail out** per the Bail-out rule (Modes section): stop, leave
the branch intact, and report — do not push known-broken code toward a PR.

Commit everything:
```bash
git add <specific files — never git add .>
git commit -m "feat(<scope>): <ticket title>"
```

---

## Phase 5 — Self-Review (`/phillip`)

Run `/phillip` via the Skill tool. This single step replaces the old separate Codex and Gemini passes: `/phillip` runs a multi-round adversarial review with three independent reviewers (Claude + Codex + Gemini), verifies every finding against the real code path, implements the genuine HIGH/MEDIUM fixes itself, rejects false positives with a written reason, and loops until a clean round. It writes a report to `~/.claude/plans/phillip-<branch>-<date>.md`.

- Let it run to completion. It applies the HIGH/MEDIUM fixes directly to the working tree (and may commit them itself).
- If it left any fixes uncommitted, commit them — `git add <specific files — never git add .>` then `git commit -m "fix(<scope>): address /phillip self-review findings"`. Skip the commit if it changed nothing.
- Do not stop for the verdict (zero stops) — carry it forward to Phase 9 (Done):
  - **"Ready for PR"** → proceed normally.
  - **"Needs human review — cap hit, ..."** or any verdict with unresolved HIGH/MEDIUM → proceed, but record the unresolved items and the report path so the Done summary surfaces them on the PR.

For a small or low-risk diff, `/phillip quick` is acceptable (it auto-scales down on trivial diffs anyway).

---

## Phase 6 — PR

Read `CLAUDE.local.md` for the `username` (assignee). Read `.github/PULL_REQUEST_TEMPLATE.md` for the body format.

The PR title must come from the Linear ticket title — do not invent or summarise it.

```bash
gh pr create \
  --draft \
  --title "[$TICKET_ID] $TICKET_TITLE" \
  --body "$(cat <<'EOF'
<filled-in PR template>
EOF
)" \
  --reviewer ptrandev \
  --reviewer skowalskidev \
  --reviewer MidnightTinge \
  --assignee <username from CLAUDE.local.md> \
  --label "Pending Code Review"
```

Then request the automated reviewers:
```bash
PR_NUMBER=$(gh pr view --json number --jq '.number')
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')

# Copilot must be requested explicitly, and only reviews when usage is available.
# This call can error or be silently dropped when Copilot is over its usage limit —
# that is not fatal; Gemini still reviews.
gh api repos/$REPO/pulls/$PR_NUMBER/requested_reviewers \
  --method POST \
  --field 'reviewers[]=Copilot' \
  || echo "Copilot request failed (likely usage limits) — Gemini Code Assist will still review."
```

**Gemini Code Assist needs no request.** It is a GitHub App that reviews every PR
automatically (it posts a review ~2 min after the PR opens), so it covers the case
where Copilot is rate-limited or otherwise unavailable. You do not — and cannot — add
it via `requested_reviewers`.

---

## Phase 7 — Automated Review (Copilot + Gemini)

Up to two bots may review. Their logins differ between the `reviews` API and the
inline-`comments` API, so match them exactly:

| Bot | Trigger | Review author (`reviews`) | Inline author (`comments`) | Thread author (GraphQL) |
|-----|---------|---------------------------|----------------------------|--------------------------|
| GitHub Copilot | Requested in Phase 6; reviews only when usage is available | `copilot-pull-request-reviewer[bot]` | `Copilot` | `copilot-pull-request-reviewer` |
| Gemini Code Assist | Automatic on every PR (~2 min) | `gemini-code-assist[bot]` | `gemini-code-assist[bot]` | `gemini-code-assist` |

Either, both, or (rarely) neither may land. **Do not block on Copilot specifically** —
when Copilot is rate-limited, Gemini is the fallback and usually arrives first. Process
whichever bot reviews are present.

### Step 7a — Wait for an automated review

```bash
# Matches both bots' review-author logins.
BOT_REVIEWS='.user.login=="copilot-pull-request-reviewer[bot]" or .user.login=="gemini-code-assist[bot]"'

# Poll up to 10 min for the first bot review (usually Gemini).
N=0
for i in $(seq 1 10); do
  N=$(gh api repos/$REPO/pulls/$PR_NUMBER/reviews \
    --jq "[.[] | select($BOT_REVIEWS) | .user.login] | unique | length")
  [ "$N" -gt 0 ] && break
  echo "Waiting for an automated review ($i/10)..."
  sleep 60
done

# One bot in but not the other → give the slower bot (usually Copilot) a short
# grace window before processing, in case both will review.
if [ "$N" = "1" ]; then
  for j in 1 2 3; do
    sleep 60
    N=$(gh api repos/$REPO/pulls/$PR_NUMBER/reviews \
      --jq "[.[] | select($BOT_REVIEWS) | .user.login] | unique | length")
    [ "$N" -ge 2 ] && break
  done
fi

gh api repos/$REPO/pulls/$PR_NUMBER/reviews \
  --jq "[.[] | select($BOT_REVIEWS) | .user.login] | unique | \"Reviewed by: \" + join(\", \")"
```

If neither bot responds within the window, note the timeout and continue — do not stop.

### Step 7b — Read the review summaries

Each bot posts a summary in its review body — read them for feedback that isn't tied to
a specific line:

```bash
gh api repos/$REPO/pulls/$PR_NUMBER/reviews \
  --jq ".[] | select($BOT_REVIEWS) | \"### \(.user.login)\n\(.body)\n\""
```

Gemini tags each inline finding with a severity badge (`high` / `medium` / `low`). Treat
HIGH and MEDIUM as actionable; LOW and praise/nit comments can be acknowledged and resolved.

### Step 7c — Address and resolve every bot thread

1. Fetch the bots' inline comments (note Copilot's inline author is `Copilot`, **not** its
   review login):
   ```bash
   gh api repos/$REPO/pulls/$PR_NUMBER/comments \
     --jq '.[] | select(.user.login=="Copilot" or .user.login=="gemini-code-assist[bot]") | {id, path, line, body}'
   ```
2. For each comment: fix if actionable, otherwise explain why not.
3. Reply to every comment:
   ```bash
   gh api repos/$REPO/pulls/comments/$COMMENT_ID/replies \
     --method POST --field body="<response>"
   ```
4. List the unresolved **bot** thread IDs (skip human-authored threads), then resolve each.
   Both bots create standard resolvable threads; in GraphQL their authors drop the `[bot]`
   suffix, so a regex matches both:
   ```bash
   OWNER=${REPO%/*}; NAME=${REPO#*/}
   gh api graphql -f query='
   query($owner:String!,$name:String!,$pr:Int!) {
     repository(owner:$owner,name:$name) {
       pullRequest(number:$pr) {
         reviewThreads(first:100) {
           nodes { id isResolved comments(first:1){ nodes { author { login } } } }
         }
       }
     }
   }' -F owner="$OWNER" -F name="$NAME" -F pr="$PR_NUMBER" \
     --jq '.data.repository.pullRequest.reviewThreads.nodes[]
           | select(.isResolved==false)
           | select(.comments.nodes[0].author.login | test("copilot|gemini-code-assist"))
           | .id'

   # Then resolve each thread id:
   gh api graphql -f query='mutation($id:ID!) {
     resolveReviewThread(input:{threadId:$id}) { thread { isResolved } }
   }' -F id="$THREAD_ID"
   ```
5. If any fixes were made, commit as `fix(<scope>): address automated review findings` and push.

### Step 7d — Ensure CI is green

Bot reviews are advisory; the PR's **CI checks** (build, tests, lint, type) are the real gate, and
a developer cares more that they pass than that a bot commented. After the last code push, wait
for the checks to settle:

```bash
# Waits for all required checks; exits non-zero if any fail.
gh pr checks "$PR_NUMBER" --watch --interval 30 || CI_FAILED=1
```

- **All green** → continue.
- **A check fails** → read its log, fix the cause, commit (`fix(<scope>): fix CI`), push, and
  re-watch. Loop until green or until the failure is genuinely unrecoverable.
- **Unrecoverable / failure is pre-existing & unrelated** → don't loop forever: note it, carry the
  red-check status to the Done summary so it's surfaced on the PR, and (if the failure is caused by
  this change) treat it as a **bail-out** rather than presenting the PR as ready.

If the repo has no CI configured, `gh pr checks` reports no checks — note that and move on.

---

## Phase 8 — Evidence (screenshots + video)

Skip if no files under `apps/agents-portal/src/pages/` or `apps/agents-portal/src/components/` were modified.

This phase produces two artifacts: clean **screenshots** of each affected surface, and a
continuous **walkthrough video** of the same flow recorded with [OpenCap](https://opencap.dev).
The video is **best-effort** — if OpenCap isn't installed or logged in, capture screenshots only
and never block the PR.

### Step 8a — Ensure the dev environment is running

Check which ports the stack needs and free any that are blocked:

```bash
# Ports used by agents-portal stack: 3000 (Next.js), 3001 (API)
for PORT in 3000 3001; do
  PIDS=$(lsof -ti :$PORT 2>/dev/null)
  if [ -n "$PIDS" ]; then
    echo "Killing processes on port $PORT: $PIDS"
    kill $PIDS 2>/dev/null || true
    sleep 1
  fi
done
```

Check if the dev server is already up:

```bash
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 --max-time 5 2>/dev/null || echo "000")
echo "localhost:3000 status: $HTTP_STATUS"
```

If status is not `200`:

1. Build any packages that are missing their `dist/` output (check `packages/*/dist` exists; build any that don't via `yarn turbo run build --filter=<name>`).
2. Start the full dev environment in the background and wait for it to be ready:

```bash
nohup yarn agents-portal > /tmp/full-send-$TICKET_ID/dev-server.log 2>&1 &
DEV_PID=$!
echo "Dev server PID: $DEV_PID"

# Wait up to 60 seconds for Next.js to be ready
for i in $(seq 1 12); do
  sleep 5
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 --max-time 3 2>/dev/null || echo "000")
  echo "Attempt $i: status=$STATUS"
  [ "$STATUS" = "200" ] && echo "READY" && break
done
```

If still not ready after 60 seconds, check `/tmp/full-send-$TICKET_ID/dev-server.log` for errors, fix any missing package builds, and retry once.

### Step 8b — Open a dedicated browser session and log in

Set up the browse binary:

```bash
_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
B=""
[ -n "$_ROOT" ] && [ -x "$_ROOT/.claude/skills/gstack/browse/dist/browse" ] && B="$_ROOT/.claude/skills/gstack/browse/dist/browse"
[ -z "$B" ] && B="$HOME/.claude/skills/gstack/browse/dist/browse"
echo "Browse binary: $B"
```

Disconnect any existing browse daemon and start a fresh headed session dedicated to screenshots:

```bash
$B disconnect 2>/dev/null || true
sleep 1
```

Read dev credentials from `~/.claude/skills/full-send/dev-credentials.md` and export them:

```bash
DEV_EMAIL="phillip+dev@atllas.com"
DEV_PASSWORD="Password!123"
DEV_URL="http://localhost:3000"
```

Navigate to the app and log in:

```bash
$B goto $DEV_URL
```

Check if a login form is present. If the app redirects to a login page:

```bash
$B snapshot -i 2>&1 | head -20
$B fill '[data-testid="email"], input[type="email"], input[name="email"]' "$DEV_EMAIL"
$B fill '[data-testid="password"], input[type="password"], input[name="password"]' "$DEV_PASSWORD"
$B click '[data-testid="sign-in-button"], button[type="submit"]'
sleep 3
$B url
```

Confirm the URL is no longer the login page before proceeding. If login fails (still on `/` or `/login`), check console errors and retry once.

### Step 8b.1 — OpenCap preflight (non-fatal)

OpenCap records the screen, so it needs a headed/desktop session — which is exactly what the
headed browse session above provides (it works locally on macOS; it cannot work in a truly
headless CI run). It also needs a one-time `opencap login` before its first use. Probe for it;
if it's unavailable, degrade to screenshots-only — do **not** block:

```bash
if command -v opencap >/dev/null 2>&1 && opencap config doctor >/dev/null 2>&1; then
  OPENCAP_OK=1
  echo "OpenCap ready — will record a walkthrough video."
else
  OPENCAP_OK=0
  echo "OpenCap unavailable (not installed or not logged in) — capturing screenshots only."
fi
```

> First-time setup: run `opencap login` once (interactive). If you see the "unavailable" message
> and want video, that login is the most likely missing step.

### Step 8c — Record a walkthrough while taking screenshots

Create the output directory:

```bash
mkdir -p /tmp/full-send-$TICKET_ID
```

If OpenCap is ready, start recording before the walkthrough so the **same** flow that produces
the screenshots also produces the video (the two stay in sync). Prefer targeting the browser
surface over full-screen — resolve a window/display with `opencap list-windows` /
`opencap list-displays` and pass `--window <id>` / `--display <id>`, or use `--pick` when
ambiguous. Confirm the exact target flag with `opencap --help` on first use.

```bash
[ "$OPENCAP_OK" = 1 ] && opencap record start --task "$TICKET_ID: $TICKET_TITLE"
```

Navigate to each page affected by the ticket and capture. **Don't just render each page —
exercise the happy path** (open the modal, submit the form, show the result) so the video proves
the feature works. Drop an OpenCap marker before each scene so the recording is navigable:

- The main page showing the new feature
- Any modal or dialog (trigger it, screenshot, close)
- Any audit/activity log entry if applicable

Use `prettyscreenshot` for clean full-page captures:

```bash
[ "$OPENCAP_OK" = 1 ] && opencap marker "Feature page"
$B goto http://localhost:3000/<affected-path>
sleep 2
$B prettyscreenshot /tmp/full-send-$TICKET_ID/01-feature-page.png

# For modals: open them, screenshot, then close
[ "$OPENCAP_OK" = 1 ] && opencap marker "Modal open"
$B click '[data-testid="<trigger-button>"]'
sleep 1
$B prettyscreenshot /tmp/full-send-$TICKET_ID/02-modal-open.png
```

Stop the recording once the walkthrough is complete, then resolve its artifacts:

```bash
if [ "$OPENCAP_OK" = 1 ]; then
  opencap record stop
  SESSION=$(opencap list --json 2>/dev/null | head -1)   # newest session id; confirm shape via `opencap list --help`
  opencap show "$SESSION"                                  # local file path
  VIDEO_LINK=$(opencap share "$SESSION" 2>/dev/null)       # shareable link (preferred for the PR)
  echo "Video: ${VIDEO_LINK:-see local path above}"
fi
```

> Optional polish, only if trivially available: `opencap trim "$SESSION" --start <ms> --end <ms>
> --save-as-copy` to clip dead air. Skip it if it adds any friction.

After all screenshots are taken, use the Read tool on each PNG so they appear inline in the conversation.

### Step 8d — Attach the evidence to the PR

Post the evidence directly onto the PR as a comment instead of leaving it for the user to upload
by hand. Embed the screenshots and link the video (the OpenCap share link is the simplest path;
fall back to the local file note if no link was produced):

```bash
gh pr comment "$PR_NUMBER" --body "$(cat <<EOF
## Walkthrough evidence

**Video:** ${VIDEO_LINK:-_(no OpenCap link — see attached/local recording)_}

Screenshots:
<one Markdown image embed or link per PNG in /tmp/full-send-$TICKET_ID/>
EOF
)"
```

> Screenshots: confirm the cleanest binary-attach path with `gh` on first use — dragging images
> into a comment renders inline; otherwise link them. The share link is the preferred default for
> the video; only fall back to uploading the local file if no link is available.

Record the comment URL — Phase 9 references it instead of asking the user to upload anything.

### Step 8e — Tear down

If this skill started the dev server (tracked via `$DEV_PID`), leave it running — the user may want to inspect the UI. Do not kill it.

---

## Phase 9 — Done

Close the Linear loop:
- Move the ticket to **In Review** (Linear MCP update).
- Post a comment on the Linear issue with the PR URL (and the OpenCap share link if there is one).

Report:
- PR URL
- All commits on this branch (`git log master..HEAD --oneline`)
- Which bots reviewed (Copilot, Gemini Code Assist, both, or neither) and how their threads were handled
- **CI status** (Step 7d): green, or which checks failed and how they were handled
- Evidence: link to the PR comment where the screenshots and walkthrough video are already
  attached (Phase 8d) — note the video link, or that video was skipped because OpenCap was unavailable
- Mode-specific context:
  - **Interactive:** the clarifications captured during the Phase 0.5 grill.
  - **Autonomous:** the **Assumptions** block recorded in Phase 0 for anything inferred.
- Anything skipped and why (pre-existing errors, skipped review findings, no automated review landed within the timeout)
