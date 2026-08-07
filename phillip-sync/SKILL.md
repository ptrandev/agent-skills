---
name: phillip-sync
description: >
  Mines the current repo's recent resolved PR reviews and folds recurring, generalizable
  lessons into the /phillip rubric at ~/.claude/skills/phillip/RUBRIC.md. Runs as a
  non-blocking pre-step inside /phillip: on any missing tool, auth, or network problem it
  prints one warning line and returns success.
triggers:
  - /phillip-sync
  - phillip sync
  - refresh the rubric
  - sync the phillip rubric
allowed-tools:
  - Bash
  - Read
  - Edit
  - Write
  - Grep
---

# phillip-sync -> self-updating review rubric

You keep the `/phillip` rubric current by mining THIS repo's recent, resolved PR-review
comments and folding the recurring lessons back into `~/.claude/skills/phillip/RUBRIC.md`.
You are RUN BY Claude (you read the gh JSON and judge each thread yourself). You run as a
pre-step inside `/phillip`, so be cheap and NEVER block the review.

Be terse. Use `->`, not em dashes. Never print tokens or keys.

## 0. Hard rules (read first)

- NON-BLOCKING. If anything is missing or fails -> print ONE warning line and STOP with
  success so `/phillip` proceeds on the existing rubric. Never error out, never block.
- COOLDOWN. If this repo synced < 24h ago -> print one "rubric fresh" line and STOP.
- IDEMPOTENT. Re-running adds nothing already present. Anchored blocks are the only thing
  you ever rewrite, and you dedupe before writing.
- SECURITY. `gh` owns its auth token. Never echo it, never print env that holds it.
- ONE REPO AT A TIME. A slug-consistency guard in steps 4 and 7 detects a concurrent run in a
  different repo and SKIPS, so the shared `/tmp/phillip_sync_*` files are never corrupted.

Paths used throughout:
- Rubric file: `~/.claude/skills/phillip/RUBRIC.md`
- State file: `~/.claude/skills/phillip/.sync-state.json`
- Scripts: `~/.claude/skills/phillip-sync/scripts/plan.py` and
  `~/.claude/skills/phillip-sync/scripts/cursor.py` (invoke by that literal installed path,
  a skill has no reliable `$0`)

HARD RULE, applies to every code block below: each Bash call is a fresh shell, so NO shell
variable survives between blocks. All cross-block state goes through two files,
`/tmp/phillip_sync_slug.txt` (the repo slug, written in step 2) and
`/tmp/phillip_sync_plan.json` (slug + cooldown + since window, written in step 3). Re-read
them in every later block. Never rely on `$SLUG` or `$SINCE` carrying over.

## 1. Guard: is sync even possible? (non-blocking)

Run this. Any failure -> print the warning it emits and STOP (success).

```bash
# gh present?
command -v gh >/dev/null 2>&1 || { echo "phillip-sync: gh not installed -> skipping rubric sync (using existing rubric)."; exit 0; }
# gh authenticated? (does not print the token)
gh auth status >/dev/null 2>&1 || { echo "phillip-sync: gh not authenticated -> skipping rubric sync (run 'gh auth login')."; exit 0; }
# inside a git repo with a remote?
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "phillip-sync: not a git repo -> skipping rubric sync."; exit 0; }
echo "phillip-sync: guards passed"
```

If the rubric file is missing, this skill has nothing to update -> warn and stop:

```bash
test -f "$HOME/.claude/skills/phillip/RUBRIC.md" || { echo "phillip-sync: ~/.claude/skills/phillip/RUBRIC.md not found -> skipping."; exit 0; }
```

## 2. Detect the current repo (any project, not just Atllas)

```bash
SLUG=$(gh repo view --json owner,name -q '.owner.login + "/" + .name' 2>/dev/null)
if [ -z "$SLUG" ]; then
  # Fallback: parse the origin remote URL (handles git@ and https forms, strips .git)
  URL=$(git remote get-url origin 2>/dev/null)
  SLUG=$(printf '%s\n' "$URL" | sed -E 's#^git@[^:]+:##; s#^https?://[^/]+/##; s#\.git$##')
fi
[ -z "$SLUG" ] && { echo "phillip-sync: could not resolve owner/repo -> skipping."; exit 0; }
printf '%s' "$SLUG" > /tmp/phillip_sync_slug.txt   # persist: later Bash calls are fresh shells
echo "repo: $SLUG"
```

## 3. Cooldown + SINCE from the per-repo cursor (30-day cap)

The state file is shaped:

```json
{ "<owner/repo>": { "lastSync": "<ISO8601>" } }
```

`plan.py` computes both in one pass. SINCE = max(cursor.lastSync, now-30d); cold start (no
cursor) -> now-30d. It writes the slug into the plan file too, so step 7 can read it back.

```bash
python3 "$HOME/.claude/skills/phillip-sync/scripts/plan.py" "$(cat /tmp/phillip_sync_slug.txt 2>/dev/null)" \
  || { echo "phillip-sync: state read failed -> skipping."; exit 0; }
```

If cooldown -> print and STOP:

```bash
COOLDOWN=$(python3 -c "import json;print(json.load(open('/tmp/phillip_sync_plan.json')).get('cooldown'))" 2>/dev/null)
LASTH=$(python3 -c "import json;print(json.load(open('/tmp/phillip_sync_plan.json')).get('lastHuman'))" 2>/dev/null)
if [ "$COOLDOWN" = "True" ]; then echo "phillip-sync: rubric fresh (synced $LASTH ago) -> skipping."; exit 0; fi
```

## 4. Fetch recent PR reviews (one capped GraphQL page)

One page: the <= 40 most-recently-updated MERGED PRs in the window (`first:40`,
`sort:updated-desc`). Merged-only signals acted-on.

The filter is `updated:>=`, not `merged:>=`. A PR merged months ago but updated yesterday
re-enters the window carrying ALL its old threads, so do NOT treat every returned thread as
new since the cursor. The step 5 text dedupe absorbs the repeats.

```bash
SLUG=$(cat /tmp/phillip_sync_slug.txt 2>/dev/null)
SINCE=$(python3 -c "import json;print(json.load(open('/tmp/phillip_sync_plan.json')).get('since',''))" 2>/dev/null)
{ [ -n "$SLUG" ] && [ -n "$SINCE" ]; } || { echo "phillip-sync: missing repo/window -> skipping."; exit 0; }
# Concurrency guard: if a sync in ANOTHER repo clobbered the temp slug, it won't match this
# repo -> skip rather than mine the wrong one (see "ONE REPO AT A TIME" in the hard rules).
CUR=$(gh repo view --json owner,name -q '.owner.login + "/" + .name' 2>/dev/null)
[ -n "$CUR" ] && [ "$CUR" != "$SLUG" ] && { echo "phillip-sync: temp state is for $SLUG but this repo is $CUR (concurrent run?) -> skipping."; exit 0; }
SINCE_DATE=${SINCE%%T*}   # date granularity (YYYY-MM-DD); may re-scan the last-sync day, but the text dedupe drops repeats
echo "phillip-sync: syncing $SLUG since $SINCE_DATE"

# Single page (first:40), newest-updated first, merged PRs only -> one JSON object.
gh api graphql \
  -f query='query($q:String!){ search(query:$q,type:ISSUE,first:40){ nodes{ ... on PullRequest { number title author{login} updatedAt mergedAt reviewThreads(first:50){nodes{ isResolved comments(first:20){nodes{ author{login} body path line createdAt }}}} reviews(first:50){nodes{ author{login} body state submittedAt }} }}}}' \
  -F q="repo:${SLUG} is:pr is:merged sort:updated-desc updated:>=${SINCE_DATE}" \
  > /tmp/phillip_sync_prs.json 2>/tmp/phillip_sync_err.txt \
  || { echo "phillip-sync: GitHub fetch failed ($(head -1 /tmp/phillip_sync_err.txt 2>/dev/null)) -> using existing rubric."; exit 0; }

# Extract PR nodes; degrade to empty on any error.
python3 - <<'PY' || { echo "phillip-sync: parse failed -> using existing rubric."; exit 0; }
import json
try: d=json.load(open("/tmp/phillip_sync_prs.json"))
except Exception: d={}
nodes=((d.get("data") or {}).get("search") or {}).get("nodes") or []
json.dump(nodes, open("/tmp/phillip_sync_capped.json","w"), indent=2)
print(f"phillip-sync: {len(nodes)} merged PR(s) in window")
PY
```

Now READ `/tmp/phillip_sync_capped.json` with the Read tool. That JSON is your input for the
next step. If the file is empty / `[]`, there is nothing to learn this window -> go to step 7
(update the cursor so the cooldown still applies), then print the step 8 summary line, then
return success.

## 5. Distill (your own reasoning over the JSON)

Read the JSON. For EACH review thread across ALL PRs, judge it like Phillip would:

RESOLUTION = the quality signal. Keep a comment's lesson ONLY if the thread was accepted
and acted on:
- KEEP when `isResolved: true` AND the evidence says the author acted on it -> a later
  comment in the thread agrees / says "fixed" / "good catch", or a review with
  `state: CHANGES_REQUESTED` was later followed by `state: APPROVED`, or the PR shipped
  after the comment with the change applied.
- EXCLUDE threads that were dismissed, declined, "won't fix", "by design", "out of scope",
  or explicitly accepted as a tradeoff. An unresolved thread is weak evidence -> exclude
  unless the same lesson recurs elsewhere from resolved threads.

Learn from all reviewers present in the fetched threads, not just one pair.

The per-PR fetch is capped at 50 threads / 20 comments / 50 reviews. That is ample for typical
PRs; a very busy PR may be partially sampled.

You MAY weight the repo owner / a clearly senior reviewer slightly higher, but RECURRENCE is
the primary weight -> one senior comment is a Candidate, the same issue raised twice is rubric.

From the kept comments, keep only patterns that are ALL of:
- (a) RECURRING -> the same class of issue appears in >= 2 distinct threads/PRs.
- (b) GENERALIZABLE -> a class of bug (e.g. "fetch not checking response.ok"), not a
  one-file detail ("rename `foo` in bar.ts:14").
- (c) NOVEL -> not already covered by ANY row in `~/.claude/skills/phillip/RUBRIC.md`. Read
  that file and compare meaning, not exact words, against ALL THREE anchored blocks: `auto`,
  `candidates`, AND `auto-donotflag`. A pattern already sitting in `candidates` is NOT novel,
  so it can never be re-mined into `auto` a month later. A pattern matching a `donotflag` row
  is the inverse of a finding -> drop it.
- (d) ACTED-ON -> per the resolution rule above.

Phrase each survivor as ONE table row in the rubric's column order:

  `| <repo> | <category> | <trigger -> failure> | <rule> | <YYYY-MM-DD> |`

- REPO: the slug from `/tmp/phillip_sync_slug.txt` when the pattern names identifiers,
  products, or services specific to this repo. `any` when the lesson holds in any codebase.
  Never leave it blank -> readers skip rows tagged to a repo other than the one they review.
- CATEGORY: one value from the closed set at the top of `RUBRIC.md` (Security, Races, Silent
  failures, Correctness, Performance, Data loss, Comments, Encoding, Docs, Tests, UI,
  Permissions, Firestore).
- TRIGGER -> FAILURE: the pattern plus its concrete user-visible consequence. One idea.
- RULE: what to do instead. One idea. Split a survivor carrying more than one pattern into
  one row per pattern rather than packing them into a single cell.
- Escape every literal `|` inside a cell as `\|`, including inside backticks, or the row
  breaks the table.
- Candidate rows put `PR #<n>, <YYYY-MM-DD>` in the Added column instead of a bare date.

Bucket your survivors:
- All four of (a) to (d) -> the `auto` block.
- Any one of the four uncertain -> the `candidates` block.
- A DECLINED comment class (the thread resolved with the reviewer being told the comment was
  wrong, unreachable, or unwanted) -> the `auto-donotflag` block, using its own column shape:
  `| <repo> | <category> | <pattern> | <why it is not a finding> | <YYYY-MM-DD> |`.

Build, in memory, the lists of fully-formatted rows. Dedupe each new row against the current
contents of all three anchored blocks before writing.

If after dedupe ALL lists are empty -> print "phillip-sync: no new patterns" and go to
step 7 (still update the cursor).

## 6. Write into the anchored blocks (idempotent, provenance-tagged)

`RUBRIC.md` contains three stable anchor pairs:

- Auto block:
  `<!-- phillip-sync:auto START -->` ... `<!-- phillip-sync:auto END -->`
- Do-not-flag block:
  `<!-- phillip-sync:auto-donotflag START -->` ... `<!-- phillip-sync:auto-donotflag END -->`
- Candidates block:
  `<!-- phillip-sync:candidates START -->` ... `<!-- phillip-sync:candidates END -->`

If any anchor pair is missing (older rubric), do NOT guess a spot and do NOT insert the block
yourself. ALWAYS skip the write. Print: "phillip-sync: anchors missing in RUBRIC.md ->
skipping write. Fix: copy the missing `<!-- phillip-sync:... START/END -->` marker lines from
the repo clone's `phillip/RUBRIC.md` into the installed
`~/.claude/skills/phillip/RUBRIC.md`." Then go to step 7.

For each NEW row, APPEND it just before its block's END marker, using the Edit tool anchored
on that END marker so insertion is deterministic. Get today's date for the Added column with
`date +%F` and tag every new row with it.

Concretely, to add one auto row, Edit the END marker like:

  old_string:
  ```
  <!-- phillip-sync:auto END -->
  ```
  new_string:
  ```
  | any | Races | <trigger -> failure> | <rule> | <today> |
  <!-- phillip-sync:auto END -->
  ```

Do not leave a blank line between the last row and the END marker; the rows must stay
contiguous with the table header or the table breaks. Repeat per row, or batch several rows
above the marker in one Edit.

### 6b. Retirement (the blocks are capped, not monotonic)

Run this AFTER inserting this run's rows. Without it the file grows about 4 rows per week per
repo and never shrinks.

- RECONFIRM instead of duplicating. When a survivor matches an existing row, do not insert.
  Edit that row's Added column to today's date. That is what "re-observed" means below.
- AUTO block cap: 40 rows. If inserting would exceed 40, move the rows with the oldest Added
  date back into the `candidates` block, oldest first, until 40 remain. Moving preserves the
  row verbatim; only its block changes.
- CANDIDATES block cap: 30 rows. A candidate row whose Added date is more than 90 days old
  AND was not re-observed this run is DELETED. If the block still exceeds 30 rows after that,
  delete the oldest rows until 30 remain.
- DO-NOT-FLAG block: no cap and no retirement. It is small and each row prevents a recurring
  false positive.
- Report every retirement in the step 8 summary (e.g. "-2 auto -> candidates, -1 candidate
  expired") so a human can see what left.

## 7. Update the per-repo cursor

Persist `lastSync = now` for this repo. This arms the 24h cooldown and shrinks the next
window. Do it even when nothing was written, so a no-op still costs \~0 next time within 24h.

```bash
CUR=$(gh repo view --json owner,name -q '.owner.login + "/" + .name' 2>/dev/null)
python3 "$HOME/.claude/skills/phillip-sync/scripts/cursor.py" "$CUR" \
  || { echo "phillip-sync: cursor update skipped (non-fatal)."; exit 0; }
```

## 8. One-line summary

Print exactly one closing line, e.g.:
`phillip-sync: +2 rubric, +1 candidate from 7 PRs (Atllas-Inc/codebase). Cursor armed (24h cooldown).`
or, on any guard/cooldown/empty path, the single line that branch already printed. Then
return success so `/phillip` continues into its review loop.

## Cleanup

These temp files are disposable; leaving them is fine, but you may remove them:

```bash
rm -f /tmp/phillip_sync_prs.json /tmp/phillip_sync_capped.json /tmp/phillip_sync_plan.json /tmp/phillip_sync_slug.txt /tmp/phillip_sync_err.txt 2>/dev/null; true
```
