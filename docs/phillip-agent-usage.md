# Using `/phillip`: day-to-day guide

First you set this up once (Claude does most of it), then you run one command before every push.

## First-time setup (one-time, let Claude do it)

You don't install anything by hand. Claude provisions your Mac from the companion doc, which clones this repo and symlinks the skills for you:

1. Open Claude Code in any project and pick the best model: type `/model` and choose the most capable option offered.
2. Paste the ENTIRE contents of **[`docs/phillip-agent-setup.md`](./phillip-agent-setup.md)** (the companion doc in this repo) as your message. That doc is written for Claude, not for you -> Claude reads it and runs the whole setup itself, including cloning this repo and symlinking `/phillip`, `/phillip-sync`, and `/gemini` into `~/.claude/skills/`.
3. Let it work. It does everything it can on its own and STOPS to ask you (an "ASK USER" block) only for the few things it can't do:
   - GUI/password installers it can't click: `xcode-select --install` and the Homebrew installer.
   - Your API keys (OpenAI for Codex, Google for Gemini): you paste them into `~/.zshenv` YOURSELF in your terminal. Keep them out of the chat; Claude never needs to see them.
   - `gh auth login` (a browser login), plus the `/model` and `/effort ultracode` commands you type into the Claude input box.
4. When its final "verify and report" step says the checks passed, you're set. Re-running the setup later is safe. It skips whatever's already installed and just refreshes the repo.

After that, it's just the one move below before every push.

## The one move

Before you push, type:

```
/phillip
```

No arguments. It reviews your current branch vs the default branch (main/master, auto-detected), including any staged or uncommitted edits you're about to ship.

## What it does

Runs your diff through three independent reviewers (Claude + Codex + Gemini) over multiple rounds. It verifies every finding against the real code, fixes the genuine HIGH/MEDIUM ones, rejects bad suggestions out loud (with a reason), and loops until a clean ("dry") round turns up nothing new. It caps at 4 rounds that find something, and the clean confirmation round after the last fix is always free on top of that (5 rounds maximum). If it is still finding HIGH/MEDIUM issues at the cap, it stops, applies them, and flags the result as unconfirmed (that's the "Needs human review" verdict below).

All three reviewers are genuinely independent. Codex and Gemini are separate CLI processes that see only your diff. The Claude reviewer is a **blind sub-agent** -> a fresh Claude with no access to the conversation, the ticket, or who wrote the code, so it reviews with no author bias, exactly like the two CLIs. The orchestrating session that runs `/phillip` does NOT count as a reviewer; it integrates and verifies their findings. The two CLIs and the blind sub-agent run in parallel, so a round costs about the slowest single reviewer rather than the sum of all of them.

## Full vs quick

- `/phillip` -> full multi-round, all three reviewers. Use on substantive diffs: logic, auth, data, anything user-facing.
- `/phillip quick` -> one round, Claude-only (it may add one external reviewer if the diff is substantial). Use on small or low-risk diffs.
- It auto-scales down on tiny diffs (docs-only, sub-30 lines, no logic) -> runs Claude-only even without `quick`.

## Reading the result

You get a report table -> saved to `~/.claude/plans/phillip-<branch>-<date>.md` and printed in chat. Columns: severity, `file:line`, finding, source (which reviewer raised it), status (Fixed + SHA / Listed / Rejected-with-reason).

Then the verdict line:
- "Ready for PR" -> the loop ended on a clean dry round with nothing unresolved. Push and open the PR.
- "Needs human review -> cap hit, final-round fixes unconfirmed" -> the loop hit its finding-round limit before a clean round, so the fixes it applied last were never re-verified by a dry round. Do NOT treat it as Ready for PR -> eyeball the final-round changes yourself before shipping.
- Anything else (it lists what remains and why) -> read it; there are unresolved items. Take a beat before shipping.

## Cost

The full loop is real work and real API spend (several external CLI calls, a few minutes). Use `quick` mode on small stuff so you actually keep the habit.

## Keeping it fresh (it does this itself)

You don't maintain the rubric by hand and there's no canonical copy to chase. The `~/.claude/skills/phillip/RUBRIC.md` file IS the single source of truth (a symlink into your `~/Git/claude-skills` clone), and it self-updates.

Every time you run `/phillip`, it first runs `/phillip-sync`:
- It looks at the CURRENT repo's recent PRs (last 30 days, capped), reads which review comments were resolved AND acted on, and distills the recurring, generalizable lessons.
- High-confidence patterns get appended as rows in the `<!-- phillip-sync:auto -->` table, tagged with the date. Weaker one-offs land in the `Candidates` table for you to promote or delete. Declined comment classes land in the `<!-- phillip-sync:auto-donotflag -->` table, which tells the reviewers what NOT to raise.
- The tables are capped: 40 auto rows, 30 candidate rows. Old rows that stop recurring get retired, so the file does not grow forever.
- It learns from all reviewers on the repo's merged PRs (capped per PR), not just one person -> the rubric reflects the whole team's bar.

It's cheap and safe: a 24h per-repo cooldown means most runs are an instant no-op ("rubric fresh"), and if `gh` isn't installed/authed or you're offline it prints one warning and reviews on the existing rubric anyway -> it never blocks `/phillip`.

So: just keep running `/phillip`. The rubric grows on its own. If you ever want to force a refresh, run `/phillip-sync` directly. To curate, open `~/.claude/skills/phillip/RUBRIC.md` and promote good candidate rows into the auto table (or delete noise). One prerequisite: `gh auth login` must be done once (Setup Step 5).

## Updating the skills

Because the skills are symlinked from your clone, updating is one step:

```bash
cd ~/Git/claude-skills && git pull
```

That brings `/phillip`, `/phillip-sync`, and `/gemini` to the latest version with no re-copying. Update gstack (which provides `/codex`) separately from inside Claude Code with `/gstack-upgrade`.
