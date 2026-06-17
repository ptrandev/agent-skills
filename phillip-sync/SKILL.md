---
name: phillip-sync
description: >
  Keeps the /phillip review rubric fresh by learning from the current repo's recent PR
  reviews. Auto-detects the repo, honors a 24h per-repo cooldown, computes a since-cursor
  (30-day cap), fetches resolved-and-acted-on review comments (merged PRs) across reviewers
  via the GitHub GraphQL API, distills recurring + generalizable + novel patterns, and writes
  high-confidence entries into section 1 of ~/.claude/skills/phillip/SKILL.md (one-offs go
  to Candidates). Non-blocking: degrades to a single warning line if gh is missing, not
  authenticated, offline, or anything errors. Run automatically by /phillip before its
  review loop; can also be invoked directly as "phillip sync" or "refresh the rubric".
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
comments and folding the recurring lessons back into `~/.claude/skills/phillip/SKILL.md`.
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
- ONE REPO AT A TIME. The cross-block handoff uses fixed `/tmp/phillip_sync_*` paths. Running
  `/phillip` in two DIFFERENT repos at the same instant is detected by a slug-consistency
  guard (steps 4 and 7) and safely SKIPPED, not corrupted -> just run reviews one repo at a
  time and there's nothing to think about.

Paths used throughout:
- Rubric file: `~/.claude/skills/phillip/SKILL.md`
- State file: `~/.claude/skills/phillip/.sync-state.json`

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
test -f "$HOME/.claude/skills/phillip/SKILL.md" || { echo "phillip-sync: ~/.claude/skills/phillip/SKILL.md not found -> skipping."; exit 0; }
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

Later steps re-read the slug from `/tmp/phillip_sync_slug.txt` and `/tmp/phillip_sync_plan.json`
(each Bash call is a fresh shell, so `$SLUG` does NOT survive across blocks).

## 3. Cooldown + SINCE from the per-repo cursor (30-day cap)

The state file is shaped:

```json
{ "<owner/repo>": { "lastSync": "<ISO8601>" } }
```

Compute cooldown and SINCE in one python pass, reading the slug from the file step 2 wrote
(fresh shell -> do NOT rely on `$SLUG` surviving). SINCE = max(cursor.lastSync, now-30d);
cold start (no cursor) -> now-30d. The slug is written into the plan file too, so step 7 can
read it back.

```bash
python3 - "$(cat /tmp/phillip_sync_slug.txt 2>/dev/null)" <<'PY' || { echo "phillip-sync: state read failed -> skipping."; exit 0; }
import json, os, sys, datetime
slug = sys.argv[1] if len(sys.argv) > 1 else ""
if not slug:
    print("phillip-sync: no slug -> skipping"); raise SystemExit(0)
p = os.path.expanduser("~/.claude/skills/phillip/.sync-state.json")
now = datetime.datetime.now(datetime.timezone.utc)
state = {}
if os.path.exists(p):
    try: state = json.load(open(p))
    except Exception: state = {}
last = (state.get(slug) or {}).get("lastSync")
cooldown = False
floor = now - datetime.timedelta(days=30)
since = floor
if last:
    try:
        lt = datetime.datetime.fromisoformat(last.replace("Z","+00:00"))
        if (now - lt).total_seconds() < 24*3600:
            cooldown = True
        since = max(lt, floor)
    except Exception:
        pass
out = {
  "slug": slug,
  "cooldown": cooldown,
  "lastHuman": last or "never",
  "since": since.strftime("%Y-%m-%dT%H:%M:%SZ"),
}
json.dump(out, open("/tmp/phillip_sync_plan.json","w"))
print("cooldown" if cooldown else "go", "| since", out["since"], "| last", out["lastHuman"])
PY
```

If cooldown -> print and STOP (everything read from the plan file; fresh shell):

```bash
COOLDOWN=$(python3 -c "import json;print(json.load(open('/tmp/phillip_sync_plan.json')).get('cooldown'))" 2>/dev/null)
LASTH=$(python3 -c "import json;print(json.load(open('/tmp/phillip_sync_plan.json')).get('lastHuman'))" 2>/dev/null)
if [ "$COOLDOWN" = "True" ]; then echo "phillip-sync: rubric fresh (synced $LASTH ago) -> skipping."; exit 0; fi
```

## 4. Fetch recent PR reviews (one capped GraphQL page)

One page of the <= 40 most-recently-updated MERGED PRs in the window, capped server-side via
`first:40` + `sort:updated-desc` -> no client-side pagination, no multi-object concatenation,
no brace-splitting. Merged-only is a strong "acted-on / shipped" signal. Read repo + window
from the files step 2/3 wrote (fresh shell):

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

# One JSON object (no pagination). Extract PR nodes; degrade to empty on any error.
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
next step. If the file is empty / `[]`, there is nothing to learn this window -> jump
straight to step 7 (update the cursor so the cooldown still applies) and stop.

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

This is a heuristic from thread state + merge status, not diff-level proof that the exact
change shipped. That's deliberate -> it's good enough to SEED the rubric, and the recurrence
bar plus the human-gated Candidates block catch what the heuristic misses.

Learn from all reviewers present in the fetched threads (diversity of perspective), not just
one pair. (Per-PR fetch is capped at 50 threads / 20 comments / 50 reviews -> ample for
typical PRs; a very busy PR may be partially sampled.) You MAY weight the repo owner / a
clearly senior reviewer slightly higher, but RECURRENCE is the primary weight -> one senior
comment is a Candidate, the same issue raised twice is rubric.

From the kept comments, keep only patterns that are ALL of:
- (a) RECURRING -> the same class of issue appears in >= 2 distinct threads/PRs.
- (b) GENERALIZABLE -> a class of bug (e.g. "fetch not checking response.ok"), not a
  one-file detail ("rename `foo` in bar.ts:14").
- (c) NOVEL -> not already covered by an existing rubric line in section 1 of
  `~/.claude/skills/phillip/SKILL.md` (Read it and compare meaning, not exact words).
- (d) ACTED-ON -> per the resolution rule above.

Phrase each survivor as ONE terse rubric line in the existing taxonomy: category + a
severity marker (HIGH / MEDIUM / low) + a one-line concrete example. Match the voice of the
existing "Categories Phillip reliably catches" bullets. Example shape:

  `- Silent failures: a Firestore write whose promise is not awaited -> the handler returns
    200 before the write lands (PR #1681, #1693).`

Bucket your survivors:
- HIGH-CONFIDENCE (recurring + acted-on + generalizable + novel) -> the `auto` block.
- Everything weaker (single strong senior comment, plausibly generalizable but only seen
  once, or you're unsure it's novel) -> the `candidates` block.

Build, in memory, two lists of fully-formatted bullet lines. Dedupe each new line against
(i) the existing rubric text and (ii) the current contents of the two anchored blocks before
writing. (The since-cursor plus this text dedupe prevent re-adding the same lesson; there is
no separate seen-thread ledger to maintain.)

If after dedupe BOTH lists are empty -> print "phillip-sync: no new patterns" and go to
step 7 (still update the cursor).

## 6. Write into the anchored blocks (idempotent, provenance-tagged)

Section 1 of the rubric contains two stable anchor pairs (created during setup):

- Auto block:
  `<!-- phillip-sync:auto START -->` ... `<!-- phillip-sync:auto END -->`
- Candidates block:
  `<!-- phillip-sync:candidates START -->` ... `<!-- phillip-sync:candidates END -->`

If either anchor pair is missing (older rubric), do NOT guess a spot -> print
"phillip-sync: anchors missing in rubric -> skipping write (re-run setup to add them)." and
go to step 7. (You may, if confident, insert the missing block at the end of section 1, but
prefer skipping over mangling the file.)

For each NEW high-confidence line, APPEND it just before `<!-- phillip-sync:auto END -->`.
For each NEW candidate line, APPEND it just before `<!-- phillip-sync:candidates END -->`.
Use the Edit tool, anchoring on the END marker so insertion is deterministic. Tag every
auto-added line with a small provenance suffix:

  `  _(auto-synced from PR reviews 2026-06-17)_`

Concretely, to add one auto line, Edit the END marker like:

  old_string:
  ```
  <!-- phillip-sync:auto END -->
  ```
  new_string:
  ```
  - <your new rubric line>  _(auto-synced from PR reviews <today>)_
  <!-- phillip-sync:auto END -->
  ```

Repeat per line (or batch several lines above the marker in one Edit). Because you deduped
in step 5 against the block's current contents, re-runs never insert a duplicate -> the
write is idempotent. Candidates get the same treatment against the candidates END marker;
candidate lines do NOT need the provenance suffix (the block heading already says
auto-detected), but include the date in parentheses so humans can age them out.

Get today's date for the provenance tag:

```bash
date +%F
```

## 7. Update the per-repo cursor

Persist `lastSync = now` for this repo. This arms the 24h cooldown and shrinks the next
window. Do it even when nothing was written, so a no-op still costs ~0 next time within 24h.
Read the slug from the plan file (fresh shell -> do not rely on `$SLUG`):

```bash
CUR=$(gh repo view --json owner,name -q '.owner.login + "/" + .name' 2>/dev/null)
python3 - "$CUR" <<'PY' || { echo "phillip-sync: cursor update skipped (non-fatal)."; exit 0; }
import json, os, sys, datetime
cur = sys.argv[1] if len(sys.argv) > 1 else ""
try: plan=json.load(open("/tmp/phillip_sync_plan.json"))
except Exception: plan={}
slug=plan.get("slug")
if not slug: raise SystemExit(0)
if cur and cur != slug:   # concurrency guard: plan belongs to another repo -> don't touch its cursor
    print("phillip-sync: cursor skip (state for", slug, "but repo is", cur + ")"); raise SystemExit(0)
p=os.path.expanduser("~/.claude/skills/phillip/.sync-state.json")
state={}
if os.path.exists(p):
    try: state=json.load(open(p))
    except Exception: state={}
state.setdefault(slug, {})["lastSync"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")  # preserve any sibling keys
os.makedirs(os.path.dirname(p), exist_ok=True)
# Atomic write (temp + os.replace): an interrupted or concurrent cross-repo write can't
# truncate/corrupt the cursor JSON; the replace is atomic on the same filesystem.
_tmp = p + ".tmp"
json.dump(state, open(_tmp,"w"), indent=2)
os.replace(_tmp, p)
print("phillip-sync: cursor updated ->", slug, state[slug]["lastSync"])
PY
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
