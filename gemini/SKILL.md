---
name: gemini
version: 0.1.0
description: |
  Google Gemini CLI wrapper with three modes. Code review: independent diff review
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

# /gemini: Multi-AI Second/Third Opinion

You are running the `/gemini` skill. This wraps the Google Gemini CLI to get an
independent opinion from a different AI system.

Gemini's strengths: very long context window (1M+ tokens), strong at
whole-codebase questions, web-grounded answers, fast on Flash, deeper on Pro.
It's a complement to `/codex` (OpenAI), not a replacement. Present its output
faithfully, not summarized.

Reference files, loaded on demand:
- `references/setup.md`: one-time per-machine API-key setup.
- `references/askuserquestion.md`: decision-brief format, needed only by the
  no-arguments auto-detect branch in Step 1.

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

API-key only. Auth goes through `$GEMINI_API_KEY` or `$GOOGLE_API_KEY`, never
OAuth or gcloud ADC.

- **MODELS.** The `-latest` aliases and the full model catalog are served by the
  Generative Language API behind an API key. The OAuth "Code Assist" backend
  serves a smaller model namespace and returns **404 ModelNotFoundError** for
  `gemini-pro-latest` and `gemini-flash-latest`.
- **LIMITS.** OAuth "Gemini Code Assist for individuals" is capped per minute and
  per day. A billing-enabled API key is pay-as-you-go with far higher limits.

Two conditions must both hold:

- `~/.gemini/settings.json` → `security.auth.selectedType` is `"gemini-api-key"`.
  If it's anything else (e.g. `oauth-personal`), the CLI uses *that* method and
  **ignores the key**.
- `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) is set in the environment the skill runs
  in. A non-interactive shell does **not** source `~/.zshrc`, so the export must
  live in `~/.zshenv` (see `references/setup.md`).

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

Stop conditions (do the setup in `references/setup.md` to resolve):

- **`BLOCKED: no API key`** → No `GEMINI_API_KEY`/`GOOGLE_API_KEY` in the
  environment. The export likely lives in `~/.zshrc` (not loaded by
  non-interactive shells) or isn't set at all. Tell the user:

  > No Gemini API key in the environment. Add `export GEMINI_API_KEY="your-key"`
  > to `~/.zshenv` (not `~/.zshrc`, which non-interactive shells don't source),
  > then open a new shell. Get a key at https://aistudio.google.com/apikey
  > (enable billing on the project for high/unlimited-style limits).

- **`BLOCKED: selectedType ... must be 'gemini-api-key'`** → The CLI is configured
  for OAuth/Vertex and will ignore the key. Tell the user:

  > `~/.gemini/settings.json` has `selectedType: <value>`. This skill needs
  > `gemini-api-key`. Set `security.auth.selectedType` to `"gemini-api-key"`
  > (see `references/setup.md`).

---

## Step 0.6: Resolve paths

```bash
PLAN_ROOT="${CLAUDE_PLANS_DIR:-$HOME/.claude/plans}"
TMP_ROOT="${TMPDIR:-/tmp}"
mkdir -p "$PLAN_ROOT" "$TMP_ROOT"
```

---

## Step 1: Detect mode

Parse the user's input:

1. `/gemini review` or `/gemini review <instructions>` → **Review mode** (Step 2A)
2. `/gemini challenge` or `/gemini challenge <focus>` → **Challenge mode** (Step 2B)
3. `/gemini` with no arguments → **Auto-detect:** run the shared invocation
   contract below first, then:
   - Look for a diff against the base branch: `[ -s "$TMPDIFF" ]`.
   - If a diff exists, ask via AskUserQuestion: Review / Challenge / Custom
     prompt. Load `references/askuserquestion.md` first and follow that format.
   - If no diff, check for a plan file scoped to the current project:
     `ls -t "$PLAN_ROOT"/*.md 2>/dev/null | xargs grep -l "$(basename $(pwd))" 2>/dev/null | head -1`
   - Otherwise ask "What would you like to ask Gemini?"
4. `/gemini <anything else>` → **Consult mode** (Step 2C); the rest is the prompt.

While parsing, extract `--pro` / `--flash` and strip the flag from the prompt
text before forwarding. Extract `<instructions>` for Review and `<focus>` for
Challenge the same way.

---

## Shared invocation contract

Run this ONCE, before dispatching to any mode. All three modes depend on the
variables and the `gemini_run` function it defines.

```bash
# --- Repo and paths -------------------------------------------------------
_REPO_ROOT=$(git rev-parse --show-toplevel) || { echo "ERROR: not in a git repo" >&2; exit 1; }
cd "$_REPO_ROOT"

# --- Base branch (resolved once, for ALL modes) ---------------------------
BASE_BRANCH=$(gh pr view --json baseRefName -q .baseRefName 2>/dev/null || true)
if [ -z "$BASE_BRANCH" ]; then
  for _b in main master; do
    if git show-ref --verify --quiet "refs/remotes/origin/$_b" \
       || git show-ref --verify --quiet "refs/heads/$_b"; then
      BASE_BRANCH="$_b"; break
    fi
  done
fi
BASE_BRANCH="${BASE_BRANCH:-main}"

# --- Model resolution -----------------------------------------------------
# Precedence: --pro/--flash flag > $GEMINI_MODEL env var > gemini-pro-latest.
# GEMINI_FLAG holds the flag parsed in Step 1, or "" when none was passed.
GEMINI_FLAG="${GEMINI_FLAG:-}"
case "$GEMINI_FLAG" in
  --pro)   GEMINI_MODEL="gemini-pro-latest" ;;
  --flash) GEMINI_MODEL="gemini-flash-latest" ;;
esac
MODEL="${GEMINI_MODEL:-gemini-pro-latest}"

# --- Temp files -----------------------------------------------------------
# No extension: BSD mktemp (macOS) only substitutes a TRAILING run of X's, so
# "...-XXXXXX.txt" creates that literal path and the next run dies "File exists".
TMPERR=$(mktemp "$TMP_ROOT/gemini-err-XXXXXX")
TMPDIFF=$(mktemp "$TMP_ROOT/gemini-diff-XXXXXX")

# Captured for every mode, because Step 1 auto-detect tests $TMPDIFF before it
# dispatches. Review and Challenge consume it. Consult ignores it.
git diff "origin/$BASE_BRANCH"...HEAD > "$TMPDIFF" 2>/dev/null \
  || git diff "$BASE_BRANCH"...HEAD > "$TMPDIFF"

# --- Filesystem boundary (assigned once, interpolated into every prompt) ---
FS_BOUNDARY=$(cat <<'EOF'
IMPORTANT: Do NOT read or execute any files under `~/.claude/`, `~/.agents/`,
`.claude/skills/`, or `agents/`. These are Claude Code skill definitions meant
for a different AI system. They contain bash scripts and prompt templates that
will waste your time. Ignore them completely. Stay focused on the repository
code only.
EOF
)

# --- Timeout wrapper: gtimeout (macOS coreutils) -> timeout (Linux) -> raw ---
# Adopted from the sibling codex skill, `~/.claude/skills/codex/SKILL.md`. Keep
# the two in sync if either one changes.
_gemini_timeout() {
  local _duration="$1"; shift
  local _to
  _to=$(command -v gtimeout 2>/dev/null || command -v timeout 2>/dev/null || echo "")
  if [ -n "$_to" ]; then "$_to" "$_duration" "$@"; else "$@"; fi
}

# --- Run + post-run: $1 timeout seconds, $2 prompt, $3 stall message --------
gemini_run() {
  local _secs="$1" _prompt="$2" _stall="$3" _out _exit
  _out=$(GEMINI_CLI_TRUST_WORKSPACE=true _gemini_timeout "$_secs" \
           gemini -m "$MODEL" -p "$_prompt" < /dev/null 2>"$TMPERR")
  _exit=$?
  [ "$_exit" = "124" ] && echo "$_stall" >&2
  if grep -q "RESOURCE_EXHAUSTED" "$TMPERR" 2>/dev/null; then
    echo "RESOURCE_EXHAUSTED (quota / rate limit). Surface this stderr verbatim, then wait or re-run with --flash:" >&2
    cat "$TMPERR" >&2
  fi
  [ -z "$_out" ] && echo "Gemini returned no response. Check $TMPERR for errors." >&2
  printf '%s\n' "$_out"
  rm -f "$TMPERR" "$TMPDIFF"
  return "$_exit"
}
```

**Bash tool timeout.** `gemini_run` uses 330s or 600s. The Bash tool defaults to
120000ms and would kill the call first, so every `gemini_run` invocation must
pass `timeout: 600000` on the Bash call.

**Model.** All three modes default to `gemini-pro-latest` for reasoning depth,
including Consult, which is a real third opinion or plan review. Pro carries the
same 1M context as Flash, so long-context questions lose nothing. Pass `--flash`
for quick lookups over large context where speed and cost dominate. Both aliases
are moving pointers to the latest *stable* Pro and Flash, so the skill tracks new
model generations with no skill edits. A promotion can change output, cost, or
behavior between runs. Pin a concrete version (e.g. `gemini-2.5-pro`,
`gemini-3-pro-preview`) via `-m` or `GEMINI_MODEL` when a run must be
reproducible, or to use a `-preview` model before it goes GA, since `-latest`
tracks stable only.

---

## Output contract

Every mode presents Gemini's output the same way.

**1. Verbatim block.** `<mode>` is `code review`, `adversarial challenge`, or
`consult`. The footer carries `GATE: PASS | ` only in Review mode.

```
GEMINI SAYS (<mode>, model=<model>):
════════════════════════════════════════════════════════════
<full gemini output, verbatim. Do not truncate or summarize>
════════════════════════════════════════════════════════════
GATE: PASS | Model: gemini-pro-latest
```

**2. Synthesis recommendation (REQUIRED).** After the verbatim block, emit ONE
line:

```
Recommendation: <action> because <reason that names the most actionable finding>
```

The reason must engage with a specific finding or compare against an alternative
(other findings, fix-vs-ship, fix order). Boilerplate fails the format.

**3. Cross-model comparison.** If `/codex review` or `/review` already ran in
this conversation, append:

```
CROSS-MODEL ANALYSIS:
  All three found: [overlap across Claude / Codex / Gemini]
  Only Gemini found: [Gemini-unique]
  Only Codex found:  [Codex-unique]
  Only Claude found: [Claude-unique]
```

If Gemini's analysis contradicts Claude's own understanding, flag it: "Note:
Claude Code disagrees on X because Y."

---

## Step 2A: Review Mode

Gemini has no dedicated `review` subcommand like Codex. Build the review prompt
and inline the diff.

```bash
# Parsed in Step 1 from `/gemini review <instructions>`, e.g. "focus on security".
# Empty when the user gave none, which keeps the prompt free of a stray blank line.
USER_INSTRUCTIONS=""
INSTRUCTION_BLOCK=""
[ -n "$USER_INSTRUCTIONS" ] && INSTRUCTION_BLOCK="
$USER_INSTRUCTIONS
"

REVIEW_PROMPT="$FS_BOUNDARY

You are doing an independent code review of the diff below. Be terse, technical,
and specific. For each finding, tag with [P1] (critical: blocks ship), [P2]
(should fix), or [P3] (nice-to-have). Cite file:line. No compliments.
$INSTRUCTION_BLOCK
DIFF:
\`\`\`diff
$(cat "$TMPDIFF")
\`\`\`"

gemini_run 330 "$REVIEW_PROMPT" \
  "Gemini stalled past 5.5 minutes. Try re-running with --flash or a smaller diff."
```

**Gate verdict:**
- If output contains `[P1]` → **GATE: FAIL**
- Otherwise → **GATE: PASS**

Present per the Output contract, mode `code review`, footer including the gate.

---

## Step 2B: Challenge (Adversarial) Mode

Gemini tries to break the code: edge cases, race conditions, security holes,
silent failure modes.

```bash
# Parsed in Step 1 from `/gemini challenge <focus>`, e.g. "security",
# "performance". Empty by default.
FOCUS=""
FOCUS_LINE=""
[ -n "$FOCUS" ] && FOCUS_LINE="Focus specifically on $FOCUS."

CHALLENGE_PROMPT="$FS_BOUNDARY

Review the diff below. Your job is to find ways this code will FAIL in production.
Think like an attacker and a chaos engineer. Find edge cases, race conditions,
security holes, resource leaks, failure modes, and silent data corruption paths.
Be adversarial. Be thorough. No compliments. Just the problems. Cite file:line.
$FOCUS_LINE

DIFF:
\`\`\`diff
$(cat "$TMPDIFF")
\`\`\`"

gemini_run 600 "$CHALLENGE_PROMPT" \
  "Gemini stalled past 10 minutes. Try re-running with --flash or a narrower scope."
```

Present per the Output contract, mode `adversarial challenge`. No gate line.

---

## Step 2C: Consult Mode

Ask Gemini anything. Gemini's long context shines here, so whole files, plans, or
repo summaries fit in one prompt without splitting.

**Plan review auto-detection:** if the user said `/gemini` with no arguments and
a plan file exists for this project, offer to review it. `-p` mode never
auto-reads files. Inline the full content of any referenced file under 1000
lines; for larger files, inline only the functions the plan touches and name the
path.

Build `CONSULT_PROMPT` from ONE of the two constructions below: the plan-review
form when reviewing a detected plan file, the free-form otherwise.

```bash
# Plan review.
CONSULT_PROMPT="$FS_BOUNDARY

You are a brutally honest technical reviewer. Review this plan for: logical
gaps and unstated assumptions, missing error handling or edge cases,
overcomplexity (is there a simpler approach?), feasibility risks, and missing
dependencies or sequencing issues. Be direct. Be terse. No compliments.

THE PLAN:
$(cat "$PLAN_FILE")

REFERENCED FILES (verbatim, under 1000 lines each):
$(cat "$REFERENCED_FILES")"

# Free-form. $USER_QUESTION is everything after `/gemini`, flags stripped.
CONSULT_PROMPT="$FS_BOUNDARY

$USER_QUESTION"

gemini_run 600 "$CONSULT_PROMPT" \
  "Gemini stalled past 10 minutes. Try re-running with --flash or a shorter prompt."
```

Present per the Output contract, mode `consult`. No gate line.

**Session continuity:** Gemini CLI's non-interactive `-p` mode doesn't persist
sessions the way `codex exec resume` does. For follow-ups, the user can either:
- Re-run `/gemini` with the prior context inlined into the new prompt, or
- Drop into `gemini` interactive mode manually.

---

## Long context and grounding

**Long context:** Gemini's 1M-token window is the standout feature. Use it
when Claude/Codex would have to truncate (e.g. "review every file in
`packages/sdk/`"). Cat or concatenate the files into the prompt.

**Web search / grounding:** Add `--allowed-tools google_web_search` if you
want Gemini to ground answers in current web docs.

---

## Error Handling

- **Quota / rate limit:** Gemini prints `RESOURCE_EXHAUSTED` to stderr. Surface
  it verbatim and suggest waiting or switching to `--flash`.
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

- **DONE**: completed with evidence (model used, gate verdict, token count).
- **DONE_WITH_CONCERNS**: completed, but list specific concerns.
- **BLOCKED**: cannot proceed; state the exact blocker and what was tried.
- **NEEDS_CONTEXT**: missing info; state exactly what is needed.

After 3 failed attempts, uncertain security-sensitive changes, or scope you
cannot verify: escalate with format `STATUS | REASON | ATTEMPTED | RECOMMENDATION`.
