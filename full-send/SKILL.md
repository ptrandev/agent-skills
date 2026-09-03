---
name: full-send
description: >
  End-to-end feature workflow: take a Linear ticket or a raw idea, implement it, self-review,
  open a PR, address every bot review thread, then capture UI evidence. Autonomous by default.
  Use with /full-send <TICKET-ID>, /full-send alone, or a free-text idea.
---

# full-send

## Input

The invocation input holds an optional leading **mode keyword**, then a ticket ID (e.g. `AP-1234`) or free-text
describing the work. Parse them in this order:

1. **Mode keyword** (optional, first token):
   - `interactive` / `ask` / `careful` → **interactive mode** (front-load a grill, see Phase 0.5).
   - `auto` → explicit **autonomous mode** (the default).
   - No keyword → **autonomous mode**.
   - `loop` (orthogonal, may combine with any of the above) → force the Phase 3B Ralph loop
     regardless of size. Without it, the implement path is size-gated in Phase 3.0.
2. **Remaining invocation input:**
   - A ticket ID (e.g. `AP-1234`) → fetch it (Phase 0).
   - Free-text with no ticket ID → treat as a **raw idea/spec** and synthesize a ticket (Phase 0).
   - Empty → ask once for a ticket ID or an idea before starting.

### Modes

Autonomous is the default and takes zero stops.

**Interactive** takes exactly **one** stop: the up-front grill (Phase 0.5).

**When the up-front grill (Phase 0.5) runs.** Resolve the case from this table. "Attended" means a
human is present to answer. Any non-interactive CLI run or scheduled routine is unattended.

| Input | Attendedness | Grill runs? | Assumptions block? |
|-------|--------------|-------------|--------------------|
| Ticket ID, no `interactive` keyword | attended | no (the ticket carries the spec) | yes |
| Ticket ID, `interactive` keyword | attended | yes | no, the grill resolves it |
| Raw idea / spec (no ticket ID) | attended | yes (highest-ambiguity input, no human-authored ticket to anchor on) | no, the grill resolves it |
| Anything, including `interactive` | unattended | no (nobody to answer) | yes |

When the grill is skipped: pick the most reasonable interpretation, proceed, and record it in an
**Assumptions** block carried onto the PR (Phase 6) and the Done summary (Phase 9).

### Bail-out (the one exception to zero-stops)

"Zero stops" means do not pause for preferences. It does **not** mean ship broken code. **Stop and
report** instead of proceeding when the run hits an **unrecoverable** state, specifically:

- Typecheck, lint, or tests cannot be made green after a genuine fix attempt, and the failure is
  caused by this change (not pre-existing).
- The implementation cannot satisfy the acceptance criteria (the ticket is wrong, blocked, or
  needs a decision only a human can make).
- A `git` rebase/push conflict can't be resolved cleanly.

On bail-out:

1. Commit or stash what is safe.
2. Leave the branch intact.
3. Report exactly where the run stopped, why, and what is needed to continue.

**Do not** open or finalize a PR around known-broken code. A trivial or blocked ambiguity is not a
bail-out. Record an assumption and keep going.

---

## Writing style

Copied verbatim from `~/.claude/CLAUDE.md`, which a headless run never loads.
Binding on commits, the PR body, review replies, recorded assumptions, and the final
report.

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

Check the tools this run will use before any other work. Print a **readiness summary**.

**Required** (**stop** and say so clearly when any is missing):
- `gh` CLI, authenticated (`gh auth status`), needed for the PR and bot review.
- Linear MCP available, needed to fetch/create/update the ticket.
- **`/ui-walkthrough`** (Phase 8), required only when the change touches UI. It owns the capture and
  its own driver detection. Without it, Phase 8 degrades to no visual evidence and says so.

  **Never probe with `command -v browse`.** It ships as a binary inside the gstack skill
  (`{$PWD,$HOME}/.claude/skills/gstack/browse/dist/browse`), not on `PATH`, so a `PATH` probe
  falsely declares Phase 8 impossible. A missing `browse` is not a blocked Phase 8 either:
  `/ui-walkthrough` falls back to headed Playwright, which still produces screenshots and video.
  Report the driver, not a bare ✗.

**Optional** (note what is missing and how to enable it, then continue):
- **OpenCap** (walkthrough video): `command -v opencap` and `opencap config doctor`. `doctor` also
  surfaces a missing **macOS screen-recording permission**, a TCC grant no script can make, so a
  human grants it once by hand. Missing → video is skipped, never blocks. To enable: install
  OpenCap, `opencap login` once, then approve screen recording when macOS asks.
- **Skill dependencies** (`/grilling`, and the Phase 5 `/phillip` + its `/codex` + `/gemini`
  reviewers): **auto-installed when missing**, with any CLI auth walked through interactively.

Print a compact summary, e.g.:

```
Preflight:  gh ✓   Linear ✓   driver: browse ✓ (headless → Phase 8 uses headed Playwright for video)   phillip ✓   grilling ✓   codex ✓   gemini ✗ (CLI ok, needs GEMINI_API_KEY → /phillip runs Claude+Codex)   OpenCap ✓
```

### Skill dependencies: auto-install and setup

Install missing skills. Installs are idempotent. For a dep that wraps an external CLI login,
attended: walk the user through the exact steps. Headless: note the gap and let `/phillip` degrade
to Claude-only. A missing reviewer CLI is **never** a bail-out.

| Dep | When needed | Detect | Install if missing | External CLI + auth |
|-----|-------------|--------|--------------------|---------------------|
| **`/grilling`** (mattpocock plugin) | grill will run | `grilling` in available skills | `claude plugin marketplace add mattpocock/skills` → `claude plugin install mattpocock-skills@mattpocock`, then `/setup-matt-pocock-skills` once per repo | none. If install fails, fall back to inline clarification Q&A |
| **`phillip`** (ptrandev) | always (Phase 5) | `phillip` in available skills | clone `https://github.com/ptrandev/agent-skills.git`, then run its `scripts/link-skills` | none directly; drives Claude + Gemini + Codex reviewers. Full Mac provisioning: `docs/phillip-agent-setup.md` in that repo |
| **`/gemini`** (ptrandev) | always (via `/phillip`) | `gemini` in available skills | same symlink pattern as `/phillip` | CLI `gemini`: `npm install -g @google/gemini-cli`. **Auth (API-key only, no OAuth):** set `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) in `~/.zshenv`, and add `security.auth.selectedType: "gemini-api-key"` to `~/.gemini/settings.json` |
| **Codex reviewer** | always (via `phillip`) | `codex` CLI available and authenticated | install Codex using current OpenAI instructions | run `codex login` when the CLI requests authentication |

Phase 5 holds the operative gate when `/phillip` itself cannot be installed.

**Mode behavior:** Print the summary and proceed. Fold this summary into the grill when the grill
runs. The operative OpenCap gate is `/ui-walkthrough`'s own `CAN_VIDEO` probe (its Phase 0). This
preflight only reports what the operator can fix now.

---

## Resume: idempotency check (runs after Preflight)

This skill is safe to re-run on the same ticket. Establish what is already done before doing work,
and **skip completed phases** rather than redoing them. Determine state from the world, not memory:

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
- **Ticket already In Progress / assigned** → **do not** reassign (Phase 0 is a no-op).
- **Branch exists with commits** → resume on it. **Do not** recreate it (Phase 1).
- **PR already open** → reuse its number; skip `gh pr create` (Phase 6), go straight to processing
  reviews/CI (Phases 7+).
- **Bot threads already resolved / commits already pushed** → **do not** duplicate replies or
  commits.
- **A `fix_plan.md` exists under `/tmp/full-send-$TICKET_ID/`** → the implement step took the
  Phase 3B loop path; resume it by re-reading `fix_plan.md` + `notes.md` and continuing from the
  first unchecked task. **Do not** restart the decomposition or redo checked tasks.

Every phase checks "is this already true?" and becomes a no-op when it is. Read current state
(`git`, `gh`, Linear) instead of assuming a fresh run.

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
   - **Grill skipped** → keep the inferred AC and record everything you inferred in the
     **Assumptions** block.

Either way, bind the two run variables from the ticket:

```bash
TICKET_ID="AP-1234"                       # the identifier as Linear spells it, original casing
TICKET_TITLE="<the ticket title, verbatim from Linear>"
```

---

## Phase 0.5: Up-front alignment grill

Run this phase only when the Modes table says the grill runs. Run it before writing any code:

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

Always branch from an **up-to-date base**. Detect the base branch (`master`/`main`), fetch it, and
branch from the fresh ref:

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

Create a new branch from the freshly fetched base when the current branch is the base or unrelated.
Name it after the ticket ID, preserving original casing, per the repo's `CLAUDE.md`. A headless run
never loads `CLAUDE.md`, so use `$TICKET_ID` exactly as Linear spells it when the file is absent:

```bash
git checkout -b $TICKET_ID "origin/$BASE"
```

Switch to the branch when it already exists. **This is a resume.** Rebase it onto the latest base
when it has diverged. **Stop and report** when the rebase conflicts. **Never** force through a
conflicted rebase.

---

## Phase 2: Plan

Check for an existing plan file in `~/.claude/plans/` referencing this ticket ID.

- **Plan exists:** read it and proceed.
- **No plan:** scan the codebase, identify all files to create or modify, and state the implementation plan inline as a numbered list (types → SDK → API → frontend state → UI → tests). **Do not** write a file. **Do not** wait for approval. Proceed immediately.

---

## Phase 3: Implement

### Phase 3.0: Size assessment (pick the path)

Judge the scope from the Phase 2 plan:

- **Loop (3B)** when the change spans multiple layers (types → sdk → api → frontend → ui) or many
  files, or the ticket has several independent acceptance criteria.
- **Single-pass (3A)** when the change is small enough to hold in one focused context without rot:
  roughly ≤ 3-4 files, a single layer, or one cohesive acceptance criterion.

Precedence: any 3B condition wins. Pick 3A only when no 3B condition holds.

`/full-send loop <TICKET-ID>` forces 3B regardless of size. Record the chosen path in
`/tmp/full-send-$TICKET_ID/path.md` (one line, `3A` or `3B`, plus the reason).

**Read [ralph-loop.md](ralph-loop.md) and follow it before starting 3B.** It owns the
decomposition, the on-disk run state, and the loop. Return to Phase 4 when it finishes.

### Standing rules (both paths)

Every implementation task, a 3A single pass or one 3B loop iteration, follows these. Follow all
conventions in the repo's `CLAUDE.md` and `CLAUDE.local.md`. A headless run never loads either
file, so when one is absent, follow the conventions the surrounding code already shows.

- **Never `git add .`.** Stage the specific files the task touched, at every commit site in this
  skill (Phase 3B, Phase 4, Phase 5, Phase 7c).
- Read every file before editing it.
- **Search before assuming something isn't implemented.** Ripgrep silence is not absence.
- Full implementations, **no placeholders or TODOs.**
- **Never** add features or abstractions beyond what the ticket/task requires.
- **Opportunistic cleanup is allowed, within the blast radius.** When you're already editing a
  function or file, you may DRY it and raise its quality (extract a duplicated helper, tighten a
  type, delete dead code, clarify a name), but only for code the change already touches, only when
  it's low-risk and covered by tests, and without materially widening the diff. Anything bigger, or
  in code this change doesn't touch, stays a **surfaced note** (a Linear follow-up or a PR comment).
- When modifying a shared package (sdk, privs, common, ui), rebuild it: `cd packages/<name> && yarn build`.
- Add `data-testid` attributes to every new interactive element.
- **Cover the new behavior with tests.** Add/extend tests for the code paths this ticket
  introduces (acceptance criteria = the checklist), following the workspace's existing test
  patterns. If a touched area has no test infrastructure, note it rather than scaffolding a
  framework from scratch.

### Phase 3A: Single-pass (small change)

Run the Phase 2 plan directly, following the standing rules above. Use TaskCreate to track
sub-steps. Mark each sub-step complete as you finish it. Continue to Phase 4.

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

Note a typecheck error that is pre-existing and unrelated to this ticket. **Do not** fix it. Treat
test failures the same way: **fix** the ones caused by this change; **note and skip** pre-existing
or unrelated ones.

Confirm the Phase 3 tests run and pass. Every test file added in Phase 3 must appear in the
runner's own output.

```bash
cd <workspace> && yarn test 2>&1 | grep -F "<new test file path>"   # empty output = never ran
```

If typecheck, lint, or tests **cannot be made green** and the failure is caused by this change,
**bail out** (see Bail-out, Modes) rather than pushing broken code toward a PR.

Commit any remaining uncommitted work. **Single-pass (3A):** this is where the change is committed,
as `feat(<scope>): <ticket title>`. **Loop (3B):** the units were already committed per-task during
the loop, so only commit stragglers from this final sweep (e.g. a test fix the full-suite run
surfaced). **Do not** squash the per-task history.

```bash
git add <the specific files this phase touched>
git commit -m "feat(<scope>): <ticket title>"   # 3A; or fix(<scope>): <what the sweep fixed> for 3B stragglers
```

---

## Phase 5: Self-Review (`/phillip`)

Invoke the loaded `phillip` skill through the host's skill mechanism. It writes a report to the
host's configured plans directory (the branch slug replaces `/` with `-`).

Operative gate: when `/phillip` cannot be installed, **skip this phase** and flag prominently on the
PR and Done summary that **no self-review ran**. When `/phillip` is present but a reviewer CLI
(`gemini`/`codex`) is unauthenticated, let `/phillip` degrade to the reviewers that are available
(down to Claude-only). **Do not** block.

- Let it run to completion. It applies the HIGH/MEDIUM fixes directly to the working tree (and may commit them itself).
- Commit any fixes it left uncommitted: `git add <the files it changed>` then `git commit -m "fix(<scope>): address /phillip self-review findings"`. Skip the commit when it changed nothing.
- **Do not** stop for the verdict (zero stops). Carry it forward to Phase 9 (Done):
  - **"Ready for PR"** → proceed normally.
  - **"Needs human review -> cap hit, ..."** or any verdict with unresolved HIGH/MEDIUM → proceed, but record the unresolved items and the report path so the Done summary surfaces them on the PR.

For a small or low-risk diff, `/phillip quick` is acceptable (it auto-scales down on trivial diffs anyway).

---

## Phase 6: PR

Read `CLAUDE.local.md` for the `username` (assignee). When the file is absent (a headless run never
loads it), use `gh api user --jq .login` and say in the Done summary that the assignee was inferred.
Read `.github/PULL_REQUEST_TEMPLATE.md` for the body format.

The PR title must come from the Linear ticket title. **Do not** invent or summarise it.

The three reviewer handles and the `Pending Code Review` label below are the Atllas defaults.
Verify both before creating, because `gh pr create` fails outright on a label the repo does not
define. Drop `--label` when `gh label list --json name --jq '.[].name'` does not list it. Drop a
`--reviewer` when `gh api "repos/$REPO/collaborators/<handle>"` returns non-zero. Note each drop in
the Done summary. **Never** let a missing label or handle block the PR.

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
posts a review \~2 min after the PR opens). **Never** add it via `requested_reviewers`, which the
API rejects.

---

## Phase 7: Automated Review (Copilot + Gemini)

Up to two bots may review. Their logins differ between the `reviews` API and the
inline-`comments` API, so match them exactly:

| Bot | Trigger | Review author (`reviews`) | Inline author (`comments`) | Thread author (GraphQL) |
|-----|---------|---------------------------|----------------------------|--------------------------|
| GitHub Copilot | Requested in Phase 6; reviews only when usage is available | `copilot-pull-request-reviewer[bot]` | `Copilot` | `copilot-pull-request-reviewer` |
| Gemini Code Assist | Automatic on every PR (\~2 min) | `gemini-code-assist[bot]` | `gemini-code-assist[bot]` | `gemini-code-assist` |

Either, both, or (rarely) neither may land. Copilot reviews only when its usage is available: the
Phase 6 request can error or be silently dropped when Copilot is over its limit. **Do not** block on
Copilot specifically. Gemini is the fallback and usually arrives first. Process whichever bot
reviews are present.

### Step 7a: Wait for an automated review

The polls below run up to 10 minutes, then up to 3 more, so this step alone can take 13 minutes. A
headless `claude -p` run can hit its wall-clock limit inside that window and die here, which makes
Phase 7 the most common resume point.

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

Note the timeout and continue when neither bot responds within the window. **Do not** stop.

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
2. For each comment: fix it when actionable, otherwise explain why not.
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
5. Commit any fixes as `fix(<scope>): address automated review findings` and push.

### Step 7d: Ensure CI is green

Bot reviews are advisory. The PR's **CI checks** (build, tests, lint, type) are the real gate.
After the last code push, wait for the checks to settle:

```bash
# Waits for all required checks; exits non-zero if any fail.
gh pr checks "$PR_NUMBER" --watch --interval 30 || CI_FAILED=1
```

- **All green** → continue.
- **A check fails** → read its log, fix the cause, commit (`fix(<scope>): fix CI`), push, and
  re-watch. Loop until green or until the failure is unrecoverable.
- **Unrecoverable, or the failure is pre-existing and unrelated** → **Never** loop forever. Note it
  and carry the red-check status to the Done summary so it is surfaced on the PR. Treat a failure
  caused by this change as a **bail-out** rather than presenting the PR as ready.

`gh pr checks` reports no checks when the repo has no CI configured. Note that and move on.

---

## Phase 8: Evidence (screenshots and video)

**Read [evidence.md](evidence.md) and follow it at Phase 8.** It owns the skip gate for a non-UI
change, the capture, and the PR comment. Continue to Phase 9 when it finishes.

---

## Phase 9: Done

Close the Linear loop:
- Move the ticket to **In Review** (Linear MCP update).
- Post a comment on the Linear issue with the PR URL (and the OpenCap share link when there is one).

Report:
- PR URL
- All commits on this branch (`git log master..HEAD --oneline`)
- Which bots reviewed (Copilot, Gemini Code Assist, both, or neither) and how their threads were handled
- **CI status** (Step 7d): green, or which checks failed and how they were handled
- Evidence: link to the PR comment where the screenshots and walkthrough video are already
  attached (Phase 8d): the video link, or the specific reason there isn't one (screen-recording
  permission not granted, OpenCap not installed/logged in, reviewer mode, `--no-video`). **Never**
  report "video skipped" with no reason.
- Alignment context (per the Modes table):
  - **Grill ran:** the clarifications captured during the Phase 0.5 grill.
  - **Grill skipped:** the **Assumptions** block recorded in Phase 0 for anything inferred.
- Anything skipped and why (pre-existing errors, skipped review findings, no automated review landed within the timeout)
