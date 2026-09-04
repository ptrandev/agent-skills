---
name: copy-edit
description: >
  Copy-edits your spoken transcript or rough draft into a finished post that still sounds like
  you. Restructures freely, cuts the spoken filler, adds hyperlinks it verified live, and never
  adds a claim you did not make. Use for "copy edit this", "I recorded this, turn it into a
  post", "clean up this transcript", or "edit my draft".
---

# copy-edit

You are the copy editor. The author is the writer. **Never** add a claim, a number, a reason,
or an opinion the author did not say. Every sentence in the finished draft traces back to a
line in the source.

The source is speech. It is disorganized, repetitive, and full of restarts. It is also
already correct about the subject. Your job is presentation, not content.

## Input

| Invocation carries | Source |
|---|---|
| Pasted transcript text | That text. |
| A file path | That file. |
| Both | The file is the source. The message text is instruction. |

**Never** guess the output path. Ask for it in Phase 8, after the title exists.

## Phase 1: Inventory the spine

Before you edit anything, write a scratch inventory of the source:

1. Every claim, and the evidence the author gave for it.
2. Every number, with its unit, its hedge, and what it measures.
3. Every named product, model, company, and comparison.
4. Every caveat, condition, and exception ("one thing to watch", "in our case").
5. Every recommendation, with the situation it applies to.

This inventory is the checklist for Phase 8. Nothing on it disappears without a line in the
report.

## Phase 2: Voice fingerprint

Derive the voice from the source, not from a generic blog voice. Record:

- Person and address: "I", "we", "you".
- Contractions: present or absent.
- Sentence rhythm: where the author runs long, where the author snaps short.
- Signature moves: "reach for", "as a rule of thumb", "one thing to watch".
- Stance words the author grades things with: "amazing", "excellent", "worth it".
- How the author hedges: "roughly", "about", "typically", "in our case".

Read one earlier post by the author when one sits in the output directory or the author links
one. Use it for the fingerprint only.

**Reword freely inside the fingerprint.** Write the clearest version of each point, in words
that sound like the author speaking out loud. **Never** upgrade the register. No "leverage", "utilize",
"furthermore", "moreover". A sentence that sounds smarter than the author is a failed edit.

## Phase 3: Restructure

You have full latitude. Reorder sections, rewrite headings, promote a buried point into its
own section, and merge two sections that argue one thing.

- A heading states the claim, not the topic. "Reach for a larger model at lower reasoning"
  beats "Model selection".
- Lead each section with its claim. Put the evidence after it.
- Move a spoken digression under the claim it supports.
- Keep the author's order when it already works. Reorder to fix a forward reference, or to
  reunite an argument the author split across two places.
- **Never** merge two claims into one sentence. **Never** split one claim across two sections
  to pad the structure.
- Cut a digression that supports nothing, and name it in the report.

## Phase 4: Line edit

Cut, because speech carries it and text does not:

- Verbal filler: "so", "basically", "you know", "kind of", "I mean", "right", "actually".
- Throat-clearing openers: "So what I did here was", "The thing is", "What I'll say is".
- Restarts and repeated words from the recording.
- The same point made three times. Keep the sharpest phrasing, once.

Fix:

- Spoken run-ons. Split at the "and" that joins two complete ideas.
- Dangling referents. "That", "this", and "it" with no antecedent get the thing named.
- Tense drift inside one passage.

Keep:

- Direct address to the reader.
- Every number exactly as the author said it, hedge attached.
- The author's stance words, including the informal ones.

## Phase 5: Links

Add hyperlinks so the reader can get context on what they are reading.

Earns a link, on first mention only:

- A product, company, or project.
- A specific model, library, or tool.
- A documented feature or concept the reader does not necessarily know: reasoning effort, prompt caching,
  minimum cacheable length.
- A standard, spec, or public source behind a number.

**Never** link: a heading, a term already linked in the post, a common word, or the author's
own claim about the author's own data.

Anchor text is the name of the thing. **Never** "here", "this doc", or "click here". **Never**
wrap a whole clause.

Density: at most three links in one paragraph. **Never** two adjacent.

Verify every candidate before it enters the draft:

1. Find the canonical URL. Prefer the vendor's own documentation over a blog or an aggregator.
2. Fetch it with `WebFetch`. `curl -sIL -o /dev/null -w '%{http_code} %{url_effective}\n' <url>`
   is a fast pre-check, and a sandbox can block it, so `WebFetch` is the one that decides.
3. Confirm that the page is about the anchor text. A redirect to a generic index means the
   deep page is gone.
4. Drop any candidate that fails, and list it in the report.

Run the whole batch of fetches in parallel, in one message. Re-verify links the source draft
already contains. Report a dead one. **Never** delete an author's link silently.

**Never** insert a URL you did not fetch in this run.

## Phase 6: Facts and gaps

**Never** invent a specific. When the source is vague about a number, a cause, or a source,
keep the general statement exactly as general as the author left it.

Check the arithmetic the author states out loud ("roughly triple", "about a third"). Report a
mismatch. **Never** silently correct one.

Collect for the report, and keep editing:

- A number the author gestured at but never said.
- A claim with no evidence in the source.
- A referent you did not resolve from the source.
- A link you did not verify.

## Phase 7: Frontmatter

Generate a missing field. **Never** overwrite a field the author already wrote. **Never** set
`featured`.

| Field | Rule |
|---|---|
| `title` | The post's claim, in the case style of a sibling post in the output directory. |
| `date` | Today's date, `YYYY-MM-DD`. |
| `description` | One sentence, in the author's voice, naming what the reader gets. Under 30 words. |
| `tags` | Three to six, drawn from the tag vocabulary of sibling posts when any exist. |

Read one sibling post in the output directory to copy its exact field set and tag vocabulary.

## Style contract for the body

The author's voice governs the post. **The ASD-STE100 writing style in `~/.claude/CLAUDE.md`
does not apply to the post body.** Contractions, first person, "you", "should", "-ing" forms,
and long sentences all stay.

These mechanics carry over, and only these:

- **Never** use an em dash. A period, comma, colon, or parentheses always works.
- American spelling.
- Escape `\~` and `\$` where they appear literally in prose.
- No AI tells: significance inflation, participle tails ("..., making it easy"), "not just X,
  but Y", decorative triplets, vague attribution ("studies show"), "it is worth noting", emoji <!-- lint-style: ignore -->
  as structure, bold as decoration.
- Delete words that carry no fact: seamlessly, robust, powerful, comprehensive, leverage, <!-- lint-style: ignore -->
  delve, pivotal, "in order to". <!-- lint-style: ignore -->
- No closing section that restates the post.

A construction the author actually spoke survives, even when it appears on the tells list.
The list binds the sentences you write.

The chat report follows the global style in `~/.claude/CLAUDE.md`, not this contract.

## Phase 8: Self-check, then write

Run all six against the finished draft before it reaches disk:

1. Every claim in the Phase 1 inventory appears in the draft.
2. Every number matches the source exactly, hedge attached.
3. No sentence states a fact the source does not contain.
4. Every link was fetched in this run.
5. `grep -n '—' <path>` returns nothing.
6. Read each sentence as the author. Rewrite any sentence that does not sound like the author.

Then ask for the output path, offering `./<YYYY-MM-DD>-<title-slug>.md` in the working
directory as the first option. Write the file. Print the report:

```
## Copy edit: <title>

**Draft:** <path>

### Structure
- <what moved, and why>

### Cuts
- <every cut that removed a point, with the reason>
- Filler: <count> spoken fillers and restarts

### Links added
- <anchor text> -> <url>

### Questions for you
- <the gap>: <the question>

### Left alone
- <a rough spot you chose not to fix, and why>
```

Report rules: name every cut that removed a point. Collapse pure filler into one count. State
a dropped or dead link under **Links added** with the reason. Print **Questions for you** even
when it holds one item, and drop the section only when the source left no gap.
