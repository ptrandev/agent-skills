# Cached grounding: Atllas `agents-portal`

Owns the token block and the five shell facts for `apps/agents-portal`. Use this file instead of
Route A when the surface is in that app. Every value below was transcribed from the theme, with
the source file named in the comment.

**Re-read the cited file when a value looks wrong, or when the run needs a token this file does
not carry.** This file is a cache, and the theme is the source.

## Token block

Paste into `<style id="product-tokens">`, then delete the lines the mockup does not use.

```css
:root {
  /* palette.ts */
  --canvas: #FCFCFB;          /* background.default */
  --surface: #FFFFFF;         /* background.paper */
  --hairline: #E7E6E2;        /* divider */
  --accent: #2857E5;          /* primary.main */
  --accent-weak: #EEF2FE;     /* primary.light, also action.selected */
  --accent-hover: #1B43C9;    /* primary.dark */
  --ink: #1A1D26;             /* text.primary */
  --ink-2: #5B5F6B;           /* text.secondary, also action.active */
  --ink-3: #9A9DA8;           /* text.disabled */
  --hover-bg: #F6F6F4;        /* action.hover */
  --ok: #0E7C5A;              /* success.main */
  --ok-weak: #E6F2EC;         /* success.light */
  --warn: #9A6700;            /* warning.main */
  --warn-weak: #FBF3E1;       /* warning.light */
  --danger: #B42318;          /* error.main */
  --danger-weak: #FDECEB;     /* error.light */
  --line-strong: #D5D4D0;     /* grey.400 */
  --ink-deep: #0F1117;        /* grey.900 */

  /* shape.ts */
  --radius: 8px;              /* borderRadius */

  /* shadows.ts */
  --whisper-sm: 0 1px 2px rgba(16, 24, 40, 0.04);   /* elevation 1..4 */
  --whisper-md: 0 4px 16px rgba(16, 24, 40, 0.06);  /* elevation 5..24 */

  /* typography.ts */
  --font: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
}
```

Third-party brand marks live in `palette.ts` as the exported `brand` object. Use them only on a
vendor logo or a vendor connect button: `stripe #635BFF`, `revenueCat #F2545B`, `hubspot #FF7A59`,
`meta #1877F2`, `zapier #FF4F00`, `claude #CC785C`.

## Type ramp

| Class | Size | Weight | Line height | Extra |
|---|---|---|---|---|
| `.h1` | 32px | 650 | 1.2 | `letter-spacing: -0.01em` |
| `.h2` | 28px | 650 | 1.25 | `letter-spacing: -0.01em` |
| `.h3` | 24px | 600 | 1.3 | |
| `.h4` | 20px | 650 | 1.3 | page title |
| `.h5` | 18px | 600 | 1.35 | |
| `.h6` | 16px | 600 | 1.4 | |
| `.subtitle1` | 15px | 600 | 1.4 | |
| `.body1` | 14px | 400 | 1.43 | |
| `.body2` | 13px | 400 | 1.38 | |
| `.overline` | 10.5px | 600 | 1.33 | uppercase, `letter-spacing: 0.07em` |
| `.button` | 14px | 600 | 1.43 | `text-transform: none` |

Load Inter from Google Fonts at weights 400, 500, 600, 650, 700.

## Component overrides that change what you draw

From `components.tsx`. These beat the raw tokens.

- **Card and Paper are flat.** `box-shadow: none`, plus `1px solid var(--hairline)`.
- **Button never shouts.** `text-transform: none`, radius 8px, no shadow.
- **Focus ring is a tinted halo**, not an outline: `0 0 0 3px rgba(40,87,229,0.12)`, and
  `0 0 0 3px rgba(180,35,24,0.12)` in the error state.
- **Menu, popover and dialog carry `--whisper-md`** plus the hairline border. They are the only
  things with elevation.
- **Switch** is 30px tall with 4px padding around a 38x22 pill.
- **Chip** is 18px tall with an 11px radius.
- **Tab and MenuItem** use `padding: 8px 12px` and radius 8px.

## Breakpoints

MUI defaults, not overridden: `xs 0`, `sm 600`, `md 900`, `lg 1200`, `xl 1536`. Fill `BREAKPOINTS`
with exactly this scale.

## The five shell facts

Source: `components/dashboard/DashboardLayout.tsx`, with `dashboardSidebar/Sidebar.tsx` and
`NavbarTopMobile.tsx`.

1. **The nav changes form at `lg` (1200)**, not at the `md` the page grids use.
2. **At 1200 and up the rail is pinned.** Below 1200 the rail becomes a drawer.
3. **The header exists only below 1200.** It is 64px tall and its only job is the drawer toggle.
   From `lg` up the shell is headerless.
4. **Content offsets:** `padding-left: 230px` at 1200 and up, which is the rail width. Below 1200
   a 64px spacer stands in for the fixed header.
5. **The drawer** slides the 230px rail in over a backdrop. The backdrop and the toggle both
   close it.

Pick device presets that straddle 1200, or the three buttons show one layout. `1440 / 1024 / 390`
lands in `xl`, `md` and `xs`.

**Wire the drawer toggle.** Below 1200 the nav is most of what there is to judge.
