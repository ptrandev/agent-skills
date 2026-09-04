---
name: skill-edit
description: >
  Rewrites one skill file in this repository to the house style in AGENTS.md, without losing an
  instruction. Fixes what the style linter reports, then applies the judgment rules a linter
  cannot see. Use for "tighten this skill", "make this skill match the house style", "this
  SKILL.md is too long", or "style pass on <skill>".
---

# skill-edit

You are the editor. The skill is the contract. **Never** drop an instruction, a command, a flag,
a path, a `file:line`, a literal output string, or an exit code. Concision means fewer words per
instruction. It never means fewer instructions.

[`AGENTS.md`](../AGENTS.md) owns the style rules. **Read it before Phase 1.** This skill states
the procedure only.

## Input

| Invocation carries | Target |
|---|---|
| A skill name (`skill-edit gemini`) | Every `.md` file in that directory, `SKILL.md` first. |
| A file path | That file. |
| Nothing | Run `scripts/lint-style --summary` and ask which file to take. |

Edit one file per run. A run that touches four files produces a diff nobody reviews.

## Phase 1: Inventory the contract

Read the target file. Write a scratch inventory before you change a character:

1. Every instruction, in order, numbered.
2. Every command, flag, path, and environment variable.
3. Every branch: the condition, and what happens on each side.
4. Every prohibition, and what it forbids.
5. Every pointer to another file, and the condition for reading it.

This inventory is the checklist for Phase 5. Nothing on it disappears without a line in the report.

## Phase 2: Fix the mechanical findings

Run the linter on the target:

```bash
scripts/lint-style <path>
```

Fix every finding at the source. Rewrite the sentence. **Never** silence a finding with an
exemption comment unless the passage must name a banned word, such as a rule that bans the word.
A `modal` finding on a real counterfactual ("if the agent still does the same thing") is the one
case where a rewrite makes the sentence worse. Leave it, and name it in the report.

Two findings need structure, not wording:

- `long-skill`: extract a reference file. Follow the split rules in `AGENTS.md`.
- `long-description`: cut the description to what the router needs. Say what the skill does and
  when to invoke it. Delete flags, phase names, and implementation detail.

## Phase 3: Apply the judgment rules

The linter cannot see these. Work through them in order:

1. **Deletion test.** Remove each sentence. If the agent still does the same thing in the same
   order, leave it removed. Motivation, stakes, meta-narration, and closing summaries all go.
2. **One owner per fact.** A rule stated twice in one skill drifts. Keep the copy at the point of
   use and delete the other. A rule stated in `AGENTS.md` gets a pointer, not a restatement.
3. **Structure over prose.** Three cases become a three-row table. Ordered work becomes a numbered
   list. A branch becomes a table with the condition in column one.
4. **Progressive disclosure.** A section that fires in a minority of runs, or at one late phase
   only, moves to its own file. Extract a whole contract, so the agent finishes that job from
   `SKILL.md` plus one reference. Leave exactly one imperative pointer behind, in bold, with the
   condition for reading it. **Do not** summarize what you extracted.
5. **Hedges become conditions.** `as needed` names no case. Replace it with the case: "Skip Phase 4
   when `--no-post` is set." Delete the hedge when no condition exists.

## Phase 4: Preserve the register

A skill is read by a model that acts on every sentence. Keep the imperative mood and the named
actor. Keep every **Never**, **Do not**, and **Stop and ask** in bold, because a skim must not
miss a prohibition. Keep one word per concept across the whole file. Do not vary a name for style.

Some files defend a different register on purpose. `copy-edit/SKILL.md` overrides the global rules
for the post body it produces. When a file states an override, the override wins. Style the
instructions around it, not the passage it protects.

## Phase 5: Verify, then report

Run all five before you finish:

1. Every numbered item in the Phase 1 inventory appears in the new file, or in the reference file
   you extracted.
2. `scripts/lint-style <path>` reports only the findings you named in Phase 2.
3. `scripts/validate-skills` passes.
4. `git diff --stat` shows the file got shorter. A style pass that adds lines went wrong, unless
   it split a table out of a paragraph.
5. Read the file as the agent. Every branch still resolves to one action.

Then print the report:

```
skill-edit <path>
  lines      <before> -> <after>
  findings   <before> -> <after>
  extracted  <new reference file, or none>
  dropped    <every instruction removed, with the reason>
  left       <every finding kept, with the reason>
```

`dropped` is the line that matters. An empty `dropped` on a file that lost 200 lines means you
did not check. Go back to Phase 5, step 1.
