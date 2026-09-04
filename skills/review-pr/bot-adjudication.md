# Phase 5b: adjudicate existing bot review threads

Owned by this file, read from Phase 5b of [SKILL.md](SKILL.md): fetching the bot threads, verifying
each against the real code, the four outcomes, and the re-check before acting.

Fetch the existing **bot** review threads and **verify each against the real code**, exactly like
your own findings. Gemini Code Assist auto-reviews every PR. Copilot reviews on request. Reuse
`/babysit-prs`' GraphQL (`reviewThreads` -> `resolveReviewThread`) and `/full-send`'s bot-login
table. Logins differ across the reviews, comments, and GraphQL APIs. GraphQL drops `[bot]`, so
match `test("copilot|gemini-code-assist")`.

```bash
gh api graphql -f query='query($o:String!,$n:String!,$pr:Int!){repository(owner:$o,name:$n){
  pullRequest(number:$pr){reviewThreads(first:100){pageInfo{hasNextPage endCursor}
    nodes{ id isResolved
    comments(first:20){nodes{ databaseId author{login} body path line }}}}}}}' \
  -F o="$OWNER" -F n="$NAME" -F pr="$PR"
# hasNextPage -> paginate with endCursor; never silently truncate at 100 threads.
```

For each **unresolved bot** thread, trace it and act:

- **Legit** (verified real) -> **never resolve it**, because the author has to fix it. Surface it
  in your review summary ("Gemini's note on `X` is correct, please address"). **Never re-raise it
  as your own** finding, which only duplicates the noise.
- **False / irrelevant / already-handled** (verified wrong) -> **reply** with the one-line reason,
  then **resolve** it (`resolveReviewThread`, or the MCP review-thread write tool under
  `GH_TRANSPORT=mcp`, per [../shared/github-transport.md](../shared/github-transport.md)). This is **default on**.
  `--no-resolve-bots` replies but leaves it unresolved.

Hard rules:

- **Bot threads only. Never resolve a human's thread.**
- **Verified only. Never resolve on a guess, and never resolve a *legit* bot comment.**
- **Reply before resolve.** Always leave the why, an evidence trail. **Never dismiss silently.**
- **Re-check before acting.** Re-fetch `isResolved` and the last-comment author right before
  replying or resolving, because a concurrent run or the PR author can have handled it already.
  Already handled -> skip silently.

Bot adjudication is a **separate** section and **does not move your verdict**: a pile of bot
false-positives must not push you toward `REQUEST_CHANGES`. Your verdict stays driven by *your*
verified findings.
