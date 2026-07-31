# Worked examples

Four cases: an empty source, a mostly-empty source with one real claim, a dense
legal clause, and a hedged research finding. The `Why` block after each output
is commentary for you. It is never part of the output.

Contents:

1. [Empty source](#1-empty-source)
2. [One claim buried in filler](#2-one-claim-buried-in-filler)
3. [Dense legal clause](#3-dense-legal-clause)
4. [Hedged research finding](#4-hedged-research-finding)

---

## 1. Empty source

**Source**

> At Vantage, we're on a journey to reimagine what's possible in the modern
> workplace. Our best-in-class platform empowers teams to unlock their full
> potential through seamless, intelligent collaboration. We believe the future of
> work is human-centered, and we're committed to leading the way. Stay tuned for
> what's next.

**Output**

```
**TL;DR:** Nothing checkable here — Vantage sells workplace collaboration software and promises an announcement later.

What it does assert:
- Vantage sells a collaboration product for workplaces. No features, price, customers, or results given.
- Vantage says it believes work should be "human-centered". That is an opinion, not a claim.
- Something will be announced later. No date and no subject.

What you would need for this to mean anything:
- What does the product do, in verbs?
- Who uses it now, and for what?
- What is being announced, and when?
```

**Why**: no sentence here can be false, so there is nothing to rewrite. The
honest output names that and stops. Writing a polished four-sentence "rewrite"
of this would be inventing content.

---

## 2. One claim buried in filler

**Source**

> As we continue to navigate an increasingly complex regulatory landscape, our
> compliance organization has been working tirelessly to ensure that we remain at
> the forefront of industry best practices. Following an extensive review process
> undertaken over the past several months, it has been determined that certain
> adjustments to our data retention methodology will be necessary. Specifically,
> effective March 1, customer transaction records will be retained for 24 months
> rather than the previous 36. We remain, as always, deeply committed to the trust
> our customers place in us.

**Output**

```
**TL;DR:** From March 1, we keep customer transaction records for 24 months instead of 36.

From March 1, we keep customer transaction records for 24 months. We kept them for 36 months before that. We made this change after a compliance review that ran for several months.
```

**Why**: one claim survives, so the output is three sentences from a paragraph of
102 words. That is a correct result, not a lazy one. "Tirelessly", "forefront of
industry best practices", and "deeply committed" assert nothing and are cut.
"Several months" is kept as written, because the source gives no number.

---

## 3. Dense legal clause

**Source**

> Notwithstanding the foregoing, in the event that the Subscriber fails to remit
> payment within thirty (30) days of the invoice date, the Provider may, at its
> sole discretion, suspend the Subscriber's access to the Services, provided that
> the Provider has given the Subscriber not less than seven (7) days' prior
> written notice of such suspension.

**Output**

```
**TL;DR:** If you pay more than 30 days late, the Provider can cut off your access after giving 7 days' written notice.

If you do not pay within 30 days of the invoice date, the Provider may suspend your access to the Services. The Provider chooses whether to suspend it. Before any suspension, the Provider must give you written notice at least 7 days in advance.

Unclear:
- "Notwithstanding the foregoing" points to earlier terms that are not in the text you pasted. Those terms may limit this one.
```

**Why**: "may" stays "may" and never becomes "will" — the whole clause turns on
it. "At its sole discretion" is a separate claim, so it gets its own sentence.
"Not less than seven days" becomes "at least 7 days", which is the same bound.
The cross-reference cannot be resolved from the pasted text, so it is flagged
instead of ignored.

---

## 4. Hedged research finding

**Source**

> Our findings suggest that moderate consumption may be associated with a reduced
> incidence of the condition among older adults, although the observational design
> of the study precludes causal inference.

**Output**

```
**TL;DR:** Older adults who consume a moderate amount may get the condition less often, but the study cannot show that one causes the other.

Our results suggest a link: older adults who consume a moderate amount get the condition less often. This study only observed people. It therefore cannot show that moderate consumption causes the lower rate.
```

**Why**: three hedges are load-bearing and all three survive — "suggest", "may",
and the limit on causation. The plain-English gain comes from splitting the
27-word sentence, cutting "precludes causal inference" down to what it means,
and naming the actor. It does not come from deleting the qualifiers.
