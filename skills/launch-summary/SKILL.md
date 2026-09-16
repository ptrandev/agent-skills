---
name: launch-summary
version: 2.3.0
description: >
  Summarizes what shipped across the Atllas repos over a daily or weekly window, written for
  non-developers. Counts only PRs merged to each repo's default branch. Use for "what
  did we launch today", "weekly summary", or "launch recap".
allowed-tools:
  - Bash
  - Read
  - Write
---

## Instructions

Generate a **non-developer-friendly launch summary** from merged pull requests across four GitHub repos: `Atllas-Inc/codebase`, `Atllas-Inc/aicc-queues`, `Atllas-Inc/neema-simple-hyzl`, and `Atllas-Inc/pointsgpt`.

The skill takes one argument, the window: `daily` or `weekly`. **If the user gives no argument, use `daily`.** The window sets the timeframe and nothing else. Every later step is shared.

### Step 1: Determine the date range

- `daily`: the last 24 hours, a rolling window ending now.
- `weekly`: the current calendar week, Monday 00:00 UTC through today.

If the user specified a different range, a specific day, or a specific week, use that instead.

### Step 2: Fetch merged PRs from every repo

Only PRs merged **into the repo's default branch** count. The `base:` filter excludes PRs merged into release branches and feature branches.

**Never hardcode `base:master`.** The default branch differs per repo: `codebase` and `aicc-queues` use `master`, `neema-simple-hyzl` and `pointsgpt` use `main`. Read it from `repos/<repo>` so a repo added later needs no edit here.

**Never use `gh pr list`.** It calls the GitHub GraphQL API, which Claude Code sessions block with a 403. Use the REST endpoints below.

`search/issues` filters on merge date server-side, so no `--limit` can drop a PR that was opened long ago and merged inside the window. It does not return changed files. Step 2 therefore calls `pulls/{n}/files` for each repo that ships a phone app, to tell Mobile PRs from App PRs.

Two repos ship one: `codebase` under `apps/atllas-app/`, and `pointsgpt` under `ios/`. The `mobile_prefix` function below holds the prefix per repo. An empty value means no phone app.

Add a repo by appending it to `REPOS`.

Run the whole block in one Bash invocation so `SINCE` is computed once:

```bash
set -euo pipefail
WINDOW=daily   # daily | weekly

case "$WINDOW" in
  daily)
    SINCE=$(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "24 hours ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)
    [ -n "$SINCE" ] || { echo "ERROR: could not compute a 24-hours-ago timestamp with this system's date(1). Aborting." >&2; exit 1; }
    HEADER="## 🚀 Daily Launch Summary: $(date -u +%Y-%m-%d)"
    EMPTY="Nothing shipped in the last 24 hours."
    ;;
  weekly)
    WEEK_START=$(date -v-Mon +%Y-%m-%d 2>/dev/null || date -d "last Monday" +%Y-%m-%d 2>/dev/null)
    [ -n "$WEEK_START" ] || { echo "ERROR: could not compute the start of the week with this system's date(1). Aborting." >&2; exit 1; }
    SINCE="${WEEK_START}T00:00:00Z"
    HEADER="## 🚀 Weekly Launch Summary: Week of ${WEEK_START}"
    EMPTY="Nothing shipped this week."
    ;;
esac
UNTIL=""
echo "Window starts: $SINCE"
echo "Header: $HEADER"
echo "Empty-result line: $EMPTY"

REPOS="Atllas-Inc/codebase Atllas-Inc/aicc-queues Atllas-Inc/neema-simple-hyzl Atllas-Inc/pointsgpt"

mobile_prefix() {
  case "$1" in
    codebase) echo '^apps/atllas-app/' ;;
    pointsgpt) echo '^ios/' ;;
    *) echo '' ;;
  esac
}

search_prs() {
  gh api -X GET search/issues \
    -f q="repo:$1 is:pr is:merged base:$2 merged:>=$SINCE" \
    -f per_page=100 --paginate \
    --jq '.items[] | {number, title, mergedAt: .pull_request.merged_at, body, labels: [.labels[].name]}'
}

: > /tmp/ls_prs.jsonl
for REPO in $REPOS; do
  NAME="${REPO#*/}"
  BASE=$(gh api "repos/$REPO" --jq .default_branch)
  echo "$REPO: base $BASE"
  search_prs "$REPO" "$BASE" | while read -r row; do
    n=$(jq -r .number <<<"$row")
    m=false
    PREFIX=$(mobile_prefix "$NAME")
    if [ -n "$PREFIX" ]; then
      if gh api "repos/$REPO/pulls/$n/files?per_page=100" --paginate --jq '.[].filename' \
           | grep -q "$PREFIX"; then m=true; fi
    fi
    jq -c --arg repo "$NAME" --argjson m "$m" '. + {repo: $repo, mobile: $m}' <<<"$row"
  done >> /tmp/ls_prs.jsonl
done

jq -s --arg until "$UNTIL" '[.[] | select($until == "" or .mergedAt < $until)]' /tmp/ls_prs.jsonl
```

A repo with no `mobile_prefix` row gets `mobile: false` on every PR (App).

**Bounded window.** The search filter is one-sided, so "what shipped yesterday" also returns everything merged today. To bound the far end, set `UNTIL` to a timestamp in the same format. `UNTIL` is empty by default, and an empty value keeps every PR.

### Step 3: Analyze and categorize

For each PR, read the **title** and the **Description** and **Changes** sections of the body. Write plain-English summaries. **Never** copy developer jargon or ticket IDs into the output.

**Exclude** these from the summary:
- PRs that only touch CI/CD pipelines, linting configs, test infrastructure, or dev tooling with no user impact
- Dependency bumps or version updates with no feature changes
- Code refactors or internal restructuring with no user-visible effect
- MCP server config changes, developer debugging tools

**Include** everything that affects what users see, experience, or can do. Include a fix even when the thing it fixed was itself broken by a recent change.

**Split every included PR into one of two sections, in this order:**

1. **Mobile**: PRs where `mobile: true`. That is `apps/atllas-app/` in `codebase` (the React Native/Expo app) and `ios/` in `pointsgpt` (the iPhone app)
2. **App**: everything else. That is `agents-portal`, `admin`, `api`, and the other `codebase` apps. It covers all of `aicc-queues` and all of `neema-simple-hyzl` (the Hyzl paywall-recovery product). It also covers the non-`ios/` parts of `pointsgpt` (the award flight search website, admin site, and server)

A PR that touches both its repo's phone-app prefix and backend paths gets `mobile: true`, so it goes under Mobile only. If its backend half has user impact of its own, add a second bullet for that impact under App.

**Within each section, use these categories** (only include a category if it has items):

1. **New Features**: brand-new capabilities that did not exist before
2. **Improvements**: enhancements to existing features (faster, smarter, more accurate, better UX)
3. **Bug Fixes**: things that were broken and are now fixed
4. **Reliability & Performance**: backend changes that affect stability, speed, or uptime, even if invisible to the user

### Step 4: Write the summary

The first line is the `HEADER` string from Step 2, printed verbatim. All dates in the output use `YYYY-MM-DD` format.

```
[HEADER]

### 📱 Mobile

**New Features**
- **[Short feature name]**: [Half a sentence max. What can users now do?]

**Improvements**
- **[Short name]**: [Half a sentence max. What got better?]

**Bug Fixes**
- **[Short name]**: [Half a sentence max. What was broken?]

**Reliability & Performance**
- **[Short name]**: [Half a sentence max. What got more stable?]

---
_[N] pull requests merged_
```

Repeat the same four category blocks under `### 💻 App`, between the Mobile section and the footer.

Omit the **Mobile** or **App** section entirely if it has no included PRs. Within a section, omit any category with no items.

If no PRs merged in the window, print the `EMPTY` string from Step 2 and nothing else.

**Tone guidelines:**
- Ultra-concise: each bullet is a fragment, not a full sentence. Think changelog entry, not explanation.
- No filler words: drop "now", "previously", "instead", "in order to". Just the fact.
- "AI calling" not "AICC", "contacts" not "recipients", "dashboard" not "portal"
- **Never** use a technical term: no Firestore, Redis, UUID, cron, CSV (say "spreadsheet"), API, etc.
- Group closely related PRs into a single bullet, including PRs from different repos. **Never** merge a Mobile PR and an App PR into one bullet.
- Keep the bold name to 1 to 3 words maximum

Print the formatted summary to the user. **Do not** save it to a file unless the user asks.
