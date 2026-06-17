# Setup task: build the self-reviewing "Phillip agent"

You are Claude Code running on the user's Mac. Your job is to set up a self-reviewing "Phillip agent" for them by working through the numbered steps below. When done, the user will be able to type `/phillip` before pushing and get a multi-reviewer self-review of their diff.

The `/phillip`, `/phillip-sync`, and `/gemini` skills live in the public **claude-skills** repo (`https://github.com/ptrandev/claude-skills`). You install them by cloning that repo once and symlinking the skill folders into `~/.claude/skills/` (Step 3) -> setup always installs the latest version and there is nothing to hand-maintain.

## Ground rules (read first, follow throughout)

- **Probe before you assume.** This is NOT necessarily a fresh Mac -> the user may already have Homebrew, Node, bun, git, etc. ALWAYS check what's present first (Step 0a) and skip anything already installed: no reinstall, and no "ASK USER" handoff for a tool that's already there. Only install or hand off what is genuinely missing.
- **Do all non-interactive work yourself.** That means: `git clone`, `ln -s`, `npm install -g ...` (brew-installed Node does NOT need sudo for global installs), patching JSON with `python3`, appending non-secret PATH entries to `~/.zshenv`, and every verification check. Do not ask the user to do anything you can do. (API keys are the one exception -> the user adds those themselves; see the key rule below.)
- **Each Bash call is a fresh shell.** Every Bash tool call runs a new non-interactive, non-login shell that sources ONLY `~/.zshenv` -> it does NOT source `~/.zprofile` or `~/.zshrc`. Environment variables you `export` in one Bash call are GONE in the next. So: to make a key or PATH entry available to later steps AND to the skill at runtime, you must WRITE it to `~/.zshenv` (e.g. append `export GEMINI_API_KEY=...`). Never rely on an in-session `export` carrying across steps. This rule is why several installers below need an extra "append to `~/.zshenv`" step: their own installers wire PATH via `~/.zprofile` or `~/.zshrc`, which your fresh shells never read.
- **For anything interactive, STOP and hand it to the user.** You CANNOT click GUI installer popups, type an interactive sudo/password prompt, complete a browser OAuth flow, or run Claude Code slash commands (`/model`, `/effort`, `/fast` are typed by the human into the Claude Code input box -> they are NOT tools you can call). For every such step, print the EXACT command or action for the user in an "ASK USER" block, then WAIT for confirmation before continuing.
- **Run each check before moving on.** After every install, run the step's check command and confirm it passed. If a check fails, debug it. Never fabricate success, never skip ahead on a failed check.
- **Never handle raw API keys.** Do NOT ask the user to paste a key into this chat, and never put a key value in a Bash command. If a key is needed, hand the user the exact line to add to `~/.zshenv` THEMSELVES, in their own terminal, then have them confirm. You only ever reference the variable NAME (e.g. `$GEMINI_API_KEY`) and check that it is present -> never print its value. Never invent or guess a key.

---

## Step 0 — Prerequisites (probe first, install only what's missing)

Do NOT assume a fresh Mac. The user may already have some or all of these. Run the probe in 0a FIRST, then handle only what is missing. For anything already present, skip its sub-step entirely -> no reinstall, no ASK USER handoff. Only the missing-tool installs that happen to be interactive get handed to the user.

> **Precondition (no bootstrap paradox):** `claude` itself must already be installed and authenticated for you to be running this at all. So if `command -v claude` succeeds in the probe below, treat claude as DONE -> skip sub-step f's install/login branch entirely. Sub-step f only matters if you are provisioning claude for a different or headless context.

**a. Check what already exists.** Run yourself:

```bash
git --version 2>/dev/null; python3 --version 2>/dev/null; command -v brew; command -v node; command -v npm; command -v bun; command -v claude
```

For each tool that printed a version or a path above, skip its sub-step entirely -> do NOT issue that sub-step's ASK USER block. (E.g. if `git --version` printed, skip b's xcode-select handoff; if `command -v brew` printed a path, skip c.)

**b. Xcode Command Line Tools** (gives `git` and `python3`). This pops a GUI dialog and takes minutes -> the user must do it.

> **ASK USER:**
> "Run this in your terminal, click through the popup, and wait for it to finish (a few minutes):
> ```
> xcode-select --install
> ```
> Tell me when it's done."

After they confirm, verify yourself:

```bash
git --version && python3 --version
```

Both must print a version.

**c. Homebrew** — installer is an interactive script that may prompt for the Mac password -> the user must do it.

> **ASK USER:**
> "Run this, and if it asks for your Mac password, type it (you won't see characters as you type):
> ```
> /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"
> ```
> Tell me when it's done. (You don't need to do the 'Next steps' PATH lines it prints — I'll handle PATH.)"

After they confirm, **immediately put brew on the non-interactive PATH yourself.** The Homebrew installer wires its shellenv into `~/.zprofile` (a login-shell file), which your fresh shells never source -> brew would NOT be on PATH for any later check or install. Append brew's shellenv to `~/.zshenv` (this also puts node/npm and global CLIs on PATH once installed). Detect Apple Silicon vs Intel:

```bash
BREW=$( [ -x /opt/homebrew/bin/brew ] && echo /opt/homebrew/bin/brew || echo /usr/local/bin/brew )
grep -q 'brew shellenv' ~/.zshenv 2>/dev/null || echo "eval \"\$($BREW shellenv)\"" >> ~/.zshenv
```

Now verify in a fresh shell (the NEXT Bash call sources the updated `~/.zshenv`):

```bash
command -v brew && echo "brew OK"
```

If this fails but the user confirmed the install succeeded, brew is installed but not on the non-interactive PATH -> re-run the append above (confirm `~/.zshenv` now contains the `brew shellenv` line) and re-check. Do NOT ask the user to reinstall Homebrew.

**d. Node + npm** — the Codex and Gemini CLIs are global npm packages, so this is required (bun cannot stand in). You can run this yourself (brew is now on the fresh-shell PATH from c):

```bash
brew install node
command -v npm && echo "npm OK"
```

**e. bun** — gstack's build step uses it. You can run this yourself:

```bash
curl -fsSL https://bun.sh/install | bash
```

The bun installer adds bun to PATH via shell profile (not `~/.zshenv`). Since your next Bash call is a fresh shell, verify against bun's known install path:

```bash
("$HOME/.bun/bin/bun" --version || bun --version) && echo "bun OK"
```

Then append it to `~/.zshenv` so future non-interactive shells see it:

```bash
grep -q '.bun/bin' ~/.zshenv 2>/dev/null || echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.zshenv
```

**f. Claude Code** — skip if `command -v claude` already printed a path in 0a (see the precondition note above; if you are running, it almost certainly did). Only do this branch if provisioning claude for a separate/headless context. The first run prompts for an interactive Anthropic login -> hand that to the user.

If not installed, prefer the npm install (it lands in the brew node prefix, which is now on the fresh-shell PATH):

```bash
npm install -g @anthropic-ai/claude-code    # or: curl -fsSL https://claude.ai/install.sh | bash
```

If you used the `curl` installer instead, it wires `~/.local/bin` via `~/.zshrc`/`~/.zprofile`, not `~/.zshenv` -> append it so fresh shells see it:

```bash
grep -q '.local/bin' ~/.zshenv 2>/dev/null || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshenv
```

Then verify (the known install path works even before PATH propagates):

```bash
( command -v claude || "$HOME/.local/bin/claude" --version >/dev/null 2>&1 && echo "$HOME/.local/bin/claude" ) && claude --version 2>/dev/null; echo "claude check done"
```

If a fresh login is required:

> **ASK USER:**
> "The first time `claude` runs it asks you to log in -> use your Anthropic account (it needs Opus access for a later step). Confirm you're logged in."

---

## Step 1 — Install gstack (gives `/codex`, `/review`, and many more skills)

This is gstack's official install flow. You are automating the setup, so run it yourself rather than handing it to the user. Its `./setup` registers each skill into the PARENT of wherever you clone it, so it MUST live at `~/.claude/skills/gstack` for the skills to land in `~/.claude/skills/` where Claude discovers them. Cloning anywhere else breaks discovery.

`/phillip` shells out to `/codex` (one of its three reviewers), and `/codex` is a gstack skill -> gstack is required, not optional.

**a. Clone and run setup** (run yourself; needs `bun` from Step 0e):

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
```

If `~/.claude/skills/gstack` already exists, skip the clone and run `cd ~/.claude/skills/gstack && git pull && ./setup` instead. If `./setup` pauses on an interactive prompt you can't answer (e.g. a telemetry or skill-naming question), hand that exact prompt to the user in an ASK USER block, then continue.

Verify the DISCOVERABLE top-level skill (not the source folder):

```bash
test -f ~/.claude/skills/codex/SKILL.md && echo "codex skill discoverable OK"
```

Must print `codex skill discoverable OK`. (Later, the user updates gstack with `/gstack-upgrade` inside Claude Code.)

**b. Add a `## gstack` section to the user's global `~/.claude/CLAUDE.md`** (do this yourself with Read + Write/Edit; create the file if it doesn't exist; if a `## gstack` section is already there, leave it). Append exactly:

```markdown

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills:
/office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /design-consultation, /design-shotgun, /design-html, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /connect-chrome, /qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /setup-gbrain, /retro, /investigate, /document-release, /document-generate, /codex, /cso, /autoplan, /plan-devex-review, /devex-review, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade, /learn
```

gstack is set up globally (the `~/.claude/CLAUDE.md` section in 1b). Do NOT add a `## gstack` section to the current project's `CLAUDE.md`, and do not ask the user about it.

---

## Step 2 — Install and authenticate the Codex CLI

The `/codex` skill shells out to OpenAI's Codex CLI, so the CLI must be installed and logged in. Install it yourself:

```bash
npm install -g @openai/codex
```

Confirm the binary is on PATH:

```bash
command -v codex && echo "codex CLI OK"
```

Auth is a browser OAuth flow OR an API key. You can't do the browser flow -> hand the user the choice.

> **ASK USER:**
> "Codex needs auth. Pick one and do it YOURSELF in your terminal — do not paste any key into this chat:
> 1. Browser login: run `codex login` and complete the browser flow.
> 2. API key: add it to `~/.zshenv` yourself by running (swap in your real key): `echo 'export OPENAI_API_KEY=\"sk-REPLACE_ME\"' >> ~/.zshenv`
> Tell me which you did when you're done. Keep the key out of this chat — I never need to see it."

Do NOT ask them to paste the key, and never put a key value in a command yourself. Once they confirm, verify presence WITHOUT printing the value (the env check just stays empty if they chose browser login):

```bash
grep -c '^export OPENAI_API_KEY=' ~/.zshenv   # 1 if they added a key, 0 if they used codex login
( source ~/.zshenv 2>/dev/null; [ -n "$OPENAI_API_KEY" ] && echo "OPENAI key present" || echo "no key in env (fine if they used codex login)" )
```

Neither command prints the key. If `source ~/.zshenv` errors, the line the user added is malformed (likely an unescaped quote in the key) -> tell THEM to open `~/.zshenv` and fix that line; you can't see it, so don't try to edit it yourself.

(Codex auth itself is only exercised the first time `/codex review` runs, so there's nothing further to smoke-test now -> the `command -v codex` check above is sufficient.)

---

## Step 3 — Clone the claude-skills repo and symlink the skills

This is the core change that keeps you on the latest skills with zero hand-maintenance: clone the repo once, then symlink `gemini`, `phillip`, and `phillip-sync` into `~/.claude/skills/`. Edits in the repo (or a later `git pull`) take effect immediately — no copying, no embedded snapshots to re-sync.

**a. Clone the repo** (run yourself). Pick a stable home for it; `~/Git/claude-skills` matches the repo's own README:

```bash
git clone https://github.com/ptrandev/claude-skills.git ~/Git/claude-skills
```

If `~/Git/claude-skills` already exists, skip the clone and refresh it instead:

```bash
cd ~/Git/claude-skills && git pull --ff-only
```

**b. Symlink the three skills** into `~/.claude/skills/` (run yourself). Create each link only if it isn't already there, and never clobber an existing real directory:

```bash
for s in gemini phillip phillip-sync; do
  if [ -e ~/.claude/skills/"$s" ] || [ -L ~/.claude/skills/"$s" ]; then
    echo "skip $s (already present)"
  else
    ln -s ~/Git/claude-skills/"$s" ~/.claude/skills/"$s" && echo "linked $s"
  fi
done
```

(The repo also ships `/full-send` and `/weekly-launch-summary`; symlink those too if the user wants them, but they are not required for `/phillip`.)

**c. Verify the skill files resolve through the symlinks** (run yourself):

```bash
for s in gemini phillip phillip-sync; do test -f ~/.claude/skills/"$s"/SKILL.md && echo "$s skill OK" || echo "$s skill MISSING"; done
head -2 ~/.claude/skills/phillip/SKILL.md       # must be: --- then name: phillip
head -2 ~/.claude/skills/phillip-sync/SKILL.md  # must be: --- then name: phillip-sync
head -2 ~/.claude/skills/gemini/SKILL.md        # must be: --- then name: gemini
```

All three must print `... skill OK`, and each `head -2` must show `---` then the matching `name:`. A skill is just a folder at `~/.claude/skills/<name>/SKILL.md`; Claude auto-discovers it and triggers it on `/<name>` or a matching request.

`/phillip` already wires in `/phillip-sync` (its section-0 "Refresh the rubric first" step) and contains the `<!-- phillip-sync:auto ... -->` / `<!-- phillip-sync:candidates ... -->` anchors that `/phillip-sync` writes into. No further wiring is needed -> the first time the user runs `/phillip` in a repo with `gh` authed, sync seeds the rubric from the last 30 days of PR reviews.

---

## Step 4 — Install the Gemini CLI and authenticate (API-key only)

The `/gemini` skill (symlinked in Step 3) is one of `/phillip`'s three reviewers. It needs the Gemini CLI plus an API key.

**a. Install the CLI yourself:**

```bash
npm install -g @google/gemini-cli
command -v gemini && echo "gemini CLI OK"
```

**b. Auth (API-key only).** The skill runs the CLI non-interactively, so browser/OAuth login will NOT work -> the skill hard-blocks on anything but an API key. Two things must be true: the CLI is told to use API-key auth, and the key is visible to non-interactive shells (`~/.zshenv`).

You do the non-secret half (point the CLI at API-key auth); the user adds the key themselves.

First, point the CLI at API-key auth by setting `security.auth.selectedType` to `gemini-api-key` in `~/.gemini/settings.json` (no secret involved — do this yourself):

```bash
python3 - <<'PY'
import json, os
p = os.path.expanduser("~/.gemini/settings.json")
os.makedirs(os.path.dirname(p), exist_ok=True)
d = {}
if os.path.exists(p):
    try: d = json.load(open(p))
    except Exception: d = {}   # empty/corrupt settings.json -> start fresh
d.setdefault("security", {}).setdefault("auth", {})["selectedType"] = "gemini-api-key"
json.dump(d, open(p, "w"), indent=2)
print("selectedType ->", d["security"]["auth"]["selectedType"])
PY
```

Then have the user add the key themselves — do NOT ask them to paste it here:

> **ASK USER:**
> "Create a Gemini API key at https://aistudio.google.com/apikey (enable billing on its Google Cloud project for high limits). Then add it to `~/.zshenv` YOURSELF in your terminal (swap in your real key), keeping it out of this chat: `echo 'export GEMINI_API_KEY=\"REPLACE_ME\"' >> ~/.zshenv`. Tell me when it's done — I never need to see the key."

Once they confirm, verify presence WITHOUT printing the value:

```bash
grep -c '^export GEMINI_API_KEY=' ~/.zshenv   # must print 1
( source ~/.zshenv 2>/dev/null; [ -n "$GEMINI_API_KEY" ] && echo "GEMINI key present" || echo "GEMINI key NOT set — ask the user to re-add it to ~/.zshenv" )
```

Neither command prints the key. If `source ~/.zshenv` errors, the line the user added is malformed -> tell THEM to open `~/.zshenv` and fix it; you can't see it, so don't edit it yourself.

Clear anything that could shadow the good key: if `~/.gemini/oauth_creds.json` exists, OAuth could be picked by mistake.

```bash
rm -f ~/.gemini/oauth_creds.json 2>/dev/null; echo "cleared stale oauth creds if any"
```

**c. Smoke-test the real headless auth path.** Run yourself (this is a fresh shell, so it picks up the new `~/.zshenv` key):

```bash
test -f ~/.claude/skills/gemini/SKILL.md && command -v gemini && \
  gemini -m gemini-pro-latest -p "Reply with exactly one word: OK" < /dev/null && \
  echo "gemini skill + headless auth OK"
```

A clean `OK` means it's ready. If auth fails despite a key, check, in order:
1. `selectedType` is `gemini-api-key` (re-run the python step above).
2. The key is in `~/.zshenv`, not `~/.zshrc` (move it).
3. A stale `GEMINI_API_KEY` in `~/.gemini/.env` or a project `.env` can shadow the good one (an expired key there overrides `~/.zshenv`). Check only for its PRESENCE (a count, never the value):
   ```bash
   grep -c 'GEMINI_API_KEY' ~/.gemini/.env 2>/dev/null || echo 0
   ```
   If that prints a non-zero number, there's a stale key line -> tell the user to remove the `GEMINI_API_KEY` line from `~/.gemini/.env` themselves, and to check any project `.env` in the repo you'll review. Do NOT open or print these files yourself — they hold key values.
Debug and re-test — do not proceed until the smoke-test prints `OK`.

---

## Step 5 — Install and authenticate the GitHub CLI (`gh`)

The `/phillip-sync` skill uses `gh` to read the current repo's PR reviews and fold recurring lessons into the rubric. It degrades gracefully if `gh` is absent, but `/phillip` is much better with it -> install now.

**a. Install yourself** (non-interactive, brew is on PATH from Step 0):

```bash
command -v gh >/dev/null 2>&1 && echo "gh already present -> skipping install" || brew install gh
command -v gh && echo "gh CLI OK"
```

**b. Auth is a browser flow you can't drive -> hand it to the user.**

> **ASK USER:**
> "Run this in your terminal and complete the browser login (pick GitHub.com -> HTTPS -> 'Login with a web browser'):
> ```
> gh auth login
> ```
> Tell me when it says you're logged in. I never need to see any token."

**c. Verify yourself (does NOT print the token):**

```bash
gh auth status >/dev/null 2>&1 && echo "gh authenticated OK" || echo "gh NOT authenticated -> have the user finish 'gh auth login'"
```

If auth isn't done, `/phillip-sync` simply prints one warning and skips -> `/phillip` still runs on the existing rubric. So this step is recommended, not blocking: if the user can't auth right now, continue setup and they can run `gh auth login` later.

---

## Step 6 — Verify all three reviewers and skills are ready

Run yourself:

```bash
command -v claude && command -v codex && command -v gemini && echo "All three CLIs on PATH"
test -f ~/.claude/skills/codex/SKILL.md && echo "codex skill OK"
test -f ~/.claude/skills/gemini/SKILL.md && echo "gemini skill OK"
test -f ~/.claude/skills/phillip/SKILL.md && echo "phillip skill OK"
test -f ~/.claude/skills/phillip-sync/SKILL.md && echo "phillip-sync skill OK"
```

All five lines must print. `/codex` comes from gstack (Step 1); `/gemini`, `/phillip`, and `/phillip-sync` come from the claude-skills symlinks (Step 3).

---

## Step 7 — Model and effort (the user types these)

These are Claude Code slash commands typed into the input box -> they are NOT tools you can call. Hand them to the user.

> **ASK USER:**
> "Two things to type into the Claude Code input box, one at a time:
> 1. `/model` -> pick the most capable model offered. Claude has no 'latest' alias, so this is a manual pick. As of 2026-06-17 that's **Claude Opus 4.8** (`claude-opus-4-8`, the coding/agentic default) or **Claude Fable 5** (`claude-fable-5`, most intelligent overall, ~2x cost) — either works; if those look dated, pick the newest top-tier option.
> 2. `/effort ultracode` -> the highest reasoning effort (needs a top-tier model, which you just picked).
> If your build doesn't recognize `/effort` or `ultracode`, just skip it — the skill still works at default effort. Tell me when done (or if `/effort` wasn't recognized)."

Two notes worth passing on: typing the literal keyword `ultracode` inside a prompt turns on multi-agent orchestration for that task where supported (the `/phillip` skill uses it when available); and `/fast`, if the build has it, gives Opus with faster output without downgrading the model.

---

## Step 8 — Verify and report

Run the full verification yourself:

```bash
command -v claude && command -v codex && command -v gemini && echo "All three CLIs on PATH"
for s in codex gemini phillip phillip-sync; do test -f ~/.claude/skills/"$s"/SKILL.md && echo "$s skill OK" || echo "$s skill MISSING"; done
gemini -m gemini-pro-latest -p "Reply with exactly one word: OK" < /dev/null && echo "gemini auth OK"
```

Then print a short status to the user:

- **Installed and verified:** which CLIs are on PATH (claude, codex, gemini, gh), which skills resolve (codex, gemini, phillip, phillip-sync), and whether the Gemini headless auth smoke-test passed.
- **Still needs the user (if not already done):** the `/model` -> most-capable-model pick (Opus 4.8 or Fable 5 as of 2026-06-17) and `/effort ultracode` slash commands from Step 7, since those are typed in the Claude Code UI and you can't run them. Also `gh auth login` if it wasn't completed in Step 5.
- **Any failures:** if a check failed, say exactly which one and what's needed to fix it (e.g. "Gemini auth failed - re-check `selectedType` is `gemini-api-key` and the key is in `~/.zshenv`, and clear any stale key in `~/.gemini/.env`"). Do not report success for anything that didn't pass.
- **Staying current:** the skills are symlinked from `~/Git/claude-skills`, so `cd ~/Git/claude-skills && git pull` updates `/phillip`, `/phillip-sync`, and `/gemini` to the latest in one step — no re-copying. Update gstack (for `/codex`) separately with `/gstack-upgrade`.
- **Self-updating rubric:** the `/phillip` rubric maintains itself. Each `/phillip` run first invokes `/phillip-sync`, which (when `gh` is authed) mines the current repo's recent resolved PR reviews and appends recurring lessons into section 1 of `~/.claude/skills/phillip/SKILL.md` -> an auto block for high-confidence patterns, a `## Candidates` block for the rest. A 24h per-repo cooldown keeps it cheap; it never blocks a review if `gh` is missing.

Once all checks pass and the user has set the model/effort, they're ready: they type `/phillip` before pushing to run the self-review.
