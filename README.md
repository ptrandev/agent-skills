# claude-skills

Custom [Claude Code](https://claude.ai/code) skills. Each skill lives in its own directory and is symlinked into `~/.claude/skills/` so Claude Code picks them up automatically.

## Skills

### `/full-send`
End-to-end feature workflow: Linear ticket (or raw idea) → implement (with tests) → `/phillip` self-review → commit → draft PR → automated bot review (Copilot and/or Gemini Code Assist) → address all threads → green CI → UI screenshots + walkthrough video (via [OpenCap](https://opencap.dev)) attached to the PR → Linear moved to In Review.

Autonomous (zero stops) by default; opt into an up-front grill with the `interactive` mode. Safe to re-run — it resumes and skips completed phases.

**Usage:**
- `/full-send <TICKET-ID>` — run autonomously from an existing ticket
- `/full-send` — prompts for a ticket ID or idea
- `/full-send <free-text idea>` — synthesizes a Linear ticket from the idea, then builds it
- `/full-send interactive <TICKET-ID>` — grills you to remove ambiguity before writing code

---

### `/phillip`
Self-reviews the current diff to a senior engineering bar before it becomes a PR. Runs multiple adversarial rounds with three independent reviewers (Claude + Codex via `/codex` + Gemini via `/gemini`), verifies every finding against the real code path, implements the genuine HIGH/MEDIUM fixes, rejects false positives with a written reason, and loops until a clean round. Writes a report to `~/.claude/plans/phillip-<branch>-<date>.md`.

- `/phillip` — full multi-round, all three reviewers.
- `/phillip quick` — one round, Claude-only (auto-scales down on trivial diffs anyway).

Before each run it invokes `/phillip-sync` (non-blocking) to refresh the rubric from this repo's recent PR reviews.

**Usage:** `/phillip` or `/phillip quick`

**Requires:** `/codex` (gstack) and `/gemini` skills for the external reviewers; degrades to fewer reviewers if either is absent.

**First-time setup:** [`docs/phillip-agent-setup.md`](docs/phillip-agent-setup.md) is a paste-to-Claude script that provisions a Mac end-to-end (gstack/`/codex`, the Codex + Gemini CLIs, `gh`, and symlinks these skills). [`docs/phillip-agent-usage.md`](docs/phillip-agent-usage.md) is the day-to-day guide.

---

### `/phillip-sync`
Keeps the `/phillip` rubric fresh by mining the current repo's recent resolved-and-acted-on PR reviews (merged PRs, 30-day window) and appending recurring, generalizable lessons into section 1 of `phillip/SKILL.md` — high-confidence patterns to the auto block, weaker one-offs to Candidates. Honors a 24h per-repo cooldown and is fully non-blocking: degrades to a single warning line if `gh` is missing/unauthenticated/offline. Run automatically by `/phillip`; can also be invoked directly.

**Usage:** `/phillip-sync` (or runs automatically inside `/phillip`)

**Requires:** `gh` CLI authenticated (`gh auth login`). Without it, `/phillip` still runs on the existing rubric.

---

### `/gemini`
Google Gemini CLI wrapper with three modes (defaults to `gemini-pro-latest`; pass `--flash` for `gemini-flash-latest`):

- **Review** — independent diff review with a pass/fail gate
- **Challenge** — adversarial mode that tries to break your code
- **Consult** — ask Gemini anything, leveraging its 1M+ token context for whole-repo questions

**Usage:** `/gemini review`, `/gemini challenge`, `/gemini <question>`

**Requires:** `gemini` CLI (`npm install -g @google/gemini-cli`) and **API-key auth** — `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) in your environment (in `~/.zshenv` so non-interactive shells see it) plus `security.auth.selectedType: "gemini-api-key"` in `~/.gemini/settings.json`. OAuth / Code Assist login is not supported — it 404s on the `-latest` model aliases.

---

### `/weekly-launch-summary`
Generates a non-developer-friendly weekly summary of merged PRs across the Atllas repos. Produces a categorized, bulleted summary suitable for stakeholders or changelog posts.

**Usage:** `/weekly-launch-summary`

---

### `/daily-launch-summary`
Same as `/weekly-launch-summary`, but scoped to the **last 24 hours** (a rolling window) instead of the calendar week starting Monday.

**Usage:** `/daily-launch-summary`

---

## Setup

Skills are symlinked from this repo into `~/.claude/skills/` so edits here take effect immediately without any sync step.

To set up on a new machine:

```bash
git clone https://github.com/ptrandev/claude-skills.git ~/Git/claude-skills

ln -s ~/Git/claude-skills/full-send ~/.claude/skills/full-send
ln -s ~/Git/claude-skills/gemini ~/.claude/skills/gemini
ln -s ~/Git/claude-skills/phillip ~/.claude/skills/phillip
ln -s ~/Git/claude-skills/phillip-sync ~/.claude/skills/phillip-sync
ln -s ~/Git/claude-skills/weekly-launch-summary ~/.claude/skills/weekly-launch-summary
ln -s ~/Git/claude-skills/daily-launch-summary ~/.claude/skills/daily-launch-summary
```

> **Note:** `full-send/dev-credentials.md` is gitignored — create it manually after cloning if needed.

### Setting up the Phillip agent (full)

The snippet above wires the skills into an already-configured machine. To provision a fresh
Mac for `/phillip` end-to-end — Homebrew/Node/bun, gstack (for `/codex`), the Codex + Gemini
CLIs and their auth, `gh`, and these symlinks — paste the entire contents of
[`docs/phillip-agent-setup.md`](docs/phillip-agent-setup.md) into Claude Code as your message;
it runs the whole setup itself, stopping only for the few interactive bits (password installers,
API keys, `gh auth login`). See [`docs/phillip-agent-usage.md`](docs/phillip-agent-usage.md) for
day-to-day use. Updating later is just `cd ~/Git/claude-skills && git pull`.

## Adding a new skill

1. Create a directory in this repo: `mkdir my-skill`
2. Add a `SKILL.md` with the skill definition (see existing skills for format)
3. Symlink it: `ln -s ~/Git/claude-skills/my-skill ~/.claude/skills/my-skill`
4. Commit and push
