# ASD-STE100 writing rules, adapted to general prose

ASD-STE100 (Simplified Technical English) is the aerospace standard for writing
that a non-native reader can read once and act on. Its dictionary is proprietary
and it targets maintenance manuals, so this file adapts the writing rules to
arbitrary prose. The rules below are the load-bearing part of the standard.

Contents:

1. [Words](#1-words)
2. [Verbs](#2-verbs)
3. [Sentences](#3-sentences)
4. [Paragraphs and structure](#4-paragraphs-and-structure)
5. [Precision](#5-precision)
6. [What STE does not license](#6-what-ste-does-not-license)

---

## 1. Words

**1.1 One word, one meaning.** Pick one meaning per word and hold it for the
whole text. If the source uses "platform" for a product and again for a
strategy, the rewrite uses "product" and "strategy".

**1.2 One meaning, one word.** Never vary the word for elegance. If the source
calls it "the dashboard", then "the console", then "the portal", and they are
the same thing, use one name throughout. Elegant variation is the single most
common cause of a reader thinking there are three things.

**1.3 Use the shortest word that carries the meaning.** See
[word-swaps.md](word-swaps.md). Short does not mean vague: "stop" beats
"terminate", but "stop" does not beat "shut down the pump" if that is what
happens.

**1.4 Keep the domain term when there is no plain equivalent.** "Mitral valve"
stays "mitral valve". Do not invent a gloss from your own knowledge. If the
source defines the term, use the source's definition. If it does not and the
term blocks meaning, list it under `Unclear:`.

**1.5 No idioms, metaphors, slang, or humor.** "Move the needle" becomes the
measured effect, or `Unclear:` if the source never states one.

**1.6 Noun clusters: three words maximum.** "Customer data retention policy
review" becomes "the review of the policy for keeping customer data".

**1.7 Keep the articles.** "Press button" becomes "Press the button". Dropping
articles to save words is telegraphic style, and it reads as harder, not easier.

## 2. Verbs

**2.1 Active voice. Name the actor.** "The changes were approved" becomes "The
board approved the changes". If the source never names the actor, write "Someone
approved..." only if the source implies it; otherwise keep the passive and note
the missing actor under `Unclear:`. Inventing an actor is a fidelity failure.

**2.2 Simple tenses only.** Simple present, simple past, simple future. "Will
have been running" becomes "runs" or "ran", whichever the source means.

**2.3 No verbs turned into nouns.** "Make a decision" becomes "decide";
"performed an evaluation of" becomes "evaluated"; "the implementation of the
policy" becomes "we applied the policy".

**2.4 No `-ing` forms as nouns or adjectives.** "Following the resetting of the
counter" becomes "After you reset the counter". `-ing` is fine in a continuous
tense the source actually means ("the server is failing right now").

**2.5 One verb per instruction.** Split "Open the file and change the value and
save it" into three steps.

## 3. Sentences

**3.1 Length.** 20 words maximum for an instruction. 25 words maximum for a
description. A sentence past the limit is a signal to split, not to compress by
deleting function words.

**3.2 One idea per sentence.** Two claims that can be separately false get two
sentences. This preserves fidelity and shortens sentences at the same time.

**3.3 Put the condition first.** "Restart the service if the check fails"
becomes "If the check fails, restart the service". The reader needs to know
whether to read the rest.

**3.4 Warnings before the action.** Any risk, cost, deadline, or irreversible
step goes before the step it applies to, never after.

**3.5 No sentence-initial throat-clearing.** Delete "It is important to note
that", "What this means is that", "Interestingly,". Start with the subject.

## 4. Paragraphs and structure

**4.1 Six sentences maximum per paragraph.** One topic per paragraph.

**4.2 Lead with the topic sentence.** The first sentence states the paragraph's
claim; the rest support it.

**4.3 Vertical lists for three or more parallel items,** and for any sequence
of steps. Numbered when order matters, bulleted when it does not.

**4.4 Keep the source's order** unless the conclusion is buried. If the source
buries its result under three paragraphs of setup, lead the rewrite with the
result. That is reordering, not adding.

**4.5 Headings only if the source has sections.** Do not impose structure the
source does not have. A four-sentence source gets four sentences, not a
document.

## 5. Precision

**5.1 Replace vague quantity words with the source's own numbers.** "Several
users" stays "several users" if the source gives no count. Do not upgrade
"several" to "many" or downgrade it to "a few".

**5.2 Replace "as necessary" and "if required" with the actual condition**
when the source states it. When the source does not, say "the source does not
say when".

**5.3 Keep every unit, date, currency, version, and name exactly as written.**
Convert nothing. Round nothing.

**5.4 Do not resolve an ambiguous pronoun by guessing.** If "it" could be the
report or the policy, and the source does not settle it, list it under
`Unclear:`.

## 6. What STE does not license

These are the failure modes of a plain-English pass. Each one is a bug.

- **Dropping a hedge.** "may reduce costs" is not "reduces costs".
- **Dropping attribution.** "The vendor claims X" is not "X".
- **Dropping scope.** "in the EU, for enterprise plans" is part of the claim.
- **Merging two claims** that can be separately false.
- **Adding a cause.** "Sales fell. We changed the pricing." does not become
  "Sales fell because we changed the pricing".
- **Adding your own knowledge**, however correct, as context, examples, or
  definitions. The rewrite may contain only what the source contains.
- **Padding an empty source** to make the output look substantial.
- **Telegraphic compression.** Deleting articles, auxiliaries, and connectors
  makes text shorter and harder. STE forbids it.
