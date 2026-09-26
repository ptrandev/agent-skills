---
name: launch-summary
version: 3.0.0
description: >
  Summarizes what shipped across the Atllas repos over a daily or weekly window, written for
  non-developers. Groups the result by product and credits who built and merged each change.
  Counts only PRs merged to each repo's default branch. Use for "what did we launch today",
  "weekly summary", or "launch recap".
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

`search/issues` filters on merge date server-side, so no `--limit` can drop a PR that was opened long ago and merged inside the window. It returns the author, but not the merger and not the changed files. Step 2 therefore calls `pulls/{n}` for every PR to read `merged_by`. It also calls `pulls/{n}/files` for each repo that ships a phone app, to tell Mobile PRs from App PRs.

Two repos ship one: `codebase` under `apps/atllas-app/`, and `pointsgpt` under `ios/`. The `mobile_prefix` function below holds the prefix per repo. An empty value means no phone app.

`product_name` holds the customer-facing name per repo. The summary is grouped by that name, so every repo needs a row.

`display_name` turns a GitHub login into a person's real name, and caches each lookup in `/tmp/ls_names.tsv` so one person costs one call.

Add a repo by appending it to the `for REPO in ...` list and giving it a `product_name` row. **Never put the repo list in a variable.** This block runs under `zsh`, which does not word-split an unquoted variable, so a list in a variable is read as one repo name.

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
NAMES=/tmp/ls_names.tsv
: > "$NAMES"
echo "Window starts: $SINCE"
echo "Header: $HEADER"
echo "Empty-result line: $EMPTY"

mobile_prefix() {
  case "$1" in
    codebase) echo '^apps/atllas-app/' ;;
    pointsgpt) echo '^ios/' ;;
    *) echo '' ;;
  esac
}

product_name() {
  case "$1" in
    codebase) echo 'Atllas' ;;
    aicc-queues) echo 'AI Calling' ;;
    neema-simple-hyzl) echo 'Hyzl' ;;
    pointsgpt) echo 'PointsGPT' ;;
    *) echo "$1" ;;
  esac
}

display_name() {
  [ -n "$1" ] || { echo ''; return; }
  local hit
  hit=$(awk -F'\t' -v l="$1" '$1==l {print $2; exit}' "$NAMES")
  if [ -z "$hit" ]; then
    hit=$(gh api "users/$1" --jq '.name // .login')
    printf '%s\t%s\n' "$1" "$hit" >> "$NAMES"
  fi
  echo "$hit"
}

search_prs() {
  gh api -X GET search/issues \
    -f q="repo:$1 is:pr is:merged base:$2 merged:>=$SINCE" \
    -f per_page=100 --paginate \
    --jq '.items[] | {number, title, mergedAt: .pull_request.merged_at, body, author: .user.login, labels: [.labels[].name]}'
}

: > /tmp/ls_prs.jsonl
for REPO in Atllas-Inc/codebase Atllas-Inc/aicc-queues Atllas-Inc/neema-simple-hyzl Atllas-Inc/pointsgpt; do
  NAME="${REPO#*/}"
  BASE=$(gh api "repos/$REPO" --jq .default_branch)
  PRODUCT=$(product_name "$NAME")
  PREFIX=$(mobile_prefix "$NAME")
  echo "$REPO: base $BASE, product $PRODUCT"
  search_prs "$REPO" "$BASE" | while read -r row; do
    n=$(jq -r .number <<<"$row")
    m=false
    if [ -n "$PREFIX" ]; then
      if gh api "repos/$REPO/pulls/$n/files?per_page=100" --paginate --jq '.[].filename' \
           | grep -q "$PREFIX"; then m=true; fi
    fi
    MERGER_LOGIN=$(gh api "repos/$REPO/pulls/$n" --jq '.merged_by.login // ""')
    AUTHOR=$(display_name "$(jq -r .author <<<"$row")")
    MERGER=$(display_name "$MERGER_LOGIN")
    jq -c --arg repo "$NAME" --arg product "$PRODUCT" --argjson m "$m" \
          --arg authorName "$AUTHOR" --arg mergerName "$MERGER" \
      '. + {repo: $repo, product: $product, mobile: $m, authorName: $authorName, mergerName: $mergerName}' <<<"$row"
  done >> /tmp/ls_prs.jsonl
done

jq -s --arg until "$UNTIL" '[.[] | select($until == "" or .mergedAt < $until)]' /tmp/ls_prs.jsonl
```

A repo with no `mobile_prefix` row gets `mobile: false` on every PR (App).

An empty `mergerName` means the merger is no longer readable, for example a deleted account. Print the author alone for that PR.

**Bounded window.** The search filter is one-sided, so "what shipped yesterday" also returns everything merged today. To bound the far end, set `UNTIL` to a timestamp in the same format. `UNTIL` is empty by default, and an empty value keeps every PR.

### Step 3: Analyze and categorize

For each PR, read the **title** and the **Description** and **Changes** sections of the body. Write plain-English summaries. **Never** copy developer jargon or ticket IDs into the output.

**Exclude** these from the summary:
- PRs that only touch CI/CD pipelines, linting configs, test infrastructure, or dev tooling with no user impact
- Dependency bumps or version updates with no feature changes
- Code refactors or internal restructuring with no user-visible effect
- MCP server config changes, developer debugging tools

**Include** everything that affects what users see, experience, or can do. Include a fix even when the thing it fixed was itself broken by a recent change.

**Group every included PR three levels deep, in this order:**

1. **Product**: the `product` field. Order the products as the `for REPO in ...` list orders them: Atllas, AI Calling, Hyzl, PointsGPT.
2. **Mobile, then App**, inside each product. **Mobile**: PRs where `mobile: true`. That is `apps/atllas-app/` in `codebase` (the React Native/Expo app) and `ios/` in `pointsgpt` (the iPhone app). **App**: everything else, which is the web dashboards, admin sites, and servers of that product.
3. **Category**, inside each Mobile or App block.

A PR that touches both its repo's phone-app prefix and backend paths gets `mobile: true`, so it goes under Mobile only. If its backend half has user impact of its own, add a second bullet for that impact under App, in the same product.

**Use these categories** (only include a category if it has items):

1. **New Features**: brand-new capabilities that did not exist before
2. **Improvements**: enhancements to existing features (faster, smarter, more accurate, better UX)
3. **Bug Fixes**: things that were broken and are now fixed
4. **Reliability & Performance**: backend changes that affect stability, speed, or uptime, even if invisible to the user

### Step 4: Write the summary

The first line is the `HEADER` string from Step 2, printed verbatim. All dates in the output use `YYYY-MM-DD` format.

```
[HEADER]

### [Product]

#### 📱 Mobile

**New Features**
- **[Short feature name]**: [Half a sentence max. What can users now do?] ([Author], merged by [Merger])

**Improvements**
- **[Short name]**: [Half a sentence max. What got better?] ([Author], merged by [Merger])

#### 💻 App

**Bug Fixes**
- **[Short name]**: [Half a sentence max. What was broken?] ([Author], merged by [Merger])

**Reliability & Performance**
- **[Short name]**: [Half a sentence max. What got more stable?] ([Author])

---
_[N] pull requests merged_
```

Repeat the whole product block for each product that has included PRs. Omit any product, any Mobile or App block, and any category with no items. Print the `#### 📱 Mobile` and `#### 💻 App` headings only when the product has both blocks. A product with one block prints its categories directly under the product heading.

If no PRs merged in the window, print the `EMPTY` string from Step 2 and nothing else.

**Attribution rules:**
- The credit goes in parentheses at the end of the bullet, after the period.
- Use the first name from `authorName` and `mergerName`. Add the last initial for two people who share a first name, for example `Simon K.`
- Write `(Phillip, merged by David)`. Write `(Phillip)` alone when the author merged their own PR, or when `mergerName` is empty.
- A bullet that groups several PRs lists each distinct author, then the mergers: `(Phillip and Simon, merged by David)`.
- An empty `authorName` means a bot opened the PR. Drop the whole credit for that bullet.

**Tone guidelines:**
- Ultra-concise: each bullet is a fragment, not a full sentence. Think changelog entry, not explanation.
- No filler words: drop "now", "previously", "instead", "in order to". Just the fact.
- "AI calling" not "AICC", "contacts" not "recipients", "dashboard" not "portal"
- **Never** use a technical term: no Firestore, Redis, UUID, cron, CSV (say "spreadsheet"), API, etc.
- Group closely related PRs into a single bullet, only when they share a product and a Mobile or App block. **Never** merge a Mobile PR and an App PR into one bullet, and **never** merge PRs from two products.
- Keep the bold name to 1 to 3 words maximum

Print the formatted summary to the user. **Do not** save it to a file unless the user asks.
