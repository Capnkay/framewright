// client/src/studio/ModeSelector.logic.js
//
// The pure, dependency-free part of ModeSelector.jsx, in its own module so it is
// unit-testable with a bare `node --test` run, without React installed — the same
// split as UploadForm.logic.js, CodePromptInputs.logic.js, StageInspector.logic.js
// and client/src/sections/generated/HeroSection.logic.js.
//
// Without this, the only way to test the selector is to regex its JSX source,
// which asserts formatting rather than behaviour: a match like
// /<UploadForm onSubmit=\{onSubmit\} \/>/ breaks when someone reflows the line
// and still passes when the mode wiring is wrong.

// CONTRACT.md §13: "`mode` is one of `wireframe | code | prompt | combined`".
// server/src/routes/generate.js rejects anything else with a 400, so this list
// and that one must stay identical — a fifth value invented here would make the
// Studio look broken for a reason invisible from the UI.
export const MODES = ['wireframe', 'code', 'prompt', 'combined'];

export function isValidMode(mode) {
  return MODES.includes(mode);
}

/**
 * Which input controls a given mode shows. §13.1 pairs each mode with the
 * fields it actually sends, and FR-G04 requires the non-matching controls to be
 * HIDDEN rather than present-and-ignored — a visible input that is silently
 * dropped is worse than no input at all.
 */
export function visibleInputsFor(mode) {
  if (!isValidMode(mode)) {
    return { wireframe: false, code: false, prompt: false };
  }
  return {
    wireframe: mode === 'wireframe',
    code: mode === 'code' || mode === 'combined',
    prompt: mode === 'prompt' || mode === 'combined',
  };
}
