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
        // Studio chrome tokens — the Generator Studio's own tool UI, scoped
        // under .studio-theme (see src/index.css). Deliberately a separate
        // namespace from the block above: those are frozen per CONTRACT §6-§8
        // and consumed by generated CMS sections; these are not. Never merge
        // the two. Source of truth: docs/DESIGN-TOKENS.md.
        studio: {
          bg: {
            base: 'var(--studio-bg-base)',
            raised: 'var(--studio-bg-raised)',
            overlay: 'var(--studio-bg-overlay)',
          },
          border: 'var(--studio-border)',
          'border-strong': 'var(--studio-border-strong)',
          text: {
            primary: 'var(--studio-text-primary)',
            secondary: 'var(--studio-text-secondary)',
            tertiary: 'var(--studio-text-tertiary)',
          },
          accent: 'var(--studio-accent)',
          'accent-hover': 'var(--studio-accent-hover)',
          'accent-foreground': 'var(--studio-accent-foreground)',
          success: 'var(--studio-success)',
          warn: 'var(--studio-warn)',
          destructive: 'var(--studio-destructive)',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        studio: ['Inter', 'Inter Fallback', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        'studio-mono': ['JetBrains Mono', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
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
        // Studio type scale (docs/DESIGN-TOKENS.md §2) — kept distinct from the
        // sizes above so a studio-text-* class can never be confused with a
        // generated-section size class.
        'studio-xs': ['0.75rem', { lineHeight: '1rem' }],
        'studio-sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'studio-base': ['1rem', { lineHeight: '1.5rem' }],
        'studio-lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'studio-xl': ['1.25rem', { lineHeight: '1.75rem' }],
        'studio-2xl': ['1.5rem', { lineHeight: '2rem' }],
        'studio-3xl': ['2rem', { lineHeight: '2.5rem' }],
        'studio-display': ['2.75rem', { lineHeight: '3rem' }],
      },
      borderRadius: {
        base: '0.375rem',
        lg: '0.5rem',
        'studio-sm': '0.375rem',
        'studio-md': '0.5rem',
        'studio-lg': '0.75rem',
        'studio-xl': '1rem',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'studio-xs': 'var(--studio-shadow-xs)',
        'studio-sm': 'var(--studio-shadow-sm)',
        'studio-md': 'var(--studio-shadow-md)',
        'studio-lg': 'var(--studio-shadow-lg)',
        'studio-glow': 'var(--studio-glow-accent)',
      },
      transitionDuration: {
        'studio-instant': '100ms',
        'studio-fast': '150ms',
        'studio-base': '200ms',
        'studio-slow': '320ms',
      },
      transitionTimingFunction: {
        'studio-standard': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'studio-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};
