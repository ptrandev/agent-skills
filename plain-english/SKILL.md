---
name: plain-english
description: Rewrites pasted text into plain English using ASD-STE100 (Simplified Technical English) principles, and outputs a one-line TL;DR followed by the rewrite. Keeps every real claim, hedge, number, condition, and attribution; cuts only filler. Says so honestly when the source makes no checkable claim instead of inventing content. Use when the user pastes text and asks to "put this in plain English", "simplify this", "make this readable", "de-jargon this", "TL;DR this", "what is this actually saying", "cut the fluff", "translate the corporate speak", "rewrite this clearly", or pastes marketing copy, a press release, legal terms, a policy, an academic abstract, or an internal memo and wants the meaning without the padding.
---

# Plain English

Rewrite the pasted text so a competent non-specialist reads it once and gets it.
Two failure modes matter more than style: losing a claim, and dressing up a
source that says nothing. Both are covered below.

## Output contract

Exactly this, and nothing before it. No preamble, no "Here is the rewrite".

```
**TL;DR:** <one sentence, 25 words maximum>

<the rewrite>
```

- The TL;DR states what the text says, not what it is about. Write "Support ends
  March 1", not "This describes a support change".
- Add an `Unclear:` bullet list after the rewrite only when the source is
  ambiguous in a way that changes meaning: an unresolvable pronoun, a missing
  actor, a cross-reference to text you were not given. Omit it otherwise. Never
  use it to editorialize.
- Match the source's length ceiling, never its length. A 900-word source with
  one claim gets a three-sentence rewrite. That is the correct result.

## Procedure

1. **Inventory the claims.** Silently list every statement that could be false:
   facts, numbers, dates, names, causes, comparisons, conditions, exceptions,
   negations, promises, attributions. This list is the fidelity contract.
2. **Label every phrase** CLAIM, QUALIFIER, or FILLER. Only FILLER is cut. Use
   [references/word-swaps.md](references/word-swaps.md), which lists the filler,
   the plain replacements, and the terms that must never be cut.
3. **Rewrite** under the rules in [references/ste-rules.md](references/ste-rules.md):
   one idea per sentence, 25 words maximum (20 for an instruction), active voice
   with a named actor, simple tenses, one word per meaning, no `-ing` nouns, no
   noun cluster over three words, vertical lists for three or more parallel
   items. Read that file before the first rewrite in a session.
4. **Verify both directions.** Every claim in the inventory appears in the
   rewrite. Nothing in the rewrite is absent from the source. No hedge dropped,
   none added, no number changed, no cause invented.
5. **Check, then judge.** `scripts/check.py <file>` flags long sentences, filler,
   swaps, passives, and noun clusters. Run it when the rewrite is longer than a
   few sentences. It is a helper, not an authority. Never break a claim to
   silence it, and ignore any flag on a term the source needs.

See [references/examples.md](references/examples.md) for four worked cases: an
empty source, one claim buried in filler, a legal clause, and a hedged research
finding. Read it when a source is mostly filler or heavily hedged.

## Fidelity: keep every real claim

Cutting filler is easy. Cutting a claim while it looks like filler is the whole
risk. These are non-negotiable.

- **Hedges are claims.** "may reduce costs" never becomes "reduces costs".
  "suggests a link" never becomes "shows". Keep `may`, `might`, `should`,
  `we believe`, `estimated`, `planned`.
- **Attribution is a claim.** "The vendor says X" never becomes "X".
- **Scope and time limits are claims.** "in the EU", "for enterprise plans",
  "as of 2024" survive the rewrite.
- **Bounds are claims.** "up to 40%" is not "40%". "at least 7 days" is not
  "7 days".
- **Keep negation and quantifiers exactly.** all / most / some / none / only.
- **Copy numbers, units, dates, currency, versions, and names verbatim.**
  Convert nothing, round nothing.
- **Do not merge two claims** that can be separately false.
- **Do not add a cause** the source only implies by adjacency.
- **Add nothing from your own knowledge** — no context, examples, definitions,
  or corrections, however right they are. If the source is wrong, the rewrite is
  wrong in the same way. Say so under `Unclear:` if it matters.
- **Vagueness is data.** If the source says "significant improvement" with no
  number, the rewrite says "significant improvement" and the reader learns the
  number is missing. Do not invent one and do not smooth it over.
- **Keep unfamiliar domain terms** the source never defines. Do not gloss them
  from your own knowledge; that is adding content. Flag one under `Unclear:`
  only when it blocks the meaning of a sentence.

## Honesty: when the source says nothing

A source says nothing when no claim survives step 1 — every sentence is
unfalsifiable. Marketing copy, mission statements, and most announcements of
announcements land here.

Do not produce a polished rewrite of an empty source. A fluent four-sentence
version of nothing is worse than the original, because it looks like content.
Output this instead:

```
**TL;DR:** Nothing checkable here — it <announces X / promises detail later / restates its own title>.

What it does assert:
- <the few weak assertions, each marked "no detail given">

What you would need for this to mean anything:
- <the questions a reader must have answered>
```

Partial cases follow the same rule. If one claim survives out of twelve
paragraphs, say that in the TL;DR ("Only one checkable claim: ...") and let the
rewrite be one sentence long. Never pad to make the output look proportionate to
the input.
