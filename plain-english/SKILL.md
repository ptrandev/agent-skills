---
name: plain-english
description: Rewrites pasted text into plain English using ASD-STE100 (Simplified Technical English) principles, and outputs a one-line TL;DR followed by the rewrite. Keeps every real claim, hedge, number, condition, and attribution; cuts only filler. Says so honestly when the source makes no checkable claim instead of inventing content. Use when the user pastes text and asks to "put this in plain English", "simplify this", "make this readable", "de-jargon this", "TL;DR this", "what is this actually saying", "cut the fluff", "translate the corporate speak", "rewrite this clearly", or pastes marketing copy, a press release, legal terms, a policy, an academic abstract, or an internal memo and wants the meaning without the padding.
---

# Plain English

Rewrite the pasted text so a competent non-specialist reads it once and gets it.
Everything needed for the normal case is in this file. Do not open a reference
file unless a trigger below says to.

Two failure modes matter more than style: losing a claim, and dressing up a
source that says nothing.

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
2. **Rewrite** under the rules below. Cut only what carries no claim.
3. **Verify both directions.** Every claim in the inventory appears in the
   rewrite. Nothing in the rewrite is absent from the source. No hedge dropped,
   none added, no number changed, no cause invented.

## Rules

**Words**

- One word, one meaning, held for the whole text. If the source calls one thing
  "the dashboard", "the console", and "the portal", pick one name. Elegant
  variation makes a reader think there are three things.
- Shortest word that carries the meaning: use / help / to / because / now /
  before / after / if / can / start / stop / most / about / buy / get / try /
  many / decide / consider / needs / shows.
- Delete pure filler: "it is important to note that", "needless to say", "at the
  end of the day", "we are excited to announce", very, really, basically,
  world-class, cutting-edge, seamless, robust, innovative, game-changing,
  synergy, holistic, turnkey.
- Keep a domain term that has no plain equivalent. Never gloss it from your own
  knowledge.
- No idioms, metaphors, slang, or humor.
- Noun clusters: three words maximum.
- Keep the articles. Telegraphic style reads as harder, not easier.

**Verbs**

- Active voice, named actor. "The board approved the changes", not "the changes
  were approved". If the source never names the actor, keep the passive and note
  it under `Unclear:`. Inventing an actor is a fidelity failure.
- Simple tenses only.
- No verb turned into a noun: "decide", not "make a decision".
- No `-ing` form as a noun or adjective. `-ing` is fine in a continuous tense the
  source means.

**Sentences**

- 25 words maximum, 20 for an instruction. Past the limit, split. Do not compress
  by deleting function words.
- One idea per sentence. Two separately falsifiable claims get two sentences.
- Condition first: "If the check fails, restart the service".
- Warnings, costs, deadlines, and irreversible steps come before the step.
- No throat-clearing. Start with the subject.

**Structure**

- Six sentences maximum per paragraph, one topic each, topic sentence first.
- Vertical list for three or more parallel items, or any sequence of steps.
- Keep the source's order, unless it buries its conclusion. Leading with a buried
  result is reordering, not adding.
- Headings only if the source has sections. Do not impose structure on a
  four-sentence source.

## Fidelity: keep every real claim

Cutting filler is easy. Cutting a claim that looks like filler is the whole risk.
These are non-negotiable.

- **Hedges are claims.** "may reduce costs" never becomes "reduces costs".
  Keep `may`, `might`, `could`, `should`, `we believe`, `estimated`, `planned`.
- **Attribution is a claim.** "The vendor says X" never becomes "X". Keep
  `according to`, `reportedly`, `per`.
- **Scope and time limits are claims.** "in the EU", "for enterprise plans",
  "as of 2024" survive the rewrite.
- **Bounds are claims.** "up to 40%" is not "40%". "at least 7 days" is not
  "7 days". Keep `about`, `roughly`, `at most`, `more than`, `fewer than`.
- **Keep negation, conditions, exceptions, and quantifiers exactly.**
  not / never / cannot, if / unless / until / subject to, except / excluding,
  all / most / some / none / only.
- **Copy numbers, units, dates, currency, versions, and names verbatim.**
  Convert nothing, round nothing.
- **Do not merge two claims** that can be separately false.
- **Do not add a cause** the source only implies by adjacency.
- **Add nothing from your own knowledge** — no context, examples, definitions,
  or corrections, however right they are. If the source is wrong, the rewrite is
  wrong in the same way. Say so under `Unclear:` if it matters.
- **Vagueness is data.** "significant improvement" with no number stays
  "significant improvement", so the reader learns the number is missing.
- **Do not resolve an ambiguous pronoun by guessing.**

Judge these by meaning, not by the word: `essentially` and `effectively` are
hedges when they mean "close but not exactly"; `only` is a bound in "only 3
users" and filler in "just click here"; `significant` is a claim when the source
gives the number.

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

## Reference files, and when to open them

Skip all three in the normal case.

| File | Open it only when |
| --- | --- |
| [references/examples.md](references/examples.md) | The source is mostly filler, or heavily hedged, and you want a worked case first. |
| [references/word-swaps.md](references/word-swaps.md) | You want the full 64 swaps and 49 filler terms. The common ones are already above. |
| [references/ste-rules.md](references/ste-rules.md) | You need the rationale behind a rule above, or an edge case it does not cover. |

`scripts/check.py <file>` lints a rewrite for sentence length, filler, passives,
and noun clusters. Run it only when the user asks, or when the rewrite is long
and the stakes are high. It is a helper, not an authority. Never break a claim to
silence it.
