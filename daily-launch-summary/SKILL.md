---
name: daily-launch-summary
version: 1.0.0
description: |
  Generates a non-developer-friendly daily summary of what was shipped across
  the Atllas codebase and aicc-queues repos over the last 24 hours. Produces a
  categorized, bulletpointed summary suitable for stakeholders, non-technical
  teammates, or changelog posts. Use when asked to "daily summary", "what did
  we launch today", "daily recap", or "what shipped today".
allowed-tools:
  - Bash
  - Read
  - Write
triggers:
  - daily summary
  - what did we launch today
  - daily recap
  - what shipped today
  - daily launch summary
---

## Instructions

You are generating a **non-developer-friendly daily launch summary** from merged pull requests across two GitHub repos: `Atllas-Inc/codebase` and `Atllas-Inc/aicc-queues`.

### Step 1 — Determine the date range

The default is the **last 24 hours** (a rolling window ending now). If the user specified a different range or a specific day, use that instead.

Calculate the start-of-window timestamp (UTC):
```bash
# Start of window: 24 hours ago (UTC, full ISO timestamp)
SINCE=$(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "24 hours ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)
echo "Window starts: $SINCE"
```

### Step 2 — Fetch merged PRs from both repos

```bash
SINCE=$(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "24 hours ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)

gh pr list \
  --repo Atllas-Inc/codebase \
  --state merged \
  --limit 100 \
  --json number,title,mergedAt,body,labels \
  --jq --arg since "${SINCE}" \
  '[.[] | select(.mergedAt >= $since)] | map({repo: "codebase", number: .number, title: .title, mergedAt: .mergedAt, body: .body, labels: [.labels[].name]})'
```

```bash
SINCE=$(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "24 hours ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)

gh pr list \
  --repo Atllas-Inc/aicc-queues \
  --state merged \
  --limit 100 \
  --json number,title,mergedAt,body,labels \
  --jq --arg since "${SINCE}" \
  '[.[] | select(.mergedAt >= $since)] | map({repo: "aicc-queues", number: .number, title: .title, mergedAt: .mergedAt, body: .body, labels: [.labels[].name]})'
```

### Step 3 — Analyze and categorize

For each PR, read the **title** and the **Description** + **Changes** sections from the PR body to understand what changed. You should use this to write plain-English summaries — do not copy developer jargon or ticket IDs verbatim into the output.

**Exclude** these from the summary:
- PRs that only touch CI/CD pipelines, linting configs, test infrastructure, or dev tooling with no user impact
- Dependency bumps or version updates with no feature changes
- Code refactors or internal restructuring with no user-visible effect
- MCP server config changes, developer debugging tools

**Include** everything that affects what users see, experience, or can do — even if it's a bug fix that caused something to break.

**Categories to use** (only include a section if it has items):

1. **New Features** — brand-new capabilities that didn't exist before
2. **Improvements** — enhancements to existing features (faster, smarter, more accurate, better UX)
3. **Bug Fixes** — things that were broken and are now fixed
4. **Reliability & Performance** — backend changes that affect stability, speed, or uptime, even if invisible to the user

### Step 4 — Write the summary

Output format:

```
## 🚀 Daily Launch Summary — [Today's Date]

### New Features
- **[Short feature name]** — [Half a sentence max. What can users now do?]

### Improvements
- **[Short name]** — [Half a sentence max. What got better?]

### Bug Fixes
- **[Short name]** — [Half a sentence max. What was broken?]

### Reliability & Performance
- **[Short name]** — [Half a sentence max. What got more stable?]

---
_[N] pull requests merged in the last 24 hours_
```

**Tone guidelines:**
- Ultra-concise: each bullet is a fragment, not a full sentence. Think changelog entry, not explanation.
- No filler words: drop "now", "previously", "instead", "in order to". Just the fact.
- "AI calling" not "AICC", "contacts" not "recipients", "dashboard" not "portal"
- Avoid all technical terms: no Firestore, Redis, UUID, cron, CSV (say "spreadsheet"), API, etc.
- Group closely related PRs from both repos into a single bullet
- Bold name should be 1–3 words maximum

### Step 5 — Output

Print the formatted summary to the user. Do not save it to a file unless the user asks.

If no PRs merged in the window, say so plainly (e.g. "Nothing shipped in the last 24 hours.") rather than printing empty sections.
