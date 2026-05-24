# claude-skills

Custom [Claude Code](https://claude.ai/code) skills. Each skill lives in its own directory and is symlinked into `~/.claude/skills/` so Claude Code picks them up automatically.

## Skills

### `/full-send`
End-to-end feature workflow: Linear ticket → implement → Codex + Gemini review → commit → draft PR → Copilot review → address all threads → UI screenshots. Zero stops.

**Usage:** `/full-send` or `/full-send <TICKET-ID>`

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
ln -s ~/Git/claude-skills/weekly-launch-summary ~/.claude/skills/weekly-launch-summary
```

> **Note:** `full-send/dev-credentials.md` is gitignored — create it manually after cloning if needed.

## Adding a new skill

1. Create a directory in this repo: `mkdir my-skill`
2. Add a `SKILL.md` with the skill definition (see existing skills for format)
3. Symlink it: `ln -s ~/Git/claude-skills/my-skill ~/.claude/skills/my-skill`
4. Commit and push
