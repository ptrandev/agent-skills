---
name: plain-english
description: Extracts the signal from bloated or evasive text and shows it as a bottom line, a list of what the text actually claims with each claim's strength marked, what it conspicuously does not say, and what it implies without claiming. Adds nothing from outside the source. Use when the user pastes text and asks "what is this actually saying", "cut through this", "extract the signal", "what are they actually claiming", "is this saying anything", "decode this", "what am I missing here", "put this in plain English", "TL;DR this", "translate the corporate speak", or pastes AI-generated writing, marketing copy, a press release, legal terms, a policy, an academic abstract, an executive memo, or a status update and wants to know what is really in it.
---

# Plain English

Pull the signal out of the noise. The reader wants to know what the text says,
what it avoids saying, and what it is steering them toward. Do not rewrite the
text. Select from it.

This file is self-contained. Open a reference only when a trigger at the bottom
fires.

## The guarantee

> Add nothing. Drop nothing that would change the reader's take.

Dropping noise is the job, so "preserve everything" is the wrong rule. This one
replaces it. A hedge, bound, condition, scope limit, or attribution is never
carried forward as text; it rides along as part of the claim it modifies.

## Output contract

Nothing before the bottom line. No preamble, no "Here's the breakdown".

```
**Bottom line:** <the one thing that matters to this reader, or "Nothing actionable.">

**What it claims**
- **<strength>:** <the claim, with its hedge, number, and scope attached>

**Not stated**
- <what a reader needs and does not get>

**What it implies but never claims**   <- only when this gap exists
- <the reading the text induces, and the device that induces it>
```

Rules for the shape:

- Length tracks real content, not input length. Three sentences of substance
  produce three bullets. A 2,000-word post with one claim gets one.
- Drop **Not stated** only when nothing material is missing. That is rare.
- Drop **What it implies but never claims** whenever there is no gap. That is
  common, and an empty section is worse than none.
- Never pad a section to make the output look proportionate to the input.

## Strength labels

Every claim gets exactly one. This is the point of the skill: slop's main trick
is making a soft thing feel firm, and the label makes that visible at a glance.

| Label | Means | Trigger words |
| --- | --- | --- |
| `fact` | Asserted flatly, checkable now | none needed |
| `hedged` | Asserted with an escape hatch | may, might, could, should, expects, aims to, is designed to |
| `attributed` | Someone else's assertion, not the author's | according to, X says, reportedly, per, sources indicate |
| `promise` | A future act the author commits to | will, plans to, by <date>, in the coming weeks |
| `opinion` | A value judgment, not falsifiable | best, critical, exciting, industry-leading |

Judgment calls:

- Label by what the sentence does, not by its verb. "We will consider it" is
  `hedged`, not `promise`, because the committed act is only consideration.
- A hedged promise is `hedged`. The escape hatch wins.
- Attribution outranks the rest. "The vendor says it cuts costs 40%" is
  `attributed`, even though the inner claim is a fact.
- If a sentence carries two separately falsifiable claims, split it into two
  bullets. Never merge two claims under one label.

## What must ride along with a claim

Losing one of these changes what the text asserts. Each stays attached to its
bullet, in plain words.

- **Hedges:** may, might, could, should, we believe, we expect, estimated,
  projected, planned, targeted.
- **Attribution:** according to, reportedly, said, per.
- **Bounds:** about, roughly, up to, at least, at most, more than, fewer than.
  "up to 40%" is not "40%". "at least 7 days" is not "7 days".
- **Quantifiers:** all, most, many, some, few, none, only.
- **Conditions and exceptions:** if, unless, until, provided that, subject to,
  except, excluding, other than.
- **Negation:** not, no, never, cannot.
- **Time and scope limits:** as of <date>, in <year>, so far, in <region>, for
  <group>, on <platform>.
- **Numbers, units, dates, currency, versions, names, percentages,** copied
  verbatim. Convert nothing, round nothing.

Judge these by meaning: `essentially` and `effectively` are hedges when they mean
"close but not exactly"; `only` is a bound in "only 3 users" and filler in "just
click here"; `significant` is a claim when the source gives the number and vague
when it does not.

## Add nothing

Selection makes invention easy to hide, so this is stricter than it was under
rewriting.

- No context, examples, definitions, or corrections from your own knowledge,
  however right. If the source is wrong, say the source claims it and put the
  correction nowhere.
- Keep an undefined domain term as the source wrote it. Do not gloss it. If it
  blocks meaning, that belongs under **Not stated**.
- Vagueness is data. "significant improvement" with no number is extracted as a
  claim with no number, so the reader learns the number is missing.
- Do not resolve an ambiguous pronoun by guessing.
- Do not add a cause the source only implies by adjacency. That belongs under
  **What it implies but never claims**.

## Finding what is not stated

Read as someone who has to act on this. The absences that matter are the ones
that block a decision.

- Who acts, decides, or is accountable. Passive voice and "it was determined"
  are the tell.
- When. "Soon", "in due course", "in the coming weeks" are absences, not dates.
- How much. A percentage with no baseline, a gain with no denominator.
- Who is affected, and how they find out.
- What happens if it fails, or what the tradeoff cost.
- The comparison. "Faster" and "better" need a "than what".

List the absence, not a complaint about it. Write "Who decided", not "They
conveniently avoid saying who decided".

## What it implies but never claims

Include this section only when the text induces a belief it never asserts. Every
bullet names the device, so the reader can check you.

- **Adjacency posing as cause.** "Sales fell. We changed the pricing." implies a
  link the text never claims.
- **A hedge placed to read as a commitment.** "We aim to ship in Q3" in a section
  headed "Q3 Deliverables".
- **A statistic with no denominator.** "Support tickets dropped 60%" implies
  fewer problems, and never says volume fell because a product was retired.
- **An actor hidden by the passive** so nobody appears responsible.
- **Precision borrowed from an unrelated number.** An exact figure next to a
  vague claim lends it false weight.
- **A retracted commitment stated as progress.** "We have decided to focus
  elsewhere" for work that was cancelled.

Name the mechanism and stop. Never speculate about motive, and never write a
bullet you cannot point at a specific sentence for.

## When the source says nothing

Not a special case any more. **What it claims** comes out thin or empty, and
**Not stated** comes out long. Write the bottom line as `Nothing actionable.`
followed by what the text is doing instead, in one clause: announcing an
announcement, restating its own title, or promising detail later.

Do not manufacture claims to fill the section. An empty **What it claims** is a
finding, and it is the most useful output this skill produces.

## Reference

Open [references/examples.md](references/examples.md) for four worked cases: an
empty announcement, one claim buried in filler, a legal clause where the hedges
carry the meaning, and a hedged research finding. Read it when the source is
mostly filler, heavily hedged, or when a strength label is genuinely ambiguous.
