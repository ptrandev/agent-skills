---
name: debrief
description: |
  End-of-session confidence audit. Interrogates the session just completed —
  what was assumed but never verified, what the user doesn't realize, what
  will break in 3 months — then converts every uncertainty into a concrete
  check (a command, test, or file read), runs the safe ones, and separates
  real gaps from confident-sounding filler. Optionally spawns a blind,
  context-free reviewer on the session's diff. Use at the end of a work
  session, before walking away from a task, or when asked "debrief",
  "what are you least confident about", "what am I missing", "loose ends",
  or "/debrief".
---

# debrief

An LLM asked "are you sure?" mid-thread defends its own earlier calls. This skill works
around that two ways: every self-reported uncertainty must carry a **falsifiable check**
that gets executed (real gaps have cheap checks behind them; filler stays vague), and a
**blind sub-agent** with no conversation history reviews the artifacts, because the
in-thread model flags what it knew was shaky but not what it's confidently wrong about.

This is a **read-only audit**. It never edits files, never commits, never pushes. It ends
with a ranked report; the user decides what to act on.

## Input

`$ARGS`:
- **Empty** → audit the current session.
- `deep` → also run Phase 3 (blind reviewer) even when `/phillip` already ran this session.
- Free text → treat as the specific area to focus the audit on (e.g. `/debrief the auth changes`).

## Phase 1 — Self-interrogation

Answer four questions **against this session specifically**, not in the abstract:

1. **What am I least confident about right now?** Actions taken on assumptions never
   verified: how existing code behaves, data shapes, env/config, API contracts,
   requirements interpretation.
2. **Which early decision am I least sure about now?** Calls made when context was thin
   and never revisited once the picture filled in.
3. **What is the user missing about this situation?** The thing they'd be surprised to
   learn — scope implications, side effects, a smell adjacent to the work.
4. **If this breaks in 3 months, what's the most likely reason?** Fragility baked in:
   scale assumptions, hardcoded values, drift-prone couplings, missing edge cases.

Rules:
- 3–7 items total, ranked by expected damage. Not a laundry list.
- **Every item under questions 1–2 must name a check that would settle it**: a command to
  run, a test to execute, a file/line to read, a doc to consult. An item with no
  conceivable check is labeled `JUDGMENT CALL` explicitly — never dressed up as an
  investigation.
- Do not investigate a doubt using the same assumption that created it. If the doubt is
  "I assumed the API returns X", the check is reading the API's actual code or calling
  it — not re-reading the call site written under that assumption.

## Phase 2 — Verify

Run every check from Phase 1 that is **read-only and safe** (reads, greps, type checks,
existing test suites, dry-runs). Skip anything mutating or slow; list it as `UNRUN` with
the exact command the user can run themselves.

Each item resolves to:

| Verdict | Meaning |
|---|---|
| `CONFIRMED FINE` | Check ran, assumption held. Cite the evidence. |
| `REAL GAP` | Check ran, assumption was wrong or a hole exists. Cite the evidence. |
| `UNRUN` | Check exists but is mutating/slow/needs creds — give the command verbatim. |
| `JUDGMENT CALL` | No falsifiable check exists. State the tradeoff in one sentence. |

## Phase 3 — Blind fresh eyes

Skip when `/phillip` already ran on this diff this session (it does blind multi-reviewer
work already) unless `$ARGS` contains `deep`. Skip entirely when the session produced no
diff and no artifact.

Otherwise spawn **one sub-agent with no conversation history**. Give it only:
- the diff (`git diff` against the base) or the artifact produced, and
- a one-paragraph statement of what the work was supposed to accomplish — the goal, not
  the approach taken.

Prompt it to answer: *what is wrong, missing, or fragile here?* Merge its findings into
the Phase 2 table, verifying each the same way before accepting it.

## Report

Print (no file written unless the user asks):

```
## Debrief — <one-line session summary>

### Real gaps (act on these)
1. <finding> — evidence: <what the check showed> — suggested fix: <one line>

### Unrun checks (run these yourself)
- <command> — settles: <the doubt>

### Judgment calls
- <decision> — tradeoff: <one sentence>

### Confirmed fine
- <assumption> — verified by <check>

### What you might be missing
<the single most valuable observation, 2–4 sentences>

### Most likely 3-month failure
<one scenario, concrete>
```

Offer to fix the real gaps as a follow-up; do not start fixing unprompted.

## Relationship to sibling skills

- `/grilling` — interrogates a **plan before** building. `/debrief` interrogates the
  **session after**.
- `/phillip` — adversarially reviews the **diff**. `/debrief` audits the **process**:
  assumptions, unverified claims, and context the diff can't show. They compose;
  `/debrief` dedupes by skipping its blind pass when `/phillip` already ran.
