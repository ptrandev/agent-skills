# Writing skills in this repo

Every directory here is a Claude Code skill, symlinked into `~/.claude/skills/`. Each file you
write has two readers: an agent that must act on it, and a human who must maintain it. Write for
both. Neither one is served by extra words.

Three things load at different costs. Budget for each:

| What | Loads | Cost |
|---|---|---|
| Frontmatter `description` | Every session, even when the skill never runs | Highest. Pay rent in every session. |
| `SKILL.md` | On invocation | High. Every run pays for every line. |
| Reference `.md` files | Only when `SKILL.md` tells the agent to read them | Paid only by the runs that need it. |

## Style: ASD-STE100, adapted for agent readers

Standard ASD-STE100 optimizes for a human who reads once. A skill is read by a model that acts on
every sentence. These rules take priority over the general writing style in `global/CLAUDE.md`:

- **One instruction per sentence.** Split any sentence carrying two.
- **Imperative mood, actor named.** "Run `gh pr view`." Not "the PR should be viewed" or "you may
  want to run".
- **One word, one meaning.** Pick a term for each concept and repeat it in every sentence. Never
  vary a name for style. `PR`, `thread`, `finding`, `verdict` stay those words throughout a skill.
- **Short common words.** `use` not `utilize`, `before` not `prior to`, `run` not `execute`.
- **20 words per instruction sentence, 25 per explanation.** 6 sentences per paragraph.
- **No hedges.** Delete `try to`, `if possible`, `generally`, `as needed`, `where appropriate`. An
  agent reads a hedge as permission to skip the step. State the condition instead: "Skip Phase 4
  when `--no-post` is set."
- **Mark prohibitions.** A wrong default needs an explicit block: **Never**, **Do not**, **Stop
  and ask**. Bold it so a skim cannot miss it.
- **Keep the evidence.** Exact commands, flags, paths, `file:line`, literal output strings, and
  exit codes all stay. Concision means fewer words per instruction, never fewer instructions.
- **Never use the em dash.** A period, comma, colon, or parentheses always works.
- **Escape `\~` and `\$`** when used literally in prose. Two of either in one paragraph corrupt
  everything between them in rendered markdown.

## Brevity: every sentence changes behavior

Apply the **deletion test** to each sentence. Remove it. If the agent would still do the same
thing in the same order, leave it removed.

Delete on sight:

- Motivation and stakes: "This is important because", "quality matters here".
- Restating the skill's purpose after the opening lines.
- Meta-narration: "In this section", "Now that we have done X", "The next step will".
- Praise, hype, and closing summaries of what the skill just told the agent to do.
- Any rule already stated elsewhere in the same skill.

Keep rationale only when the agent must apply the rule to a case the skill does not list. Attach
it to the instruction as one clause, not a paragraph. Example: "Resolve only threads you fixed and
verified green, because a resolved thread is invisible to the author."

Prefer structure over prose. Branches go in a table. Ordered work goes in a numbered list. A
paragraph that describes three cases costs more tokens and reads worse than a three-row table.

**One owner per fact.** State a procedure in exactly one file. Duplicated rules drift, and the
agent then follows whichever copy it read last. The one documented exception is the Writing style
block copied verbatim into four skills, explained in `README.md`, because headless sandboxes
never load `~/.claude/CLAUDE.md`.

## Progressive disclosure: split what most runs do not read

Move a section into its own `.md` file when any of these is true:

- It fires in a minority of runs (one mode, one flag, one role, one platform).
- It is needed at one phase only, and that phase is late.
- It is one-time setup, a long worked example, or a reference table.
- `SKILL.md` is past \~500 lines and still growing.

What stays in `SKILL.md`: input parsing, mode routing, phase order, anything every run needs, and
the pointers to the reference files.

Rules for the split:

1. **Extract a whole contract, not a fragment.** After reading `SKILL.md` plus the one reference,
   the agent must be able to finish that job without a third file.
2. **Point at the file where the work happens**, in the imperative, in bold, with the condition
   for reading it: **"Read [stack.md](stack.md) before booting the stack."** Never write "see X
   for more information", which gives the agent no trigger and no reason.
3. **Say what the file owns** in one clause, so the agent knows it is the source of truth and
   `SKILL.md` is not.
4. **Do not restate the extracted content.** A summary in `SKILL.md` costs the tokens the split
   was meant to save, and becomes the copy that drifts.
5. **One location per skill.** Put a skill's first reference file in `references/`. Match the
   existing location for skills that already have reference files at their root.

## Frontmatter

```yaml
---
name: <matches the directory name>
description: >
  What the skill does, in 2 to 4 lines. Then the phrases that should route to it. Use for
  "walk the UI", "screenshot the PR".
---
```

`description` is the only text in context for every session, so it is the most expensive prose in
the repo. It carries routing. Say what the skill does and when to invoke it. No implementation
detail, no phase names, no flags.

Add `allowed-tools` only to restrict a skill below the session's tools. Omitting it grants all of
them.

## Before you finish

1. Run the deletion test over every sentence you added.
2. Confirm each new reference file has exactly one imperative pointer in `SKILL.md`.
3. Update the skill's entry in `README.md`, including any new reference file it links.
4. New skill: add the `ln -s` line to the Setup block in `README.md`, and create the symlink.
5. Changed the Writing style block: run the drift check in `README.md` against all three copies.
