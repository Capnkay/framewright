// client/src/studio/Composer.jsx
//
// The single generation-input surface: one card, one mode-appropriate primary
// input, naming fields demoted to a disclosure. Replaces the pattern of
// ModeSelector.jsx routing between UploadForm.jsx and a duplicated
// TextModeForm — see docs/SURFACE-INSPO.md §1-2 for the reasoning (Stitch and
// Figma Make both treat mode + primary input as one composer, not a settings
// row above a separate form).
//
// Styled with the Studio chrome token set (docs/DESIGN-TOKENS.md) via the
// `studio-*` Tailwind namespace and the `.studio-theme` CSS scope — entirely
// separate from the `--color-*` tokens CONTRACT.md §6-§8 freezes for generated
// sections. This component renders none of that frozen system.
//
// Not yet wired into GeneratePage.jsx / ModeSelector.jsx — first reviewed in
// isolation via routes/DesignPreview.jsx before it replaces anything live.

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutTemplate, Upload, ChevronDown, ArrowRight } from 'lucide-react';

import { MODES, visibleInputsFor } from './ModeSelector.logic.js';
import { buildFormData } from './CodePromptInputs.logic.js';
import { validateFile } from './UploadForm.logic.js';

// docs/DESIGN-TOKENS.md §6 — easeOutExpo, matches --studio-ease-standard.
const EASE_STANDARD = [0.16, 1, 0.3, 1];

const MODE_LABELS = {
  wireframe: 'Wireframe',
  code: 'Code',
  prompt: 'Prompt',
  combined: 'Combined',
};

const MODE_TITLES = {
  wireframe: 'Generate from a wireframe',
  code: 'Generate from code',
  prompt: 'Generate from a prompt',
  combined: 'Generate from code and a prompt',
};

const EXAMPLE_PROMPTS = [
  'A hero section for a SaaS launch — headline, subhead, and one CTA button',
  'A three-tier pricing table with the middle plan highlighted',
  'A testimonial section: avatar, quote, name, and a star rating',
];

export default function Composer({ onSubmit }) {
  const [mode, setMode] = useState('prompt');
  const [pageName, setPageName] = useState('Home');
  const [sectionName, setSectionName] = useState('Custom');
  const [code, setCode] = useState('');
  const [prompt, setPrompt] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);

  const visible = visibleInputsFor(mode);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (visible.wireframe) {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);
      const formData = new FormData();
      formData.append('mode', 'wireframe');
      formData.append('wireframe', file);
      formData.append('pageName', pageName.trim() || 'Home');
      formData.append('sectionName', sectionName.trim() || 'Custom');
      if (prompt) formData.append('prompt', prompt);
      onSubmit?.(formData);
      return;
    }

    const result = buildFormData({
      code: visible.code ? code : '',
      prompt: visible.prompt ? prompt : '',
      pageName,
      sectionName,
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    onSubmit?.(result.formData);
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: EASE_STANDARD }}
      className="w-full max-w-2xl rounded-studio-lg border border-studio-border bg-studio-bg-raised p-6 font-studio text-studio-text-primary shadow-studio-sm"
    >
      {/* Header: title + segmented mode control, one row — the mode choice is
          the primary decision (it changes which fields exist at all), so it
          gets the same visual weight as the heading, not a settings row above it. */}
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <LayoutTemplate className="h-4 w-4 shrink-0 text-studio-text-tertiary" strokeWidth={1.75} />
          <h2 className="truncate text-studio-lg font-medium">{MODE_TITLES[mode]}</h2>
        </div>
        <div
          role="radiogroup"
          aria-label="Generation mode"
          className="flex items-center gap-0.5 self-start rounded-studio-md bg-studio-bg-overlay p-1"
        >
          {MODES.map((m) => (
            <motion.button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => { setMode(m); setError(null); }}
              whileTap={{ scale: 0.96 }}
              className={
                'rounded-studio-sm px-2.5 py-1 text-studio-xs font-medium transition-colors duration-studio-fast ' +
                (mode === m
                  ? 'bg-studio-bg-base text-studio-text-primary shadow-studio-xs'
                  : 'text-studio-text-secondary hover:text-studio-text-primary')
              }
            >
              {MODE_LABELS[m]}
            </motion.button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-studio-sm border border-studio-destructive/30 bg-studio-destructive/10 px-3 py-2 text-studio-sm text-studio-destructive">
          {error}
        </div>
      )}

      {/* Primary input — exactly one shape per mode, not a stack of every
          possible field. Cross-fades on mode switch (AnimatePresence keyed by
          mode) instead of an abrupt swap — the one place in this surface where
          a state change is dramatic enough (the whole input block changes
          shape) to earn a transition. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: EASE_STANDARD }}
        >
          {visible.wireframe && (
            <label
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-studio-md border border-dashed border-studio-border px-6 py-10 text-center transition-colors duration-studio-fast hover:border-studio-border-strong"
            >
              <Upload className="h-5 w-5 text-studio-text-tertiary" strokeWidth={1.75} />
              <span className="text-studio-sm text-studio-text-secondary">
                {file ? file.name : 'Drop a wireframe image, or click to browse'}
              </span>
              <span className="text-studio-xs text-studio-text-tertiary">PNG, JPEG, or WebP — up to 8MB</span>
              <input
                type="file"
                accept="image/png, image/jpeg, image/webp"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          )}

          {visible.code && (
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste an existing React component to reuse its structure..."
              rows={visible.prompt ? 5 : 8}
              className="w-full resize-none rounded-studio-md border border-studio-border bg-studio-bg-base px-3 py-2.5 font-studio-mono text-studio-sm text-studio-text-primary placeholder:text-studio-text-tertiary focus:border-studio-accent focus:outline-none focus:shadow-studio-glow"
            />
          )}

          {visible.code && visible.prompt && <div className="my-3 h-px bg-studio-border" />}

          {visible.prompt && (
            <>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A hero section for a SaaS product launch, headline + subhead + CTA button"
                rows={visible.code ? 4 : 6}
                className="w-full resize-none rounded-studio-md border border-studio-border bg-studio-bg-base px-3 py-2.5 text-studio-sm text-studio-text-primary placeholder:text-studio-text-tertiary focus:border-studio-accent focus:outline-none focus:shadow-studio-glow"
              />
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {EXAMPLE_PROMPTS.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setPrompt(example)}
                    className="rounded-studio-xl border border-studio-border px-2.5 py-1 text-left text-studio-xs text-studio-text-secondary transition-colors duration-studio-fast hover:border-studio-border-strong hover:text-studio-text-primary"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Naming fields — required by the contract, but not the primary
          decision a person is making, so they're demoted to a disclosure
          instead of two top-level required boxes. */}
      <details className="group mt-4">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-studio-xs text-studio-text-tertiary hover:text-studio-text-secondary">
          <ChevronDown className="h-3.5 w-3.5 transition-transform duration-studio-fast group-open:rotate-180" strokeWidth={1.75} />
          Naming details — page &ldquo;{pageName || 'Home'}&rdquo;, section &ldquo;{sectionName || 'Custom'}&rdquo;
        </summary>
        <div className="mt-2.5 flex gap-3">
          <label className="flex-1 text-studio-xs text-studio-text-secondary">
            Page name
            <input
              type="text"
              value={pageName}
              onChange={(e) => setPageName(e.target.value)}
              className="mt-1 w-full rounded-studio-sm border border-studio-border bg-studio-bg-base px-2.5 py-1.5 text-studio-sm text-studio-text-primary focus:border-studio-accent focus:outline-none"
            />
          </label>
          <label className="flex-1 text-studio-xs text-studio-text-secondary">
            Section name
            <input
              type="text"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              className="mt-1 w-full rounded-studio-sm border border-studio-border bg-studio-bg-base px-2.5 py-1.5 text-studio-sm text-studio-text-primary focus:border-studio-accent focus:outline-none"
            />
          </label>
        </div>
      </details>

      <div className="mt-5 flex items-center justify-end">
        <motion.button
          type="submit"
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-1.5 rounded-studio-md bg-studio-accent px-4 py-2 text-studio-sm font-medium text-studio-accent-foreground transition-colors duration-studio-fast hover:bg-studio-accent-hover focus:outline-none focus:shadow-studio-glow"
        >
          Generate
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
        </motion.button>
      </div>
    </motion.form>
  );
}
