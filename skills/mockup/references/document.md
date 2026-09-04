# The document contract

Owns the file's structure, the chrome, the wiring and the seed data. `SKILL.md` Phase 4 points
here. Start from [shell.html](shell.html): it carries the whole harness, verified in a browser.
Fill only the blocks marked `FILL:`.

## Block order

| Block | Holds |
|---|---|
| `<style id="mk-chrome">` | The walkthrough bar. Never edit it, never put product tokens in it. |
| `<style id="product-tokens">` | Every colour, size, weight, radius and shadow, each with its citation. |
| `<style id="product-css">` | Components built only from the tokens above. |
| `<script id="brief">` | Surface, source link, shape, grounding, open questions. |
| `DATA` | Seed values. |
| `STATES` | The storyboard. |
| harness | Do not edit. |

**Every hex in the file lives in `product-tokens`.** Phase 5 greps for the ones that do not.

## Fonts and icons

Link the product's font from Google Fonts and keep the full fallback stack in `--font`. A blocked
network then changes the glyphs and nothing else.

**Never call into a CDN global at the top level.** `lucide.createIcons()` on a page whose CDN
script failed throws a `ReferenceError` that kills the whole script, and the reader gets a blank
page instead of a mockup. Inline the SVGs you need, most often under a dozen. When you do use
a CDN library, guard every call: `if (typeof lucide !== 'undefined') lucide.createIcons()`.

## The frame

One `.frame`, fixed to the real viewport width, centred on a neutral page background. Inside it,
only product tokens. Outside it, only chrome. A reader must never be unsure which is which.

Match the product's own chrome: the sidebar, the header, the nav state. Those are what make the
screen recognisable before the reader reads a word.

**Build the narrow widths too when the surface is responsive.** The frame drags to any width and
the toolbar jumps to the three device presets, so the reader sizes it the way they size a
browser window. Narrow is where a design actually fails: a card that is a fifth of a row on a
laptop is half of one on a tablet, and a label that fits at 240px clips at 176px. A laptop-only
mockup of a responsive surface hides every decision width forces, and those decisions then get
made during the build, by whoever hits them first.

Fill `BREAKPOINTS` with the product's own scale and `DEVICES` with the three widths to jump to.
Pick device widths that land in **different bands**, or the three buttons show one layout.

**Branch the product CSS on `[data-bp]`, never on the device name.** The harness computes the band
from the live width and puts it on the frame, so a dragged width and a preset behave identically:

```css
.frame[data-bp="md"] .kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.frame[data-bp="xs"] .kpi-grid { grid-template-columns: 1fr; }
```

The readout beside the presets names the width and the band, so a reader dragging through 900px
sees `md` become `sm` at the moment the layout changes. That is the whole reason it is draggable
rather than three fixed buttons: the breakpoint is a claim, and dragging is how you check it.

## Wiring: three attributes, no re-binding

The harness delegates clicks from `document`, so markup returned by `render()` is live the moment
it is written. Never attach a handler after setting `innerHTML`: that is the bug that silently
kills every control on the second visit to a state.

| Attribute | Use |
|---|---|
| `data-go="<state-id>"` | Move the reader to another state. Covers most controls. |
| `data-act="<name>"` | Change something inside this state. Add the function to `ACTIONS`. |
| `data-inert` | A real control that is out of scope for this mockup. |

Every `<button>` in the frame carries one of the three. A button with none is a dead button, and
Phase 5 finds it.

## Seed data

One `DATA` object. Derive every displayed number from it with a function, the way a real component
does. Two states that disagree about the same number destroy the reader's trust in all of them.

**Every value the reader can change lives in `UI`, never in a bare `let`.** Reset snapshots `UI` at
load and restores it. A mutable binding outside `UI` survives Reset and silently carries one state's
choice into the next walk.

Realistic content only: real-shaped names, real-shaped ids (`cus_QX81…`), plausible amounts, dates
in the product's own format, and at least one value long enough to wrap or truncate.

## Overlays are states

A dialog, a drawer or a confirm is a state, not a flag. It gets an id, a chip and a narration line
like any other step, and its cancel button is a `data-go` back to where the reader came from. This
is what makes every modal reachable from the chip bar instead of only by clicking the exact path.

## Before / after

Set `ab: true` on a state and `render(ab)` receives `'before'` or `'after'`. Default is `after`,
and it resets to `after` on every state change so the reader never gets stranded in `before`.

Change only the region the source asks you to change. Everything else must be byte-identical
between the two, or the toggle reads as noise.

## Variants

Fill `VARIANTS` with `{id, label}`. The id lands on `.frame` as `data-variant`, so a direction that
differs only in tokens is pure CSS:

```css
.frame[data-variant="b"] { --accent: #0E7C5A; --radius: 4px; }
```

A direction that differs in layout branches inside `render()` on the `variant` global.

## The changed region

Put `class="mk-new"` on what the change adds. The harness flashes it once on entry, then holds a
static outline, and respects `prefers-reduced-motion`. One flash defeats change-blindness. A loop
just annoys.

## Deep links and size

The current state id is in the URL hash, so a reader can send someone a link to step 4 of the file
they were both sent. It survives being copied to another machine.

Keep the finished file under about 2MB. Past that, replace the inlined screenshot with styles built
from measurement instead.
