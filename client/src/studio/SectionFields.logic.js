// client/src/studio/SectionFields.logic.js

const TAILWIND_PALETTES = new Set([
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink',
  'rose', 'slate', 'gray', 'grey', 'zinc', 'neutral', 'stone', 'black', 'white'
]);

export function normaliseAccent(accent) {
  if (typeof accent !== 'string' || !accent.trim()) return null;
  const lower = accent.trim().toLowerCase();
  
  if (TAILWIND_PALETTES.has(lower)) {
    return lower;
  }
  
  const match = lower.match(/^([a-z]+)-\d{3,4}$/);
  if (match && TAILWIND_PALETTES.has(match[1])) {
    return match[1];
  }
  
  return null;
}

export function buildSectionFieldsPayload({ pageName, sectionName, accent }) {
  // Case preservation: whatever case they enter is the key. Do NOT normalise.
  const finalPageName = (pageName !== undefined && pageName !== null && pageName.trim() !== '') 
    ? pageName.trim() 
    : 'Home';
    
  const finalSectionName = (sectionName !== undefined && sectionName !== null && sectionName.trim() !== '') 
    ? sectionName.trim() 
    : 'Custom';
    
  const normAccent = normaliseAccent(accent);
  
  // Building whatever the request carries.
  // The only way to get the accent into the IR's theme.accent without modifying 
  // backend endpoints is to append it to the prompt.
  const promptExtension = normAccent ? `Make the accent ${normAccent}.` : null;
  
  return {
    pageName: finalPageName,
    sectionName: finalSectionName,
    accent: normAccent,
    promptExtension
  };
}
