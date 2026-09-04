# Phase 7: automated review

Owned by this file, read from Phase 7 of [SKILL.md](SKILL.md): the bot login table, the wait, the
review summaries, addressing and resolving every bot thread, and the CI-green gate. Phase 7 is not
finished until every bot thread is resolved and CI is green.

Up to two bots review a PR. Their logins differ between the `reviews` API and the
inline-`comments` API, so match them exactly:

| Bot | Trigger | Review author (`reviews`) | Inline author (`comments`) | Thread author (GraphQL) |
|-----|---------|---------------------------|----------------------------|--------------------------|
| GitHub Copilot | Requested in Phase 6; reviews only when usage is available | `copilot-pull-request-reviewer[bot]` | `Copilot` | `copilot-pull-request-reviewer` |
| Gemini Code Assist | Automatic on every PR (\~2 min) | `gemini-code-assist[bot]` | `gemini-code-assist[bot]` | `gemini-code-assist` |

Either, both, or neither lands. Copilot reviews only when its usage is available. The Phase 6
request can error, or GitHub drops it in silence, when Copilot is over its limit. **Do not** block
on Copilot specifically. Gemini is the fallback and arrives first in most runs. Process whichever
bot reviews are present.

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

Each bot posts a summary in its review body. Read them for feedback that is not tied to
a specific line:

```bash
gh api repos/$REPO/pulls/$PR_NUMBER/reviews \
  --jq ".[] | select($BOT_REVIEWS) | \"### \(.user.login)\n\(.body)\n\""
```

Gemini tags each inline finding with a severity badge (`high` / `medium` / `low`). Treat
HIGH and MEDIUM as actionable. Acknowledge and resolve LOW, praise, and nit comments.

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
   Both bots create standard resolvable threads. In GraphQL their authors drop the `[bot]`
   suffix, so one regex matches both:
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
