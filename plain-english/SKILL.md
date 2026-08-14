---
name: plain-english
description: >
  Extracts the signal from bloated or evasive text: the bottom line, every claim with its
  strength marked, what it does not say, and what it implies without claiming. Adds nothing
  from outside the source. Use for "what is this actually saying", "cut through this", "TL;DR
  this", or on pasted marketing, legal, policy, or AI-generated writing.
---

# Plain English

Pull the signal out of the noise. **Do not** rewrite the text. Select from it.

The reader is someone who has to act on this text. The bottom line is the
consequence for the reader, not the topic of the text.

## The guarantee

> Add nothing. Drop nothing that would change the reader's take.

**Never** carry a hedge, bound, condition, scope limit, or attribution forward as
its own text. It rides along as part of the claim it modifies.

## Output contract

**Never** write anything before the bottom line. No preamble, no "Here's the
breakdown".

```
**Bottom line:** <the one thing that matters to this reader, or "Nothing actionable.">

**What it claims**
- **<strength>:** <the claim, with its hedge, number, and scope attached>
  <optional: one sentence naming what the hedge costs, only when the label alone does not show it>

**Not stated**
- <what a reader needs and does not get>

**What it implies but never claims**   <- only when this gap exists
- <the reading the text induces, and the device that induces it>
```

Rules for the shape:

- Length tracks real content, not input length. Three sentences of substance
  produce three bullets. A 2,000-word post with one claim gets one. **Never** pad
  a section to make the output look proportionate to the input.
- Drop **Not stated** only when nothing material is missing. That is rare.
- Drop **What it implies but never claims** whenever there is no gap. That is
  common, and an empty section is worse than none.

## Strength labels

Every claim gets exactly one label.

| Label | Means | Trigger words |
| --- | --- | --- |
| `fact` | Asserted flatly, checkable now | none needed |
| `hedged` | Asserted with an escape hatch | the **Hedges** row under [What must ride along](#what-must-ride-along-with-a-claim) |
| `attributed` | Someone else's assertion, not the author's | the **Attribution** row under [What must ride along](#what-must-ride-along-with-a-claim) |
| `promise` | A future act the author commits to | will, plans to, by <date>, in the coming weeks |
| `opinion` | A value judgment, not falsifiable | best, critical, exciting, industry-leading |

Judgment calls:

- Label by what the sentence does, not by its verb. "We will consider it" is
  `hedged`, not `promise`, because the committed act is only consideration.
- A hedged promise is `hedged`. The escape hatch wins.
- Attribution outranks the rest. "The vendor says it cuts costs 40%" is
  `attributed`, even though the inner claim is a fact.
- If a sentence carries two separately falsifiable claims, split it into two
  bullets. **Never** merge two claims under one label.

## What must ride along with a claim

Attach each of these to its bullet, in plain words.

| Carry | Words and test |
| --- | --- |
| **Hedges** | may, might, could, should, expects, aims to, is designed to, we believe, we expect, estimated, projected, planned, targeted |
| **Attribution** | according to, X says, reportedly, per, sources indicate, said |
| **Bounds** | about, roughly, up to, at least, at most, more than, fewer than. "up to 40%" is not "40%". "at least 7 days" is not "7 days". |
| **Quantifiers** | all, most, many, some, few, none, only |
| **Conditions and exceptions** | if, unless, until, provided that, subject to, except, excluding, other than |
| **Negation** | not, no, never, cannot |
| **Time and scope limits** | as of `<date>`, in `<year>`, so far, in `<region>`, for `<group>`, on `<platform>` |
| **Numbers, units, dates, currency, versions, names, percentages** | copied verbatim. Convert nothing, round nothing. |

Judge these by meaning: `essentially` and `effectively` are hedges when they mean
"close but not exactly"; `only` is a bound in "only 3 users" and filler in "just
click here"; `significant` is a claim when the source gives the number and vague
when it does not.

## Add nothing

- **Never** add context, examples, definitions, or corrections from your own
  knowledge, however right. If the source is wrong, say the source claims it and
  put the correction nowhere.
- Keep an undefined domain term as the source wrote it. **Do not** gloss it. If it
  blocks meaning, that belongs under **Not stated**.
- Vagueness is data. "significant improvement" with no number is extracted as a
  claim with no number, so the reader learns the number is missing.
- **Do not** resolve an ambiguous pronoun by guessing.
- **Do not** add a cause the source only implies by adjacency. That belongs under
  **What it implies but never claims**.

## Finding what is not stated

List only absences that block the reader's decision.

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

Name the device and stop. **Never** speculate about motive. **Never** write a
bullet you cannot point at a specific sentence for.

## When the source says nothing

**What it claims** comes out thin or empty, and **Not stated** comes out long.
Write the bottom line as `Nothing actionable.` followed on the same line by what
the text is doing instead, in one clause: announcing an announcement, restating
its own title, or promising detail later.

**Do not** manufacture claims to fill the section. An empty **What it claims** is
a finding.

## Reference

[references/examples.md](references/examples.md) owns the worked cases.
**Read it for these four calls only:** `may` as granted permission versus `may`
as a hedge, the author as their own source, stacked qualifiers on one claim, and
an empty claims list.
