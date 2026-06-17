# claude-skills

Custom [Claude Code](https://claude.ai/code) skills. Each skill lives in its own directory and is symlinked into `~/.claude/skills/` so Claude Code picks them up automatically.

## Skills

### `/full-send`
End-to-end feature workflow: Linear ticket → implement → `/phillip` self-review → commit → draft PR → Copilot review → address all threads → UI screenshots. Zero stops.

**Usage:** `/full-send` or `/full-send <TICKET-ID>`

---

### `/phillip`
Self-reviews the current diff to a senior engineering bar before it becomes a PR. Runs multiple adversarial rounds with three independent reviewers (Claude + Codex via `/codex` + Gemini via `/gemini`), verifies every finding against the real code path, implements the genuine HIGH/MEDIUM fixes, rejects false positives with a written reason, and loops until a clean round. Writes a report to `~/.claude/plans/phillip-<branch>-<date>.md`.

- `/phillip` — full multi-round, all three reviewers.
- `/phillip quick` — one round, Claude-only (auto-scales down on trivial diffs anyway).

Before each run it invokes `/phillip-sync` (non-blocking) to refresh the rubric from this repo's recent PR reviews.

**Usage:** `/phillip` or `/phillip quick`

**Requires:** `/codex` (gstack) and `/gemini` skills for the external reviewers; degrades to fewer reviewers if either is absent.

---

### `/phillip-sync`
Keeps the `/phillip` rubric fresh by mining the current repo's recent resolved-and-acted-on PR reviews (merged PRs, 30-day window) and appending recurring, generalizable lessons into section 1 of `phillip/SKILL.md` — high-confidence patterns to the auto block, weaker one-offs to Candidates. Honors a 24h per-repo cooldown and is fully non-blocking: degrades to a single warning line if `gh` is missing/unauthenticated/offline. Run automatically by `/phillip`; can also be invoked directly.

**Usage:** `/phillip-sync` (or runs automatically inside `/phillip`)

**Requires:** `gh` CLI authenticated (`gh auth login`). Without it, `/phillip` still runs on the existing rubric.

---

### `/gemini`
Google Gemini CLI wrapper with three modes:

- **Review** — independent diff review with pass/fail gate (uses `gemini-2.5-pro`)
- **Challenge** — adversarial mode that tries to break your code
- **Consult** — ask Gemini anything, leveraging its 1M+ token context for whole-repo questions

**Usage:** `/gemini review`, `/gemini challenge`, `/gemini <question>`

**Requires:** `gemini` CLI — `npm install -g @google/gemini-cli` and a `GEMINI_API_KEY` or OAuth via `gemini` interactive mode.

---

### `/weekly-launch-summary`
Generates a non-developer-friendly weekly summary of merged PRs across the Atllas repos. Produces a categorized, bulleted summary suitable for stakeholders or changelog posts.

**Usage:** `/weekly-launch-summary`

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
```

> **Note:** `full-send/dev-credentials.md` is gitignored — create it manually after cloning if needed.

## Adding a new skill

1. Create a directory in this repo: `mkdir my-skill`
2. Add a `SKILL.md` with the skill definition (see existing skills for format)
3. Symlink it: `ln -s ~/Git/claude-skills/my-skill ~/.claude/skills/my-skill`
4. Commit and push
