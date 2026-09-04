# agent-skills

Personal agent skills shared by Claude Code and Codex.

Canonical skill source lives under `skills/`. Generated symlinks expose the same files to both
agents, so a `git pull` updates every linked copy.

- Claude Code: invoke a skill as `/skill-name`.
- Codex: invoke a skill as `$skill-name` or select it from the skills UI.

## Skill catalog

| Skill | What it does | Common forms |
|---|---|---|
| [`full-send`](skills/full-send/SKILL.md) | Takes a Linear ticket or idea through implementation, review, CI, and UI evidence. | `/full-send [ticket\|idea]`<br>`/full-send interactive <ticket\|idea>`<br>`/full-send loop <ticket\|idea>` |
| [`phillip`](skills/phillip/SKILL.md) | Reviews the current diff against a senior engineering rubric and fixes verified findings. | `/phillip [quick]` |
| [`phillip-sync`](skills/phillip-sync/SKILL.md) | Updates the Phillip rubric from recurring patterns in resolved PR reviews. | `/phillip-sync` |
| [`babysit-prs`](skills/babysit-prs/SKILL.md) | Handles safe review feedback on open PRs you authored and leaves ambiguous threads open. | `/babysit-prs [PR# ...] [--repo owner/name]` |
| [`review-pr`](skills/review-pr/SKILL.md) | Reviews PRs awaiting your review, posts inline findings, and manages the verdict. | `/review-pr [PR#\|URL] [quick]`<br>`--repo owner/name`<br>`--draft`, `--no-approve`, `--no-live`, `--no-resolve-bots` |
| [`mockup`](skills/mockup/SKILL.md) | Builds a self-contained interactive HTML mockup before implementation. | `/mockup [ticket\|plan.md\|description]`<br>`--variants=N`, `--out=path`, `--publish` |
| [`ui-walkthrough`](skills/ui-walkthrough/SKILL.md) | Tests a PR's UI at several widths and posts screenshot evidence to GitHub. | `/ui-walkthrough [PR#\|URL]`<br>`--author\|--reviewer`, `--target=e2e\|dev`, `--no-post` |
| [`gemini`](skills/gemini/SKILL.md) | Uses Gemini for an independent review, challenge, or large-context consultation. | `/gemini review [focus]`<br>`/gemini challenge [focus]`<br>`/gemini <question> [--flash]` |
| [`claude`](skills/claude/SKILL.md) | Uses Claude from Codex for an independent review, challenge, or consultation. Codex only. | `$claude review [focus]`<br>`$claude challenge [focus]`<br>`$claude <question>` |
| [`debrief`](skills/debrief/SKILL.md) | Audits a completed session for unchecked assumptions and remaining risks. | `/debrief [deep] [topic]` |
| [`merge-master`](skills/merge-master/SKILL.md) | Merges `origin/master` into the current branch, resolves conflicts, and pushes. | `/merge-master` |
| [`launch-summary`](skills/launch-summary/SKILL.md) | Summarizes daily or weekly Atllas launches for non-developers. | `/launch-summary [daily\|weekly]` |
| [`plain-english`](skills/plain-english/SKILL.md) | Extracts claims, caveats, omissions, and implications from dense text. | `/plain-english <text>` |
| [`copy-edit`](skills/copy-edit/SKILL.md) | Turns a transcript or rough draft into a polished post without adding claims. | `/copy-edit <text\|path>` |
| [`skill-edit`](skills/skill-edit/SKILL.md) | Rewrites one skill to match this repository's house style. | `/skill-edit [skill\|path]` |

Brackets mark optional input, and pipes mark alternatives. The linked `SKILL.md` files contain
specialized flags and exact behavior.

## Setup

Bootstrap a fresh clone with generated repository-local and user-level symlinks:

```bash
git clone https://github.com/ptrandev/agent-skills.git ~/Git/agent-skills
cd ~/Git/agent-skills
./scripts/link-skills
```

The repository-local adapters live under `.agents/skills/` and `.claude/skills/`. Git ignores
both directories. The user-level adapters live under `~/.agents/skills/` and
`~/.claude/skills/`. The linker refuses to replace a real directory or a symlink that points
elsewhere. It updates links that point to the former top-level skill directories.

Use `./scripts/link-skills --scope repo` to create only repository-local adapters. Use
`--scope user` to create only user-level adapters. The `--host` flag limits either scope to one
host.

`skills/shared/` holds reference files that more than one skill reads, such as
[`skills/shared/github-transport.md`](skills/shared/github-transport.md). It is not a skill.
The linker exposes it beside installed skills so `../shared/<file>` paths resolve. A Routine setup
script must copy `shared` next to each skill it installs.

To install the global Claude Code instructions too:

```bash
ln -s ~/Git/agent-skills/global/CLAUDE.md ~/.claude/CLAUDE.md
```

For a complete Mac setup for `/phillip`, use
[`docs/phillip-agent-setup.md`](docs/phillip-agent-setup.md). See
[`docs/phillip-agent-usage.md`](docs/phillip-agent-usage.md) for day-to-day use.

### Optional dependencies

- `/gemini` needs the authenticated Gemini CLI. Follow
  [`skills/gemini/references/setup.md`](skills/gemini/references/setup.md).
- `$claude` needs an authenticated Claude Code CLI.
- `/phillip-sync` needs an authenticated `gh` CLI. `/phillip` still works from the existing
  rubric when GitHub is unavailable.
- UI workflows can use `skills/full-send/dev-credentials.md` and
  `skills/ui-walkthrough/dev-credentials.md`.
  Both are gitignored. Start with
  [`skills/ui-walkthrough/dev-credentials.example.md`](skills/ui-walkthrough/dev-credentials.example.md).

## Maintaining the repository

The rules for writing skills live in [`AGENTS.md`](AGENTS.md). In short:

1. Edit only canonical skill directories under `skills/`.
2. Keep instructions brief, imperative, and unambiguous.
3. Run `scripts/lint-style <skill>` for every changed skill.
4. Run `scripts/validate-skills` before committing.

### Add a skill

1. Create `skills/<skill-name>/SKILL.md` with valid frontmatter.
2. Add the skill to the catalog above.
3. Run `scripts/lint-style <skill-name>` and `scripts/validate-skills`.
4. Run `scripts/link-skills` to refresh generated links.
5. Run `scripts/validate-skills --links` to verify generated links.

Add a `claude` exclusion to the linker for each Codex-only skill.

### Keep the global writing rules in sync

[`global/CLAUDE.md`](global/CLAUDE.md) is the versioned user-level instruction file for Claude
Code. Four headless skills include its Writing style block because they cannot access the global
file: `babysit-prs`, `full-send`, `review-pr`, and `ui-walkthrough`.

When that block changes, copy it verbatim into all four skills and run:

```bash
for f in skills/babysit-prs skills/full-send skills/review-pr skills/ui-walkthrough; do
  diff <(sed -n '/^When you write technical text/,/backticks instead\.$/p' global/CLAUDE.md) \
       <(sed -n '/^When you write technical text/,/backticks instead\.$/p' $f/SKILL.md) >/dev/null \
    && echo "$f ok" || echo "$f DRIFTED"
done
```

The longer rationale and refresh procedure live in
[`global/ai-tells.md`](global/ai-tells.md).
