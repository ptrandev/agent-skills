---
name: babysit-prs
description: >
  Triages unresolved review threads on open PRs that you authored, fixes the safe ones,
  replies with the fixing commit, and leaves anything ambiguous open with a question. Defaults
  to Atllas-Inc/codebase and aicc-queues. Idempotent, so it is safe to re-run on a schedule.
---

# babysit-prs

The "address review comments" half of `/full-send`, pulled out so it runs **continuously**
against PRs that already exist.

This is **Phase 1** (local agent loop). The graduation path to a CI-native, event-driven GitHub
Actions bot is [github-actions.md](github-actions.md) (**Phase 2**). Do not build it until this
loop's resolution quality is trusted.

## Input

`$ARGS`:
- **Empty** → process **all** open PRs authored by the current GitHub user across **all default
  repos** (see Targets).
- **One or more PR numbers** (e.g. `1768 1765`) → process only those PRs. PR numbers are
  ambiguous across repos, so they resolve against the **first** default repo (`Atllas-Inc/codebase`)
  unless a `--repo` is also given. Still must be authored by the current user, see the Scope
  guardrail.
- `--repo <owner/name>` → restrict this run to one repo (one of the defaults, or any other repo you
  own PRs in). May be combined with PR numbers.

### Targets (default repos)

Process these unless `--repo` narrows the run. Each has a known local clone for making fixes:

| Repo | Local clone |
|------|-------------|
| `Atllas-Inc/codebase` | `/Users/phillip/Git/codebase` |
| `Atllas-Inc/aicc-queues` | `/Users/phillip/Git/aicc-queues` |

**Default author:** the `gh` authenticated login. Adding a repo to this loop later = one more row.

## Core safety model (do not weaken these)

This skill pushes commits and resolves threads autonomously. Three invariants keep that safe:

1. **Scope, your PRs only.** Never act on a PR you didn't author. Confirm `author == gh login`
   for every PR before touching it. A PR number passed in `$ARGS` that you don't own is skipped
   with a note.
2. **Evidence before resolution.** A thread is auto-resolved **only** when a real fix was pushed
   **and** the affected typecheck/lint/tests are green, **and** only after a reply has been posted
   linking the fixing commit. No silent resolves. No resolving a thread you merely replied to.
   Exception: a thread already fixed by an earlier commit on this branch may be resolved if it is
   bot-authored, verified by reading the current code at that `path` and identified via
   `git log --oneline -3 -- <path>` (Phase 3, outdated pre-step).
3. **When unsure, answer and leave open.** If a thread is a question, a judgment call, an
   architectural disagreement, security-sensitive, or the fix can't be made green, reply with
   your reasoning or question and **leave the thread unresolved** for the human. Resolving an
   open question is worse than leaving it open.

"Safe to auto-resolve" = **mechanical, local, obviously-correct, test-covered.** Everything else
is a reply-and-leave-open.

---

## Writing style

These rules are binding on every thread reply this skill posts and on the Phase 7 report. They are
copied verbatim from `~/.claude/CLAUDE.md`, which a headless run never loads. When the rules change
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

## Preflight (runs first)

Establish the world before touching anything. If a **required** check fails, stop and say so.

- `gh auth status`, authenticated (required). Capture the login: `ME=$(gh api user --jq .login)`.
- Resolve the **target repo set**: if `$ARGS` has `--repo`, that single repo; else all rows in
  **Targets**. For each, split `OWNER=${REPO%/*}` / `NAME=${REPO#*/}` and map to its clone (the
  Targets table, or `/Users/phillip/Git/<name>` for a `--repo` override).
- Each repo's **local clone** is where its fixes get committed. Per clone, confirm it exists and its
  `origin` matches the repo. A clone is required to *fix*; without one you can still **triage and
  reply** for that repo, say fixes were skipped. Resolve and check each clone **independently**:
  one missing clone disables fixes for that repo only, not the whole run.
- Each clone's working tree must be **clean** (`git status --porcelain`) before you check out PR
  branches in it. Stash is risky in a headless run. A dirty clone → triage/reply only for that
  repo (or skip it); never discard uncommitted work. A dirty clone does not block the *other* repo.

### Capability detection (this is what makes it safe in any runtime)

The same skill runs locally (full power) and inside a **Routine cloud sandbox** (clones the repo,
runs `yarn`, has GitHub write, but **no display, no OpenCap, maybe no browser**). Detect what this
environment can do and **degrade per tier** rather than failing:

- **Tier 1, triage/reply/resolve:** needs only `gh` + network. Always available.
- **Tier 2, fix + verify:** needs that repo's clone with deps installed and a runnable toolchain.
  Probe with the literal commands for the stack:
  ```bash
  # codebase
  command -v yarn && node -v \
    && jq -e '.scripts["ci:typecheck"]' "$CLONE/apps/api/package.json" >/dev/null
  # aicc-queues
  test -x "$CLONE/gradlew"
  ```
  A failing probe makes that repo **triage-only** for this run: reply/resolve where no code change
  is required; route fix-needed threads to the Needs-you queue.
- **Tier 3, visual evidence (screenshots/video):** needs a display + browser + recorder. Probe:
  is the `browse` binary present, is `opencap` installed, is a dev server reachable/startable?
  In a sandbox these are almost always **absent**, so any thread whose proof must be *visual*
  cannot be evidenced here. Don't fake it: **flag those threads to the Needs-you queue marked
  "needs local visual run"** (see Phase 5).

Set `CAN_FIX[$REPO]` **per repo** from that repo's clone, tree, and Tier 2 probes. Set `CAN_VISUAL`
**once per run**, since display, browser, and recorder belong to the runtime, not to a repo. Later
phases branch on the value for the repo they are acting in.

Print a one-line readiness summary per repo + the capability line, e.g.:
```
Preflight:  gh ✓ (ptrandev)   visual ✗ (sandbox: UI-proof threads → Needs-you)
  Atllas-Inc/codebase     clone ~/Git/codebase ✓     tree clean ✓   fix ✓
  Atllas-Inc/aicc-queues  clone ~/Git/aicc-queues ✓  tree dirty ✗   fix ✗ (triage-only)
```

---

## Phase 1: Enumerate target PRs

For **each** repo in the target set, list the open PRs you authored:

```bash
# All open PRs authored by me in this repo (default), or the specific numbers from $ARGS.
gh pr list --repo "$REPO" --author "$ME" --state open \
  --json number,title,headRefName,isDraft \
  --jq '.[] | "\(.number)\t\(.headRefName)\t\(.title)"'
```

Tag each PR with its repo (and that repo's clone) so Phases 2 to 5 act in the right place. If
`$ARGS` named specific PRs, intersect with this list and **drop any you don't own** (Scope
guardrail) with a logged note. Draft PRs are included: bots and humans comment on drafts too.

### Dispatch, one sub-agent per PR (context isolation)

Each (repo, PR) unit runs Phases 2 to 6 in its **own sub-agent** (Agent tool). One agent across
several PRs cross-contaminates: a thread from PR A can steer a fix on PR B. A per-PR agent holds
exactly one PR's world. The orchestrator (this session) stays thin: preflight → enumerate →
dispatch → aggregate.

**Orchestrator rules:**

- **Never read thread bodies, diffs, or repo files yourself.** That is the sub-agent's job. You
  enumerate PRs and aggregate results, nothing else. (Optional cheap pre-filter: a body-free
  GraphQL pass fetching only `isResolved` + last-comment author per thread lets you skip
  dispatching for PRs whose worklist is empty. Don't pull comment bodies for it.)
- **Each dispatch prompt is self-contained:** repo, PR#, head branch, clone path, that repo's
  `CAN_FIX[$REPO]` value, `CAN_VISUAL`, and the three safety invariants (scope,
  evidence-before-resolve, unsure→leave-open). Tell the agent to execute Phases 2 to 6 of
  `~/.claude/skills/babysit-prs/SKILL.md` for **exactly that one PR** and nothing else.
  Point it at the **Phase 5 Reply style** rules explicitly: a Routine sandbox has no global
  `CLAUDE.md`, so the skill is the only place those rules exist for that agent.
- **Concurrency:** agents for **different repos run in parallel** (separate clones, safe).
  Agents for PRs in the **same repo run sequentially**. They share the clone, and parallel
  checkouts in one clone corrupt each other.
- **Return contract:** each agent returns only the compact per-PR result (the Phase 6 line,
  its needs-you items, commit SHAs, and any skipped-thread notes), not its working transcript.
  Phase 7 is assembled from these.
- **Failure isolation:** a sub-agent that dies or errors marks its PR `skipped (agent failed)`
  in the report and never blocks the other PRs.
- **Single-PR exception:** exactly one target PR → skip dispatch and run Phases 2 to 6 inline.

**Nested dispatch:** a per-PR agent may delegate read-only work (tracing a JUDGMENT thread across
the codebase, classification reads on a 30-thread worklist) to Explore helpers that return compact
answers. Two hard rules keep nesting safe:

- **Single writer per PR.** Every mutation (file edits, commits, pushes, replies, resolves)
  happens in the per-PR agent itself, never in a helper. The safety invariants live in exactly
  one place per PR and are enforced there.
- **Depth cap:** orchestrator → per-PR agent → read-only helpers. No deeper. And no speculative
  spawning: a typical PR (a handful of threads) runs Phases 2 to 6 entirely inline.

---

## Phase 2: Fetch the actionable threads for one PR

Pull every review thread with the data needed to reply (`databaseId`), resolve (`id`), and
classify (author, body, path, line). One query gets it all:

```bash
gh api graphql -f query='
query($owner:String!,$name:String!,$pr:Int!) {
  repository(owner:$owner,name:$name) {
    pullRequest(number:$pr) {
      reviewThreads(first:100) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(first:50) {
            nodes { databaseId author { login } body createdAt }
          }
        }
      }
    }
  }
}' -F owner="$OWNER" -F name="$NAME" -F pr="$PR" > /tmp/babysit-$NAME-$PR-threads.json
```

Temp paths must include `$NAME`: PR numbers repeat across repos, and parallel per-repo agents
writing `/tmp/babysit-$PR-*` would clobber each other. If `pageInfo.hasNextPage` is true (100+
threads), paginate with `endCursor`, never silently truncate the worklist.

Build the **worklist** = threads that are **all** of:
- `isResolved == false`, and
- the **last** comment's author is **not** `$ME` (if you already replied, it's the human's move.
  Skip to stay idempotent and avoid double-replies on re-runs), and
- not a pure self-thread (first comment author is `$ME` with no other participants).

Identify the **review author** of each thread = `comments.nodes[0].author.login`. Recognize the
bots (their thread/GraphQL logins drop the `[bot]` suffix):

| Source | First-comment author (GraphQL) |
|--------|--------------------------------|
| GitHub Copilot | `copilot-pull-request-reviewer` |
| Gemini Code Assist | `gemini-code-assist` |
| Teammate | any other human login |

If the worklist is empty, log `PR #$PR: nothing to do` and move to the next PR.

---

## Phase 3: Classify each thread

For each worklist thread, read the comment body and the referenced `path:line` in the code, then
assign exactly one disposition. **This judgment is the heart of the skill, be conservative.**

| Disposition | Signal | Examples | Action |
|---|---|---|---|
| **SAFE-FIX** | Mechanical, local, unambiguous. The correct change is obvious from the comment plus the code, touches a small well-understood region, and is (or can be) covered by an existing test. | Null/undefined guard, off-by-one, wrong variable, missing `await`, unused import, typo, obvious rename, a missing `data-testid`, tighten a type, a nit the bot spelled out exactly. | **Fix it** (Phase 4). |
| **QUESTION** | The reviewer is *asking* something, or the right answer needs context only you have. | "why do we...?", "is this intentional?" | **Reply** with the answer or explanation. **Leave open.** |
| **JUDGMENT / RISKY** | A plausible fix could be wrong. | Architectural disagreement, public API / contract / migration change, security- or auth-sensitive code, money/billing logic, a large refactor. | **Reply** with your take or a question. **Leave open.** Do **not** auto-fix risky surfaces even if the change *looks* mechanical. |
| **ACK / NIT-RESOLVE** | Nothing to change. | Praise, or a trivial bot nit you're declining for a stated reason. | **Reply** acknowledging or explaining the decline. Resolve **only if** the author is a **bot** and there is genuinely nothing actionable. A **human** ACK thread gets a reply, they resolve it. |

**Pre-step, outdated threads (`isOutdated == true`):** the diff hunk the comment anchored to has
changed since the comment was written, a strong hint the concern may already be addressed by a
later commit. Before classifying, read the **current** code at that `path` and check whether the
concern still applies.

- **Already addressed** (verified against the current head, the flagged code was rewritten; find
  the commit with `git log --oneline -3 -- <path>`): reply with the evidence
  (`Addressed by <sha>: <one line on what changed>`), then resolve **only if bot-authored**.
  Human-authored → reply with the same evidence, leave open for them to resolve.
- **Still applies** (the line moved but the issue persists): classify with the table above.
  Outdated is a hint to check, never a reason to dismiss.

When torn between SAFE-FIX and QUESTION/JUDGMENT, choose the more conservative one. Record the
disposition + one-line reason per thread for the final report.

---

## Phase 4: Apply the safe fixes for this PR

Only if the PR has ≥1 SAFE-FIX thread. Check out the PR branch into the local clone:

```bash
cd "$CLONE"                 # THIS PR's repo clone (from the Targets map)
git fetch origin
gh pr checkout "$PR" --repo "$REPO"   # checks out the head branch, tracking the PR
git pull --ff-only 2>/dev/null || true
```

For each SAFE-FIX thread: **Read the file**, make the minimal change the comment calls for, nothing
more (stay in scope, no opportunistic refactors). Keep a map of `thread.id → {fixed, commitSha,
note}` as you go.

**codebase only:** when modifying a shared package (`sdk`, `privs`, `common`, `ui`), rebuild it
(`cd packages/<name> && yarn build`) per repo convention. aicc-queues is Gradle and has no
`packages/` directory.

After all fixes for this PR, **verify**. Run only what the changed files touch (don't run the
whole monorepo), using **the verify commands of that repo's stack**:

```bash
# codebase: Yarn 3 (Berry) + Turbo monorepo, per affected workspace.
cd apps/api && yarn ci:typecheck 2>&1 | tail -30
cd apps/agents-portal && yarn lint 2>&1 | tail -30
# plus the nearest test target (e.g. vitest) for the changed code, if one exists

# aicc-queues: Gradle/JVM. Compile-only in the cloud, see the verification depth note below.
./gradlew --no-daemon compileJava
./gradlew --no-daemon :<module>:test     # local only, when Redis+Postgres are up
```

**Verification depth per repo sets the auto-resolve bar.** `codebase` gets full Tier 2:
per-workspace `yarn ci:typecheck`, `turbo run lint`, `vitest`. Some vitest suites need Firebase
emulators; typecheck and lint always work. `aicc-queues` in a cloud sandbox is **compile-only**,
because its integration tests need Redis and Postgres, absent there. "Verified" there means
*compiles*, not *tests pass*. That is weaker evidence: auto-resolve only genuinely mechanical fixes
on that basis, and route anything whose correctness depends on runtime behavior to the Needs-you
queue rather than resolving it on a compile alone.

- **Green** → commit the batch and push:
  ```bash
  git add <specific changed files, never git add .>
  git commit -m "fix(<scope>): address review feedback on #$PR"
  git push
  SHA=$(git rev-parse HEAD)
  ```
  Record `$SHA` against every thread fixed in this batch (evidence for Phase 5).
  **Push rejected (non-fast-forward)?** A concurrent run (Routine vs. local) pushed to this
  branch first. `git pull --rebase`, re-verify, push again; if the rebase conflicts, abort it
  and report the PR as `skipped (concurrent push)`. **Never force-push.**
- **A fix breaks verification** → **one** correction attempt, in scope, no new files and no new
  dependencies. If it is still not green, **revert that specific fix**
  (`git checkout -- <file>` / `git restore`), and **downgrade that thread to QUESTION**: it will be
  replied-to ("attempted a fix but it broke <X>, leaving for you") and left open. Do not push
  broken code. Do not let one bad fix block the good ones.

> CI watch is **best-effort** in this loop. Pushing re-triggers the PR's checks; you don't need to
> block on them here (a scheduled run shouldn't hang for 20 min). Note in the report that CI was
> re-triggered. If you *want* a gate, `gh pr checks "$PR" --watch --interval 30`, but keep it
> optional and time-boxed.

---

## Phase 5: Reply and (only where earned) resolve

For **every** worklist thread, post a reply to the thread's first comment, then resolve only the
ones that earned it.

**Check-before-act (concurrent-run guard):** immediately before replying, re-fetch the thread's
state (last-comment author + `isResolved`, one cheap GraphQL call for the PR). If the last
comment is now yours or the thread is resolved, another run got there first, skip it silently.
This shrinks the double-reply window from a whole run's length to seconds.

Reply (use the first comment's `databaseId`):
```bash
gh api "repos/$OWNER/$NAME/pulls/$PR/comments/$COMMENT_DBID/replies" \
  --method POST -f body="$REPLY"
```

Every reply is held to the **Writing style** section above, orchestrator and sub-agents alike.

Reply content by disposition:
- **SAFE-FIX (pushed, green)** → state what changed and link the proof, e.g.
  `Fixed in $SHA: added a null guard before \`x.foo\` so the empty-list case returns early. ✅`
  Then **resolve** the thread:
  ```bash
  gh api graphql -f query='mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread{ isResolved } } }' \
    -F id="$THREAD_ID"
  ```
- **QUESTION** → answer it, or ask the clarifying question you need. **Leave open.**
- **JUDGMENT / RISKY** → give your reasoning or propose an approach and ask for a steer.
  **Leave open.**
- **ACK / NIT-RESOLVE** → acknowledge / explain the decline. Resolve **only** bot threads with
  nothing actionable; leave human threads for the human to resolve.

Never resolve a thread whose last substantive content is an open question, yours or theirs.

### Visual proof (Tier 3), only when the thread demands it

Visual proof is required **only when the reviewer's comment asks about rendered appearance or
interaction** ("does the UI still render correctly?"). A code fix that happens to touch a component
is evidenced by the commit SHA like any other. For the threads that do need it, handle by
capability:

- **`CAN_VISUAL` (local run):** after the fix, capture proof with **`/ui-walkthrough`** (the same
  pipeline `/full-send` Phase 8 delegates to): screenshots of the affected surface, plus a
  window-scoped OpenCap video when the flow is interactive. Never hand-roll `opencap` here. The
  contract, including why the capture must never widen to the whole display, is
  `ui-walkthrough/opencap.md`. Attach the image to the thread reply, *then* resolve.
- **`!CAN_VISUAL` (sandbox/Routine):** do **not** resolve on a code-only basis when the reviewer
  explicitly wanted visual confirmation. Push the fix, reply ("Fixed in `$SHA`; visual confirmation
  pending a local capture"), **leave the thread open**, and add it to the Needs-you queue tagged
  **"needs local visual run."** A later local invocation picks it up and finishes the evidence.

Don't spin up a browser/dev server speculatively, only when a specific thread needs visual proof.

---

## Phase 6: Per-PR wrap

Log a compact line per PR as you finish it:
```
PR #1768  threads: 5  → fixed+resolved 3 · answered/open 2 · pushed abc1234  (CI re-triggered)
```

In a dispatched run this line, plus the needs-you items, commit SHAs, and skipped notes, **is
the sub-agent's entire return value** to the orchestrator.

---

## Phase 7: Final report

A single summary table across all PRs processed (group/sort by repo):

| Repo | PR | Threads | Fixed & resolved | Answered (left open) | Commit | Needs you |
|------|----|---------|------------------|----------------------|--------|-----------|

Then call out explicitly:
- **Needs-you items:** every thread left open and why (the human-decision queue). This is the
  most important output of a headless run.
- Any PR/thread skipped (not owned by you, dirty tree, no clone, fix reverted) and the reason.
- Commits pushed (PR → SHA), and that their CI was re-triggered.

In a headless/scheduled run this report is the artifact. Make the "needs you" list scannable so a
human can act on it in 30 seconds.

---

## Running it unattended

This skill is built to run headless. Pick the runtime by the **deepest tier you need**:

| Runtime | Tiers available | Latency on a new review comment |
|---|---|---|
| **Routine (cloud), primary** | 1 + 2. The cloud session clones the repo and runs a `yarn install` setup step, so it has the real code and toolchain. | Hourly. Routines have **no review-comment event** (only `pull_request.*` / `release.*`), so the schedule is the workhorse. A `pull_request` `labeled` trigger is an optional nudge for one PR. |
| **Local cron / `/loop`** | 1 + 2 + 3 (`browse` + OpenCap). The only runtime that can produce visual evidence. | Whatever you set, sub-hour allowed. |
| **GitHub Actions** | 1 + 2 | Seconds. The only option that triggers on `pull_request_review_comment`. |

- **Routine setup** is [routine.md](routine.md): GitHub connection (no PAT, the Claude GitHub App
  or `/web-setup`), repo selection, env setup script, the **Permissions → "Allow unrestricted
  branch pushes"** toggle, and checking out the PR head (the session starts on the default branch).
- **Local** sweeps the "needs local visual run" queue the Routine leaves behind. Use
  `/loop 2h /babysit-prs` in a session, or a `launchd`/cron entry invoking `claude -p "/babysit-prs"`.
- **GitHub Actions** setup is [github-actions.md](github-actions.md). Use it when sub-hour response
  to comments matters; otherwise the Routine's hourly sweep is simpler and lower-maintenance.

Three mechanisms make repeated and overlapping runs safe: the Phase 2 worklist rule (a thread whose
last comment is yours drops off), the Phase 5 check-before-act re-fetch, and the Phase 4
push-rejection rebase. Still stagger cadences (Routine hourly at :17, local `/loop 2h`) so overlap
stays the rare case rather than the norm.
