---
name: babysit-prs
description: >
  Triages unresolved review threads on open PRs that you authored, fixes the safe ones,
  replies with the fixing commit, and leaves anything ambiguous open with a question.
  Use for "babysit my PRs", "address review comments", or "handle my PR review threads".
---

# babysit-prs

## Input

Treat text accompanying the skill invocation as the input:

- **Empty** → process **all** open PRs authored by the current GitHub user across **all default
  repos** (see Targets).
- **One or more PR numbers** (e.g. `1768 1765`) → process only those PRs. PR numbers are
  ambiguous across repos, so they resolve against the **first** default repo (`Atllas-Inc/codebase`)
  unless a `--repo` is also given. Process a numbered PR only when the current user authored it
  (Scope guardrail).
- `--repo <owner/name>` → restrict this run to one repo (one of the defaults, or any other repo you
  own PRs in). Can be combined with PR numbers.

### Targets (default repos)

Process these unless `--repo` narrows the run. Each has a known local clone for making fixes:

| Repo | Local clone |
|------|-------------|
| `Atllas-Inc/codebase` | `/Users/phillip/Git/codebase` |
| `Atllas-Inc/aicc-queues` | `/Users/phillip/Git/aicc-queues` |

**Default author:** the `gh` authenticated login.

## Core safety model (do not weaken these)

Three invariants:

1. **Scope, your PRs only. Never act on a PR you did not author.** Confirm `author == gh login`
   for every PR before touching it. Skip a PR number passed in the invocation input that you do
   not own, and log a note.
2. **Evidence before resolution.** Auto-resolve a thread **only** after you pushed a real fix,
   the affected typecheck/lint/tests are green, and you posted a reply linking the fixing commit.
   **Never** resolve silently. **Never** resolve a thread you only replied to.
   Exception: resolve a thread already fixed by an earlier commit on this branch when it is
   bot-authored, verified by reading the current code at that `path` and identified via
   `git log --oneline -3 -- <path>` (Phase 3, outdated pre-step).
3. **When unsure, answer and leave open.** Reply with your reasoning or question and **leave the
   thread unresolved** for the human when a thread is a question, a judgment call, an
   architectural disagreement, security-sensitive, or the fix cannot be made green.

"Safe to auto-resolve" = **mechanical, local, obviously-correct, test-covered.** Everything else
is a reply-and-leave-open.

---

## Writing style

Copied verbatim from `~/.claude/CLAUDE.md`, which a headless run never loads.
Binding on every thread reply this skill posts and on the Phase 7 report.

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

## Preflight (runs first)

**Stop and say so when a required check fails.**

- `gh auth status`, authenticated (required). Capture the login: `ME=$(gh api user --jq .login)`.
- Resolve the **target repo set**: if the invocation input has `--repo`, resolve to that single
  repo. Otherwise, resolve to all rows in **Targets**. For each, split `OWNER=${REPO%/*}` /
  `NAME=${REPO#*/}` and map to its clone (the Targets table, or `/Users/phillip/Git/<name>` for a
  `--repo` override).
- Commit each repo's fixes in its **local clone**. Per clone, confirm it exists and its `origin`
  matches the repo. A clone is required to *fix*. Without one, **triage and reply** for that repo
  and say fixes were skipped. Resolve and check each clone **independently**: one missing clone
  disables fixes for that repo only, not the whole run.
- Each clone's working tree must be **clean** (`git status --porcelain`) before you check out PR
  branches in it. **Never stash in a headless run.** A dirty clone → triage/reply only for that
  repo (or skip it). **Never discard uncommitted work.** A dirty clone does not block the *other*
  repo.

### Capability detection

The same skill runs locally and inside a **Routine cloud sandbox**. **Detect what this environment
can do and degrade per tier instead of failing:**

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
  is required. Route fix-needed threads to the Needs-you queue.
- **Tier 3, visual evidence (screenshots/video):** needs a display + browser + recorder. Probe for
  the `browse` binary, an `opencap` install, and a reachable or startable dev server. **Never fake
  visual proof.** Flag every thread whose proof must be *visual* to the Needs-you queue marked
  **"needs local visual run"** (Phase 5).

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
# All open PRs authored by me in this repo (default), or the specific numbers from the invocation input.
gh pr list --repo "$REPO" --author "$ME" --state open \
  --json number,title,headRefName,isDraft \
  --jq '.[] | "\(.number)\t\(.headRefName)\t\(.title)"'
```

Tag each PR with its repo (and that repo's clone) so Phases 2 to 5 act in the right place.
When the invocation input named specific PRs, intersect with this list and **drop any you do not own** (Scope
guardrail) with a logged note. **Include draft PRs.**

### Dispatch, one agent per PR

Run Phases 2 to 6 for each (repo, PR) unit in its **own per-PR subagent**, because one
agent across several PRs cross-contaminates: a thread from PR A can steer a fix on PR B. The
orchestrator (this session) stays thin: preflight → enumerate → dispatch → aggregate.

**Orchestrator rules:**

- **Never read thread bodies, diffs, or repo files yourself.** Enumerate PRs and aggregate results,
  nothing else. (Optional pre-filter: run a body-free GraphQL pass fetching only `isResolved` +
  last-comment author per thread, then skip dispatch for PRs whose worklist is empty. **Never pull
  comment bodies for it.**)
- **Each dispatch prompt is self-contained:** repo, PR#, head branch, clone path, that repo's
  `CAN_FIX[$REPO]` value, `CAN_VISUAL`, and the three safety invariants (scope,
  evidence-before-resolve, unsure→leave-open). Tell the per-PR agent to run Phases 2 to 6 of
  this loaded `babysit-prs/SKILL.md` for **exactly that one PR** and nothing else.
  Point it at the **Writing style** section explicitly: a Routine sandbox has no global
  `CLAUDE.md`, so the skill is the only place those rules exist for that agent.
- **Concurrency:** run per-PR agents for **different repos in parallel** (separate clones, safe).
  Run per-PR agents for the **same repo sequentially**, because they share the clone and parallel
  checkouts in one clone corrupt each other.
- **Return contract:** each per-PR agent returns only its Phase 6 wrap, never its working
  transcript. Phase 7 is assembled from these.
- **Failure isolation:** mark a PR whose per-PR agent died or errored as `skipped (agent failed)`
  in the report. **Never let it block the other PRs.**
- **Single-PR exception:** exactly one target PR → skip dispatch and run Phases 2 to 6 inline.

**Nested dispatch:** a per-PR agent can delegate read-only work (tracing a JUDGMENT thread across
the codebase, classification reads on a 30-thread worklist) to Explore helper agents that return
compact answers. Two rules keep nesting safe:

- **Single writer per PR.** Run every mutation (file edits, commits, pushes, replies, resolves) in
  the per-PR agent itself. **Never mutate from a helper agent.**
- **Depth cap:** orchestrator → per-PR agent → read-only helper agents. **Never nest deeper.**
  **Do not** spawn speculatively: run Phases 2 to 6 inline for a PR with a handful of threads.

---

## Phase 2: Fetch the actionable threads for one PR

Pull every review thread with the data needed to reply (`databaseId`), resolve (`id`), and
classify (author, body, path, line):

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

Include `$NAME` in every temp path, because PR numbers repeat across repos and parallel per-repo
agents writing `/tmp/babysit-$PR-*` can clobber each other. Paginate with `endCursor` when
`pageInfo.hasNextPage` is true (100+ threads). **Never silently truncate the worklist.**

Build the **worklist** = threads that are **all** of:
- `isResolved == false`, and
- the **last** comment's author is **not** `$ME` (you already replied, so it is the human's move.
  Skip it to stay idempotent and avoid double-replies on re-runs), and
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
assign exactly one disposition. **Be conservative.**

| Disposition | Signal | Examples | Action |
|---|---|---|---|
| **SAFE-FIX** | Mechanical, local, unambiguous. The correct change is obvious from the comment plus the code, touches a small well-understood region, and is (or can be) covered by an existing test. | Null/undefined guard, off-by-one, wrong variable, missing `await`, unused import, typo, obvious rename, a missing `data-testid`, tighten a type, a nit the bot spelled out exactly. | **Fix it** (Phase 4). |
| **QUESTION** | The reviewer is *asking* something, or the right answer needs context only you have. | "why do we...?", "is this intentional?" | **Reply** with the answer or explanation. **Leave open.** |
| **JUDGMENT / RISKY** | A plausible fix can be wrong. | Architectural disagreement, public API / contract / migration change, security- or auth-sensitive code, money/billing logic, a large refactor. | **Reply** with your take or a question. **Leave open.** Do **not** auto-fix risky surfaces even if the change *looks* mechanical. |
| **ACK / NIT-RESOLVE** | Nothing to change. | Praise, or a trivial bot nit you are declining for a stated reason. | **Reply** acknowledging or explaining the decline. Resolve **only if** the author is a **bot** and there is genuinely nothing actionable. A **human** ACK thread gets a reply, they resolve it. |

**Pre-step, outdated threads (`isOutdated == true`):** the diff hunk the comment anchored to has
changed since the comment was written, a hint that a later commit addressed the concern. Before
classifying, read the **current** code at that `path` and check whether the concern still applies.

- **Already addressed** (verify against the current head that the flagged code was rewritten, and
  find the commit with `git log --oneline -3 -- <path>`): reply with the evidence
  (`Addressed by <sha>: <one line on what changed>`), then resolve **only if bot-authored**.
  Human-authored → reply with the same evidence, leave open for them to resolve.
- **Still applies** (the line moved but the issue persists): classify with the table above.
  Outdated is a hint to check. **Never treat it as a reason to dismiss a thread.**

When torn between SAFE-FIX and QUESTION/JUDGMENT, choose the more conservative one. Record the
disposition + one-line reason per thread for the final report.

---

## Phase 4: Apply the safe fixes for this PR

Run this phase only when the PR has ≥1 SAFE-FIX thread. Check out the PR branch into the local
clone:

```bash
cd "$CLONE"                 # THIS PR's repo clone (from the Targets map)
git fetch origin
gh pr checkout "$PR" --repo "$REPO"   # checks out the head branch, tracking the PR
git pull --ff-only 2>/dev/null || true
```

For each SAFE-FIX thread: **Read the file**, then make the minimal change the comment calls for and
nothing more. Stay in scope. **Never make an opportunistic refactor.** Keep a map of
`thread.id → {fixed, commitSha, note}` as you go.

**codebase only:** when modifying a shared package (`sdk`, `privs`, `common`, `ui`), rebuild it
(`cd packages/<name> && yarn build`) per repo convention. aicc-queues is Gradle and has no
`packages/` directory.

After all fixes for this PR, **verify**. Run only what the changed files touch, using **the verify
commands of that repo's stack**. **Never run the whole monorepo.**

```bash
# codebase: Yarn 3 (Berry) + Turbo monorepo, per affected workspace.
cd apps/api && yarn ci:typecheck 2>&1 | tail -30
cd apps/agents-portal && yarn lint 2>&1 | tail -30
# plus the nearest test target (e.g. vitest) for the changed code, if one exists

# aicc-queues: Gradle/JVM. Compile-only in the cloud, per the verification depth table below.
./gradlew --no-daemon compileJava
./gradlew --no-daemon :<module>:test     # local only, when Redis+Postgres are up
```

**Verification depth per repo sets the auto-resolve bar.**

| Repo | Verification depth | Auto-resolve bar |
|---|---|---|
| `codebase` | Full Tier 2: per-workspace `yarn ci:typecheck`, `turbo run lint`, `vitest`. Some vitest suites need Firebase emulators; typecheck and lint always work. | Green typecheck, lint, and the nearest test target. |
| `aicc-queues` (cloud sandbox) | **Compile-only**, because its integration tests need Redis and Postgres, absent there. "Verified" means *compiles*, not *tests pass*. | Auto-resolve genuinely mechanical fixes only. Route anything whose correctness depends on runtime behavior to the Needs-you queue instead of resolving it on a compile alone. |

- **Green** → commit the batch and push:
  ```bash
  git add <specific changed files, never git add .>
  git commit -m "fix(<scope>): address review feedback on #$PR"
  git push
  SHA=$(git rev-parse HEAD)
  ```
  Record `$SHA` against every thread fixed in this batch (evidence for Phase 5).
  **Push rejected (non-fast-forward)?** A concurrent run (Routine vs. local) pushed to this
  branch first. `git pull --rebase`, re-verify, push again. If the rebase conflicts, abort it
  and report the PR as `skipped (concurrent push)`. **Never force-push.**
- **A fix breaks verification** → **one** correction attempt, in scope, no new files and no new
  dependencies. If it is still not green, **revert that specific fix**
  (`git checkout -- <file>` / `git restore`), and **downgrade that thread to QUESTION**: reply
  ("attempted a fix but it broke <X>, leaving for you") and leave it open. **Do not push broken
  code. Do not let one bad fix block the good ones.**

> **Do not block on CI here**, because a scheduled run must not hang for 20 min. Pushing
> re-triggers the PR's checks. Note in the report that CI was re-triggered. Run
> `gh pr checks "$PR" --watch --interval 30` only when you want a gate, and time-box it.

---

## Phase 5: Reply and (only where earned) resolve

For **every** worklist thread, post a reply to the thread's first comment, then resolve only the
ones that earned it.

**Check-before-act (concurrent-run guard):** immediately before replying, re-fetch the thread's
state (last-comment author + `isResolved`, one cheap GraphQL call for the PR). Skip the thread
silently when the last comment is now yours or the thread is resolved, because another run got
there first.

Reply (use the first comment's `databaseId`):
```bash
gh api "repos/$OWNER/$NAME/pulls/$PR/comments/$COMMENT_DBID/replies" \
  --method POST -f body="$REPLY"
```

Hold every reply to the **Writing style** section above, orchestrator and per-PR agents alike.

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
  nothing actionable. Leave human threads for the human to resolve.

**Never resolve a thread whose last substantive content is an open question, yours or theirs.**

### Visual proof (Tier 3), only when the thread demands it

Visual proof is required **only when the reviewer's comment asks about rendered appearance or
interaction** ("does the UI still render correctly?"). Evidence a code fix that only touches a
component with the commit SHA, like any other fix. Handle a thread that needs visual proof by
capability:

- **`CAN_VISUAL` (local run):** after the fix, capture proof with **`/ui-walkthrough`**: screenshots
  of the affected surface, plus a window-scoped OpenCap video when the flow is interactive.
  **Never hand-roll `opencap` here.** `ui-walkthrough/opencap.md` owns the capture contract,
  including why the capture never widens to the whole display. Attach the image to the thread
  reply, *then* resolve.
- **`!CAN_VISUAL` (sandbox/Routine):** **Do not** resolve on a code-only basis when the reviewer
  explicitly wanted visual confirmation. Push the fix, reply ("Fixed in `$SHA`. Visual confirmation
  pending a local capture"), **leave the thread open**, and add it to the Needs-you queue tagged
  **"needs local visual run."** A later local invocation picks it up and finishes the evidence.

**Do not** spin up a browser or dev server unless a specific thread needs visual proof.

---

## Phase 6: Per-PR wrap

Log a compact line per PR as you finish it:
```
PR #1768  threads: 5  → fixed+resolved 3 · answered/open 2 · pushed abc1234  (CI re-triggered)
```

In a dispatched run this line, plus the Needs-you items, commit SHAs, and skipped-thread notes,
**is the per-PR agent's entire return value** to the orchestrator.

---

## Phase 7: Final report

Print a single summary table across all PRs processed (group/sort by repo):

| Repo | PR | Threads | Fixed & resolved | Answered (left open) | Commit | Needs you |
|------|----|---------|------------------|----------------------|--------|-----------|

Then call out explicitly:
- **Needs-you items:** every thread left open and why (the human-decision queue).
- Any PR/thread skipped (not owned by you, dirty tree, no clone, fix reverted) and the reason.
- Commits pushed (PR → SHA), and that their CI was re-triggered.

Make the Needs-you queue scannable so a human can act on it in 30 seconds.

---

## Running it unattended

Pick the runtime by the **deepest tier you need**:

| Runtime | Tiers available | Latency on a new review comment |
|---|---|---|
| **Routine (cloud), primary** | 1 + 2. The cloud session clones the repo and runs a `yarn install` setup step, so it has the real code and toolchain. | Hourly. Routines have **no review-comment event** (only `pull_request.*` / `release.*`), so the schedule is the workhorse. A `pull_request` `labeled` trigger is an optional nudge for one PR. |
| **Local cron / `/loop`** | 1 + 2 + 3 (`browse` + OpenCap). The only runtime that can produce visual evidence. | Whatever you set, sub-hour allowed. |
| **GitHub Actions** | 1 + 2 | Seconds. The only option that triggers on `pull_request_review_comment`. |

- **Read [routine.md](routine.md) before you set up the Routine.** It owns the GitHub connection,
  repo selection, environment setup script, triggers, and the permission toggles the Routine needs.
- **Local** sweeps the "needs local visual run" queue the Routine leaves behind. Use the host's
  recurring-task mechanism. Claude Code can also run `/loop 2h /babysit-prs`.
- **Read [github-actions.md](github-actions.md) before you set up the Actions bot.** It owns the
  workflow file, the CI-only safety deltas, and the bot identity options. Choose it when sub-hour
  response to comments matters. Otherwise, the Routine's hourly sweep is simpler and
  lower-maintenance.

Stagger cadences (Routine hourly at :17, local `/loop 2h`) so overlapping runs stay rare.
