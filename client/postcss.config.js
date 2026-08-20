// client/postcss.config.js
//
// Tailwind v3 runs as a PostCSS plugin, so this file is what makes the
// @tailwind directives in src/index.css do anything. Without it Vite serves the
// stylesheet verbatim, the directives never expand, and every page renders with
// no styling at all — while the build reports success.

export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
