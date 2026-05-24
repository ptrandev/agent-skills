---
name: full-send
description: |
  End-to-end feature workflow: Linear ticket → implement → Codex + Gemini review →
  commit → draft PR → Copilot review → address all threads → UI screenshots.
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

## Phase 5 — Codex Review

Run `/codex review` via the Skill tool.

For each finding:
- **Bug / correctness / security / edge case** → fix it, commit as `fix(<scope>): address Codex review findings`.
- **Style / preference / nitpick** → skip; note why.
- **Pre-existing / false positive** → skip; note why.

---

## Phase 6 — Gemini Review

Run `/gemini review` via the Skill tool. Apply the same triage as Phase 5.

If fixes were made, commit as `fix(<scope>): address Gemini review findings`.

---

## Phase 7 — PR

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

Then request Copilot:
```bash
PR_NUMBER=$(gh pr view --json number --jq '.number')
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
gh api repos/$REPO/pulls/$PR_NUMBER/requested_reviewers \
  --method POST \
  --field 'reviewers[]=Copilot'
```

---

## Phase 8 — Copilot Review

Poll every 60 seconds, up to 10 minutes:

```bash
for i in $(seq 1 10); do
  COUNT=$(gh api repos/$REPO/pulls/$PR_NUMBER/reviews \
    --jq '[.[] | select(.user.login | startswith("copilot"))] | length')
  [ "$COUNT" -gt 0 ] && echo "DONE" && break
  echo "Waiting for Copilot ($i/10)..."
  sleep 60
done
```

When the review arrives (or after timeout):

1. Fetch inline comments: `gh api repos/$REPO/pulls/$PR_NUMBER/comments`
2. For each comment: fix if actionable, otherwise explain why not.
3. Reply to every comment:
   ```bash
   gh api repos/$REPO/pulls/comments/$COMMENT_ID/replies \
     --method POST --field body="<response>"
   ```
4. Resolve every thread via GraphQL:
   ```bash
   gh api graphql -f query='mutation {
     resolveReviewThread(input:{threadId:"$THREAD_ID"}) {
       thread { isResolved }
     }
   }'
   ```
5. If any fixes were made, commit as `fix(<scope>): address Copilot review findings` and push.

If Copilot doesn't respond within 10 minutes, note the timeout and continue.

---

## Phase 9 — Screenshots

Skip if no files under `apps/agents-portal/src/pages/` or `apps/agents-portal/src/components/` were modified.

### Step 9a — Ensure the dev environment is running

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

### Step 9b — Open a dedicated browser session and log in

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

### Step 9c — Take screenshots

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

### Step 9d — Tear down

If this skill started the dev server (tracked via `$DEV_PID`), leave it running — the user may want to inspect the UI. Do not kill it.

---

## Phase 10 — Done

Report:
- PR URL
- All commits on this branch (`git log master..HEAD --oneline`)
- Screenshot paths (if any), with a note that the user should upload them to the PR
- Anything skipped and why (pre-existing errors, skipped review findings, Copilot timeout)
