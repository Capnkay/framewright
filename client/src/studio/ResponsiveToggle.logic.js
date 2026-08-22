// client/src/studio/ResponsiveToggle.logic.js
//
// The pure, dependency-free part of ResponsiveToggle.jsx, in its own module so
// it is unit-testable with a bare `node --test` run, without React installed —
// the same split used across the Studio surfaces.
//
// WHY THE PREVIEW IS FRAMED, AND NOT JUST NARROWED
//
// R11's rule is that the section is two columns on desktop and stacked on
// mobile, which the golden component expresses as `flex-col md:flex-row`
// (client/src/sections/generated/HeroSection.jsx, asserted by
// tests/hero-section-mount.test.mjs). Tailwind's `md:` compiles to
// `@media (min-width: 768px)`, and a media query is evaluated against the
// VIEWPORT, never against the width of an ancestor element.
//
// So constraining a <div> to 375px does not put the page into its mobile
// layout. On a desktop browser it renders a 375px-wide box that is still two
// columns, each about 180px across — squeezed, not stacked. It looks like a
// responsive toggle and demonstrates the opposite of R11.
//
// Giving the preview its own viewport is what actually flips the media query,
// so `width` here is an iframe width, not a max-width on a container.

export const VIEWPORT_MODES = {
  desktop: {
    id: 'desktop',
    label: 'Desktop',
    // Full width of the pane; comfortably past the 768px md: breakpoint.
    width: '100%',
    classes: 'w-full',
  },
  mobile: {
    id: 'mobile',
    label: 'Mobile',
    // Below 768px, so `md:` does not apply and the section stacks.
    width: '375px',
    classes: 'w-full max-w-[375px] mx-auto border-x border-border',
  },
};

export function getModeConfig(modeId) {
  return VIEWPORT_MODES[modeId] || VIEWPORT_MODES.desktop;
}

// Tailwind's default `md` breakpoint. Kept here so the assertion below is
// checking a real number rather than restating a magic value.
export const MD_BREAKPOINT_PX = 768;

/**
 * Does this mode actually put the preview into its mobile layout?
 * True only when the frame is narrower than the `md:` breakpoint — which is the
 * whole difference between a responsive toggle and a narrow box.
 */
export function stacksAtBreakpoint(modeId) {
  const { width } = getModeConfig(modeId);

  // Only a pixel width is comparable to a pixel breakpoint. A relative width
  // ('100%', 'auto') means "as wide as the pane", which on any real screen is
  // past the breakpoint. Note parseInt('100%') is 100, not NaN — trusting
  // Number.isFinite alone would call the desktop pane a 100px phone.
  const px = /^\d+(\.\d+)?px$/.test(String(width).trim())
    ? Number.parseFloat(width)
    : null;

  if (px === null) return false;
  return px < MD_BREAKPOINT_PX;
}
