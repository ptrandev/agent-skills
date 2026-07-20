---
name: full-send
description: |
  End-to-end feature workflow: Linear ticket (or raw idea) → implement (size-adaptive:
  small tickets single-pass, large ones decompose into a Ralph-style one-task-per-iteration
  loop to avoid context rot) → /phillip self-review → commit → draft PR → automated bot review
  (Copilot and/or Gemini Code Assist) → address all threads → UI screenshots + walkthrough video.
  Autonomous (zero stops) by default; opt into an interactive grill with
  /full-send interactive <TICKET-ID>, or force the loop with /full-send loop <TICKET-ID>.
  Use with /full-send <TICKET-ID>, just /full-send, or /full-send <free-text idea>.
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
   - `loop` (orthogonal — may combine with any of the above) → force the Phase 3B Ralph loop
     regardless of size. Without it, the implement path is size-gated in Phase 3.0.
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

**When the up-front grill (Phase 0.5) runs.** The grill is *the* alignment stop. It runs when
**either**:

- the run is **interactive** (the keyword was passed), **or**
- the input is a **raw idea/spec** (no ticket ID) **and a human is present to answer** — a raw idea
  is the highest-ambiguity input, with no human-authored ticket to anchor on, so it earns one
  alignment pass even in autonomous mode.

It is **skipped** — falling back to infer-and-record-Assumptions — for a real ticket in autonomous
mode (the ticket already carries the spec), or for any **unattended/headless** run (no human to
answer, e.g. `claude -p` on a schedule).

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

Before doing any work, check the tools this run will use and print a **readiness summary**, so
missing optional tooling surfaces now instead of 20 minutes into Phase 8.

**Required** (if any is missing, stop and say so clearly — the run can't complete without it):
- `gh` CLI, authenticated (`gh auth status`) — needed for the PR and bot review.
- Linear MCP available — needed to fetch/create/update the ticket.
- The `browse` binary (see Phase 8b) — only required if the change touches UI and screenshots are expected.

**Optional** (note what's missing and how to enable it, then continue — these degrade gracefully):
- **OpenCap** (walkthrough video): `command -v opencap` and `opencap config doctor`. If missing →
  video will be skipped. To enable: install OpenCap and run `opencap login` once.
- **Skill dependencies** (`/grilling`, and the Phase 5 `/phillip` + its `/codex` + `/gemini`
  reviewers): **auto-installed when missing**, with any CLI auth walked through interactively — see
  "Skill dependencies — auto-install & setup" just below.

Print a compact summary, e.g.:

```
Preflight:  gh ✓   Linear ✓   browse ✓   phillip ✓   grilling ✓   codex ✓   gemini ✗ (CLI ok, needs GEMINI_API_KEY → /phillip runs Claude+Codex)   OpenCap ✗ (run `opencap login` to enable video)
```

### Skill dependencies — auto-install & setup

full-send leans on skills that may not be installed yet. **Install the ones that are missing** (the
installs are idempotent — a present dep's check is a no-op), and for the ones that wrap an external
CLI needing a human login, **walk the user through auth when attended**, or note-and-degrade when
headless. The split:

- **Skill install** (plugin add, git clone, symlink) → non-interactive; fine to run even headless.
- **External-CLI install + auth** (`gemini`, `codex` logins) → needs a human. **Attended:** walk
  through the exact steps and wait for the user. **Headless:** note the gap and let `/phillip`
  degrade (down to Claude-only) rather than blocking — a missing reviewer CLI is a note, never a
  bail-out.

| Dep | When needed | Detect | Install if missing | External CLI + auth |
|-----|-------------|--------|--------------------|---------------------|
| **`/grilling`** (mattpocock plugin) | grill will run | `grilling` in available skills | `claude plugin marketplace add mattpocock/skills` → `claude plugin install mattpocock-skills@mattpocock`, then `/setup-matt-pocock-skills` once per repo | none — if install fails, fall back to inline clarification Q&A |
| **`/phillip`** (ptrandev) | always (Phase 5) | `phillip` in available skills | symlink from the repo: `ln -s ~/Git/claude-skills/phillip ~/.claude/skills/phillip` (clone `https://github.com/ptrandev/claude-skills.git` → `~/Git/claude-skills` first if the repo is absent) | none directly; drives `/gemini` + `/codex` below. Full Mac provisioning: `docs/phillip-agent-setup.md` in that repo |
| **`/gemini`** (ptrandev) | always (via `/phillip`) | `gemini` in available skills | same symlink pattern as `/phillip` | CLI `gemini`: `npm install -g @google/gemini-cli`. **Auth (API-key only — no OAuth):** set `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) in `~/.zshenv`, and add `security.auth.selectedType: "gemini-api-key"` to `~/.gemini/settings.json` |
| **`/codex`** (garrytan/gstack) | always (via `/phillip`) | `codex` in available skills | `git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup` (the `./setup` step may prompt — attended) | CLI `codex`: `npm install -g @openai/codex` then `codex login` (interactive; confirm the exact steps via `codex --help` or the skill's own docs) |

If `/phillip` itself can't be installed → skip Phase 5 and flag prominently on the PR and Done
summary that **no self-review ran** (a notable quality gap).

**Mode behavior:** Print the summary and proceed — missing optional tools skip their features,
missing skills auto-install silently. Only pause (attended) to walk through a missing
`gemini`/`codex` auth; headless never pauses (note the gap, let `/phillip` degrade). If the grill
will run, fold this summary into that interaction. The operative OpenCap gate is later at Phase 8b.1.

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
- **A `fix_plan.md` exists under `/tmp/full-send-$TICKET_ID/`** → the implement step took the
  Phase 3B loop path; resume it by re-reading `fix_plan.md` + `notes.md` and continuing from the
  first unchecked task. Don't restart the decomposition or redo checked tasks.

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
4. Handling of the derived acceptance criteria depends on whether the grill (Phase 0.5) will run
   (see "When the up-front grill runs"):
   - **Grill will run** → treat the AC as **provisional** and finalize it during the grill.
   - **Grill skipped** → keep the inferred AC and record everything you inferred in an
     **Assumptions** block (carry it to the PR body in Phase 6 and the Done summary in Phase 9).

---

## Phase 0.5 — Up-front alignment grill

Run this phase when the grill triggers (see "When the up-front grill runs"); otherwise skip it and
fall back to infer-and-record-Assumptions. When it runs, before writing any code:

1. Invoke `/grilling` via the Skill tool, scoped to this ticket/idea — interrogate edge cases,
   scope boundaries, data shapes, non-goals, and any unclear acceptance criteria until you are
   confident you understand exactly what to build. (If `/grilling` couldn't be installed in
   Preflight, run the inline clarification Q&A fallback instead — same goal, no skill.)
2. Fold the answers back into the Linear ticket: update the description and acceptance criteria
   (Linear MCP update tool) so the ticket reflects the clarified spec.
3. State the resulting implementation plan inline (same numbered-list format as Phase 2) and get
   a single explicit go-ahead.

**This is the one and only stop.** After the go-ahead, run autonomously through Phase 9 exactly
like the default flow — no further per-phase checkpoints.

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

Full-send implements one of two ways depending on the size of the change. Small tickets run in a
**single pass** (no loop overhead); larger tickets decompose into a **Ralph-style loop** — one
task per fresh sub-context — so no single context window ever carries the whole feature and focus
doesn't rot as the diff grows.

### Phase 3.0 — Size assessment (pick the path)

Judge the scope from the Phase 2 plan:

- **Single-pass (3A)** when the change is small enough to hold in one focused context without rot:
  roughly ≤ 3–4 files, a single layer, or one cohesive acceptance criterion.
- **Loop (3B)** when the change spans multiple layers (types → sdk → api → frontend → ui) or many
  files, or the ticket has several independent acceptance criteria.

`/full-send loop <TICKET-ID>` forces 3B regardless of size; a trivial change never needs it.
Record the chosen path in one line so a resume (see Resume) knows which way the run went.

### Standing rules (both paths)

Every implementation task — a 3A single pass or one 3B loop iteration — follows these. Follow all
conventions in CLAUDE.md and CLAUDE.local.md.

- Read every file before editing it.
- **Search before assuming something isn't implemented** — ripgrep silence ≠ absent.
- Full implementations — **no placeholders or TODOs.**
- Never add **features or abstractions** beyond what the ticket/task requires.
- **Opportunistic cleanup is allowed — within the blast radius.** When you're already editing a
  function or file, you may DRY it and raise its quality (extract a duplicated helper, tighten a
  type, delete dead code, clarify a name) — but only for code the change already touches, only when
  it's low-risk and covered by tests, and without materially widening the diff. Anything bigger, or
  in code this change doesn't touch, stays a **surfaced note** (a Linear follow-up or a PR comment),
  per CLAUDE.md's "stay in scope, but surface smells." The line: clean what you're standing on,
  don't wander off to refactor the neighbourhood.
- When modifying a shared package (sdk, privs, common, ui), rebuild it: `cd packages/<name> && yarn build`.
- Add `data-testid` attributes to every new interactive element.
- **Cover the new behavior with tests.** Add/extend tests for the code paths this ticket
  introduces (acceptance criteria = the checklist), following the workspace's existing test
  patterns. If a touched area has no test infrastructure, note it rather than scaffolding a
  framework from scratch.

### Phase 3A — Single-pass (small change)

Execute the Phase 2 plan directly following the standing rules above, then continue to Phase 4.
Use TaskCreate to track sub-steps; mark each complete as you finish it.

### Phase 3B — Ralph loop (large change)

Don't hold the whole feature in one context. Decompose it into an ordered task list on disk, then
work **one task per fresh sub-context**, committing each unit as you go.

**Bounded, not free-reign.** This is a large existing codebase, so every task stays within the
ticket's scope: opportunistic cleanup is welcome *within the blast radius* (standing rules), but no
repo-wide or out-of-scope rewrites, and never `git reset --hard` the branch. (The Ralph technique
assumes it can rewrite anything to recover — a greenfield assumption that does not hold here.
Recovery is a bounded repair-or-bail, per step 4 below.)

**Run state — on disk, not in context.** Under the run dir `/tmp/full-send-$TICKET_ID/`:

- `fix_plan.md` — the ordered, checkboxed task list; the single source of truth for what's left.
- `notes.md` — learnings carried across iterations: build/test commands discovered, gotchas,
  decisions, and any follow-on work surfaced mid-build.
- `spec.md` — the ticket title, description, and acceptance criteria, so a fresh sub-context
  re-hydrates from disk instead of from the transcript.

```bash
mkdir -p /tmp/full-send-$TICKET_ID
```

**Decompose (`fix_plan.md`).** Turn the Phase 2 plan into discrete, independently committable,
independently verifiable tasks ordered by dependency (types → sdk → api → frontend state → ui →
tests). Each task is *one thing* — a cohesive unit a blank context can finish, verify, and commit
without needing the others in-context. Aim for ~30-minute chunks. A unit's tests live in the same
task as the unit (or the immediately following task), so nothing merges unexercised.

```markdown
# AP-1234 — <title>

- [ ] 1. Add `Foo` types to packages/sdk (types only)
- [ ] 2. API: POST /foo endpoint + service + test
- [ ] 3. Frontend state: useFoo hook + SDK wiring
- [ ] 4. UI: FooModal component (+ data-testid) + test
- [ ] 5. Wire FooModal into FooPage
```

**The loop.** The orchestrator (this session) holds only `fix_plan.md` + progress — never the
accumulated implementation detail. Until every task is checked:

1. Pick the **single** top unchecked task in `fix_plan.md`.
2. Dispatch it to a **fresh subagent** (Agent tool, inherit the main model — this is substantive
   coding work) with: the one task, the paths to `fix_plan.md` / `notes.md` / `spec.md`, and the
   standing rules above. The subagent starts blank on purpose; it reads state from disk, not from a
   rotting transcript.
3. The subagent does **exactly that one task**, following the standing rules above (including
   blast-radius cleanup), plus these loop-specific steps:
   - **Backpressure:** typecheck + lint the touched workspace and run the tests this task
     added/touched. Must be green before committing.
   - Commit just this unit: `git add <specific files — never git add .>` then
     `git commit -m "<type>(<scope>): <task description>"`. If the task did opportunistic cleanup
     alongside the feature work, a separate `refactor(<scope>): ...` commit keeps the unit readable.
   - Append anything learned to `notes.md`; check off the task in `fix_plan.md`.
   - Return a **short structured summary**: task, files touched, verify result, commit SHA, and
     anything discovered (new tasks to append, a surfaced smell, or a blocker) — not the full diff.
4. **Verify the summary** (main-loop pass, per CLAUDE.md): confirm the task is actually checked off
   and committed, fold any newly-discovered tasks into `fix_plan.md`, and continue. If the subagent
   reported a blocker or its task couldn't be made green, retry **once** with the failure recorded
   in `notes.md` (Ralph "tuning"); if it still fails, **bail out** (see Bail-out) — leave the branch
   intact, don't reset it.

Per-task commits are intentional: the history stays revertible unit-by-unit and human-reviewable,
and a crash mid-loop resumes cleanly from the first unchecked task in `fix_plan.md` (see Resume).

When `fix_plan.md` is fully checked, the feature is implemented across a series of commits —
continue to Phase 4 for the final full-suite verification sweep.

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
skip** pre-existing or unrelated failures. Confirm the Phase 3 tests actually run and pass (a green
suite that never exercises the new path doesn't count).

If typecheck, lint, or tests **cannot be made green** and the failure is caused by this change,
**bail out** (see Bail-out, Modes) rather than pushing broken code toward a PR.

Commit any remaining uncommitted work. **Single-pass (3A):** this is where the change is committed
— `feat(<scope>): <ticket title>`. **Loop (3B):** the units were already committed per-task during
the loop, so only commit stragglers from this final sweep (e.g. a test fix the full-suite run
surfaced); don't squash the per-task history.

```bash
git add <specific files — never git add .>
git commit -m "feat(<scope>): <ticket title>"   # 3A; or fix(<scope>): <what the sweep fixed> for 3B stragglers
```

---

## Phase 5 — Self-Review (`/phillip`)

Run `/phillip` via the Skill tool. This single step replaces the old separate Codex and Gemini passes: `/phillip` runs a multi-round adversarial review with three independent reviewers (Claude + Codex + Gemini), verifies every finding against the real code path, implements the genuine HIGH/MEDIUM fixes itself, rejects false positives with a written reason, and loops until a clean round. It writes a report to `~/.claude/plans/phillip-<branch>-<date>.md`.

Operative gate (mirrors Preflight's "Skill dependencies"): if `/phillip` couldn't be installed, **skip this phase** and flag prominently on the PR and Done summary that **no self-review ran**. If `/phillip` is present but a reviewer CLI (`gemini`/`codex`) is unauthenticated, let `/phillip` degrade to the reviewers that are available (down to Claude-only) — don't block.

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

The operative video gate (the headed browse session OpenCap records is now up). If unavailable,
degrade to screenshots-only — do **not** block:

```bash
if command -v opencap >/dev/null 2>&1 && opencap config doctor >/dev/null 2>&1; then
  OPENCAP_OK=1; echo "OpenCap ready — will record a walkthrough video."
else
  OPENCAP_OK=0; echo "OpenCap unavailable (not installed / not logged in) — screenshots only."
fi
```

### Step 8c — Record a walkthrough while taking screenshots

Create the output directory:

```bash
mkdir -p /tmp/full-send-$TICKET_ID
```

Start recording before the walkthrough so the same flow yields both screenshots and video. Prefer
targeting the browser surface over full-screen (`opencap list-windows` / `list-displays` →
`--window`/`--display`, or `--pick`); confirm the exact flag via `opencap --help` on first use.

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
- Alignment context (per "When the up-front grill runs"):
  - **Grill ran:** the clarifications captured during the Phase 0.5 grill.
  - **Grill skipped:** the **Assumptions** block recorded in Phase 0 for anything inferred.
- Anything skipped and why (pre-existing errors, skipped review findings, no automated review landed within the timeout)
