# Worked cases

Four sources and the output each produces. Commentary is **never** part of the
output.

---

## 1. An empty announcement

**Source**

> We're thrilled to share that we've been hard at work reimagining how our
> customers experience our platform. Over the past several months, our teams have
> been laser-focused on building something truly special. This represents a
> significant milestone in our ongoing journey to deliver best-in-class solutions.
> We can't wait to show you what's next. Stay tuned for more details in the
> coming weeks.

**Output**

> **Bottom line:** Nothing actionable. It announces that an announcement is coming.
>
> **What it claims**
> - **promise:** More details are coming "in the coming weeks". No date given.
> - **opinion:** The work is a "significant milestone" and "best-in-class". No measure given.
>
> **Not stated**
> - What changed, or what is being built
> - Who it affects
> - When anything ships
> - What several months of work produced
>
> **What it implies but never claims**
> - Effort posing as outcome. "Several months", "hard at work", and "laser-focused" imply a substantial release is close. The text never says anything ships.

**Commentary.** Two bullets is the correct length for 62 words, because two is all
there is. The temptation is to promote "reimagining how our customers experience
our platform" into a claim. It is not one, since nothing about it could be false.

---

## 2. One claim buried in filler

**Source**

> As part of our continued commitment to operational excellence and in light of
> evolving industry best practices, we have undertaken a comprehensive review of
> our infrastructure posture. Following extensive consultation with stakeholders
> across the organization, and after careful consideration of a range of factors,
> we have concluded that it is in the best interests of all parties to sunset
> support for TLS 1.1 on our API endpoints effective 15 March 2026. Customers are
> encouraged to review their integration configurations at their earliest
> convenience to ensure continued uninterrupted service.

**Output**

> **Bottom line:** TLS 1.1 stops working on their API on 15 March 2026. Check your integrations before then.
>
> **What it claims**
> - **fact:** Support for TLS 1.1 on their API endpoints ends 15 March 2026.
> - **fact:** They reviewed their infrastructure and consulted stakeholders. No findings given.
>
> **Not stated**
> - What breaks, and how a customer knows whether they are affected
> - Whether they will notify affected customers directly
> - Which TLS versions stay supported

**Commentary.** 96 words carry one date. The bottom line states the consequence
for the reader, not the topic. "Customers are encouraged to review" is not a claim
about the world and does not earn a bullet, though the deadline it depends on
does.

---

## 3. A legal clause where the hedges carry the meaning

**Source**

> The Company may, at its sole discretion and without prior notice, modify,
> suspend, or discontinue any part of the Service. The Company will use
> commercially reasonable efforts to provide notice of material changes, except
> where such notice is impracticable or prohibited by law. In no event shall the
> Company be liable for any indirect or consequential damages arising from such
> modifications, provided that nothing herein limits liability that cannot be
> excluded under applicable law.

**Output**

> **Bottom line:** They can change or kill any part of the service at any time without telling you first, and they owe you nothing for indirect losses.
>
> **What it claims**
> - **fact:** The Company may modify, suspend, or discontinue any part of the Service, at its sole discretion, without prior notice.
> - **hedged:** It will use "commercially reasonable efforts" to give notice of material changes. That is an effort, not a commitment to give notice.
> - **fact:** The notice effort does not apply where notice is impracticable or prohibited by law.
> - **fact:** The Company is not liable for indirect or consequential damages, except for liability that cannot be excluded under applicable law.
>
> **Not stated**
> - What counts as a "material" change
> - What "commercially reasonable" requires in practice
> - Who decides whether notice is impracticable
>
> **What it implies but never claims**
> - A hedge placed to read as a commitment. "will use commercially reasonable efforts to provide notice" sits exactly where a notice guarantee would go. Read against the sentence before it, which reserves the right to act without prior notice, nothing is owed.

**Commentary.** `may` in the first bullet grants the Company permission, so the
claim that it holds that right is a `fact`. Compare the second bullet, where the
hedge sits on the Company's own performance and downgrades it. Both exceptions
survive as their own bullets, because each independently changes what is owed.
Quoting "commercially reasonable" instead of paraphrasing keeps the vagueness
visible.

---

## 4. A hedged research finding

**Source**

> Preliminary data from our internal analysis suggests that customers who adopted
> the new onboarding flow may see up to a 30% improvement in time-to-first-value,
> though these results have not yet been validated across all segments and should
> be interpreted with caution given the limited sample. We believe this points to
> a meaningful opportunity.

**Output**

> **Bottom line:** An unvalidated internal analysis hints at a possible improvement of at most 30%. Nothing is established.
>
> **What it claims**
> - **attributed:** Their own preliminary internal analysis suggests adopters of the new onboarding flow may see up to a 30% improvement in time-to-first-value.
> - **fact:** The results are not validated across all segments, and the sample was limited.
> - **opinion:** They believe this points to a meaningful opportunity.
>
> **Not stated**
> - Sample size, and which segments the analysis covered
> - The baseline time-to-first-value that the 30% is measured against
> - Whether adopters differ from non-adopters, which would explain the gap without the flow
> - When validation happens
>
> **What it implies but never claims**
> - A bound read as a result. "up to a 30% improvement" sets a ceiling, not a finding. The floor is zero.

**Commentary.** The first bullet stacks three qualifiers, `suggests`, `may`, and
`up to`, and all three must survive. Dropping any one turns a hint into a result.
The label is `attributed` even though the author is the source, because the author
reports an analysis rather than asserting the outcome. The self-selection bullet
under **Not stated** sits at the edge of the rules. Naming a question the source
leaves open is allowed. Writing "adopters were probably already faster users"
would not be, because that is outside knowledge.
