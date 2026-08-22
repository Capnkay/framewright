# Studio chrome design tokens — locked

**This is the single source of truth for Framewright's Generator Studio tool chrome**
(`GeneratePage.jsx`, `PreviewPage.jsx` shell/frame, `LandingPage.jsx`, and everything
under `client/src/studio/*.jsx` — upload form, mode selector, generation progress, job
timeline, stage inspector, job history, confidence badges, question prompts).

**This file does not touch `client/src/index.css` or the existing `colors` block in
`client/tailwind.config.js`.** Those are governed by `docs/CONTRACT.md` §6-§8 and stay
completely frozen — nothing below renames, overrides, or shadows `--color-background`,
`--color-card`, `--color-border`, `--color-foreground`, `--color-muted`,
`--color-muted-foreground`, `--color-accent`, `--color-accent-foreground`,
`--color-success`, `--color-warn`, or `--color-destructive`. Everything here lives under a
new `--studio-*` prefix so there is zero collision surface with the graded CMS preview
theming.

**Mode: dark-only.** Cap'n's call, 2026-08-23: the Studio chrome ships dark-only for the
hackathon window — no light-mode toggle. Two of the three inspiration sites (Raycast,
Railway) are fully dark; the third (Vercel) applies the same "never pure black/white"
contrast discipline just inverted. Light values stay recorded below for a future pass,
but `.studio-theme` only ever applies the dark table — no `.light` variant is wired.

**Icons: Lucide** (`lucide-react`, MIT, tree-shakeable). Cap'n's call, 2026-08-23. Use
outline/line icons at the default 1.5–2px stroke; no filled or duotone variants in the
Studio chrome.

**Component variants: improvise, then codify.** Cap'n's call, 2026-08-23: no button/input/
badge variant spec is pre-written. Build the first surface directly from the primitives
below, then whatever button/input/badge/chip variants actually get used should be written
back into a new "Component variants" section here — grounded in a real screen, not a
guess made before anything existed.

Full research and per-site evidence: `docs/VISUAL-INSPO.md`.

---

## 1. Color tokens

### Dark (default)

| Token | Hex | Notes |
|---|---|---|
| `--studio-bg-base` | `#0A0A0C` | Page background. Off-black, never `#000000` (Raycast pattern: `#07080A`). |
| `--studio-bg-raised` | `#141417` | Cards, panels, the upload form surface, job-timeline rows. |
| `--studio-bg-overlay` | `#1C1C21` | Modals, dropdowns, popovers, tooltips — one step above raised. |
| `--studio-border` | `#2A2A31` | Default hairline border on cards/inputs. |
| `--studio-border-strong` | `#3A3A43` | Emphasized borders: active tab, selected row, hovered card. |
| `--studio-text-primary` | `#F5F5F7` | Primary text/headings. Off-white, never `#FFFFFF` on body copy. |
| `--studio-text-secondary` | `#9A9AA3` | Secondary text: descriptions, helper text, inactive labels. |
| `--studio-text-tertiary` | `#6B6B74` | Least emphasis: timestamps, job IDs, captions. |
| `--studio-accent` | `#7C6CF6` | Single accent (muted violet, sourced from Railway's `#553F83` family, lightened for dark-bg contrast). Used for primary CTAs, active states, links, focus rings, progress fill. |
| `--studio-accent-hover` | `#8F82F8` | Accent hover/active state. |
| `--studio-accent-foreground` | `#FFFFFF` | Text/icon color on top of `--studio-accent` fills. |
| `--studio-focus-ring` | `rgba(124, 108, 246, 0.45)` | Focus-visible halo, paired with `--studio-glow-accent` shadow below. |
| `--studio-success` | `#34D399` | Stage-complete / confidence-high badges. |
| `--studio-warn` | `#FBBF24` | Confidence-medium, retry-suggested states. |
| `--studio-destructive` | `#F87171` | Stage-failed, generation-error states. |

### Light (secondary)

| Token | Hex | Notes |
|---|---|---|
| `--studio-bg-base` | `#FAFAFA` | Matches Vercel's verified `#FAFAFA` page background. |
| `--studio-bg-raised` | `#FFFFFF` | Pure white card on the `#FAFAFA` page — the Vercel elevation trick (one step lighter, not a shadow). |
| `--studio-bg-overlay` | `#F3F3F5` | Modals/popovers. |
| `--studio-border` | `#E5E5EA` | Default hairline border. |
| `--studio-border-strong` | `#D4D4DC` | Emphasized borders. |
| `--studio-text-primary` | `#171717` | Matches Vercel's verified body text exactly. Off-black, never `#000000`. |
| `--studio-text-secondary` | `#6B6B74` | Secondary text. |
| `--studio-text-tertiary` | `#8E8E96` | Least emphasis. |
| `--studio-accent` | `#6D5BD0` | Same hue as dark mode, deepened for AA text contrast on white. |
| `--studio-accent-hover` | `#5D4CC0` | Accent hover/active state. |
| `--studio-accent-foreground` | `#FFFFFF` | Text/icon on accent fills. |
| `--studio-focus-ring` | `rgba(109, 91, 208, 0.35)` | Focus-visible halo. |
| `--studio-success` | `#16A34A` | (Deliberately a different exact value from the frozen `--color-success` even though the hue family is similar — no shared variable, no accidental coupling.) |
| `--studio-warn` | `#D97706` | |
| `--studio-destructive` | `#DC2626` | |

Color Consistency Lock: `--studio-accent` (violet) is the **only** accent used anywhere in
the Studio chrome. It never gets swapped for a stray blue or green CTA in a later screen.
Success/warn/destructive are reserved strictly for real state (stage results, confidence
badges) and never used decoratively.

---

## 2. Typography

**Font stack:**
- UI text (body, labels, nav, buttons): `"Inter", "Inter Fallback", -apple-system,
  BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` — self-host via `@fontsource/inter`
  or serve local `.woff2` files with `font-display: swap`; do not link Google Fonts via a
  runtime `<link>` tag. Verified as the exact family on both Raycast and Railway's UI
  chrome; free, open (SIL OFL), no licensing friction for a hackathon.
- Monospace (job IDs, stage logs, element IDs, generation timestamps): `"JetBrains Mono",
  "IBM Plex Mono", ui-monospace, monospace` — same self-hosting approach. Reserved for
  genuinely tabular/code-like content only, not for general labels.
- No serif anywhere in the Studio chrome. Railway's IBM Plex Serif hero is a marketing-page
  choice for one headline; the Studio is a working tool, not a landing page, so it stays
  100% sans + mono per taste-skill's serif discipline (Section 4.1).

**Type scale** (rem, 16px root):

| Token | Size | Line-height | Weight | Use |
|---|---|---|---|---|
| `--studio-text-xs` | `0.75rem` (12px) | `1rem` (16px) | 400 / 500 | Timestamps, badges, captions |
| `--studio-text-sm` | `0.875rem` (14px) | `1.25rem` (20px) | 400 / 500 | Secondary labels, helper text, button labels |
| `--studio-text-base` | `1rem` (16px) | `1.5rem` (24px) | 400 | Body copy, form inputs |
| `--studio-text-lg` | `1.125rem` (18px) | `1.75rem` (28px) | 400 / 500 | Emphasized body, card titles |
| `--studio-text-xl` | `1.25rem` (20px) | `1.75rem` (28px) | 600 | Section headings (e.g. "Job Timeline") |
| `--studio-text-2xl` | `1.5rem` (24px) | `2rem` (32px) | 600 | Panel/page titles |
| `--studio-text-3xl` | `2rem` (32px) | `2.5rem` (40px) | 600 | Studio page title (Generate/Preview shell header) |
| `--studio-text-display` | `2.75rem` (44px) | `3rem` (48px) | 600 | LandingPage.jsx hero only — the one place a larger display size is earned |

Letter-spacing: normal at body sizes; `-0.02em` at `2xl` and above (mirrors Vercel's
tight-tracking-at-scale pattern, applied lightly rather than Vercel's extreme -6%).

---

## 3. Spacing scale

Standard 4px-based scale (rem), consistent with Tailwind's default so it composes cleanly
inside `theme.extend`:

| Token | Value |
|---|---|
| `--studio-space-1` | `0.25rem` (4px) |
| `--studio-space-2` | `0.5rem` (8px) |
| `--studio-space-3` | `0.75rem` (12px) |
| `--studio-space-4` | `1rem` (16px) |
| `--studio-space-5` | `1.5rem` (24px) |
| `--studio-space-6` | `2rem` (32px) |
| `--studio-space-8` | `3rem` (48px) |
| `--studio-space-10` | `4rem` (64px) |
| `--studio-space-12` | `6rem` (96px) |

---

## 4. Border-radius scale

One consistent scale, applied per the Shape Consistency Lock (never mixed arbitrarily):

| Token | Value | Use |
|---|---|---|
| `--studio-radius-sm` | `0.375rem` (6px) | Inputs, chips, small icon buttons — matches Vercel's verified nav-button radius |
| `--studio-radius-md` | `0.5rem` (8px) | Default buttons, form controls — matches Raycast's and Railway's verified CTA radius |
| `--studio-radius-lg` | `0.75rem` (12px) | Cards, panels, the job-timeline container — matches Railway's verified pill radius |
| `--studio-radius-xl` | `1rem` (16px) | Large surfaces: modals, the upload dropzone |
| `--studio-radius-full` | `9999px` | Avatars, status pills, confidence badges |

---

## 5. Shadow / glow scale

Dark mode borrows Raycast's verified inset-highlight technique (a `1px` top-edge
highlight reads as "lit" on a near-black surface without literal blur/glassmorphism);
light mode borrows Vercel's verified tinted ring-plus-soft-shadow stack. Both are real,
computed-style-sourced patterns, not invented ones.

**Dark:**
```css
--studio-shadow-xs: inset 0 1px 0 0 rgba(255, 255, 255, 0.05);
--studio-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.24), inset 0 1px 0 0 rgba(255, 255, 255, 0.05);
--studio-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.32), inset 0 1px 0 0 rgba(255, 255, 255, 0.06);
--studio-shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.40), inset 0 1px 0 0 rgba(255, 255, 255, 0.08);
--studio-glow-accent: 0 0 0 3px var(--studio-focus-ring);
```

**Light:**
```css
--studio-shadow-xs: 0 0 0 1px rgba(23, 23, 23, 0.06);
--studio-shadow-sm: 0 1px 2px rgba(23, 23, 23, 0.06), 0 0 0 1px rgba(23, 23, 23, 0.06);
--studio-shadow-md: 0 4px 12px rgba(23, 23, 23, 0.08), 0 0 0 1px rgba(23, 23, 23, 0.06);
--studio-shadow-lg: 0 12px 32px rgba(23, 23, 23, 0.12), 0 0 0 1px rgba(23, 23, 23, 0.08);
--studio-glow-accent: 0 0 0 3px var(--studio-focus-ring);
```

Shadows are always tinted (toward black in dark mode with a white top-highlight, toward
the near-black text color in light mode) — never a flat, untinted `rgba(0,0,0,X)` drop
shadow with no ring, per taste-skill's materiality rule.

---

## 6. Motion tokens

```css
--studio-duration-instant: 100ms;
--studio-duration-fast: 150ms;
--studio-duration-base: 200ms;
--studio-duration-slow: 320ms;

--studio-ease-standard: cubic-bezier(0.16, 1, 0.3, 1);  /* fast-out, gentle settle — reveals, panel opens */
--studio-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);      /* symmetric — progress bars, width/opacity transitions */
```

**Applied feel** (matches what was actually observed on all three sites — fast and
restrained, never cinematic):

- **Hover (buttons, cards, nav items):** `background-color`/`box-shadow` transition at
  `--studio-duration-fast` with `--studio-ease-standard`. No scale by default; an optional
  `scale(0.98)` only on `:active` (press feedback), never on `:hover`.
- **Focus:** `--studio-glow-accent` box-shadow fades in at `--studio-duration-instant` —
  must feel immediate, not eased.
- **Panel/modal open, stage-inspector expand:** opacity 0→1 + `translateY(8px)→0` at
  `--studio-duration-base` with `--studio-ease-standard`.
- **Job timeline / stage list reveal:** same fade+translateY, staggered 40-60ms per item
  (`transition-delay: calc(var(--index) * 50ms)` or Motion's `staggerChildren`).
- **Generation progress bar / confidence meter fill:** `width` or `transform: scaleX()`
  transition at `--studio-duration-slow` with `--studio-ease-in-out` — smooth and
  continuous, not stepped.
- **Page-load (GeneratePage, PreviewPage shell mount):** single fade-in, `~250ms`, no
  slide, no parallax — matches the "instant" feel both Raycast and Vercel project.
- **Reduced motion:** every transition above must collapse to an immediate state change
  under `prefers-reduced-motion: reduce`, per taste-skill Section 6.B.

---

## 7. How to wire this in

**This file does not touch `client/src/index.css` or the existing `colors` block in
`client/tailwind.config.js`.** The proposal below is additive only, for whoever
implements it next:

1. **`client/src/index.css`** — add a new, separate scope alongside (not inside) the
   existing `:root` / `.dark` blocks, e.g.:
   ```css
   .studio-theme {
     --studio-bg-base: #0A0A0C;
     --studio-bg-raised: #141417;
     /* ...all dark tokens from Section 1... */
   }
   .studio-theme.light {
     --studio-bg-base: #FAFAFA;
     /* ...all light tokens... */
   }
   ```
   Mount `.studio-theme` on the root element of the Studio shell (e.g. the wrapper in
   `GeneratePage.jsx` / the `PreviewPage.jsx` chrome, *not* the CMS-rendered preview
   content inside it) so the two token systems never overlap in the DOM, let alone in
   the stylesheet.

2. **`client/tailwind.config.js`** — add a new `studio` key inside `theme.extend`,
   parallel to but never merged with the existing `colors` block:
   ```js
   theme: {
     extend: {
       colors: { /* existing frozen block — untouched */ },
       studio: {
         bg: {
           base: 'var(--studio-bg-base)',
           raised: 'var(--studio-bg-raised)',
           overlay: 'var(--studio-bg-overlay)',
         },
         border: 'var(--studio-border)',
         borderStrong: 'var(--studio-border-strong)',
         text: {
           primary: 'var(--studio-text-primary)',
           secondary: 'var(--studio-text-secondary)',
           tertiary: 'var(--studio-text-tertiary)',
         },
         accent: 'var(--studio-accent)',
         accentHover: 'var(--studio-accent-hover)',
         accentForeground: 'var(--studio-accent-foreground)',
         success: 'var(--studio-success)',
         warn: 'var(--studio-warn)',
         destructive: 'var(--studio-destructive)',
       },
     },
   }
   ```
   This produces utilities like `bg-studio-bg-base`, `text-studio-text-secondary`,
   `border-studio-border` — visually and namespace-wise unmistakable from the frozen
   `bg-background` / `text-foreground` / `border-border` utilities the CMS preview uses.

3. Spacing, radius, and shadow tokens can be added the same way under `theme.extend.spacing`
   / `theme.extend.borderRadius` / `theme.extend.boxShadow` with a `studio` prefix in the
   key name (e.g. `borderRadius: { 'studio-md': 'var(--studio-radius-md)' }`), or consumed
   directly as CSS custom properties in component-level styles — either is fine, pick one
   convention and use it consistently across all `client/src/studio/*.jsx` files.

4. Fonts: register `Inter` and `JetBrains Mono` via `@fontsource/inter` and
   `@fontsource/jetbrains-mono` (both free, self-hostable, no runtime Google Fonts
   `<link>`), imported once in the Studio shell entry point.
