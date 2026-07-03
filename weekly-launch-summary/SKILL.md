---
name: weekly-launch-summary
version: 1.1.0
description: |
  Generates a non-developer-friendly weekly summary of what was shipped across
  the Atllas codebase and aicc-queues repos, split into Mobile and App sections.
  Only counts PRs merged into master. Produces a categorized, bulletpointed
  summary suitable for stakeholders, non-technical teammates, or changelog posts.
  Use when asked to "weekly summary", "what did we launch this week", "launch recap",
  or "what shipped this week".
allowed-tools:
  - Bash
  - Read
  - Write
triggers:
  - weekly summary
  - what did we launch this week
  - launch recap
  - what shipped this week
  - weekly launch summary
---

## Instructions

You are generating a **non-developer-friendly weekly launch summary** from merged pull requests across two GitHub repos: `Atllas-Inc/codebase` and `Atllas-Inc/aicc-queues`.

### Step 1 — Determine the date range

The default is the current calendar week (Monday 00:00 UTC through today). If the user specified a date range or a specific week, use that instead.

Calculate the start-of-week date:
```bash
# Start of current week (Monday)
WEEK_START=$(date -v-Mon +%Y-%m-%d 2>/dev/null || date -d "last Monday" +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d)
echo "Week starts: $WEEK_START"
```

### Step 2 — Fetch merged PRs from both repos

Only PRs merged **into `master`** count. Use `--base master` on both calls so PRs merged into release branches, feature branches, etc. are excluded. For `codebase`, also fetch each PR's changed files (`--json files`) so Step 3 can tell Mobile PRs apart from App PRs.

```bash
WEEK_START=$(date -v-Mon +%Y-%m-%d 2>/dev/null || date -d "last Monday" +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d)
SINCE="${WEEK_START}T00:00:00Z"

gh pr list \
  --repo Atllas-Inc/codebase \
  --state merged \
  --base master \
  --limit 100 \
  --json number,title,mergedAt,body,labels,files \
  --jq "[.[] | select(.mergedAt >= \"$SINCE\")] | map({repo: \"codebase\", number: .number, title: .title, mergedAt: .mergedAt, body: .body, labels: [.labels[].name], mobile: ([.files[].path] | any(startswith(\"apps/atllas-app/\")))})"
```

```bash
WEEK_START=$(date -v-Mon +%Y-%m-%d 2>/dev/null || date -d "last Monday" +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d)
SINCE="${WEEK_START}T00:00:00Z"

gh pr list \
  --repo Atllas-Inc/aicc-queues \
  --state merged \
  --base master \
  --limit 100 \
  --json number,title,mergedAt,body,labels \
  --jq "[.[] | select(.mergedAt >= \"$SINCE\")] | map({repo: \"aicc-queues\", number: .number, title: .title, mergedAt: .mergedAt, body: .body, labels: [.labels[].name], mobile: false})"
```

Note: `gh pr list --jq` does not support jq's `--arg` flag (it errors with "unknown arguments") — the `$SINCE` value must be interpolated directly into the jq program string as shown above.

`aicc-queues` has no mobile app, so every PR from it is hardcoded `mobile: false` (App).

### Step 3 — Analyze and categorize

For each PR, read the **title** and the **Description** + **Changes** sections from the PR body to understand what changed. You should use this to write plain-English summaries — do not copy developer jargon or ticket IDs verbatim into the output.

**Exclude** these from the summary:
- PRs that only touch CI/CD pipelines, linting configs, test infrastructure, or dev tooling with no user impact
- Dependency bumps or version updates with no feature changes
- Code refactors or internal restructuring with no user-visible effect
- MCP server config changes, developer debugging tools

**Include** everything that affects what users see, experience, or can do — even if it's a bug fix that caused something to break.

**Split every included PR into one of two sections, in this order:**

1. **Mobile** — PRs where `mobile: true` (touched `apps/atllas-app/`, the React Native/Expo app)
2. **App** — everything else: `agents-portal`, `admin`, `api`, other `codebase` apps, and all of `aicc-queues`

**Within each section, use these categories** (only include a category if it has items):

1. **New Features** — brand-new capabilities that didn't exist before
2. **Improvements** — enhancements to existing features (faster, smarter, more accurate, better UX)
3. **Bug Fixes** — things that were broken and are now fixed
4. **Reliability & Performance** — backend changes that affect stability, speed, or uptime, even if invisible to the user

### Step 4 — Write the summary

Output format:

```
## 🚀 Weekly Launch Summary — Week of [Monday Date]

### 📱 Mobile

**New Features**
- **[Short feature name]** — [Half a sentence max. What can users now do?]

**Improvements**
- **[Short name]** — [Half a sentence max. What got better?]

**Bug Fixes**
- **[Short name]** — [Half a sentence max. What was broken?]

**Reliability & Performance**
- **[Short name]** — [Half a sentence max. What got more stable?]

### 💻 App

**New Features**
- **[Short feature name]** — [Half a sentence max. What can users now do?]

**Improvements**
- **[Short name]** — [Half a sentence max. What got better?]

**Bug Fixes**
- **[Short name]** — [Half a sentence max. What was broken?]

**Reliability & Performance**
- **[Short name]** — [Half a sentence max. What got more stable?]

---
_[N] pull requests merged into master_
```

Omit the **Mobile** or **App** section entirely if it has no included PRs. Within a section, omit any category with no items.

**Tone guidelines:**
- Ultra-concise: each bullet is a fragment, not a full sentence. Think changelog entry, not explanation.
- No filler words: drop "now", "previously", "instead", "in order to". Just the fact.
- "AI calling" not "AICC", "contacts" not "recipients", "dashboard" not "portal"
- Avoid all technical terms: no Firestore, Redis, UUID, cron, CSV (say "spreadsheet"), API, etc.
- Group closely related PRs within the same section into a single bullet — do not merge a Mobile PR and an App PR into one bullet
- Bold name should be 1–3 words maximum

### Step 5 — Output

Print the formatted summary to the user. Do not save it to a file unless the user asks.
