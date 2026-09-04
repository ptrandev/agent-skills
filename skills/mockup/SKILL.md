---
name: mockup
description: >
  Builds one self-contained HTML file that looks like the real product and walks a proposed change
  through every state, interactively, before the change is built. Portable: send the file to
  anyone, no server, no build step. Use for "mock this up", "prototype this", "what will this look
  like", "show me before and after", or "I want to see it before we build it".
---

# mockup

One HTML file. Product-real tokens. Every state reachable by clicking. Opens from `file://`.

## Input

| Input | Meaning |
|---|---|
| `<TICKET-ID>` | Read the ticket. It is the source and the scope. |
| `<path.md>` | A plan file. Same. |
| free text | The change, described. |
| nothing | The change under discussion in this session. |
| `--variants=N` | Build N design directions instead of one. |
| `--out=<path>` | Where to write. Default: the scratchpad, named `<slug>.html`. |
| `--publish` | Also publish as an Artifact and return the URL. |

## Never

- **Never invent a colour, font size, weight, radius, spacing or shadow.** Every value traces to a
  token you read this run. An invented value is what makes a mockup look nearly right, and nearly
  right is the failure this skill exists to prevent.
- **Never rebuild a screen from memory of the product.** Read the components.
- **Never approximate the app shell.** The nav, the header, the drawer and the content offset are
  part of what the reader is judging, and they change at breakpoints the surface itself does not
  care about. Read the layout component that hosts the page.
- **Never disclose your way out of a gap.** "Not modelled" in the report is a defect you chose to
  ship, not a scope note. If the real behavior is in the codebase, reproduce it.
- **Never leave a button dead.** A control that does nothing teaches the wrong thing.
- **Never use lorem, `Item 1`, `Foo`, or `test@example.com`.** Seed realistic names, ids, amounts
  and dates. Wrapping and truncation are half of what the reader is judging.
- **Never require a server, a build step, or a network request for layout or content.**
- **Never style the walkthrough chrome with product tokens.** The scaffolding must read as
  scaffolding at a glance.
- **Never ship a state the reader cannot reach.** Chip, button, or both.

## Phase 1: scope the change

Read the source. Name the one surface the change lands on. Then pick the shape:

| The change | Shape |
|---|---|
| New states on one existing screen | `flow`: one frame, the states as steps |
| A journey across screens | `flow`: one step per screen |
| A restyle of a screen that exists | `before/after` toggle on the frame |
| The direction is not chosen yet | `variants`: N directions, grid then focus |
| One small region of a dense screen | `overlay`: real screenshot, HTML over the changed region |
| No screen at all (schema, pipeline, prompt) | **Stop.** Say there is nothing to show, offer `/diagram`. |

Shapes compose. A `variants` run can hold a `flow` per variant. Decide the shape yourself. Do not
ask the user a question the source already answers.

**Ask for reference images only when the shape is `variants`, or when the user says the current
look is wrong.** Ask them to paste screenshots or Dribbble shots. Read every one before designing.
When a reference is named but missing, stop and say which. Otherwise the product IS the reference.

## Phase 2: ground it in the real product

**Read [references/grounding.md](references/grounding.md) before writing any CSS.** It owns token
extraction, component geometry, and when to measure a running app instead of reading the theme.

## Phase 3: storyboard the states

Write the state list before writing markup. Each state gets an id, a chip label, and one narration
line.

Cover, at minimum:

1. The entry state, as the screen looks today.
2. Every step of the proposed journey.
3. Every terminal outcome, including the unhappy ones: declined, expired, not enough data, ended
   early.
4. **The outcome where the change does not work.** The feature loses, the number comes back worse,
   the answer is no. It is the state most often skipped and the one a stakeholder most needs to
   see, because it is the honesty the rest of the design is asking them to trust.
5. The empty, loading and error state of every new surface, **including a slot embedded inside an
   existing component**. A permanent slot needs its own loading state: a slot that reads "none yet"
   for half a second in front of a user who has one is a lie the surface then has to take back.
6. The path where the user says no. A dismissed thing has to leave a way back.

Mark each state `main: true` when Next/Back must walk it in order. Alternate endings stay off the
main line and are reached by chip or by clicking through.

**The narration line is not a caption.** It says where the reader is, what changed, and what to
click next. Second person. It carries the intent the pixels cannot: write "End test early lives one
level down, deliberately" when that placement is the decision you want judged.

## Phase 4: build the file

**Read [references/document.md](references/document.md) and start from
[references/shell.html](references/shell.html).** Together they own the document contract: the file
layout, the chrome, the state machine, the click wiring, seed data, and deep links. Copy the shell,
then fill only the marked blocks.

Set `MOCKUP_DIR` to the resolved directory containing this `SKILL.md`, then run:

```bash
cp "$MOCKUP_DIR/references/shell.html" "$OUT"
```

## Phase 5: check it

Run all four. A failure here is cheaper than a failure in the reader's browser.

```bash
# 0. The script parses. One syntax error kills every state at once.
sed -n '/<script>/,/<\/script>/p' "$OUT" | sed '1d;$d' > /tmp/mk.js && node --check /tmp/mk.js

# 1. Invented values: any hex outside the token block is one.
awk '/<style id="mk-chrome">/{s=1} /<\/style>/{if(s){s=0;next}} !s' "$OUT" \
  | grep -o '#[0-9A-Fa-f]\{6\}' | sort -u > /tmp/used.txt
sed -n '/<style id="product-tokens">/,/<\/style>/p' "$OUT" \
  | grep -o '#[0-9A-Fa-f]\{6\}' | sort -u > /tmp/declared.txt
comm -23 /tmp/used.txt /tmp/declared.txt      # every line printed is an invented colour

# 2. Dead controls: every product button needs data-go, data-act, or data-inert.
grep -o '<button[^>]*>' "$OUT" | grep -v 'data-go\|data-act\|data-inert\|data-ab\|data-var\|data-dev\|mk-'

# 3. Placeholder content.
grep -in 'lorem\|example\.com\|John Doe\|Item [0-9]\|TODO\|FIXME' "$OUT"
```

4. **Open the file and walk it.** Click every chip and every button in every state, at every
   device preset. A blank frame means the script threw before it rendered. A state that throws in
   the console is a state the reader will hit. Use `browse` (see the `browse` skill) or
   `open "$OUT"`, and screenshot at least the entry state and one terminal state.

Then read the storyboard from Phase 3 back against the file. A state on that list with no chip is a
state you dropped.

## Phase 6: deliver

Give the file path, then:

- One paragraph on what the reader is looking at and what decision you want from them.
- The open questions as a numbered list. Each one names the option you recommend and why.
- Anything in the frame that approximates rather than reproduces the product. Every line here is a
  defect you chose to ship, so this list is normally empty.
- **Do not ask about anything the mockup already answers.** That is what it is for.

With `--publish`, also publish it as an Artifact and give the URL. Artifacts carry comment threads,
so a reviewer can pin feedback without a round-trip through you. Two limits decide against it:
inlined screenshots push a file toward the 16MB cap, and `localStorage` is blocked in the artifact
sandbox, so keep all state in memory either way.

When a ticket id was passed, attach the file or URL to that ticket and paste the state list into
the ticket body. The mockup is then the spec, not a thing sitting next to the spec.

## Phase 7: after approval, build it

**Read [references/implement.md](references/implement.md) once the user approves a mockup and asks
for the implementation.** It owns the difference inventory, the call-site rule, and the proof pass.
Skip this phase entirely until then.
