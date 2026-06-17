---
name: gemini
version: 0.1.0
description: |
  Google Gemini CLI wrapper — three modes. Code review: independent diff review
  with pass/fail gate. Challenge: adversarial mode that tries to break your code.
  Consult: ask Gemini anything, leveraging its long-context strength (1M+ tokens)
  for whole-repo questions. Modeled on /codex; use Gemini when you want a third
  voice or when context size matters more than raw reasoning depth.
  Use when asked to "gemini review", "ask gemini", "third opinion", or
  "long-context review".
triggers:
  - gemini review
  - gemini challenge
  - third opinion
  - long context review
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - AskUserQuestion
---

<!-- Scaffold modeled on ~/.claude/skills/codex/SKILL.md. The gstack preamble,
     telemetry, and Plan-Mode boilerplate are NOT included here — add them
     later if you want full gstack parity. AskUserQuestion format and
     Completion Status Protocol ARE included. -->

## AskUserQuestion Format

### Tool resolution (read first)

"AskUserQuestion" can resolve to two tools at runtime: the **host MCP variant**
(e.g. `mcp__conductor__AskUserQuestion` — appears in your tool list when the
host registers it) or the **native** Claude Code tool.

**Rule:** if any `mcp__*__AskUserQuestion` variant is in your tool list, prefer
it. Hosts may disable native AUQ via `--disallowedTools AskUserQuestion`
(Conductor does, by default) and route through their MCP variant; calling native
there silently fails.

**Fallback when neither variant is callable:** output the brief as prose and
stop. **Never silently auto-decide.**

### Format

Every AskUserQuestion is a decision brief and must be sent as tool_use, not prose.

```
D<N> — <one-line question title>
Project/branch/task: <1 short grounding sentence>
ELI10: <plain English a 16-year-old could follow, 2-4 sentences, name the stakes>
Stakes if we pick wrong: <one sentence on what breaks, what user sees, what's lost>
Recommendation: <choice> because <one-line reason>
Completeness: A=X/10, B=Y/10   (or: Note: options differ in kind, not coverage — no completeness score)
Pros / cons:
A) <option label> (recommended)
  ✅ <pro — concrete, observable, ≥40 chars>
  ❌ <con — honest, ≥40 chars>
B) <option label>
  ✅ <pro>
  ❌ <con>
Net: <one-line synthesis of what you're actually trading off>
```

D-numbering: first question is `D1`; increment yourself.

- ELI10 always present. Recommendation ALWAYS present with `(recommended)` label.
- Completeness: use `N/10` when options differ in coverage; otherwise "differ in kind" note.
- Min 2 ✅ and 1 ❌ per option, each ≥40 chars. Hard-stop escape: `✅ No cons — this is a hard-stop choice`.
- Effort labels when relevant: `(human: ~X days / CC: ~Y min)`.
- Net line closes the tradeoff.

### Self-check before emitting

- [ ] D<N> header present
- [ ] ELI10 + stakes line present
- [ ] Recommendation line with concrete reason
- [ ] Completeness scored OR kind-note present
- [ ] Every option ≥2 ✅ and ≥1 ❌, each ≥40 chars
- [ ] `(recommended)` on one option
- [ ] Net line closes the decision
- [ ] Calling the tool, not writing prose

---

# /gemini — Multi-AI Second/Third Opinion

You are running the `/gemini` skill. This wraps the Google Gemini CLI to get an
independent opinion from a different AI system.

Gemini's strengths: very long context window (1M+ tokens), strong at
whole-codebase questions, web-grounded answers, fast on Flash, deeper on Pro.
It's a complement to `/codex` (OpenAI), not a replacement. Present its output
faithfully, not summarized.

---

## Step 0: Check the `gemini` binary

```bash
GEMINI_BIN=$(which gemini 2>/dev/null || echo "")
[ -z "$GEMINI_BIN" ] && echo "NOT_FOUND" || echo "FOUND: $GEMINI_BIN"
```

If `NOT_FOUND`, stop and tell the user:

> Gemini CLI not found. Install it: `npm install -g @google/gemini-cli`
> Docs: https://github.com/google-gemini/gemini-cli

---

## Step 0.5: Auth probe (API-key only)

**This skill is API-key only.** It authenticates exclusively via `$GEMINI_API_KEY`
(or `$GOOGLE_API_KEY`) — never OAuth or gcloud ADC. Two reasons:

1. **Models.** The `-latest` aliases and the full model catalog are served by the
   Generative Language API behind an API key. The OAuth "Code Assist" backend
   uses a different, smaller model namespace and returns **404 ModelNotFoundError**
   for `gemini-pro-latest` / `gemini-flash-latest`.
2. **Limits.** OAuth "Gemini Code Assist for individuals" is rate-capped (per-minute
   and per-day); a billing-enabled API key is pay-as-you-go with far higher limits.

Two conditions must both hold:

- `~/.gemini/settings.json` → `security.auth.selectedType` is `"gemini-api-key"`.
  If it's anything else (e.g. `oauth-personal`), the CLI uses *that* method and
  **ignores the key**.
- `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) is set in the environment the skill runs
  in. A non-interactive shell does **not** source `~/.zshrc`, so the export must
  live in `~/.zshenv` (see Setup, Step 0.7).

```bash
GEMINI_SETTINGS="$HOME/.gemini/settings.json"
SELECTED_TYPE=""
if [ -f "$GEMINI_SETTINGS" ]; then
  SELECTED_TYPE=$(python3 -c "
import json
d = json.load(open('$GEMINI_SETTINGS'))
print(d.get('security', {}).get('auth', {}).get('selectedType', ''))
" 2>/dev/null)
fi
echo "selectedType: ${SELECTED_TYPE:-unset}"

GEMINI_AUTH="missing"
[ -n "$GEMINI_API_KEY" ] && GEMINI_AUTH="env:GEMINI_API_KEY"
[ "$GEMINI_AUTH" = "missing" ] && [ -n "$GOOGLE_API_KEY" ] && GEMINI_AUTH="env:GOOGLE_API_KEY"
echo "GEMINI_AUTH: $GEMINI_AUTH"

if [ "$GEMINI_AUTH" = "missing" ]; then
  echo "BLOCKED: no API key in environment"
elif [ "$SELECTED_TYPE" != "gemini-api-key" ]; then
  echo "BLOCKED: selectedType is '${SELECTED_TYPE:-unset}', must be 'gemini-api-key'"
else
  echo "AUTH OK: api-key mode"
fi
```

Stop conditions (do the Setup in Step 0.7 to resolve):

- **`BLOCKED: no API key`** → No `GEMINI_API_KEY`/`GOOGLE_API_KEY` in the
  environment. The export likely lives in `~/.zshrc` (not loaded by
  non-interactive shells) or isn't set at all. Tell the user:

  > No Gemini API key in the environment. Add `export GEMINI_API_KEY="your-key"`
  > to `~/.zshenv` (not `~/.zshrc` — non-interactive shells don't source it),
  > then open a new shell. Get a key at https://aistudio.google.com/apikey
  > (enable billing on the project for high/unlimited-style limits).

- **`BLOCKED: selectedType ... must be 'gemini-api-key'`** → The CLI is configured
  for OAuth/Vertex and will ignore the key. Tell the user:

  > `~/.gemini/settings.json` has `selectedType: <value>`. This skill needs
  > `gemini-api-key`. Set `security.auth.selectedType` to `"gemini-api-key"`
  > (see Setup, Step 0.7).

---

## Step 0.6: Resolve paths

```bash
PLAN_ROOT="${CLAUDE_PLANS_DIR:-$HOME/.claude/plans}"
TMP_ROOT="${TMPDIR:-/tmp}"
mkdir -p "$PLAN_ROOT" "$TMP_ROOT"
```

---

## Step 0.7: One-time setup (API-key only)

Run this once. After it, both the auth probe and the `gemini` calls work under
Claude Code's non-interactive Bash tool, with no rate caps beyond your API tier.

**1. Get an API key (enable billing for high limits).**
Create a key at https://aistudio.google.com/apikey. The free API tier is itself
rate-limited; for unlimited-style pay-as-you-go usage, enable billing on the
key's Google Cloud project.

**2. Tell the CLI to use API-key auth (not OAuth).**

```bash
python3 - <<'PY'
import json, os
p = os.path.expanduser("~/.gemini/settings.json")
d = json.load(open(p)) if os.path.exists(p) else {}
d.setdefault("security", {}).setdefault("auth", {})["selectedType"] = "gemini-api-key"
json.dump(d, open(p, "w"), indent=2)
print("selectedType ->", d["security"]["auth"]["selectedType"])
PY
```

If you previously logged in with OAuth, you can also delete
`~/.gemini/oauth_creds.json` so it can't be selected by mistake (optional).

**3. Put the key where every shell sees it — `~/.zshenv`, NOT `~/.zshrc`.**
`~/.zshrc` is only sourced for interactive shells; the Bash tool runs
non-interactive shells, which source `~/.zshenv`. Add:

```bash
export GEMINI_API_KEY="your-key-here"
```

If a key is currently exported in `~/.zshrc`, move that line to `~/.zshenv` so
there's a single source of truth. Also remove any stale `GEMINI_API_KEY` in a
`.env` the CLI auto-loads (`~/.gemini/.env` or a project `.env`) — an expired key
there can shadow the good one.

**4. Verify (fresh shell):**

```bash
echo "key set: ${GEMINI_API_KEY:+yes}"   # should print "key set: yes"
gemini -m gemini-pro-latest -p "Reply with exactly one word: OK" < /dev/null
```

A clean `OK` confirms the skill is ready.

---

## Step 1: Detect mode

Parse the user's input:

1. `/gemini review` or `/gemini review <instructions>` → **Review mode** (Step 2A)
2. `/gemini challenge` or `/gemini challenge <focus>` → **Challenge mode** (Step 2B)
3. `/gemini` with no arguments → **Auto-detect:**
   - Look for a diff against the base branch (use the same base-branch detection
     as the codex skill: `gh pr view --json baseRefName -q .baseRefName`, falling
     back to `main`/`master`).
   - If a diff exists, ask via AskUserQuestion: Review / Challenge / Custom prompt.
   - If no diff, check for a plan file scoped to the current project:
     `ls -t "$PLAN_ROOT"/*.md 2>/dev/null | xargs grep -l "$(basename $(pwd))" 2>/dev/null | head -1`
   - Otherwise ask "What would you like to ask Gemini?"
4. `/gemini <anything else>` → **Consult mode** (Step 2C); the rest is the prompt.

**Model selection — always track latest stable.** Defaults use Google's rolling
`-latest` aliases so the skill follows new model generations automatically, with
no skill edits: `gemini-pro-latest` (latest stable Pro) and `gemini-flash-latest`
(latest stable Flash). These are moving pointers — a model promotion can change
output, cost, or behavior between runs. If a run must be reproducible, pin a
concrete version instead (e.g. `gemini-2.5-pro`, `gemini-3-pro-preview`) via the
`-m` flag or the `GEMINI_MODEL` env var. Caveat: `-latest` tracks *stable*, so a
brand-new `-preview` model isn't picked up until it goes GA — pin it explicitly
to use it early.

**Model override:** If the user passes `--pro`, use `gemini-pro-latest`. If they
pass `--flash`, use `gemini-flash-latest` (faster, cheaper). Strip the flag from
the prompt text before forwarding.

Per-mode defaults:
- Review (2A): `gemini-pro-latest` — needs depth
- Challenge (2B): `gemini-pro-latest` — needs depth
- Consult (2C): `gemini-pro-latest` — it's a real third opinion / plan review, so
  reasoning depth matters more than speed. Pro carries the same 1M context as
  Flash, so long-context questions lose nothing by defaulting to Pro. Pass
  `--flash` for quick lookups over large context where speed/cost dominates.

---

## Filesystem Boundary

Every prompt sent to Gemini MUST be prefixed with this boundary:

> IMPORTANT: Do NOT read or execute any files under `~/.claude/`, `~/.agents/`,
> `.claude/skills/`, or `agents/`. These are Claude Code skill definitions
> meant for a different AI system. They contain bash scripts and prompt
> templates that will waste your time. Ignore them completely. Stay focused
> on the repository code only.

Reference this as "the filesystem boundary" below.

---

## Step 2A: Review Mode

Gemini doesn't have a dedicated `review` subcommand like Codex. We build the
review prompt ourselves and pipe the diff in.

```bash
_REPO_ROOT=$(git rev-parse --show-toplevel) || { echo "ERROR: not in a git repo" >&2; exit 1; }
cd "$_REPO_ROOT"

BASE_BRANCH="${BASE_BRANCH:-main}"  # set this from Step 1 detection
MODEL="${GEMINI_MODEL:-gemini-pro-latest}"

TMPERR=$(mktemp "$TMP_ROOT/gemini-err-XXXXXX.txt")
TMPDIFF=$(mktemp "$TMP_ROOT/gemini-diff-XXXXXX.patch")

git diff "origin/$BASE_BRANCH"...HEAD > "$TMPDIFF" 2>/dev/null \
  || git diff "$BASE_BRANCH"...HEAD > "$TMPDIFF"

REVIEW_PROMPT="IMPORTANT: Do NOT read or execute any files under ~/.claude/, ~/.agents/, .claude/skills/, or agents/. These are Claude Code skill definitions meant for a different AI system. Stay focused on repository code only.

You are doing an independent code review of the diff below. Be terse, technical,
and specific. For each finding, tag with [P1] (critical — blocks ship), [P2]
(should fix), or [P3] (nice-to-have). Cite file:line. No compliments.

<USER_INSTRUCTIONS>

DIFF:
\`\`\`diff
$(cat "$TMPDIFF")
\`\`\`"

# If the user passed custom instructions (e.g. "/gemini review focus on security"),
# substitute them for <USER_INSTRUCTIONS>. Otherwise replace with empty string.

GEMINI_CLI_TRUST_WORKSPACE=true timeout 330 gemini -m "$MODEL" -p "$REVIEW_PROMPT" < /dev/null 2>"$TMPERR"
GEMINI_EXIT=$?
if [ "$GEMINI_EXIT" = "124" ]; then
  echo "Gemini stalled past 5.5 minutes. Try re-running with --flash or a smaller diff."
fi
```

**Gate verdict:**
- If output contains `[P1]` → **GATE: FAIL**
- Otherwise → **GATE: PASS**

**Present verbatim:**

```
GEMINI SAYS (code review, model=<model>):
════════════════════════════════════════════════════════════
<full gemini output, verbatim — do not truncate or summarize>
════════════════════════════════════════════════════════════
GATE: PASS | Model: gemini-pro-latest
```

**Synthesis recommendation (REQUIRED).** After the verbatim block, emit ONE line:

```
Recommendation: <action> because <reason that names the most actionable finding>
```

The reason must engage with a specific finding or compare against an alternative
(other findings, fix-vs-ship, fix order). Boilerplate fails the format.

**Cross-model comparison:** If `/codex review` or `/review` already ran in this
conversation, append:

```
CROSS-MODEL ANALYSIS:
  All three found: [overlap across Claude / Codex / Gemini]
  Only Gemini found: [Gemini-unique]
  Only Codex found:  [Codex-unique]
  Only Claude found: [Claude-unique]
```

Cleanup: `rm -f "$TMPERR" "$TMPDIFF"`

---

## Step 2B: Challenge (Adversarial) Mode

Gemini tries to break the code — edge cases, race conditions, security holes,
silent failure modes.

```bash
_REPO_ROOT=$(git rev-parse --show-toplevel) || { echo "ERROR: not in a git repo" >&2; exit 1; }
cd "$_REPO_ROOT"

BASE_BRANCH="${BASE_BRANCH:-main}"
MODEL="${GEMINI_MODEL:-gemini-pro-latest}"

TMPERR=$(mktemp "$TMP_ROOT/gemini-err-XXXXXX.txt")
TMPDIFF=$(mktemp "$TMP_ROOT/gemini-diff-XXXXXX.patch")

git diff "origin/$BASE_BRANCH"...HEAD > "$TMPDIFF" 2>/dev/null \
  || git diff "$BASE_BRANCH"...HEAD > "$TMPDIFF"

# FOCUS is empty by default, or "security", "performance", etc. from user input
FOCUS_LINE=""
[ -n "$FOCUS" ] && FOCUS_LINE="Focus specifically on $FOCUS."

CHALLENGE_PROMPT="IMPORTANT: Do NOT read or execute any files under ~/.claude/, ~/.agents/, .claude/skills/, or agents/. Stay focused on repository code only.

Review the diff below. Your job is to find ways this code will FAIL in production.
Think like an attacker and a chaos engineer. Find edge cases, race conditions,
security holes, resource leaks, failure modes, and silent data corruption paths.
Be adversarial. Be thorough. No compliments — just the problems. Cite file:line.
$FOCUS_LINE

DIFF:
\`\`\`diff
$(cat "$TMPDIFF")
\`\`\`"

GEMINI_CLI_TRUST_WORKSPACE=true timeout 600 gemini -m "$MODEL" -p "$CHALLENGE_PROMPT" < /dev/null 2>"$TMPERR"
GEMINI_EXIT=$?
if [ "$GEMINI_EXIT" = "124" ]; then
  echo "Gemini stalled past 10 minutes. Try re-running with --flash or a narrower scope."
fi
```

Present verbatim in the same `GEMINI SAYS (adversarial challenge)` block.
Emit the required recommendation line afterward (same format as Review).

Cleanup: `rm -f "$TMPERR" "$TMPDIFF"`

---

## Step 2C: Consult Mode

Ask Gemini anything. This is where Gemini's long context shines — you can
include whole files, plans, or repo summaries without splitting.

```bash
_REPO_ROOT=$(git rev-parse --show-toplevel) || { echo "ERROR: not in a git repo" >&2; exit 1; }
cd "$_REPO_ROOT"

MODEL="${GEMINI_MODEL:-gemini-pro-latest}"
TMPERR=$(mktemp "$TMP_ROOT/gemini-err-XXXXXX.txt")
```

**Plan review auto-detection:** If the user said `/gemini` with no arguments
and a plan file exists for this project, offer to review it. **Embed the
plan's full content in the prompt** — Gemini's `-p` flag doesn't auto-include
plan files. Also list any source files the plan references so Gemini can be
told about them (Gemini does have repo tools but for one-shot `-p` mode, the
file paths in the prompt are hints, not auto-reads — include the file content
inline if it's small).

**Prompt construction (plan review):**

```
IMPORTANT: Do NOT read or execute any files under ~/.claude/, ~/.agents/,
.claude/skills/, or agents/. Stay focused on repository code only.

You are a brutally honest technical reviewer. Review this plan for: logical
gaps and unstated assumptions, missing error handling or edge cases,
overcomplexity (is there a simpler approach?), feasibility risks, and missing
dependencies or sequencing issues. Be direct. Be terse. No compliments.

THE PLAN:
<full plan content embedded verbatim>

REFERENCED FILES (verbatim, if small enough to fit):
<file contents>
```

**Prompt construction (free-form):**

```
IMPORTANT: Do NOT read or execute any files under ~/.claude/, ~/.agents/,
.claude/skills/, or agents/. Stay focused on repository code only.

<user's question>
```

**Run:**

```bash
GEMINI_CLI_TRUST_WORKSPACE=true timeout 600 gemini -m "$MODEL" -p "$CONSULT_PROMPT" < /dev/null 2>"$TMPERR"
```

**Session continuity:** Gemini CLI's non-interactive `-p` mode doesn't persist
sessions the way `codex exec resume` does. For follow-ups, the user can either:
- Re-run `/gemini` with the prior context inlined into the new prompt, or
- Drop into `gemini` interactive mode manually.

If you want richer session support later, look at `gemini --checkpointing`
and the `/chat save`/`/chat resume` slash commands inside interactive mode.

**Present verbatim:**

```
GEMINI SAYS (consult, model=<model>):
════════════════════════════════════════════════════════════
<full output, verbatim>
════════════════════════════════════════════════════════════
Model: <model>
```

**Synthesis recommendation (REQUIRED):** Same format as Review/Challenge —
one line, naming a specific Gemini insight, comparing against an alternative.

**Cross-model disagreement:** If Gemini's analysis contradicts Claude's own
understanding, flag it: "Note: Claude Code disagrees on X because Y."

---

## Model & Context

**Default models (rolling `-latest` aliases — auto-track new generations):**
- `gemini-pro-latest` — latest stable Pro; deepest reasoning. Default for all
  modes (review, challenge, consult).
- `gemini-flash-latest` — latest stable Flash; faster and cheaper, same 1M
  context. Opt-in via `--flash` for speed-sensitive lookups over large context.

Pin a concrete version (`-m gemini-2.5-pro`, `gemini-3-pro-preview`, …) when you
need a reproducible run or want to use a `-preview` model before it reaches GA.

**Long context:** Gemini's 1M-token window is the standout feature. Use it
when Claude/Codex would have to truncate (e.g. "review every file in
`packages/sdk/`"). Cat or concatenate the files into the prompt.

**Web search / grounding:** Add `--allowed-tools google_web_search` if you
want Gemini to ground answers in current web docs.

---

## Error Handling

- **Binary not found:** Detected in Step 0. Stop with install instructions.
- **Auth missing:** Detected in Step 0.5. Stop with auth instructions.
- **Quota / rate limit:** Gemini prints `RESOURCE_EXHAUSTED` to stderr. Surface
  it verbatim and suggest waiting or switching to `--flash`.
- **Timeout (124):** Suggest `--flash` or narrower scope.
- **Empty response:** Tell the user "Gemini returned no response. Check
  `$TMPERR` for errors."

---

## Important Rules

- **Read-only.** This skill never modifies files. Pass prompts via `-p` only;
  do not use `--yolo` / `--approval-mode auto_edit`.
- **Present output verbatim.** Do not truncate, summarize, or editorialize
  Gemini's output before showing it. Verbatim block first, synthesis after.
- **Detect skill-file rabbit holes.** If Gemini's output mentions `gstack-config`,
  `SKILL.md`, or `skills/gstack`, append: "Gemini appears to have read skill
  files instead of reviewing your code. Consider retrying."
- **Cross-model framing.** When `/codex` or `/review` has already run in the
  conversation, position Gemini's output as a third voice and surface
  agreements/disagreements explicitly.

---

## Completion Status Protocol

When completing a skill workflow, close with one of:

- **DONE** — completed with evidence (model used, gate verdict, token count).
- **DONE_WITH_CONCERNS** — completed, but list specific concerns.
- **BLOCKED** — cannot proceed; state the exact blocker and what was tried.
- **NEEDS_CONTEXT** — missing info; state exactly what is needed.

After 3 failed attempts, uncertain security-sensitive changes, or scope you
cannot verify: escalate with format `STATUS | REASON | ATTEMPTED | RECOMMENDATION`.

---

## What's NOT in this scaffold (deliberately)

This is a thin scaffold. Compared to `~/.claude/skills/codex/SKILL.md`, it
omits:

- The full gstack preamble (update checks, telemetry, repo mode, learnings)
- The AskUserQuestion decision-brief format block
- Plan-mode safe-operations declarations
- The `## GSTACK REVIEW REPORT` plan-file writer
- The JSONL streaming parser (Gemini CLI doesn't emit codex-style JSONL)
- The `gstack-codex-probe` helper (no `gstack-gemini-probe` exists yet)
- Continuous checkpoint mode, question tuning, eureka logging

If you want full gstack parity, copy the matching sections out of the codex
skill and patch the binary/auth bits. For most "give me a third opinion"
workflows, the scaffold above is enough.
