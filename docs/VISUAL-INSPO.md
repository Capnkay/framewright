# Visual inspiration — Studio chrome design research

Scope note: this research is for Framewright's own **Generator Studio tool chrome**
(`GeneratePage.jsx`, `PreviewPage.jsx` shell, `LandingPage.jsx`, `client/src/studio/*.jsx`)
only. It has zero bearing on the frozen CMS preview theming system governed by
`docs/CONTRACT.md` §6-§8 (`client/src/index.css` `:root`/`.dark`, `client/tailwind.config.js`
`colors` block). That system was not opened or touched during this research.

Method: live browser pass (Playwright), homepage + one secondary page per site, computed
styles pulled via `getComputedStyle` where noted **VERIFIED**. Anything read only from a
screenshot is marked **REPORTED** (approximate). Raycast's marketing homepage
(`raycast.com`, bare domain) redirected to unrelated third-party content inside this
sandbox on two separate attempts; `https://www.raycast.com/` and
`https://www.raycast.com/store` both loaded correctly and are the source for all Raycast
data below.

---

## 1. Raycast (raycast.com)

Pages checked: homepage (`/`), Store (`/store`).

**Color** — VERIFIED via computed styles:
- Page background: `rgb(7, 8, 10)` = `#07080A` (off-black, not pure `#000000`)
- Primary text: `rgb(255, 255, 255)` = `#FFFFFF`
- Light-style CTA ("Download"): background `rgb(230, 230, 230)` = `#E6E6E6`, text
  `rgb(47, 48, 49)` = `#2F3031`
- Dark-style CTA ("Install Extension"): transparent fill, `1px` inset ring
  `rgba(255,255,255,0.25)`, text white
- Hero accent: REPORTED — a large diagonal red-to-near-black gradient band with visible
  film-grain/noise texture behind the headline (`#ef4444`-ish red core fading to black,
  sampled visually, not a flat computed color since it's a gradient/noise image layer)

**Typography** — VERIFIED:
- Font family everywhere checked: `Inter, "Inter Fallback", sans-serif` (both homepage and
  Store use Inter, not a custom display face)
- H1 (homepage hero): `64px` / line-height `70.4px` (1.1), weight `600`, letter-spacing
  normal
- H1 (Store page): `80px` / line-height `86px`, weight `600`, letter-spacing `1.2px`
  (looser tracking on the larger display size)
- Subtext: `18px`, weight `400`, letter-spacing `0.2px`
- Button label: `14px`, weight `500`, letter-spacing `0.2px`

**Spacing / radius** — VERIFIED:
- Buttons: `border-radius: 8px`, padding `8px 12px`
- Feature/extension cards: `border-radius: 10px`, padding `32px`
- Icon tiles (app grid): `border-radius: 20px`

**Shadow / layering** — VERIFIED, this is Raycast's signature move:
- CTA button box-shadow: `rgba(0,0,0,0.5) 0 0 0 2px, rgba(255,255,255,0.19) 0 0 14px 0,
  rgba(0,0,0,0.2) 0 -1px 0.4px inset, rgb(255,255,255) 0 1px 0.4px inset` — a dark outer
  ring plus a soft outer glow plus a **1px inset top highlight**, which is what makes
  buttons on a near-black background read as subtly "lit" / glassy without literal
  glassmorphism blur.
- Cards use the same pattern at lower intensity: `rgba(255,255,255,0.05) 0 1px 0 inset`
  (a hairline top-edge highlight, nothing else).

**Motion** — REPORTED (observed, not measured): hover states on cards/buttons are fast and
subtle — a slight brightness/ring shift, no scale or slide. Page load has a quick fade-in
on the hero; no scroll-hijacking or pinned sections encountered on the two pages checked.
The overall feel is "instant," consistent with a product whose whole pitch is speed.

---

## 2. Vercel (vercel.com)

Page checked: homepage (`/`).

**Color** — VERIFIED via computed styles:
- Page background: `rgb(250, 250, 250)` = `#FAFAFA` (off-white, light mode)
- Primary text: `rgb(23, 23, 23)` = `#171717` (off-black, not pure `#000000`)
- Primary CTA ("Sign Up"): background `#171717`, text `#FFFFFF`
- Secondary CTA ("Get a Demo"): background `#FFFFFF`, text `#171717`, no visible border
  color but a `1px` ring via box-shadow `rgba(0,0,0,0.08...) 0 0 0 1px` equivalent —
  see shadow notes below
- Card surface: `#FFFFFF` on the `#FAFAFA` page background (one step lighter, not
  identical — this is how elevation reads without a visible border)

**Typography** — VERIFIED:
- Font family: `GeistSans, "GeistSans Fallback"` everywhere (body, header, nav, h1) — a
  proprietary Vercel typeface, not directly reusable, but the **shape** it produces
  (tight, geometric grotesque, aggressive negative tracking at display size) is the
  transferable signal
- H1: `64px` / line-height `64px` (1.0, tighter than Raycast's 1.1), weight `400`
  (regular weight at huge size, not bold), letter-spacing `-3.84px` (very tight, about
  -6% of font size)
- CTA label: `14px`-`16px`, weight `500`, normal letter-spacing

**Spacing / radius** — VERIFIED:
- Small nav-level buttons: `border-radius: 6px`
- Larger hero CTAs: `border-radius: 8px`
- Cards: `border-radius: 6px`

**Shadow / layering** — VERIFIED, a second distinct approach from Raycast's inset-glow:
- Secondary CTA / cards use a **compound ring stack**, e.g.:
  `rgba(0,0,0,0) 0 0 0 0 ×4, rgba(0,0,0,0.08) 0 0 0 1px, rgba(0,0,0,0.02) 0 1px 1px,
  rgba(0,0,0,0.04) 0 4px 8px, rgb(250,250,250) 0 0 0 1px, rgb(255,255,255) 0 0 0 1px`
  — several stacked near-zero shadows that resolve to a crisp `1px` hairline ring plus a
  very soft, low-opacity drop shadow tinted toward the page background color (not pure
  black). This is the "tinted shadow, not pure black" rule taste-skill calls out, executed
  literally by a real product.
- No inset highlights on Vercel (unlike Raycast) — the elevation cue is entirely the ring
  + soft shadow, appropriate for a light background.

**Motion** — REPORTED: hero has an animated radial glow/particle cluster (soft grayscale
dot constellation forming a triangle) that appears to breathe/shift slowly and
continuously — low-amplitude, ambient, not attention-grabbing. Button hovers appeared to
be simple, fast opacity/background shifts. Overall restrained; motion supports the
"serious infrastructure" tone rather than a playful one.

---

## 3. Railway (railway.app → redirects to railway.com)

Page checked: homepage (`/`).

**Color** — VERIFIED via computed styles:
- Page background: `rgb(19, 17, 28)` = `#13111C` (dark, with a cool violet undertone —
  not neutral black/zinc)
- Primary text: `rgb(255, 255, 255)` = `#FFFFFF`; secondary text `rgb(247,247,248)` =
  `#F7F7F8`
- Primary CTA ("Deploy"): background `rgb(85, 63, 131)` = `#553F83` (a muted, desaturated
  violet — not a neon/saturated AI-purple), text white
- Secondary CTA ("Deploy" button variant): background `rgb(41, 24, 57)` = `#291839`
  (darker violet, near-background), text `#F7F7F8`
- Tertiary pill ("Mobile app is now available"): background `rgb(28, 26, 40)` = `#1C1A28`

**Typography** — VERIFIED:
- Body/nav font: `Inter` (same family as Raycast)
- **H1 uses a serif**: `"IBM Plex Serif", Georgia, ...`, `54px` / line-height `60.48px`
  (1.12), weight `500`, letter-spacing `-1.96px` (tight for a serif, gives it a more
  "designed" than "editorial" feel). This is the one inspiration site that breaks from
  pure sans-serif, and it's a deliberate brand choice (Railway pairs Plex Serif headlines
  with Inter UI text throughout their marketing site) rather than an accident.

**Spacing / radius** — VERIFIED:
- Primary/secondary CTAs: `border-radius: 8px`, padding `12px 24px`
- Tertiary pill: `border-radius: 12px`, padding `16px 24px`

**Shadow / layering** — VERIFIED: buttons carry `box-shadow: none` — Railway's elevation
model is almost entirely **color-step based** (background steps from `#13111C` →
`#1C1A28` → `#291839` → `#553F83` as violet-tinted surfaces get "closer" to the viewer)
rather than shadow-based. This is a third distinct elevation strategy from Raycast
(inset-highlight) and Vercel (ring + soft shadow).

**Illustration / texture** — REPORTED: the hero background is a hand-illustrated
night-sky scene (stars, soft clouds) rendered in muted violet/navy tones behind the
headline, and the page embeds a real product screenshot (an actual "New Project" dashboard
panel, not a div-based fake) directly below the fold. Distinctive brand personality (calm,
slightly whimsical, "peaceful") layered onto an otherwise standard dark developer-tool
palette.

**Motion** — REPORTED: nothing aggressive observed on first paint; the illustrated sky
appears static or very slowly drifting. The product screenshot panel below the hero reads
as a static, real UI capture rather than an animated demo.

---

## Synthesis: the shared design language

All three sites are dark-leaning or dark-primary (Raycast and Railway are fully dark;
Vercel's marketing homepage is light but its own product UI and countless surfaces
elsewhere on the same domain are dark, and its button/text contrast logic — near-black,
never pure black, `#171717` not `#000000` — is identical to the dark sites' "never pure
black/white" discipline just inverted). None of the three uses a loud, saturated accent
as a page-wide wash; each picks exactly **one** accent (Raycast: red/coral, used sparingly
in the hero graphic and small brand marks; Vercel: none, pure grayscale with the "accent"
being the CTA's own inverted black/white contrast; Railway: a single muted violet family
used consistently across all three CTA tiers). Type is almost always Inter or an
Inter-shaped grotesque at UI sizes (14-18px, weight 400-500) with a much larger, tighter
display face reserved for exactly one hero headline per page (Raycast: bold Inter at
64-80px; Vercel: GeistSans at 64px with extreme negative tracking; Railway: IBM Plex
Serif at 54px, the one outlier, used with intent rather than as a default). Elevation is
never a plain drop shadow: each site earns depth a different way — Raycast's inset
top-highlight glass edge, Vercel's tinted ring-plus-soft-shadow stack, Railway's
background-color stepping — but all three share the underlying rule taste-skill names
explicitly: **shadows are tinted, never pure black, and radius is picked once (6-12px)
and applied consistently, never mixed with sharp corners elsewhere on the same page.**
Motion across all three is restrained: fast, subtle hover feedback, no scroll-hijacking,
no cinematic reveals — speed and calm read as more "premium developer tool" than
spectacle does. This is the throughline Framewright's Studio chrome should borrow: a
near-black (never pure-black) base, exactly one accent used with restraint, Inter for UI
text, a single consistent radius and shadow language, and motion that is felt but never
performed.
