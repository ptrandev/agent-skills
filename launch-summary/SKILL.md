---
name: launch-summary
version: 2.0.0
description: >
  Summarizes what shipped across the Atllas codebase and aicc-queues repos over a daily or
  weekly window, written for non-developers. Counts only PRs merged to master. Use for "what
  did we launch today", "weekly summary", or "launch recap".
allowed-tools:
  - Bash
  - Read
  - Write
---

## Instructions

Generate a **non-developer-friendly launch summary** from merged pull requests across two GitHub repos: `Atllas-Inc/codebase` and `Atllas-Inc/aicc-queues`.

The skill takes one argument, the window: `daily` or `weekly`. **If the user gives no argument, use `daily`.** The window sets the timeframe and nothing else. Every later step is shared.

### Step 1: Determine the date range

- `daily`: the last 24 hours, a rolling window ending now.
- `weekly`: the current calendar week, Monday 00:00 UTC through today.

If the user specified a different range, a specific day, or a specific week, use that instead.

### Step 2: Fetch merged PRs from both repos

Only PRs merged **into `master`** count. `--base master` excludes PRs merged into release branches and feature branches. `--json files` returns each PR's changed files, which Step 3 uses to tell Mobile PRs apart from App PRs.

Keep `--search "merged:>=$SINCE"`. `gh pr list --state merged` orders results by creation date, not merge date, so `--limit 100` alone can silently drop a PR that was opened long ago and merged inside the window.

Run both calls in one Bash invocation so `SINCE` is computed once:

```bash
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
echo "Window starts: $SINCE"
echo "Header: $HEADER"
echo "Empty-result line: $EMPTY"

gh pr list \
  --repo Atllas-Inc/codebase \
  --state merged \
  --base master \
  --search "merged:>=$SINCE" \
  --limit 100 \
  --json number,title,mergedAt,body,labels,files \
  --jq "[.[] | select(.mergedAt >= \"$SINCE\")] | map({repo: \"codebase\", number: .number, title: .title, mergedAt: .mergedAt, body: .body, labels: [.labels[].name], mobile: ([.files[].path] | any(startswith(\"apps/atllas-app/\")))})"

gh pr list \
  --repo Atllas-Inc/aicc-queues \
  --state merged \
  --base master \
  --search "merged:>=$SINCE" \
  --limit 100 \
  --json number,title,mergedAt,body,labels \
  --jq "[.[] | select(.mergedAt >= \"$SINCE\")] | map({repo: \"aicc-queues\", number: .number, title: .title, mergedAt: .mergedAt, body: .body, labels: [.labels[].name], mobile: false})"
```

Note: `gh pr list --jq` does not support jq's `--arg` flag. It errors with "unknown arguments", because `gh` consumes `--arg` as the jq program itself. Interpolate the `$SINCE` value directly into the jq program string, as shown above.

`aicc-queues` has no mobile app, so every PR from it is hardcoded `mobile: false` (App).

**Bounded window.** Both filters above are one-sided, so "what shipped yesterday" would also return everything merged today. To bound the far end, set an `UNTIL` timestamp in the same format and use the two-sided filter in both jq programs:

```
select(.mergedAt >= "$SINCE" and .mergedAt < "$UNTIL")
```

`UNTIL` is unset by default. Set it only when the user asks for a window that ends before now.

### Step 3: Analyze and categorize

For each PR, read the **title** and the **Description** and **Changes** sections of the body. Write plain-English summaries. **Never** copy developer jargon or ticket IDs into the output.

**Exclude** these from the summary:
- PRs that only touch CI/CD pipelines, linting configs, test infrastructure, or dev tooling with no user impact
- Dependency bumps or version updates with no feature changes
- Code refactors or internal restructuring with no user-visible effect
- MCP server config changes, developer debugging tools

**Include** everything that affects what users see, experience, or can do. Include a fix even when the thing it fixed was itself broken by a recent change.

**Split every included PR into one of two sections, in this order:**

1. **Mobile**: PRs where `mobile: true` (touched `apps/atllas-app/`, the React Native/Expo app)
2. **App**: everything else: `agents-portal`, `admin`, `api`, other `codebase` apps, and all of `aicc-queues`

A PR that touches both `apps/atllas-app/` and backend paths gets `mobile: true`, so it goes under Mobile only. If its backend half has user impact of its own, add a second bullet for that impact under App.

**Within each section, use these categories** (only include a category if it has items):

1. **New Features**: brand-new capabilities that didn't exist before
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
_[N] pull requests merged into master_
```

Repeat the same four category blocks under `### 💻 App`, between the Mobile section and the footer.

Omit the **Mobile** or **App** section entirely if it has no included PRs. Within a section, omit any category with no items.

If no PRs merged in the window, print the `EMPTY` string from Step 2 and nothing else.

**Tone guidelines:**
- Ultra-concise: each bullet is a fragment, not a full sentence. Think changelog entry, not explanation.
- No filler words: drop "now", "previously", "instead", "in order to". Just the fact.
- "AI calling" not "AICC", "contacts" not "recipients", "dashboard" not "portal"
- **Never** use a technical term: no Firestore, Redis, UUID, cron, CSV (say "spreadsheet"), API, etc.
- Group closely related PRs into a single bullet, including PRs from both repos. **Never** merge a Mobile PR and an App PR into one bullet.
- Keep the bold name to 1 to 3 words maximum

Print the formatted summary to the user. **Do not** save it to a file unless the user asks.
