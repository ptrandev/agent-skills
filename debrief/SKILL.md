---
name: debrief
description: >
  End-of-session confidence audit. Names what was assumed but never verified, converts each
  uncertainty into a concrete check, runs the safe ones, and separates real gaps from
  confident-sounding filler. Use at the end of a work session, or for "what am I missing",
  "what are you least confident about", or "loose ends".
---

# debrief

An LLM asked "are you sure?" mid-thread defends its own earlier calls. Two mechanisms work
around that: every uncertainty carries a **falsifiable check** that gets executed, and a
**blind sub-agent** reviews the artifacts. The in-thread model flags what it knew was
shaky, never what it is confidently wrong about.

This is a **read-only audit**. It never edits files, never commits, never pushes. It ends
with a ranked report; the user decides what to act on.

## Input

`$ARGS`:
- **Empty** → audit the current session.
- `deep` → also run Phase 3 (blind reviewer) even when `/phillip` already ran this session.
- Free text → treat as the specific area to focus the audit on (e.g. `/debrief the auth changes`).
- **Both** → a leading `deep` token is the flag, the remainder is focus text
  (`/debrief deep the auth changes` = deep mode, focused on the auth changes).

## Phase 1: Self-interrogation

Answer four questions **against this session specifically**, not in the abstract:

1. **What am I least confident about right now?** Actions taken on assumptions never
   verified: how existing code behaves, data shapes, env/config, API contracts,
   requirements interpretation.
2. **Which early decision am I least sure about now?** Calls made when context was thin
   and never revisited once the picture filled in.
3. **What is the user missing about this situation?** The thing they'd be surprised to
   learn: scope implications, side effects, a smell adjacent to the work.
4. **If this breaks in 3 months, what's the most likely reason?** Fragility baked in:
   scale assumptions, hardcoded values, drift-prone couplings, missing edge cases.

Rules:
- 3-7 items across questions 1 and 2, ranked by expected damage. Not a laundry list.
  Questions 3 and 4 produce one entry each, reported separately.
- **Every item under questions 1-2 must name a check that would settle it**: a command to
  run, a test to execute, a file/line to read, a doc to consult. An item with no
  conceivable check is labeled `JUDGMENT CALL` explicitly, never dressed up as an
  investigation.
- Do not investigate a doubt using the same assumption that created it. If the doubt is
  "I assumed the API returns X", the check is reading the API's actual code or calling
  it, not re-reading the call site written under that assumption.

## Phase 2: Verify

Run every check from Phase 1 that is **read-only and safe** (reads, greps, type checks,
existing test suites, dry-runs) **and finishes in under 60s wall-clock**. Mark anything
mutating, and anything over 60s even when it appears on the safe list, as `UNRUN` with the
exact command the user can run themselves.

Each item resolves to:

| Verdict | Meaning |
|---|---|
| `CONFIRMED FINE` | Check ran, assumption held. Cite the evidence. |
| `REAL GAP` | Check ran, assumption was wrong or a hole exists. Cite the evidence. |
| `UNRUN` | Check exists but is mutating/slow/needs creds. Give the command verbatim. |
| `JUDGMENT CALL` | No falsifiable check exists. State the tradeoff in one sentence. |

## Phase 3: Blind fresh eyes

Skip when `/phillip` already ran on this diff this session (it does blind multi-reviewer
work already) unless `$ARGS` contains `deep`. Skip entirely when the session produced no
diff and no artifact.

Otherwise spawn **one sub-agent with no conversation history**: the `Agent` tool with
`subagent_type: general-purpose` and `run_in_background: false`, because the Phase 2 merge
blocks on its output. Give it only:
- the diff, from `git diff $(git merge-base HEAD origin/HEAD)`, or the artifact produced.
  With no remote, diff against the session's first commit instead.
- a one-paragraph statement of what the work was supposed to accomplish: the goal, not
  the approach taken.

Prompt it to answer: *what is wrong, missing, or fragile here?* Assign each sub-agent
finding a Phase 2 verdict, verifying it the same way before accepting it.

## Report

Print (no file written unless the user asks):

```
## Debrief: <one-line session summary>

### Real gaps (act on these)
1. <finding>. Evidence: <what the check showed>. Fix: <one line>

### Unrun checks (run these yourself)
- <command>. Settles: <the doubt>

### Judgment calls
- <decision>. Tradeoff: <one sentence>

### Confirmed fine
- <assumption>. Verified by: <check>

### What you might be missing
<the single most valuable observation, 2-4 sentences>

### Most likely 3-month failure
<one scenario, concrete>
```

Offer to fix the real gaps as a follow-up; do not start fixing unprompted.

## Relationship to sibling skills

- `/grilling` interrogates a **plan before** building. `/debrief` interrogates the **session after**.
- `/phillip` reviews the **diff**. `/debrief` audits the **process**: assumptions, unverified claims, and context the diff can't show.
