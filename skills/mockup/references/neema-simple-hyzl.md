# Cached grounding: `neema-simple-hyzl` (Hyzl web)

Owns the token block and the five shell facts for `neema-simple-hyzl/web`. Use this file instead of
Route A when the surface is in that app. Every value below was transcribed from the source, with
the file named in the comment.

**Re-read the cited file when a value looks wrong, or when the run needs a token this file does
not carry.** This file is a cache, and the source is `web/app/globals.css` plus
`web/components/shell.module.css`.

Hyzl is plain CSS with custom properties, not a component library. The tokens are already CSS
variables, so the `:root` block below is a transcription, not a translation.

## Token block

Paste into `<style id="product-tokens">`. Source: `web/app/globals.css` `:root`.

```css
:root {
  --background: #fefefb;
  --foreground: #10110e;
  --primary: #38bdc3;
  --primary-foreground: #10110e;
  --border: #dfe1d1;
  --muted-foreground: #7d7e76;
  --secondary: #f3f4ee;
  --secondary-foreground: #10110e;
  --input: #dfe1d1;
  --ring: #38bdc3;
  --destructive: #a83d35;
  --success: #347a56;
  --success-surface: #e9f0e4;
  --primary-soft: #e5f5f0;
  --primary-ink: #14646a;
  --ink-soft: #4a4d44;
  --white: #ffffff;
  --phone-surface: #f9faf6;
  --code-surface: #1d241f;
  --code-text: #f0f3e7;
  --code-muted: #a9b7a4;
  --code-accent: #72d4ce;
  --transparent: transparent;

  --card: var(--background);
  --popover: var(--background);
  --muted: var(--secondary);
  --accent: var(--secondary);
  --shadow: color-mix(in srgb, var(--foreground) 7%, var(--transparent));
  --surface-raised: var(--white);
  --surface-chrome: color-mix(in srgb, var(--secondary) 58%, var(--background));
  --surface-accent: color-mix(in srgb, var(--primary) 5%, var(--background));
  --border-strong: color-mix(in srgb, var(--border) 80%, var(--foreground));
  --primary-hover: color-mix(in srgb, var(--primary) 86%, var(--background));
  --accent-line: color-mix(in srgb, var(--primary) 22%, var(--border));
  --shadow-card: 0 1px 2px var(--shadow);
  --radius: 6px;

  --font-manrope: "Manrope", sans-serif;
  --font-code: ui-monospace, SFMono-Regular, Menlo, monospace;
}
```

The `color-mix` values are the product's own. Keep them as `color-mix`, because Phase 5 check 1
greps for raw hex and a hand-resolved mix is an invented colour.

**The product is light only.** `color-scheme: light` is set and there is no dark palette. Never
add one.

## Font

Manrope, self-hosted from `/fonts/manrope-latin-*.woff2` at weights 400, 500, 600, 700 and 800. A
mockup cannot reach those files, so load the same family and weights from Google Fonts and keep
`"Manrope", sans-serif` in `--font-manrope`.

## Type

**There is no type ramp.** Hyzl sets `font-size: 14px` on `body` and then sizes every component in
its own rule. The common sizes are 10, 11, 12, 13 and 14px, and headings run 20 to 32px.

**Read the rule for the component you are drawing, in `globals.css`, and copy its size and
weight.** Do not invent a ramp, and do not reuse another product's.

## Base rules that change what you draw

From `globals.css`.

- **Every control is at least 44px tall.** `button`, `[role="switch"]`, `[role="combobox"]`,
  `input` and `select` all carry `min-height: 44px`. `[data-slot="button"]` also carries
  `min-width: 44px`. A 32px button is wrong even though it looks right.
- **Focus is a 2px ring offset by 4px**: `outline: 2px solid var(--ring); outline-offset: 4px`.
- **Borders default to `var(--border)`** on every element, because `*` sets `border-color`.
- **`.panel` is the card**: `1px solid var(--border)`, radius 6px, `background: var(--surface-raised)`,
  `box-shadow: var(--shadow-card)`.
- **Buttons are 12px/600**, with `letter-spacing: -.1px`. The `default` variant is `--primary`
  background at weight 700 with `0 1px 2px var(--shadow)`. The `outline` variant is
  `--surface-raised` with no shadow.
- **Links carry no underline** and inherit their colour.

## Breakpoints

Hyzl is **desktop first**. Every rule is `max-width`, so a band is the range below its number. The
harness needs min-first bands, so fill `BREAKPOINTS` with this:

```js
const BREAKPOINTS = [
  { id: 'narrow',  min: 0 },     // the drawer band: no rail
  { id: 'tablet',  min: 761 },
  { id: 'laptop',  min: 961 },
  { id: 'desktop', min: 1181 },
  { id: 'wide',    min: 1550 },
];
```

`480` and `380` also appear, but only for the sign-in card and the account dialogs. Add them only
when the mockup draws one of those.

Fill `DEVICES` with `1440` (desktop), `1024` (laptop) and `390` (narrow). Those three land in
three different bands and straddle the one breakpoint that changes the shell.

## The five shell facts

Source: `web/components/shell.module.css`, with the markup in `web/components/shell.tsx`.
**Ignore the `.sidebar`, `.workspace` and `.topbar` rules in `globals.css`.** Those are the demo
and landing classes. The app shell is the CSS module.

1. **The nav changes form at 760px**, and at no other width.
2. **Above 760 the rail is pinned**: `position: fixed`, 204px wide, `padding: 16px 14px`,
   `background: var(--surface-chrome)`, `border-right: 1px solid var(--border)`. At 760 and below
   the rail is `display: none`.
3. **The header exists at every width.** It is 64px tall with `padding: 0 38px`, dropping to
   `24px` inline at 960 and `14px` inline at 760. It holds the app switcher, the section name, the
   recovery-mode control and, below 760 only, the status pill and the hamburger.
4. **Content offset:** `margin-left: 204px` above 760, `0` at 760 and below. The header sits in
   normal flow, so there is no spacer to add. The app switcher is `position: fixed` at
   `top: 76px; left: 14px`, 176px wide, so it floats over the rail rather than sitting inside it.
   Below 760 it becomes a static flex child of the header.
5. **The drawer opens from the right**, not the left: `inset: 0 0 0 auto`, `width: min(340px, 100vw)`,
   `border-left: 1px solid var(--border)`. Its backdrop is
   `color-mix(in srgb, var(--foreground) 24%, var(--transparent))`. A 44px close button and the
   backdrop both dismiss it. Inside it: the nav links at 48px and 14px, the recovery-mode radios,
   then the account footer above a hairline.

**Wire the hamburger.** Below 760 the drawer is the whole nav, and a dead hamburger hides it.

## Nav items

`Home`, `Hazel`, `Flow`, `Inbox`, `Install`, `Settings`, plus `Admin` for a staff account. The
active link is `color: var(--primary-ink)` on `background: var(--primary-soft)` at weight 700.
Icons are lucide at size 18, `strokeWidth 1.6`.
