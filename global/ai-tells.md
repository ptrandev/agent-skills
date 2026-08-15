---
source: https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing
pinned_revid: 1369390317
pinned_date: 2026-08-14
last_reviewed: 2026-08-15
baseline_sections: 91
baseline_wordboxes: 19
---

# AI writing tells

The deep reference behind the Writing style rules in [`CLAUDE.md`](CLAUDE.md). Those rules bind on
every artifact. Read this file when writing substantial prose: a report, a design doc, a PR body, a
skill, a summary for people who did not watch the work happen.

**The tells are symptoms, not the disease.** The disease is a claim no source supports. Editing out
the vocabulary while keeping the unsupported claim makes bad writing harder to catch, not better.
Fix the claim first.

## The swap test

If a sentence stays true after you replace its subject with a different subject, it is filler.
Delete it.

"This marks a pivotal moment in the evolution of the system" survives swapping "the system" for
anything at all. So does "reflecting its continued relevance." One test catches the significance
inflation, the participle tails, the promotional drift, and the vague attributions together.

Corollary: an importance claim needs a source, named. If no source said it matters, do not say it
matters.

## Live tells

Ordered by how often they appear in my own output.

### 1. Significance and legacy inflation

Puffing up a subject by asserting it represents something larger.

`stands as`, `serves as`, `is a testament to`, `a pivotal moment`, `underscores its importance`,
`reflects broader`, `marking a shift`, `a key turning point`, `indelible mark`, `evolving landscape`

Applies at any scale, including trivia. Also fires as a hedge followed by the claim anyway: "Though
narrow in scope, it contributes to the broader history of X."

### 2. Participle tails

An `-ing` clause bolted to a sentence end that interprets the fact just stated.

`..., highlighting its historical significance`
`..., ensuring consistency across the codebase`
`..., reflecting the broader shift toward X`
`..., contributing to overall reliability`

The fact was complete before the comma. The clause adds an interpretation no source made. End the
sentence at the fact.

### 3. Copula avoidance

Simple `is`, `are`, `has` replaced with something that sounds weightier.

| Written | Meant |
|---|---|
| `serves as`, `stands as`, `functions as`, `operates as`, `represents`, `marks` | is |
| `boasts`, `features`, `offers`, `maintains`, `provides` | has |
| `refers to` (opening a definition) | is |

Also the elaborated form: "began his career as an engineer" for "was an engineer". Measured as a
10%+ drop in `is`/`are` in academic writing in 2023.

### 4. Negative parallelism

Three shapes, all of them staging a misconception nobody held.

- `not just X, but Y` / `not only X but also Y`
- `not X, but Y` / `no X, no Y, just Z`
- `X rather than Y`

### 5. AI vocabulary density

One instance is coincidence. Many, many times in one document is the strongest single tell. They
travel together: where one is, others are.

**Live (mid-2025 on):** `emphasizing`, `enhance`, `highlighting`, `showcasing`

Take this literally. A word being overused does not implicate its synonyms. Context counts:
`underscore` is fine for a literal underline, `key` is fine for a map key or a cryptographic key.

Words that are common in real engineering prose are deliberately absent from the live list:
`crucial`, `key`, `landscape`, `robust`, `enhance` as a plain verb. Flagging those trains me to
ignore the list.

### 6. Rule of three

`adjective, adjective, adjective` or `phrase, phrase, and phrase`, used to make a thin claim sound
comprehensive. Three is fine when there are exactly three things. It is a tell when the third item
is filler that carries no new information.

### 7. Elegant variation

Renaming the same referent on each mention to avoid repeating a word: "the parser", "the component",
"this subsystem", "the module", all for one thing. Caused by a decoder repetition penalty. It
destroys precision in technical writing, where one name per thing is the whole point.

Name a thing the same way every time.

### 8. Vague attribution and inflated source counts

`experts argue`, `observers have noted`, `industry reports`, `several sources`, `it is widely
considered`, `research suggests`

Presenting one source as a consensus. Implying a list is non-exhaustive with `such as` when it is
exhaustive. Attaching an interpretation to a named source that the source never made.

### 9. Structural formulas

- **Challenges and future prospects.** "Despite its X, Y faces several challenges..." closing on a
  vague upbeat note. The tell is the formula, not the mention of difficulty.
- **Summary sections.** `In summary`, `In conclusion`, `Overall`, restating what was just said.
- **`X and Y` headings.** "Awards and recognition", "Challenges and legacy".

### 10. Formatting defaults

- **Inline-header vertical lists.** `- **Thing**: description`, repeated down a page. The single
  most recognizable AI layout. A layout decision, not a default. Use prose unless the content is
  genuinely a lookup table.
- **Bold as emphasis spray.** Bolding every instance of a chosen phrase, "key takeaways" style.
- **Title Case In Headings.**
- **Emoji decorating headings or bullets.**
- **`---` thematic breaks between every section.**
- **Tiny tables** for content that is two sentences of prose.

### 11. Scaffolding leakage

Text addressed to the requester, left in the deliverable.

`I hope this helps`, `Would you like me to`, `Certainly!`, `Here is a template you can customize`,
`let me know if`

Also unfilled placeholders (`[Your Name]`, `PASTE_URL_HERE`, `2026-XX-XX`) and knowledge-gap
speculation: "specific details are not widely documented", followed by a guess presented as
likely. The claim that something is undocumented is itself an unverified claim.

## Claude-specific

My exposure differs from the generic profile. Verified against the source at the pinned revision:

- **Em dashes: I am the outlier.** A July 2026 study found that of contemporary models, only Claude
  uses em dashes more than professional writers. ChatGPT now uses fewer. The `CLAUDE.md` ban is not
  redundant for me, it is the single rule most specific to my output.
- **Curly quotes: not my tell.** Claude and Gemini typically emit straight quotes. ChatGPT and
  DeepSeek emit curly.
- **Broader-context framing: weaker in me.** Sitting a subject inside a larger trend is more
  characteristic of ChatGPT and Grok than of Claude and Gemini. Weaker does not mean absent.
- **Markdown is my default output format**, by system prompt. Every formatting tell in section 10
  is therefore a live risk in any target that is not a Markdown document.

## Not tells

Do not overcorrect into these. Each is listed by the source as an ineffective indicator.

| Not a tell | Why |
|---|---|
| Perfect grammar | Many people write well |
| Mixed casual and formal register | Common in technical writers |
| "Bland" or "robotic" prose | AI output skews positive and verbose, not flat |
| Formal or academic vocabulary | The correlation is with *specific words*, not with formality |
| Transition words alone | Only a few are genuinely overused |
| Correct, complex formatting | Normal for anyone using a preview |

Overcorrecting has a cost. Stripping hedges, superlatives, and plain wording to sound less like AI
produces writing that is less accurate and less human at once.

## Signs of human writing

The positive checklist. Empirically more common in human writing than in AI writing.

- Simple `is`/`has` constructions: "there is a", "it has a"
- Plain verbs over stiff synonyms: `wrote` not `authored`, `used` not `utilized`, `moved` not
  `relocated`, `tried` not `attempted`, `died` not `passed away`
- Definite and superlative claims: "was the first", "is the only"
- Hedges and intensifiers where they are honest: `very`, `perhaps`, `tends to`
- Wordy constructions left alone: `as a result of`, `in order to`, `the fact that`
- Being able to explain your own choices, including your mistakes

## Refreshing

Quarterly, or on a major model release. The upstream page takes roughly 10 edits a day, so "has the
page changed" is always yes and is not the signal. Findings move on a model-release cadence.

The upstream page carries `{{update|the most recent models}}`. It is a lagging indicator by its own
admission. My own corrected output is the leading one: a correction from Phillip lands here at
higher priority than anything this procedure finds.

**Never re-read the full page.** It is over 200KB. Run two cheap probes against the pinned revision.

```bash
API=https://en.wikipedia.org/w/api.php
PAGE=Wikipedia:Signs%20of%20AI%20writing

# Probe 0: current revid
curl -sL "$API?action=query&prop=revisions&titles=$PAGE&rvprop=ids|timestamp&rvlimit=1&format=json"

# Probe 1: section list (~22KB, 91 at baseline). Diff titles against baseline_sections.
curl -sL "$API?action=parse&page=$PAGE&prop=sections&format=json"

# Probe 2: Words-to-watch boxes (19 at baseline). These hold the fastest-decaying vocabulary.
curl -sL "https://en.wikipedia.org/wiki/$PAGE?action=raw" | grep -c "Words to watch"

# Only if a probe moved: diff the changed sections, never the whole page.
curl -sL "$API?action=compare&fromrev=$PINNED&torev=$CURRENT&format=json"
```

**Acceptance rule.** An entry enters only if it can appear in text I write: chat prose, code
comments, docs, PR bodies, commit messages, Slack. That rejects every Wikipedia mechanic (wikitext,
AfC, categories, citation templates) and every provider fingerprint (`utm_source`, `oaicite`,
`[cite: 1]`) on sight. Without this rule each refresh drags the file back toward the source's 1,800
lines.

**Demotion rule.** Every entry carries the model era it was observed in. When an era passes, demote
the entry to Historical rather than leaving it live. A file that only ever grows has me defending
against dead tells while missing current ones.

**On any change to a live tell,** check whether the Writing style block in `CLAUDE.md` needs a
matching edit, then run the drift check in `README.md` across all four copies.

Update `pinned_revid`, `pinned_date`, `last_reviewed`, and both baseline counts on every run,
including a no-change run.

## Historical

Demoted. Kept for recognition only. Do not treat these as live constraints.

- **2023 to mid-2024 (GPT-4):** `additionally`, `boasts`, `bolstered`, `crucial`, `delve`,
  `enduring`, `garner`, `intricate`, `interplay`, `key`, `landscape`, `meticulous`, `pivotal`,
  `tapestry`, `testament`, `underscore`, `valuable`, `vibrant`
- **Mid-2024 to mid-2025 (GPT-4o):** `align with`, `fostering`, plus the survivors above
- **Grok, idiosyncratic:** `causal`, `empirical`, `correlate`, and `underscore` held into 2026
- **Didactic disclaimers (2022 to 2024):** "it is important to note", "worth noting"
- **Prompt refusal boilerplate:** "as an AI language model"

`delve` is the worked example. It spiked in 2023, fell through 2024, and collapsed in 2025. A rule
pinned to it would now be pure noise.
