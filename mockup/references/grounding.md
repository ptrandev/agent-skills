# Grounding: where every value comes from

Owns token extraction and component geometry. `SKILL.md` Phase 2 points here. Nothing in the
mockup gets a colour, size, weight, radius, spacing or shadow that did not come out of this phase.

## Route A: read the theme (default)

Most products keep their tokens in one place. Find it, then transcribe it into the
`<style id="product-tokens">` block as CSS custom properties.

```bash
find . -maxdepth 4 \( -iname "*theme*" -o -name "tailwind.config.*" -o -name "globals.css" \
  -o -iname "*tokens*" -o -iname "*palette*" \) -not -path "*/node_modules/*" | head
```

For the Atllas `agents-portal`, the theme is [apps/agents-portal/src/theme/](../../../codebase/apps/agents-portal/src/theme/):
`palette.ts` (colour, including the sanctioned raw-hex block), `typography.ts` (the ramp, with the
px value in a comment on every variant), `shape.ts` (radius), `shadows.ts` (elevation),
`components.tsx` (the MUI overrides that decide what a Card or Button actually looks like).

Transcribe, do not summarise. Keep the product's own names so a reviewer can diff them:

```css
:root {
  --canvas: #FCFCFB;      /* palette.ts background.default */
  --hairline: #E7E6E2;    /* palette.ts divider */
  --accent: #2857E5;      /* palette.ts primary.main */
  --radius: 8px;          /* shape.ts borderRadius */
  --whisper-md: 0 4px 16px rgba(16, 24, 40, 0.06);  /* shadows.ts elevation 4 */
}
```

Do the same for the type ramp. Reproduce every variant the mockup uses as a class, with the
product's variant name, so `.h2`, `.body2` and `.caption` in the file mean what they mean in the
app.

**Read `components.tsx` (or the equivalent override file) before drawing a card, button or input.**
A theme that sets `MuiCard: { boxShadow: 'none' }` means a card with a shadow is wrong even though
the shadow token exists.

**When the product has no dark theme, the mockup is light only.** Never add a theme the product
does not have.

## Ground the shell, not only the surface

The frame renders the whole screen, so the app shell is part of the mockup and gets the same
treatment as the change itself. **Read the layout component that hosts the page before drawing any
chrome**, and take these five facts out of it by reading, never by assuming:

1. The breakpoint at which the nav changes form. It is usually **not** the one the page content
   uses, so a mockup that reuses the content breakpoint for the shell is wrong at every width
   between the two.
2. What the nav is on each side of that breakpoint: pinned rail, drawer, top bar, tab bar.
3. The header: whether one exists at all in each mode, its height, and what it contains.
4. The exact offsets the shell imposes on content: the rail's width, the header's spacer.
5. How the drawer opens and closes, including the backdrop and what dismisses it.

For the Atllas `agents-portal` that file is
[components/dashboard/DashboardLayout.tsx](../../../codebase/apps/agents-portal/src/components/dashboard/DashboardLayout.tsx),
with the rail in `dashboardSidebar/Sidebar.tsx` and the mobile bar in `dashboardSidebar/../NavbarTopMobile.tsx`.
It pins the rail at **lg (1200)**, not at the `md` its grids use, and below 1200 it renders a 64px
top bar whose only job is the drawer toggle.

**Wire the drawer.** A mockup whose hamburger does nothing is a dead button, and on a narrow width
the nav is most of what there is to judge.

## Route B: measure a running app

Use this when the tokens are not in one file, when a component's geometry is not derivable from
the theme, or when the shape is `overlay` and you need the screenshot.

Get a browser with the `browse` skill. For driver selection on a machine where `browse` is not
available, [ui-walkthrough/driver.md](../../ui-walkthrough/driver.md) owns the fallback.

Navigate to the real screen, then measure the components the mockup reuses:

```js
// one row per component the AFTER reuses
[...document.querySelectorAll('[data-testid], .MuiCard-root, button')].slice(0, 40).map(el => {
  const c = getComputedStyle(el), r = el.getBoundingClientRect();
  return { sel: el.dataset.testid || el.className.split(' ')[0],
    w: Math.round(r.width), h: Math.round(r.height),
    font: c.fontSize + '/' + c.lineHeight + ' ' + c.fontWeight,
    color: c.color, bg: c.backgroundColor, border: c.border,
    radius: c.borderRadius, pad: c.padding, gap: c.gap, shadow: c.boxShadow };
})
```

Paste the result into the file as a comment next to the CSS it produced. A reviewer, and the next
run, can then tell a measured value from a guessed one.

## Screenshots (shape `overlay` only)

Screenshot at a fixed viewport, in one theme, with the screen seeded so it looks like real use.
Record the route, viewport and theme in the `#brief` block.

**Compress hard before inlining: WebP at q75, long edge about 1280px.** A full-resolution PNG as
base64 can be larger than everything else in the file combined.

```bash
cwebp -q 75 -resize 1280 0 shot.png -o shot.webp
printf 'data:image/webp;base64,%s' "$(base64 -i shot.webp)" > shot.datauri
```

Keep inlined screenshots to 3 or fewer. Where a state can be built from measured styles instead,
build it. HTML is smaller than a raster and it stays clickable.

## The one thing to get right

Everything outside the changed region must stay true to the product. That is what makes the reader
trust the part that is new. Change only the region the source asks you to change.
