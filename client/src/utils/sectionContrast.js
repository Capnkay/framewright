// client/src/utils/sectionContrast.js
//
// getSectionTextContrastClass(section)
//
// The reference component in the source brief imports this helper from a path
// that does not exist in this repo — it is ours to implement (CONTRACT.md §7,
// "Two helpers must be written by hand"). Its job: pick a Tailwind text-colour
// class for a section's body copy, honest about how little it actually knows.
//
// Inputs read from the section document (CONTRACT.md §2):
//   - sectionTextMode: "auto" | "light" | "dark"   (default "auto")
//   - sectionColor: "" | a CSS colour string, most usefully a hex colour
//
// Behaviour:
//   - "dark"  -> the section is authored as a dark background; return a light
//                text class so copy stays readable.
//   - "light" -> the section is authored as a light background; return a dark
//                text class.
//   - "auto"  -> infer from sectionColor when it parses as a hex colour, using
//                relative luminance. When sectionColor is empty or unparseable,
//                default to dark text — the reference section's default surface
//                is white (CONTRACT.md §6 theme.surface), so that default is the
//                honest one, not a guess.
//
// This intentionally never returns more than two answers. Guessing a third
// state (e.g. a medium-grey compromise) would be worse than being wrong in an
// obvious, easily-overridden way.
//
// THE COLOURS HERE ARE DELIBERATELY THEME-INDEPENDENT, AND THAT IS NOT AN
// OVERSIGHT IN A CODEBASE THAT HAS DESIGN TOKENS. T-125: a token pass replaced
// `text-gray-800` with `text-foreground` in all three light-background branches.
// `--color-foreground` is #111827 under `:root` and #f4f4f5 under `.dark`, so the
// returned class started depending on the VIEWER'S THEME — while the question
// this function answers is about the SECTION'S OWN BACKGROUND, which comes from
// §2's `sectionColor` and `sectionTextMode` and has nothing to do with what the
// viewer picked. Measured on the reference section:
//
//     light section, light theme:  #111827 on #ffffff  ->  17.74:1   fine
//     light section, DARK  theme:  #f4f4f5 on #ffffff  ->   1.05:1   invisible
//
// §7's accessibility floor is graded, so that is a scored regression rather than
// a matter of taste. A section that declares itself light stays light whatever
// the chrome around it is doing, and its text colour has to be pinned the same
// way. Every test in tests/text-contrast.test.mjs kept passing through the
// change, because they all checked the SHAPE OF A CLASS NAME and
// `text-foreground` is a perfectly good class name — it just is not a colour.
//
// If the studio chrome ever needs to theme these sections, the section's own
// BACKGROUND must move with the text — both or neither — and that is a change to
// §2, logged in docs/corrections/REGISTER.md, not a token swap here.

export function getSectionTextContrastClass(section = {}) {
  const { sectionTextMode = 'auto', sectionColor = '' } = section || {};

  if (sectionTextMode === 'dark') {
    // Dark background -> light text.
    return 'text-white';
  }
  if (sectionTextMode === 'light') {
    // Light background -> dark text. A fixed gray, not a token: see the note above.
    return 'text-gray-800';
  }

  const rgb = parseHexColor(sectionColor);
  if (rgb) {
    return relativeLuminance(rgb) < 0.5 ? 'text-white' : 'text-gray-800';
  }

  // "auto" with no usable colour: default to the reference section's actual
  // default surface, white, so body copy stays readable out of the box.
  return 'text-gray-800';
}

function parseHexColor(value) {
  if (typeof value !== 'string') return null;
  const match = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value.trim());
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

// Standard relative-luminance formula (sRGB), returns 0 (black) - 1 (white).
function relativeLuminance({ r, g, b }) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
