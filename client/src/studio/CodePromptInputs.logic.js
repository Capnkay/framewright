// client/src/studio/CodePromptInputs.logic.js
//
// The pure, dependency-free form assembly behind CodePromptInputs.jsx, in its
// own module so it is unit-testable with a bare `node --test` run, without React
// installed — the same split as UploadForm.logic.js and
// client/src/sections/generated/HeroSection.logic.js.
//
// The field names below are CONTRACT.md §13.1's and are the point of FR-G02 and
// FR-G03. If the client posted `sourceCode` where the server reads `code`, the
// input would be dropped silently and the generator would fall back to defaults
// — a demo that looks like it works until someone asks why their pasted code
// changed nothing. server/src/routes/generate.js reads body.code and body.prompt;
// these must stay in step with it.

export function buildFormData({ code, prompt, pageName, sectionName, mode }) {
  const c = (code || '').trim();
  const p = (prompt || '').trim();
  const page = (pageName || '').trim() || 'Home';
  const section = (sectionName || '').trim() || 'Custom';

  if (!c && !p) {
    return { error: 'At least one of code or prompt is required.', formData: null };
  }

  const formData = new FormData();

  // THE MODE THE USER CHOSE, WHERE THEY CHOSE ONE. This used to derive the mode
  // purely from which fields happened to be filled, so selecting "Combined" and
  // typing only a prompt silently sent `mode=prompt`: the selector said one thing
  // and the request said another, with nothing telling anyone.
  //
  // FR-G04's rule is that a control which does not apply is HIDDEN rather than
  // present-and-ignored, because "a visible input that is silently dropped is
  // worse than no input at all". Silently rewriting the mode itself is that rule
  // broken one level up.
  //
  // §13 already validates a mode against the inputs supplied and refuses a
  // mismatch with a usable message — `mode=combined requires a wireframe image, a
  // prompt or code (§13)`. Letting it answer is better than guessing on the
  // caller's behalf and being quietly wrong.
  //
  // The derivation stays as the fallback for callers that do not pass a mode,
  // which is what the older form does.
  if (mode) {
    formData.append('mode', mode);
  } else if (c && p) {
    formData.append('mode', 'combined');
  } else if (c) {
    formData.append('mode', 'code');
  } else {
    formData.append('mode', 'prompt');
  }

  if (c) formData.append('code', c);
  if (p) formData.append('prompt', p);
  
  formData.append('pageName', page);
  formData.append('sectionName', section);

  return { error: null, formData };
}
