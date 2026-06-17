---
name: full-send
description: |
  End-to-end feature workflow: Linear ticket → implement → /phillip self-review →
  commit → draft PR → automated bot review (Copilot and/or Gemini Code Assist) →
  address all threads → UI screenshots.
  Zero stops. Use with /full-send <TICKET-ID> or just /full-send.
---

# full-send

Takes a ticket from nothing to a fully-reviewed draft PR in one shot.

## Input

`$ARGS` may contain a ticket ID (e.g. `AP-1234`). If not present, ask for it once before starting.

---

## Phase 0 — Ticket

1. Fetch the ticket from Linear using the Linear MCP.
2. Extract: title, description, acceptance criteria.
3. Assign the ticket to the current user and set status to **In Progress**.

---

## Phase 1 — Branch

Check the current branch. If it's `master`/`main` or unrelated, create a new branch named after the ticket ID (preserve original casing per CLAUDE.md):

```bash
git checkout -b $TICKET_ID
```

If the branch already exists, switch to it (this is a resume).

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

---

## Phase 8 — Screenshots

Skip if no files under `apps/agents-portal/src/pages/` or `apps/agents-portal/src/components/` were modified.

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

### Step 8c — Take screenshots

Create the output directory:

```bash
mkdir -p /tmp/full-send-$TICKET_ID
```

Navigate to each page affected by the ticket and capture:

- The main page showing the new feature
- Any modal or dialog (trigger it, screenshot, close)
- Any audit/activity log entry if applicable

Use `prettyscreenshot` for clean full-page captures:

```bash
$B goto http://localhost:3000/<affected-path>
sleep 2
$B prettyscreenshot /tmp/full-send-$TICKET_ID/01-feature-page.png

# For modals: open them, screenshot, then close
$B click '[data-testid="<trigger-button>"]'
sleep 1
$B prettyscreenshot /tmp/full-send-$TICKET_ID/02-modal-open.png
```

After all screenshots are taken, use the Read tool on each PNG so they appear inline in the conversation.

### Step 8d — Tear down

If this skill started the dev server (tracked via `$DEV_PID`), leave it running — the user may want to inspect the UI. Do not kill it.

---

## Phase 9 — Done

Report:
- PR URL
- All commits on this branch (`git log master..HEAD --oneline`)
- Which bots reviewed (Copilot, Gemini Code Assist, both, or neither) and how their threads were handled
- Screenshot paths (if any), with a note that the user should upload them to the PR
- Anything skipped and why (pre-existing errors, skipped review findings, no automated review landed within the timeout)
