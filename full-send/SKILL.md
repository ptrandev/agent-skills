---
name: full-send
description: >
  End-to-end feature workflow: take a Linear ticket or a raw idea, implement it, self-review,
  open a PR, address every bot review thread, then capture UI evidence. Autonomous by default.
  Use with /full-send <TICKET-ID>, /full-send alone, or a free-text idea.
---

# full-send

Takes a ticket, or a raw idea, from nothing to a fully-reviewed draft PR in one shot.

## Input

`$ARGS` may contain a leading **mode keyword**, then either a ticket ID (e.g. `AP-1234`) or
free-text describing the work. Parse them in this order:

1. **Mode keyword** (optional, first token):
   - `interactive` / `ask` / `careful` → **interactive mode** (front-load a grill, see Phase 0.5).
   - `auto` → explicit **autonomous mode** (the default; this alias exists only for symmetry).
   - No keyword → **autonomous mode**.
   - `loop` (orthogonal, may combine with any of the above) → force the Phase 3B Ralph loop
     regardless of size. Without it, the implement path is size-gated in Phase 3.0.
2. **Remaining `$ARGS`:**
   - A ticket ID (e.g. `AP-1234`) → fetch it (Phase 0).
   - Free-text with no ticket ID → treat as a **raw idea/spec** and synthesize a ticket (Phase 0).
   - Empty → ask once for a ticket ID or an idea before starting.

### Modes

Two modes, encoding the global working principle (*ask when interactive; pick the most reasonable
interpretation and record it when unattended*). Autonomous is the default and takes zero stops. See
Bail-out for what "zero stops" means and its one exception.

**Interactive** takes exactly **one** stop: a thorough up-front grill (Phase 0.5) that removes
ambiguity before any code is written. After the grill's plan is approved, the run is autonomous
through Phase 9, identical to the default flow.

**When the up-front grill (Phase 0.5) runs.** The grill is *the* alignment stop. Resolve the case
from this table. "Attended" means a human is present to answer; a `claude -p` run or a scheduled
routine is unattended.

| Input | Attendedness | Grill runs? | Assumptions block? |
|-------|--------------|-------------|--------------------|
| Ticket ID, no `interactive` keyword | attended | no (the ticket carries the spec) | yes |
| Ticket ID, `interactive` keyword | attended | yes | no, the grill resolves it |
| Raw idea / spec (no ticket ID) | attended | yes (highest-ambiguity input, no human-authored ticket to anchor on) | no, the grill resolves it |
| Anything, including `interactive` | unattended | no (nobody to answer) | yes |

When the grill is skipped, fall back to infer-and-record-Assumptions: pick the most reasonable
interpretation, proceed, and record it in an **Assumptions** block carried onto the PR (Phase 6)
and the Done summary (Phase 9).

### Bail-out (the one exception to zero-stops)

"Zero stops" means *don't pause for preferences*. It does **not** mean ship broken code. Stop
and report instead of proceeding when the run hits an **unrecoverable** state, specifically:

- Typecheck, lint, or tests cannot be made green after a genuine fix attempt, and the failure is
  caused by this change (not pre-existing).
- The implementation cannot satisfy the acceptance criteria (the ticket is wrong, blocked, or
  needs a decision only a human can make).
- A `git` rebase/push conflict can't be resolved cleanly.

On bail-out: commit/stash what's safe, leave the branch intact (so it can be resumed), and report
exactly where it stopped, why, and what's needed to continue. Do **not** open or finalize a PR
around known-broken code. A trivial/blocked ambiguity is not a bail-out. Record an assumption and
keep going.

---

## Writing style

Copied verbatim from `~/.claude/CLAUDE.md`, which a headless run never loads. Binding on commits,
the PR body, review replies, recorded assumptions, and the final report. Recopy on change, do not
paraphrase.

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

## Run variables

Shell state does not persist between Bash calls. Re-assign whichever of these a call needs, at the
top of that call:

| Variable | Assigned in | Value |
|----------|-------------|-------|
| `$TICKET_ID` | Phase 0 | The Linear identifier, original casing (e.g. `AP-1234`) |
| `$TICKET_TITLE` | Phase 0 | The Linear ticket title, verbatim |
| `$BASE` | Phase 1 | `git remote show origin \| sed -n 's/.*HEAD branch: //p'` |
| `$REPO` | Resume | `gh repo view --json nameWithOwner --jq '.nameWithOwner'` |
| `$PR_NUMBER` | Resume (existing PR) or Phase 6 (after create) | The PR number |

---

## Preflight: dependency check (runs first)

Before doing any work, check the tools this run will use and print a **readiness summary**, so
missing optional tooling surfaces now instead of 20 minutes into Phase 8.

**Required** (if any is missing, stop and say so clearly, the run can't complete without it):
- `gh` CLI, authenticated (`gh auth status`), needed for the PR and bot review.
- Linear MCP available, needed to fetch/create/update the ticket.
- **`/ui-walkthrough`** (Phase 8), required only if the change touches UI. It owns the capture and
  its own driver detection; without it, Phase 8 degrades to no visual evidence and says so.

  Never probe with `command -v browse`. It ships as a binary inside the gstack skill
  (`{$PWD,$HOME}/.claude/skills/gstack/browse/dist/browse`), not on `PATH`, so a `PATH` probe
  falsely declares Phase 8 impossible. A missing `browse` is not a blocked Phase 8 either:
  `/ui-walkthrough` falls back to headed Playwright, which still produces screenshots and video.
  Report the driver, not a bare ✗.

**Optional** (note what's missing and how to enable it, then continue, these degrade gracefully):
- **OpenCap** (walkthrough video): `command -v opencap` and `opencap config doctor` (which is also
  what surfaces a missing **macOS screen-recording permission**, a TCC grant no script can make, so
  it has to be granted once by hand). Missing → video is skipped, never blocks. To enable: install
  OpenCap, `opencap login` once, then approve screen recording when macOS asks.
  The recording itself is **owned by `/ui-walkthrough`** (Phase 8) and scoped to the browser window,
  so a recorded run leaves the rest of the screen, and the machine, free.
- **Skill dependencies** (`/grilling`, and the Phase 5 `/phillip` + its `/codex` + `/gemini`
  reviewers): **auto-installed when missing**, with any CLI auth walked through interactively, see
  "Skill dependencies: auto-install and setup" just below.

Print a compact summary, e.g.:

```
Preflight:  gh ✓   Linear ✓   driver: browse ✓ (headless → Phase 8 uses headed Playwright for video)   phillip ✓   grilling ✓   codex ✓   gemini ✗ (CLI ok, needs GEMINI_API_KEY → /phillip runs Claude+Codex)   OpenCap ✓
```

### Skill dependencies: auto-install and setup

Install missing skills; installs are idempotent. For deps wrapping an external CLI login: attended,
walk the user through the exact steps. Headless, note the gap and let `/phillip` degrade to
Claude-only. A missing reviewer CLI is never a bail-out.

| Dep | When needed | Detect | Install if missing | External CLI + auth |
|-----|-------------|--------|--------------------|---------------------|
| **`/grilling`** (mattpocock plugin) | grill will run | `grilling` in available skills | `claude plugin marketplace add mattpocock/skills` → `claude plugin install mattpocock-skills@mattpocock`, then `/setup-matt-pocock-skills` once per repo | none. If install fails, fall back to inline clarification Q&A |
| **`/phillip`** (ptrandev) | always (Phase 5) | `phillip` in available skills | symlink from the repo: `ln -s ~/Git/claude-skills/phillip ~/.claude/skills/phillip` (clone `https://github.com/ptrandev/claude-skills.git` → `~/Git/claude-skills` first if the repo is absent) | none directly; drives `/gemini` + `/codex` below. Full Mac provisioning: `docs/phillip-agent-setup.md` in that repo |
| **`/gemini`** (ptrandev) | always (via `/phillip`) | `gemini` in available skills | same symlink pattern as `/phillip` | CLI `gemini`: `npm install -g @google/gemini-cli`. **Auth (API-key only, no OAuth):** set `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) in `~/.zshenv`, and add `security.auth.selectedType: "gemini-api-key"` to `~/.gemini/settings.json` |
| **`/codex`** (garrytan/gstack) | always (via `/phillip`) | `codex` in available skills | `git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup` (the `./setup` step may prompt, so it is attended) | CLI `codex`: `npm install -g @openai/codex` then `codex login` (interactive; confirm the exact steps via `codex --help` or the skill's own docs) |

If `/phillip` itself can't be installed, Phase 5 holds the operative gate.

**Mode behavior:** Print the summary and proceed. Missing optional tools skip their features,
missing skills auto-install silently. If the grill will run, fold this summary into that
interaction. The operative OpenCap gate is `/ui-walkthrough`'s own `CAN_VIDEO` probe (its Phase 0);
this preflight only reports what the operator can fix now.

---

## Resume: idempotency check (runs after Preflight)

This skill is safe to re-run on the same ticket (it often crashes or is interrupted mid-way, e.g.
during Phase 7's multi-minute poll). Before doing work, establish what's already done and **skip
completed phases** rather than redoing them. Determine state from the world, not memory:

```bash
# Is there already a branch / PR for this ticket?
git rev-parse --verify "$TICKET_ID" 2>/dev/null && echo "branch exists"
gh pr list --head "$TICKET_ID" --json number,url,isDraft --jq '.[0]' 2>/dev/null   # existing PR?

# Bind the two variables every Phase 7 command needs. On a fresh run PR_NUMBER is empty
# and Phase 6 sets it after `gh pr create`.
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
PR_NUMBER=$(gh pr list --head "$TICKET_ID" --json number --jq '.[0].number // empty')
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

## Phase 0: Ticket / Spec

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
   (see the Modes table):
   - **Grill will run** → treat the AC as **provisional** and finalize it during the grill.
   - **Grill skipped** → keep the inferred AC and record everything you inferred in an
     **Assumptions** block (carry it to the PR body in Phase 6 and the Done summary in Phase 9).

Either way, bind the two run variables from the ticket. Every later phase uses them:

```bash
TICKET_ID="AP-1234"                       # the identifier as Linear spells it, original casing
TICKET_TITLE="<the ticket title, verbatim from Linear>"
```

---

## Phase 0.5: Up-front alignment grill

Run this phase only when the Modes table says the grill runs. When it runs, before writing any code:

1. Invoke `/grilling` via the Skill tool, scoped to this ticket/idea. Interrogate edge cases,
   scope boundaries, data shapes, non-goals, and any unclear acceptance criteria until you are
   confident you understand exactly what to build. (If `/grilling` couldn't be installed in
   Preflight, run the inline clarification Q&A fallback instead: same goal, no skill.)
2. Fold the answers back into the Linear ticket: update the description and acceptance criteria
   (Linear MCP update tool) so the ticket reflects the clarified spec.
3. State the resulting implementation plan inline (same numbered-list format as Phase 2) and get
   a single explicit go-ahead.

**This is the one and only stop.** After the go-ahead, run autonomously through Phase 9 exactly
like the default flow, with no further per-phase checkpoints.

---

## Phase 1: Branch

Always branch from an **up-to-date base** so you don't build on a stale `master` and hit avoidable
conflicts later. Detect the base branch (`master`/`main`), fetch it, and branch from the fresh ref:

```bash
BASE=$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p')   # usually master
# An unreachable remote, or a fork with no upstream HEAD, leaves BASE empty. Probe main then
# master instead: an empty BASE poisons every downstream diff and the `gh pr create` base.
[ -z "$BASE" ] && for b in main master; do
  git rev-parse --verify --quiet "origin/$b" >/dev/null && BASE=$b && break
done
[ -z "$BASE" ] && { echo "FATAL: no default branch (origin/HEAD, origin/main, origin/master all unresolved)" >&2; exit 1; }
git fetch origin "$BASE"
```

If the current branch is the base or unrelated, create a new branch from the freshly fetched base.
Name it after the ticket ID, preserving original casing, per the repo's `CLAUDE.md`. A headless run
never loads `CLAUDE.md`, so if the file is absent, use `$TICKET_ID` exactly as Linear spells it:

```bash
git checkout -b $TICKET_ID "origin/$BASE"
```

If the branch already exists, switch to it. **This is a resume** (see the Resume section); rebase
it onto the latest base if it has diverged, and stop to report if the rebase conflicts rather than
forcing through it.

---

## Phase 2: Plan

Check for an existing plan file in `~/.claude/plans/` referencing this ticket ID.

- **Plan exists:** read it and proceed.
- **No plan:** scan the codebase, identify all files to create or modify, and state the implementation plan inline as a numbered list (types → SDK → API → frontend state → UI → tests). Do not write a file. Do not wait for approval, proceed immediately.

---

## Phase 3: Implement

Full-send implements one of two ways depending on the size of the change. Small tickets run in a
**single pass** (no loop overhead); larger tickets decompose into a **Ralph-style loop**, one
task per fresh sub-context, so no single context window ever carries the whole feature and focus
doesn't rot as the diff grows.

### Phase 3.0: Size assessment (pick the path)

Judge the scope from the Phase 2 plan:

- **Loop (3B)** when the change spans multiple layers (types → sdk → api → frontend → ui) or many
  files, or the ticket has several independent acceptance criteria.
- **Single-pass (3A)** when the change is small enough to hold in one focused context without rot:
  roughly ≤ 3-4 files, a single layer, or one cohesive acceptance criterion.

Precedence: any 3B condition wins. Pick 3A only when no 3B condition holds.

`/full-send loop <TICKET-ID>` forces 3B regardless of size; a trivial change never needs it.
Record the chosen path in `/tmp/full-send-$TICKET_ID/path.md` (one line, `3A` or `3B`, plus the
reason) so a resume knows which way the run went. 3B also writes `fix_plan.md` to that dir, which
is what the Resume skip rules key on.

**3B runs from `full-send/ralph-loop.md`.** Read that file and follow it, then return to Phase 4.

### Standing rules (both paths)

Every implementation task, a 3A single pass or one 3B loop iteration, follows these. Follow all
conventions in the repo's `CLAUDE.md` and `CLAUDE.local.md`. A headless run never loads either
file, so when one is absent, follow the conventions the surrounding code already shows.

- **Never `git add .`.** Stage the specific files the task touched, at every commit site in this
  skill (Phase 3B, Phase 4, Phase 5, Phase 7c).
- Read every file before editing it.
- **Search before assuming something isn't implemented.** Ripgrep silence is not absence.
- Full implementations, **no placeholders or TODOs.**
- Never add **features or abstractions** beyond what the ticket/task requires.
- **Opportunistic cleanup is allowed, within the blast radius.** When you're already editing a
  function or file, you may DRY it and raise its quality (extract a duplicated helper, tighten a
  type, delete dead code, clarify a name), but only for code the change already touches, only when
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

### Phase 3A: Single-pass (small change)

Execute the Phase 2 plan directly following the standing rules above, then continue to Phase 4.
Use TaskCreate to track sub-steps; mark each complete as you finish it.

---

## Phase 4: Verify

Detect the affected workspace(s) from the changed files (`git diff --name-only "origin/$BASE"...HEAD`)
and run that workspace's own scripts. Read its `package.json` `scripts` for the real names; skip a
step with a note when the package defines no such script. The commands below are the Atllas repo's
defaults, not universal.

Run typechecks and lint, then the test suite. Fix all errors before continuing.

```bash
# Atllas defaults
cd apps/api && yarn ci:typecheck 2>&1 | tail -30
cd apps/agents-portal && yarn lint 2>&1 | tail -30
cd apps/api && yarn test 2>&1 | tail -30
cd apps/agents-portal && yarn test 2>&1 | tail -30
```

If a typecheck error is pre-existing and unrelated to this ticket, note it and do not fix it.
Treat test failures the same way: **fix** the ones caused by this change; **note and skip**
pre-existing or unrelated ones.

Confirm the Phase 3 tests actually run and pass. A green suite that never exercises the new path
doesn't count. Check it, don't assume it: every test file added in Phase 3 must appear in the
runner's own output.

```bash
cd <workspace> && yarn test 2>&1 | grep -F "<new test file path>"   # empty output = never ran
```

If typecheck, lint, or tests **cannot be made green** and the failure is caused by this change,
**bail out** (see Bail-out, Modes) rather than pushing broken code toward a PR.

Commit any remaining uncommitted work. **Single-pass (3A):** this is where the change is committed,
as `feat(<scope>): <ticket title>`. **Loop (3B):** the units were already committed per-task during
the loop, so only commit stragglers from this final sweep (e.g. a test fix the full-suite run
surfaced); don't squash the per-task history.

```bash
git add <the specific files this phase touched>
git commit -m "feat(<scope>): <ticket title>"   # 3A; or fix(<scope>): <what the sweep fixed> for 3B stragglers
```

---

## Phase 5: Self-Review (`/phillip`)

Run `/phillip` via the Skill tool. It writes a report to
`~/.claude/plans/phillip-<branch-slug>-<YYYY-MM-DD>.md` (the branch slug replaces `/` with `-`).

Operative gate: if `/phillip` couldn't be installed, **skip this phase** and flag prominently on the
PR and Done summary that **no self-review ran** (a notable quality gap). If `/phillip` is present
but a reviewer CLI (`gemini`/`codex`) is unauthenticated, let `/phillip` degrade to the reviewers
that are available (down to Claude-only), don't block.

- Let it run to completion. It applies the HIGH/MEDIUM fixes directly to the working tree (and may commit them itself).
- If it left any fixes uncommitted, commit them: `git add <the files it changed>` then `git commit -m "fix(<scope>): address /phillip self-review findings"`. Skip the commit if it changed nothing.
- Do not stop for the verdict (zero stops). Carry it forward to Phase 9 (Done):
  - **"Ready for PR"** → proceed normally.
  - **"Needs human review -> cap hit, ..."** or any verdict with unresolved HIGH/MEDIUM → proceed, but record the unresolved items and the report path so the Done summary surfaces them on the PR.

For a small or low-risk diff, `/phillip quick` is acceptable (it auto-scales down on trivial diffs anyway).

---

## Phase 6: PR

Read `CLAUDE.local.md` for the `username` (assignee). If the file is absent (a headless run never
loads it), use `gh api user --jq .login` and say in the Done summary that the assignee was inferred.
Read `.github/PULL_REQUEST_TEMPLATE.md` for the body format.

The PR title must come from the Linear ticket title. Do not invent or summarise it.

The three reviewer handles and the `Pending Code Review` label below are the Atllas defaults.
Verify both before creating, because `gh pr create` fails outright on a label the repo does not
define. Drop `--label` when `gh label list --json name --jq '.[].name'` does not list it. Drop a
`--reviewer` when `gh api "repos/$REPO/collaborators/<handle>"` returns non-zero. Note each drop in
the Done summary. Never let a missing label or handle block the PR.

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

Then request the automated reviewers. This block runs on a resume too, even when the PR already
existed, because it is what binds `$PR_NUMBER` and `$REPO` for Phase 7:

```bash
PR_NUMBER=$(gh pr view --json number --jq '.number')
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')

# Copilot must be requested explicitly.
gh api repos/$REPO/pulls/$PR_NUMBER/requested_reviewers \
  --method POST \
  --field 'reviewers[]=Copilot' \
  || echo "Copilot request failed (likely usage limits). Gemini Code Assist will still review."
```

**Gemini Code Assist needs no request.** It is a GitHub App that reviews every PR automatically (it
posts a review \~2 min after the PR opens). You do not, and cannot, add it via
`requested_reviewers`.

---

## Phase 7: Automated Review (Copilot + Gemini)

Up to two bots may review. Their logins differ between the `reviews` API and the
inline-`comments` API, so match them exactly:

| Bot | Trigger | Review author (`reviews`) | Inline author (`comments`) | Thread author (GraphQL) |
|-----|---------|---------------------------|----------------------------|--------------------------|
| GitHub Copilot | Requested in Phase 6; reviews only when usage is available | `copilot-pull-request-reviewer[bot]` | `Copilot` | `copilot-pull-request-reviewer` |
| Gemini Code Assist | Automatic on every PR (\~2 min) | `gemini-code-assist[bot]` | `gemini-code-assist[bot]` | `gemini-code-assist` |

Either, both, or (rarely) neither may land. Copilot reviews only when its usage is available: the
Phase 6 request can error or be silently dropped when Copilot is over its limit. That is not fatal.
**Do not block on Copilot specifically.** Gemini is the fallback and usually arrives first. Process
whichever bot reviews are present.

### Step 7a: Wait for an automated review

The polls below run up to 10 minutes, then up to 3 more, so this step alone can take 13 minutes. A
headless `claude -p` run can hit its wall-clock limit inside that window and die here, which is why
Phase 7 is the most common resume point. That is safe: the PR and its threads are the state, and a
re-run picks up from them (see Resume).

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

If neither bot responds within the window, note the timeout and continue. Do not stop.

### Step 7b: Read the review summaries

Each bot posts a summary in its review body. Read them for feedback that isn't tied to
a specific line:

```bash
gh api repos/$REPO/pulls/$PR_NUMBER/reviews \
  --jq ".[] | select($BOT_REVIEWS) | \"### \(.user.login)\n\(.body)\n\""
```

Gemini tags each inline finding with a severity badge (`high` / `medium` / `low`). Treat
HIGH and MEDIUM as actionable; LOW and praise/nit comments can be acknowledged and resolved.

### Step 7c: Address and resolve every bot thread

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

### Step 7d: Ensure CI is green

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

If the repo has no CI configured, `gh pr checks` reports no checks. Note that and move on.

---

## Phase 8: Evidence (screenshots and video)

Runs from `full-send/evidence.md`, which also holds the skip gate for a non-UI change. Read that
file and follow it, then continue to Phase 9.

---

## Phase 9: Done

Close the Linear loop:
- Move the ticket to **In Review** (Linear MCP update).
- Post a comment on the Linear issue with the PR URL (and the OpenCap share link if there is one).

Report:
- PR URL
- All commits on this branch (`git log master..HEAD --oneline`)
- Which bots reviewed (Copilot, Gemini Code Assist, both, or neither) and how their threads were handled
- **CI status** (Step 7d): green, or which checks failed and how they were handled
- Evidence: link to the PR comment where the screenshots and walkthrough video are already
  attached (Phase 8d): the video link, or the specific reason there isn't one (screen-recording
  permission not granted, OpenCap not installed/logged in, reviewer mode, `--no-video`). "Video
  skipped" with no reason isn't a report; the operator can't act on it.
- Alignment context (per the Modes table):
  - **Grill ran:** the clarifications captured during the Phase 0.5 grill.
  - **Grill skipped:** the **Assumptions** block recorded in Phase 0 for anything inferred.
- Anything skipped and why (pre-existing errors, skipped review findings, no automated review landed within the timeout)
