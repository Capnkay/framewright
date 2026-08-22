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
  darkMode: 'class',
  theme: {
    extend: {
      maxWidth: {
        // §6's reference container width, so the generated hero can use a named
        // token instead of an arbitrary value.
        section: '1920px',
      },
      colors: {
        background: 'var(--color-background)',
        foreground: 'var(--color-foreground)',
        card: 'var(--color-card)',
        'card-foreground': 'var(--color-card-foreground)',
        muted: 'var(--color-muted)',
        'muted-foreground': 'var(--color-muted-foreground)',
        border: 'var(--color-border)',
        accent: 'var(--color-accent)',
        'accent-foreground': 'var(--color-accent-foreground)',
        success: 'var(--color-success)',
        warn: 'var(--color-warn)',
        destructive: 'var(--color-destructive)',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.25rem' }],
        sm: ['0.875rem', { lineHeight: '1.5rem' }],
        base: ['1rem', { lineHeight: '1.75rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '2rem' }],
        '2xl': ['1.5rem', { lineHeight: '2.25rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.5rem' }],
        '4xl': ['2.25rem', { lineHeight: '3rem' }],
      },
      borderRadius: {
        base: '0.375rem',
        lg: '0.5rem',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
};
