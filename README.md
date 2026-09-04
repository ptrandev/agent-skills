# agent-skills

Custom skills shared by Claude Code and Codex. Each skill has one canonical directory in this
repository. Repository-local symlinks expose those directories to both agents. The setup script
can also expose them in other repositories through user-level symlinks. An edit or `git pull`
updates every entry immediately.

Claude Code invokes a skill as `/skill-name`. Codex invokes one as `$skill-name` or selects it from
its skills UI.

## Skills

### `/full-send`
End-to-end feature workflow. Takes a Linear ticket or a raw idea and ships a reviewed PR. Small tickets run in one pass. Large ones decompose into a Ralph-style loop, one task per iteration. Every run then does `/phillip` self-review, commit, draft PR, bot review (Copilot and Gemini Code Assist), thread replies, green CI, and UI screenshots plus a walkthrough video (via [OpenCap](https://opencap.dev)) on the PR. It moves the Linear ticket to In Review at the end.

Autonomous by default, with zero stops. The `interactive` mode grills you first. Safe to re-run, since it resumes and skips completed phases. The loop phase runs from [`full-send/ralph-loop.md`](full-send/ralph-loop.md). The screenshot and video phase runs from [`full-send/evidence.md`](full-send/evidence.md).

**Usage:**
- `/full-send <TICKET-ID>`: run autonomously from an existing ticket
- `/full-send`: prompts for a ticket ID or idea
- `/full-send <free-text idea>`: synthesizes a Linear ticket from the idea, then builds it
- `/full-send interactive <TICKET-ID>`: grills you to remove ambiguity before writing code
- `/full-send loop <TICKET-ID>`: forces the Ralph loop regardless of ticket size

---

### `/phillip`
Self-reviews the current diff to a senior engineering bar before it becomes a PR. Runs adversarial rounds with three independent reviewers: Claude, Codex via `/codex`, and Gemini via `/gemini`. Verifies every finding against the real code path. Implements the genuine HIGH and MEDIUM fixes. Rejects false positives with a written reason. Loops until a clean round, up to 4 rounds that find something plus a free confirmation round. Writes a report to `~/.claude/plans/phillip-<branch>-<date>.md`.

- `/phillip`: full multi-round, all three reviewers.
- `/phillip quick`: one round, Claude-only (auto-scales down on trivial diffs anyway).

The rubric lives in [`phillip/RUBRIC.md`](phillip/RUBRIC.md), not in `phillip/SKILL.md`. Claude and Codex read it directly. Gemini receives a copied rubric file in its temporary workspace. Before each run `phillip` invokes `phillip-sync` (non-blocking) to refresh it from this repo's recent PR reviews.

**Usage:** `/phillip` or `/phillip quick`

**Requires:** the `/codex` (gstack) and `/gemini` skills for the external reviewers. It degrades to fewer reviewers when either one is absent.

**First-time setup:** [`docs/phillip-agent-setup.md`](docs/phillip-agent-setup.md) is a paste-to-Claude script that provisions a Mac end-to-end (gstack/`/codex`, the Codex + Gemini CLIs, `gh`, and symlinks these skills). [`docs/phillip-agent-usage.md`](docs/phillip-agent-usage.md) is the day-to-day guide.

---

### `/phillip-sync`
Keeps the `/phillip` rubric fresh. Mines the current repo's resolved-and-acted-on PR reviews from merged PRs over a 30-day window. Folds high-confidence patterns into the auto-synced table of [`phillip/RUBRIC.md`](phillip/RUBRIC.md), and weaker one-offs into the candidates table. `RUBRIC.md` holds three anchored markdown tables: auto-synced, candidates, do-not-flag. Sync only writes between those anchors. Honors a 24h per-repo cooldown. Non-blocking: it prints one warning line when `gh` is missing, unauthenticated, or offline.

Two Python helpers do the work. [`phillip-sync/scripts/plan.py`](phillip-sync/scripts/plan.py) builds the mining plan. [`phillip-sync/scripts/cursor.py`](phillip-sync/scripts/cursor.py) reads and writes the per-repo cooldown cursor. The skill resolves them from its loaded skill directory.

**Usage:** `/phillip-sync` (or runs automatically inside `/phillip`)

**Requires:** `gh` CLI authenticated (`gh auth login`). Without it, `/phillip` still runs on the existing rubric.

---

### `/babysit-prs`
Triages every unresolved review thread on the open PRs you authored on the Atllas repos. Covers bot threads (Copilot, Gemini Code Assist) and teammate threads alike. Fixes the safe, mechanical ones. Replies everywhere with the fixing commit as evidence. Resolves only the threads it fixed and verified green. Answers questions and judgment calls, then leaves them open for you. Dispatches one sub-agent per PR so contexts stay isolated. Idempotent and concurrency-guarded, so it runs headless on an hourly cloud Routine ([`babysit-prs/routine.md`](babysit-prs/routine.md)) or a local `/loop`.

**Usage:**
- `/babysit-prs`: all open PRs you authored across the default repos
- `/babysit-prs <PR#> [<PR#>...]`: specific PRs
- `/babysit-prs --repo <owner/name>`: restrict to one repo

---

### `/review-pr`
The reviewer side of the PR loop. Reviews PRs where you are the **requested reviewer**, at the same bar as `/phillip`: its rubric, three independent reviewers, every finding verified. Posts the review to GitHub as inline comments plus a conservative verdict. `REQUEST_CHANGES` needs a verified HIGH. `APPROVE` needs a clean, fully verified pass. Keeps the PR's state label in sync with the verdict it posted: `Code Approved` on `APPROVE`, `Code Review Made Comments` on `REQUEST_CHANGES` or on a `COMMENT` that posted a finding. Also adjudicates existing bot threads: it surfaces the legit ones and resolves verified-false noise with a written reason. One sub-agent per PR. Idempotent via the reviews-API `commit_id`. Runs headless on a Routine ([`review-pr/routine.md`](review-pr/routine.md)). Booting, reusing, and tearing down the sealed e2e stack for the live walkthrough runs from [`review-pr/stack-lifecycle.md`](review-pr/stack-lifecycle.md). Every GitHub call goes through one transport, `gh` or the MCP connector, mapped in [`review-pr/github-transport.md`](review-pr/github-transport.md), because a cloud sandbox can block the API while MCP keeps working.

**Usage:**
- `/review-pr`: all PRs awaiting your review across the default repos
- `/review-pr <PR#|URL>`, `/review-pr --repo <owner/name>`, `/review-pr quick`
- Opt-downs: `--draft`, `--no-approve`, `--no-live`, `--no-resolve-bots`

---

### `/mockup`
Builds one self-contained HTML file that looks like the real product and walks a proposed change through every state, interactively, before the change is built. The reader clicks through the flow, toggles before against after, drags the frame to any width or jumps to laptop, tablet and mobile, and reaches every terminal outcome, the unhappy ones and the one where the change does not work included. Portable: one file, no server, no build step, send it to anyone. Every colour, size, radius and shadow is transcribed from the product's theme, so the mockup cannot look nearly right. The state list it produces is the spec the implementation is checked against.

Token extraction and component measurement run from [`mockup/references/grounding.md`](mockup/references/grounding.md). The file layout, the chrome, the click wiring and the seed-data rules run from [`mockup/references/document.md`](mockup/references/document.md), which starts every run from the verified harness in [`mockup/references/shell.html`](mockup/references/shell.html). The post-approval difference inventory and the proof pass run from [`mockup/references/implement.md`](mockup/references/implement.md).

**Usage:** `/mockup`, `/mockup <TICKET-ID>`, `/mockup <path.md>`, `/mockup <free text>`, plus `--variants=N`, `--out=<path>`, `--publish`

---

### `/ui-walkthrough`
Walks a PR's UI changes in a real browser at desktop, tablet, and mobile widths. Judges what it sees against the design-review rubric. Posts the evidence back to GitHub: a `REQUEST_CHANGES` review with screenshots on a blocking defect, or a proof comment with screenshots when it is clean. Role-aware: as the PR's reviewer it posts a review, as its author it posts a walkthrough comment. Local runs under either role also record a desktop walkthrough video: one user journey through the change, covering every surface walked, clicked not scripted, indexed by markers. The screenshots carry the responsive evidence. Never mutates source. Always walks the sealed e2e stack: `--target=dev` runs only when a human types it.

Getting a browser runs from [`ui-walkthrough/driver.md`](ui-walkthrough/driver.md). Port lanes, the per-lane lock, and `browse` daemon scoping run from [`ui-walkthrough/concurrency.md`](ui-walkthrough/concurrency.md). Stack boot and the persona hold spec run from [`ui-walkthrough/stack.md`](ui-walkthrough/stack.md). The three capture passes run from [`ui-walkthrough/capture.md`](ui-walkthrough/capture.md), which is also the only file the capture sub-agent reads. Publishing and linking the screenshots runs from [`ui-walkthrough/evidence-hosting.md`](ui-walkthrough/evidence-hosting.md). Posting, the report, and teardown run from [`ui-walkthrough/post-and-report.md`](ui-walkthrough/post-and-report.md). The recording contract is [`ui-walkthrough/opencap.md`](ui-walkthrough/opencap.md). GitHub calls go through the transport shared with `/review-pr`, [`review-pr/github-transport.md`](review-pr/github-transport.md).

**Usage:** `/ui-walkthrough`, `/ui-walkthrough <PR#|URL>`, plus `--author`/`--reviewer`, `--viewports=`, `--personas=`, `--target=e2e|dev`, `--lane=N`, `--no-post`, `--embedded`

---

### `/gemini`
Google Gemini CLI wrapper with three modes (defaults to `gemini-pro-latest`; pass `--flash` for `gemini-flash-latest`):

- **Review**: independent diff review with a pass/fail gate
- **Challenge**: adversarial mode that tries to break your code
- **Consult**: ask Gemini anything, leveraging its 1M+ token context for whole-repo questions

One-time per-machine setup lives in [`gemini/references/setup.md`](gemini/references/setup.md). The decision-brief format the skill uses to ask you something lives in [`gemini/references/askuserquestion.md`](gemini/references/askuserquestion.md).

**Usage:** `/gemini review`, `/gemini challenge`, `/gemini <question>`

**Requires:** the `gemini` CLI (`npm install -g @google/gemini-cli`) and **API-key auth**. Put `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) in `~/.zshenv`, so non-interactive shells see it. Set `security.auth.selectedType: "gemini-api-key"` in `~/.gemini/settings.json`. OAuth and Code Assist login are not supported, because they 404 on the `-latest` model aliases.

---

### `$claude` (Codex only)

Calls the Claude Code CLI in a fresh, read-only process for an independent review, adversarial
challenge, or consultation. `phillip` and `review-pr` use its deterministic runner so Claude stays
blind to the orchestrating conversation. The linker installs this skill into Codex only; Claude
Code does not need a skill for calling itself.

**Usage:** `$claude review`, `$claude challenge`, or `$claude <question>`

**Requires:** an installed and authenticated `claude` CLI.

---

### `/debrief`
End-of-session confidence audit. Interrogates the session just completed: least-confident assumptions, early decisions never revisited, what you do not realize, the most likely 3-month failure. Converts every uncertainty into a concrete check: a command, a test, or a file read. Runs the safe ones. Separates real gaps from confident-sounding filler. Spawns a blind, context-free sub-agent on the diff, skipped when `/phillip` already ran, since that does blind review. Read-only: it reports ranked findings and never fixes unprompted.

**Usage:**
- `/debrief`: audit the current session
- `/debrief deep`: force the blind-reviewer pass even after `/phillip`
- `/debrief <topic>`: focus the audit on one area

---

### `/merge-master`
Brings the current branch up to date with `master`. Fetches `origin/master`, merges it in, resolves any conflicts, then commits and pushes. Refuses to run on `master` or `main` itself. Stops to ask before it clobbers a dirty tree.

**Usage:** `/merge-master` (or "merge master", "sync with master", "update my branch")

---

### `/launch-summary`
Summarizes merged PRs across the Atllas `codebase` and `aicc-queues` repos for a non-developer reader. Splits the output into **Mobile** and **App** sections. Counts only PRs merged into `master`. The result is categorized and bulleted, for stakeholders or changelog posts.

The window is the only difference between the two modes. `daily` is a rolling last 24 hours. `weekly` is the calendar week, Monday 00:00 UTC through today. The `gh` calls, the Mobile/App split, the categories, and the output template are shared.

**Usage:**
- `/launch-summary daily` (also what you get with no argument)
- `/launch-summary weekly`

---

### `/plain-english`
Extracts the signal out of bloated or evasive text. It selects, it does not rewrite. The output is a bottom line, every falsifiable claim with its strength marked (`fact`, `hedged`, `attributed`, `promise`, `opinion`), what the text conspicuously does not say, and what it implies without claiming. Hedges, bounds, scope limits, and attribution ride along with the claim they modify, so "up to 40%" never becomes "40%" and "the vendor says X" never becomes "X". Nothing from outside the source is added. An empty claims list is the finding when a source makes no checkable claim.

**Usage:** `/plain-english` then paste the text, or paste the text and ask what it is actually saying.

---

### `/copy-edit`
Copy-edits a spoken transcript, or a rough draft, into a finished post that still sounds like you. You are the writer, it is the editor: it never adds a claim, a number, or an opinion you did not say, and it keeps a vague statement exactly as vague as you left it. It inventories every claim, number, caveat, and recommendation first, derives a voice fingerprint from your own words, then restructures with full latitude (reordered sections, rewritten headings, a buried point promoted) and rewords freely inside that fingerprint. It cuts the spoken filler, the throat-clearing, and the point you made three times. It adds hyperlinks on first mention only, and fetches every URL in the run before it enters the draft. It generates missing frontmatter without overwriting a field you wrote. The report names every cut that removed a point, every dropped link, and every gap it found but refused to fill.

The post body follows your voice, not the ASD-STE100 rules in [`global/CLAUDE.md`](global/CLAUDE.md): contractions, first person, and long sentences all stay. Only the mechanics carry over (no em dash, American spelling, escaped `\~` and `\$`, no AI tells). `SKILL.md` states that override explicitly, because the global rules would otherwise strip the voice the skill exists to protect.

**Usage:** `/copy-edit` then paste the transcript, or `/copy-edit <path.md>`. It asks where to write the draft.

---

## Setup

No setup is required to use either agent inside this repository:

- `AGENTS.md` is the canonical repository instruction file.
- `CLAUDE.md` imports `AGENTS.md` for Claude Code.
- `.agents/skills/` points to every top-level skill for Codex.
- `.claude/skills/` points to every shared top-level skill for Claude Code.

To use these skills while working in other repositories, install user-level symlinks. The script
refuses to replace an existing real directory or a symlink with a different target.

To set up on a new machine:

```bash
git clone https://github.com/ptrandev/agent-skills.git ~/Git/agent-skills
cd ~/Git/agent-skills
./scripts/link-skills

# Global Claude Code instructions (not a skill). See "Global CLAUDE.md" below.
ln -s ~/Git/agent-skills/global/CLAUDE.md ~/.claude/CLAUDE.md
```

> **Note:** `full-send/dev-credentials.md` and `ui-walkthrough/dev-credentials.md` are gitignored, because this repo is public. Create them manually after cloning if needed; `ui-walkthrough/dev-credentials.example.md` is the template.

### Setting up the Phillip agent (full)

The snippet above wires the skills into an already-configured machine. To provision a fresh
Mac for `/phillip` end-to-end (Homebrew/Node/bun, gstack for `/codex`, the Codex + Gemini
CLIs and their auth, `gh`, and these symlinks), paste the entire contents of
[`docs/phillip-agent-setup.md`](docs/phillip-agent-setup.md) into Claude Code as your message;
it runs the whole setup itself, stopping only for the few interactive bits (password installers,
API keys, `gh auth login`). See [`docs/phillip-agent-usage.md`](docs/phillip-agent-usage.md) for
day-to-day use. Updating later is just `cd ~/Git/agent-skills && git pull`.

## Global `CLAUDE.md`

`global/CLAUDE.md` is the user-level instruction file that Claude Code loads for every session on
this machine. It is symlinked to `~/.claude/CLAUDE.md`, so it is versioned here and survives a
machine rebuild. It is not a skill, so it has no `SKILL.md` and is never invoked.

Its **Writing style** section is reproduced **verbatim** inside `babysit-prs/SKILL.md`,
`full-send/SKILL.md`, `review-pr/SKILL.md`, and `ui-walkthrough/SKILL.md`. Those four skills post
text that teammates read, and they run in cloud Routines and headless sandboxes that never load
`~/.claude/CLAUDE.md`, so the in-skill copy is the binding one there. The duplication is deliberate:
a reference to a file the sandbox does not have would silently drop the rules in the one place they
matter most.

When the section changes here, copy it into all four unchanged instead of paraphrasing. Rewording
one copy is how they drifted apart the first time. Verify no copy has drifted:

```bash
for f in babysit-prs full-send review-pr ui-walkthrough; do
  diff <(sed -n '/^When you write technical text/,/backticks instead\.$/p' global/CLAUDE.md) \
       <(sed -n '/^When you write technical text/,/backticks instead\.$/p' $f/SKILL.md) >/dev/null \
    && echo "$f ok" || echo "$f DRIFTED"
done
```

[`global/ai-tells.md`](global/ai-tells.md) is the deep reference behind those Writing style rules:
the full list of AI writing tells, the patterns that are *not* tells, and its own quarterly refresh
procedure against the upstream Wikipedia source. `global/CLAUDE.md` points at it, and that pointer
sits **outside** the copied block on purpose. The four skills above run against other repositories,
where this file is not on disk, so their copy of the Writing style rules has to stand alone.

## Adding a new skill

1. Create a directory in this repo: `mkdir my-skill`
2. Add a `SKILL.md` with the skill definition (see existing skills for format)
3. Run `ln -s ../../my-skill .agents/skills/my-skill`.
4. Run `ln -s ../../my-skill .claude/skills/my-skill`. Skip this for a Codex-only skill.
5. Run `./scripts/validate-skills`.
6. Run `./scripts/link-skills`.
7. Commit and push.
