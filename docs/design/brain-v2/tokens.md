# Brain v2 — design tokens (Orbit & Mono × dark/light)

The site sets the mode with `document.documentElement.dataset.theme` (`dark` | `light`, see `src/theme.js`). The Brain style is a second attribute on the Brain root, `data-brain-style="orbit" | "mono"`. Every combination defines the same set of custom properties, so components only ever read `var(--b-*)`.

```css
/* scope: .brain[data-brain-style="…"] under :root[data-theme="…"] */
```

Mockups for each combination:

| combination | frames |
|---|---|
| orbit-dark | `C-dark-*` |
| orbit-light | `C-*` |
| mono-dark | `A-*` |
| mono-light | `A-light-*` |

The generators read their colours from these same values (`_src/genC.mjs` with `ORBIT_THEME=dark`, and `_src/genA.mjs` with `MONO_THEME=light`).

## Token meanings

| token | meaning |
|---|---|
| `--b-bg` | page background |
| `--b-surface` | the only "raised" fill: config bar, keycaps, chart bands, focus row. Never a bordered card. |
| `--b-surface-2` | second, rarer fill: inactive option buttons, penalty wash |
| `--b-ink` | primary text, the big clock, finished arcs/segments (Orbit) |
| `--b-muted` | secondary text; passes WCA AA 4.5:1 on bg and surface |
| `--b-faint` | decorative text only: ghost `~avg` labels, dimmed chrome while solving. Exempt from AA (see exceptions). |
| `--b-accent` | brand accent for graphics: current arc/segment fill, live dot, filled bars |
| `--b-accent-text` | accent when used as small text (AA-safe) |
| `--b-accent-soft` | tinted fill behind accent text (pills, keycaps) |
| `--b-on-accent` | text/icon on a solid accent fill |
| `--b-good` | faster than your average |
| `--b-warn` | slower than average, overtime, wrong turn (graphic) |
| `--b-warn-text` | the same as small text |
| `--b-plus2` | +2 zone / +2 marker |
| `--b-plus2-soft` | +2 zone band at rest |
| `--b-dnf` | DNF sector, DNF text |
| `--b-track` | timeline track: future arcs and segments |
| `--b-fill` | a completed arc/segment |
| `--b-fill-live` | the current arc/segment |
| `--b-cube-body` | plastic colour of the 3D cube |
| `--b-cube-shadow` | contact shadow under the cube |
| `--b-cube-glow` | ambient glow under the cube (dark modes only) |

## orbit-dark (priority)

```css
:root[data-theme="dark"] .brain[data-brain-style="orbit"] {
  --b-bg: #141311;            /* warm ink, not pure black */
  --b-canvas: #0d0c0b;        /* behind device frames / outside the app column */
  --b-surface: #1d1b18;
  --b-surface-2: #2b2925;
  --b-ink: #ece6d8;           /* paper-cream text */
  --b-muted: #9a9486;
  --b-faint: #6d675c;
  --b-accent: #3dbfad;        /* brand teal, lifted for dark */
  --b-accent-text: #3dbfad;
  --b-accent-soft: #16403a;
  --b-on-accent: #0b1f1c;
  --b-good: #3dbfad;
  --b-warn: #e6a642;
  --b-warn-text: #e6a642;
  --b-plus2: #e6a642;
  --b-plus2-soft: #4d3715;
  --b-dnf: #ec6b5f;
  --b-track: #34312b;         /* future arcs, 3 px */
  --b-fill: #ece6d8;          /* finished arcs, 6 px */
  --b-fill-live: #3dbfad;     /* current arc, 8 px + leading dot */
  --b-hairline: #34312b;
  --b-cube-body: #1d1b18;     /* dark plastic that still separates from the bg */
  --b-cube-shadow: 0 0 0 transparent; /* SVG: ellipse #000 @ 35 %, rx .78s ry .10s */
  --b-cube-glow: radial-gradient(closest-side, rgb(61 191 173 / .22), rgb(61 191 173 / .07) 55%, transparent);
  --b-key-bg: #2b2925;  --b-key-ink: #d9d2c3;
}
```

## orbit-light

```css
:root[data-theme="light"] .brain[data-brain-style="orbit"] {
  --b-bg: #f3f0e8;            /* paper */
  --b-canvas: #e9e4d8;
  --b-surface: #ebe6da;
  --b-surface-2: #e6e0d3;
  --b-ink: #1c1b18;
  --b-muted: #65605a;         /* mockups use #8a857a — see exceptions */
  --b-faint: #b3ad9f;
  --b-accent: #0a7d71;        /* brand teal */
  --b-accent-text: #07695e;
  --b-accent-soft: #d3e6e1;
  --b-on-accent: #ffffff;
  --b-good: #0a7d71;
  --b-warn: #c77700;
  --b-warn-text: #9a5c00;
  --b-plus2: #c77700;
  --b-plus2-soft: #f1dcb4;
  --b-dnf: #c8372d;
  --b-track: #dcd6c8;
  --b-fill: #1c1b18;
  --b-fill-live: #0a7d71;
  --b-hairline: #dcd6c8;
  --b-cube-body: #1c1b18;
  --b-cube-shadow: 0 0 0 transparent; /* SVG: ellipse #1c1b18 @ 7 % */
  --b-cube-glow: none;
  --b-key-bg: #37352f;  --b-key-ink: #e9e4d8;
}
```

## mono-dark

```css
:root[data-theme="dark"] .brain[data-brain-style="mono"] {
  --b-bg: #16171b;
  --b-canvas: #101114;
  --b-surface: #1f2126;
  --b-surface-2: #1f2126;
  --b-ink: #d9d6cb;
  --b-muted: #8a8e99;         /* mockups use #6b6f7a — see exceptions */
  --b-faint: #6b6f7a;
  --b-accent: #e7b34c;        /* amber */
  --b-accent-text: #e7b34c;
  --b-accent-soft: #6b5424;
  --b-on-accent: #16171b;
  --b-good: #e7b34c;          /* Mono has one accent: faster = accent */
  --b-warn: #e0675e;          /* slower / overtime / wrong turn = error */
  --b-warn-text: #e0675e;
  --b-plus2: #e0675e;
  --b-plus2-soft: #5a2d2a;
  --b-dnf: #e0675e;           /* DNF = hatched error */
  --b-track: #34373f;         /* 6 px lanes */
  --b-fill: #e7b34c;
  --b-fill-live: #e7b34c;     /* + 3×22 px caret */
  --b-hairline: #34373f;
  --b-cube-body: #0b0c0e;
  --b-cube-shadow: none;
  --b-cube-glow: none;
  --b-key-bg: #1f2126;  --b-key-ink: #d9d6cb;
}
```

## mono-light

```css
:root[data-theme="light"] .brain[data-brain-style="mono"] {
  --b-bg: #f1eee6;
  --b-canvas: #e4e0d6;
  --b-surface: #e8e5dc;
  --b-surface-2: #e8e5dc;
  --b-ink: #2b2a27;
  --b-muted: #625f58;
  --b-faint: #cbc6ba;
  --b-accent: #8a5e07;        /* amber darkened to bronze for AA */
  --b-accent-text: #8a5e07;
  --b-accent-soft: #f3e6c4;
  --b-on-accent: #f1eee6;
  --b-good: #8a5e07;
  --b-warn: #b8392f;
  --b-warn-text: #b8392f;
  --b-plus2: #b8392f;
  --b-plus2-soft: #f7e0db;
  --b-dnf: #b8392f;
  --b-track: #cbc6ba;
  --b-fill: #8a5e07;
  --b-fill-live: #8a5e07;
  --b-hairline: #cbc6ba;
  --b-cube-body: #1b1c1f;
  --b-cube-shadow: none;
  --b-cube-glow: none;
  --b-key-bg: #e8e5dc;  --b-key-ink: #2b2a27;
}
```

## Cube sticker palettes (shared by both modes)

```css
/* Orbit: vivid, stickers shaded F ×0.86, R ×0.72 */
--b-st-w: #f4f4f0; --b-st-y: #ffd43b; --b-st-g: #16a34a; --b-st-b: #2563eb; --b-st-r: #e5302b; --b-st-o: #ff7a1a;
/* Mono: muted so the single accent wins, stickers shaded F ×0.84, R ×0.68 */
--b-st-w: #e8e6de; --b-st-y: #f2c94c; --b-st-g: #3fa66a; --b-st-b: #3d6fd6; --b-st-r: #d9534a; --b-st-o: #e98a3c;
```

## Fonts

```css
--b-font-sans: 'Manrope Variable', 'Manrope', system-ui, -apple-system, 'Segoe UI', sans-serif; /* @fontsource-variable/manrope */
--b-font-mono: 'DM Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;            /* @fontsource/dm-mono 300/400/500 */
--b-num: tabular-nums;  /* font-variant-numeric on every changing number */
```

- **Orbit:** Manrope for words and big numbers; DM Mono for moves, splits, labels and keycaps.
- **Mono:** DM Mono only.

## Type scale (desktop / phone)

| token | Orbit | Mono |
|---|---|---|
| `--b-fs-clock` (running timer) | Manrope 300, 168 / 112 px, −4 px tracking | DM Mono 300, 168 / 104 px, −4 px tracking |
| `--b-fs-countdown` | Manrope 300, 220 / 132 px | DM Mono 300, 168 / 132 px |
| `--b-fs-result` | Manrope 300, 120 / 72 px | DM Mono 300, 80 / 68 px |
| `--b-fs-step` (current step) | Manrope 700, 34 / 26 px | DM Mono 400, 14 / 13 px, accent |
| `--b-fs-stat` | Manrope 600, 22–28 px | DM Mono 300, 26–36 px |
| `--b-fs-move` (scramble) | DM Mono 30 px | DM Mono 36 px |
| `--b-fs-body` | Manrope 500, 13–16 px | DM Mono 400, 13–16 px |
| `--b-fs-split` | DM Mono 13–15 px | DM Mono 15 px |
| `--b-fs-label` | DM Mono 12–13 px, lowercase | DM Mono 11–12 px, lowercase |

## Radii, strokes, spacing

| token | Orbit | Mono |
|---|---|---|
| `--b-radius-key` | 6 px | 4 px |
| `--b-radius-control` | 999 px (pill buttons, tags) | 6 px (option buttons), 8 px (config bar, start button) |
| `--b-radius-phone-sheet` | 46 px | 44 px |
| track / fill / live stroke | ring: 3 / 6 / 8 px; ring radius 230–260 desktop, about 110 phone | lane: 6 px track, live caret 3×22 px, inspection lane 6 px |
| gaps | 3° between arcs | 6 px between segments, 16 px between groups |
| `--b-space` | 8 px grid | 8 px grid |

## WCAG AA contrast (4.5:1 for normal text; 3:1 for graphics and large text)

All ratios are measured against `--b-bg` unless a surface is named.

| combination | ink | muted | accent-text | warn-text | dnf | on-accent |
|---|---|---|---|---|---|---|
| orbit-dark | 14.9 | 6.2 (5.7 on surface) | 8.2 | 8.8 | 6.0 | 7.5 |
| orbit-light | 15.1 | 5.5 (4.9 on surface) | 5.8 | 4.7 | 4.6 | 5.0 (white on teal) |
| mono-dark | 12.3 | 5.5 (4.9 on surface) | 9.3 (8.4 on surface) | 5.4 | 5.4 | 9.3 |
| mono-light | 12.4 | 5.5 (5.1 on surface) | 4.9 (4.5 on surface) | 4.9 | 4.9 | 4.9 |

Graphics (arcs, segment fills, the live dot) all clear 3:1: teal 4.4 (light) / 8.2 (dark), amber 9.3 (mono-dark), bronze 4.9 (mono-light).

### Exceptions and deliberate deviations
1. **The mockups use slightly lighter "muted" text than these tokens.** Orbit-light used `#8a857a` (3.2:1) and mono-dark used `#6b6f7a` (3.6:1, monkeytype's own sub colour). Both fail AA for small text, so the tokens above darken `--b-muted`, to `#65605a` and `#8a8e99` respectively. The old values survive as `--b-faint`.
2. **Orbit-light accent and amber as text.** The brand teal `#0a7d71` measures 4.4:1, which is just under AA for small text, and amber `#c77700` measures 3.0:1. Both are fine as graphics. For small text use `--b-accent-text: #07695e` and `--b-warn-text: #9a5c00`.
3. **`--b-faint` is decorative only and is exempt from AA:** 2.0:1 in orbit-light, 3.3:1 in orbit-dark, 1.5:1 in mono-light. It is used for ghost `~avg` pace labels and the idle `0.00`. Never put required information in it.
4. **The track colours are 1.3–1.5:1.** They mark the not-yet-reached part of the timeline, which is an inactive state; the meaningful fills all clear 3:1. The +2 zone at rest (`--b-plus2-soft`) is likewise decorative, and its meaning is always also given in text ("+2", "DNF in 1.2 s").
5. **Chrome dims to 35 % opacity while solving (Mono)**, so the top bar and config bar fall below AA during a solve. This is intentional focus mode (as in monkeytype), and they return to full contrast on results and idle.
6. **Text on soft fills:**
   - Mono-dark's accent on `--b-accent-soft` keycaps measures 3.75:1, and error text on the error-soft recovery tag measures 3.4:1. For these use `--b-ink` for the key glyph, or keep them at ≥ 18 px (the recovery `L2` is 18 px medium and uses ink).
   - Mono-light's accent on `--b-accent-soft` measures 4.3:1, so use ink for small keycap glyphs.
7. **Cube stickers are not text.** White and yellow stickers on light backgrounds are low contrast, but the cube body outline (`--b-cube-body`) provides the edge.
