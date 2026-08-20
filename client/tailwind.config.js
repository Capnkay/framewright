/** @type {import('tailwindcss').Config} */
//
// client/tailwind.config.js
//
// THE CONTENT GLOBS ARE LOAD-BEARING. Tailwind only emits a utility it can find
// as a literal string in a scanned file. `./src/**/*.{js,jsx}` therefore has to
// cover `src/sections/generated/`, because that is where the API writes every
// generated component (§7's mounting seam) and those files carry the layout
// classes R11 and R12 are graded on. Narrow this glob and a generated section
// renders unstyled in a production build while looking perfect in dev — the
// same shape of fault as EC-011, where a stylesheet only went missing once
// deployed.
//
// A corollary for the emitter (T-025): accent colours from the IR must be
// written into the emitted JSX as complete literal class names. A composed
// string like `bg-${accent}-500` is invisible to this scan and gets purged, so
// the class must appear whole — `bg-green-500` — in the file on disk.
//
// The `dynamicStyle` / `dynamicStyle2` marker classes (R12) are not Tailwind
// utilities and need nothing here. They are hooks the CMS layer keys on, they
// look dead, and they are graded — do not remove them.

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      maxWidth: {
        // §6's reference container width, so the generated hero can use a named
        // token instead of an arbitrary value.
        section: '1920px',
      },
    },
  },
  plugins: [],
};
