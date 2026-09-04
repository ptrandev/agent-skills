# agent-skills

Personal agent skills shared by Claude Code and Codex.

Each top-level skill directory is the canonical source. Symlinks expose the same files to both
agents, so a `git pull` updates every linked copy.

- Claude Code: invoke a skill as `/skill-name`.
- Codex: invoke a skill as `$skill-name` or select it from the skills UI.

## Skill catalog

| Skill | What it does | Common forms |
|---|---|---|
| [`full-send`](full-send/SKILL.md) | Takes a Linear ticket or idea through implementation, review, CI, and UI evidence. | `/full-send [ticket\|idea]`<br>`/full-send interactive <ticket\|idea>`<br>`/full-send loop <ticket\|idea>` |
| [`phillip`](phillip/SKILL.md) | Reviews the current diff against a senior engineering rubric and fixes verified findings. | `/phillip [quick]` |
| [`phillip-sync`](phillip-sync/SKILL.md) | Updates the Phillip rubric from recurring patterns in resolved PR reviews. | `/phillip-sync` |
| [`babysit-prs`](babysit-prs/SKILL.md) | Handles safe review feedback on open PRs you authored and leaves ambiguous threads open. | `/babysit-prs [PR# ...] [--repo owner/name]` |
| [`review-pr`](review-pr/SKILL.md) | Reviews PRs awaiting your review, posts inline findings, and manages the verdict. | `/review-pr [PR#\|URL] [quick]`<br>`--repo owner/name`<br>`--draft`, `--no-approve`, `--no-live`, `--no-resolve-bots` |
| [`mockup`](mockup/SKILL.md) | Builds a self-contained interactive HTML mockup before implementation. | `/mockup [ticket\|plan.md\|description]`<br>`--variants=N`, `--out=path`, `--publish` |
| [`ui-walkthrough`](ui-walkthrough/SKILL.md) | Tests a PR's UI at several widths and posts screenshot evidence to GitHub. | `/ui-walkthrough [PR#\|URL]`<br>`--author\|--reviewer`, `--target=e2e\|dev`, `--no-post` |
| [`gemini`](gemini/SKILL.md) | Uses Gemini for an independent review, challenge, or large-context consultation. | `/gemini review [focus]`<br>`/gemini challenge [focus]`<br>`/gemini <question> [--flash]` |
| [`claude`](claude/SKILL.md) | Uses Claude from Codex for an independent review, challenge, or consultation. Codex only. | `$claude review [focus]`<br>`$claude challenge [focus]`<br>`$claude <question>` |
| [`debrief`](debrief/SKILL.md) | Audits a completed session for unchecked assumptions and remaining risks. | `/debrief [deep] [topic]` |
| [`merge-master`](merge-master/SKILL.md) | Merges `origin/master` into the current branch, resolves conflicts, and pushes. | `/merge-master` |
| [`launch-summary`](launch-summary/SKILL.md) | Summarizes daily or weekly Atllas launches for non-developers. | `/launch-summary [daily\|weekly]` |
| [`plain-english`](plain-english/SKILL.md) | Extracts claims, caveats, omissions, and implications from dense text. | `/plain-english <text>` |
| [`copy-edit`](copy-edit/SKILL.md) | Turns a transcript or rough draft into a polished post without adding claims. | `/copy-edit <text\|path>` |
| [`skill-edit`](skill-edit/SKILL.md) | Rewrites one skill to match this repository's house style. | `/skill-edit [skill\|path]` |

Brackets mark optional input, and pipes mark alternatives. The linked `SKILL.md` files contain
specialized flags and exact behavior.

## Setup

No setup is needed inside this repository. Its local symlinks already expose every shared skill:

- `.agents/skills/` for Codex
- `.claude/skills/` for Claude Code

`shared/` holds reference files that more than one skill reads, such as
[`shared/github-transport.md`](shared/github-transport.md). It is not a skill. `scripts/link-skills`
links it beside the skills, so a `../shared/<file>` path resolves from either host directory. A
Routine setup script must copy `shared` next to the skills it installs.

To use the skills in other repositories, install user-level symlinks:

```bash
git clone https://github.com/ptrandev/agent-skills.git ~/Git/agent-skills
cd ~/Git/agent-skills
./scripts/link-skills
```

The linker refuses to replace a real directory or a symlink that points elsewhere.

To install the global Claude Code instructions too:

```bash
ln -s ~/Git/agent-skills/global/CLAUDE.md ~/.claude/CLAUDE.md
```

For a complete Mac setup for `/phillip`, use
[`docs/phillip-agent-setup.md`](docs/phillip-agent-setup.md). See
[`docs/phillip-agent-usage.md`](docs/phillip-agent-usage.md) for day-to-day use.

### Optional dependencies

- `/gemini` needs the authenticated Gemini CLI. Follow
  [`gemini/references/setup.md`](gemini/references/setup.md).
- `$claude` needs an authenticated Claude Code CLI.
- `/phillip-sync` needs an authenticated `gh` CLI. `/phillip` still works from the existing
  rubric when GitHub is unavailable.
- UI workflows can use `full-send/dev-credentials.md` and `ui-walkthrough/dev-credentials.md`.
  Both are gitignored. Start with
  [`ui-walkthrough/dev-credentials.example.md`](ui-walkthrough/dev-credentials.example.md).

## Maintaining the repository

The rules for writing skills live in [`AGENTS.md`](AGENTS.md). In short:

1. Edit only the canonical top-level skill directories.
2. Keep instructions brief, imperative, and unambiguous.
3. Run `scripts/lint-style <skill>` for every changed skill.
4. Run `scripts/validate-skills` before committing.

### Add a skill

1. Create `<skill-name>/SKILL.md` with valid frontmatter.
2. Link it for Codex: `ln -s ../../<skill-name> .agents/skills/<skill-name>`.
3. Link shared skills for Claude Code: `ln -s ../../<skill-name> .claude/skills/<skill-name>`.
4. Add the skill to the catalog above.
5. Run `scripts/lint-style <skill-name>` and `scripts/validate-skills`.
6. Run `scripts/link-skills` to install the user-level links.

Skip step 3 for Codex-only skills.

### Keep the global writing rules in sync

[`global/CLAUDE.md`](global/CLAUDE.md) is the versioned user-level instruction file for Claude
Code. Four headless skills include its Writing style block because they cannot access the global
file: `babysit-prs`, `full-send`, `review-pr`, and `ui-walkthrough`.

When that block changes, copy it verbatim into all four skills and run:

```bash
for f in babysit-prs full-send review-pr ui-walkthrough; do
  diff <(sed -n '/^When you write technical text/,/backticks instead\.$/p' global/CLAUDE.md) \
       <(sed -n '/^When you write technical text/,/backticks instead\.$/p' $f/SKILL.md) >/dev/null \
    && echo "$f ok" || echo "$f DRIFTED"
done
```

The longer rationale and refresh procedure live in
[`global/ai-tells.md`](global/ai-tells.md).
