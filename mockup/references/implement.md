# After approval: build it, then prove it matches

Owns the handoff from an approved mockup to landed code. `SKILL.md` Phase 7 points here. Read it
only after the user approves a mockup and asks for the implementation.

The failure this prevents: the work is called done, the suite is green, and the user opens the real
screen and finds three details missing. That happens because the comparison was made from memory,
so whatever was forgotten stayed invisible to the person forgetting it.

## Step 1: inventory every difference before writing any code

Re-read the approved file top to bottom. Walk **every state**, not the entry screen. Write one
numbered row per visible difference:

| # | What changes | File that changes | Call site that must pass it | Check |
|---|---|---|---|---|

**The call-site column is the real work.** A component that grows a prop no caller passes is the
default outcome, not an edge case: the component changes, every test passes, the screen does not
move. Every row whose middle column is a component needs a row-mate that is its caller.

**Sweep the mockup for controls before sweeping the ticket.** A button the mockup renders that no
ticket ever specified is still a row, and it is the row most likely to be dropped. It is also worth
one question: it may be scope you invented, and this is the cheapest moment to find that out.

**Every row needs a mechanical check**: a DOM query, a count, a computed style, a `data-testid`.
One line, returns a value you can read. "Looks right" is not a check.

Rows come out of the file, never out of your memory of the review.

## Step 2: prove it on the real screen

Open the real screen next to the mockup, same viewport, same seed. Run the checklist row by row and
write the value each check actually returned.

**Never report a match you did not measure.** Implemented means every row returned its expected
value on the real screen. A green suite is what the failure looked like every time.

TEST: every row has a value beside it. A row with no value is an unimplemented row.

## Step 3: clean up

Tear down any scratch route or harness you stood up to measure, in the same change that lands the
work. `git status --porcelain` catches a forgotten one. The mockup file itself is not in the repo,
so there is nothing to remove there.

## When the work is split across agents

Ownership follows the row, not the component. One slice owns a change **and** its call site, or the
wiring is named as the reconciler's job. A slice that changes a component and not its caller is
individually correct and collectively useless, and every slice passing its own gate is exactly what
that failure looks like from the inside.
