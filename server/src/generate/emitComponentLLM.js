// server/src/generate/emitComponentLLM.js
//
// LLM-powered code generation — takes an IR + the user's design prompt
// and asks the model to write a beautiful, production-quality React component
// with Tailwind CSS, instead of using the rigid deterministic emitter.
//
// Uses OpenRouter (OPENROUTER_API_KEY) if available, otherwise falls back
// to the main LLM_API_KEY. This allows using a different provider for
// code generation vs structured IR generation.

import { emitComponent as deterministicEmit } from './emitComponent.js';

const SYSTEM_PROMPT = [
  'You are an elite UI engineer who writes stunning, production-quality React components with Tailwind CSS.',
  'You receive a JSON layout specification (IR) and a user design prompt.',
  'Your job: generate a SINGLE default-exported React functional component that implements the described UI.',
  '',
  'RULES:',
  '- Use ONLY Tailwind CSS utility classes for all styling. No inline styles, no CSS modules.',
  '- Make the design visually stunning: use gradients, shadows, rounded corners, hover effects, smooth transitions.',
  '- Use a modern, premium aesthetic — think Linear, Vercel, or Stripe quality.',
  '- The component must be self-contained — no imports except React.',
  '- Use semantic HTML (section, nav, header, main, footer, article, etc).',
  '- Make it fully responsive with Tailwind breakpoints (sm:, md:, lg:, xl:).',
  '- Include realistic placeholder content based on the user prompt (not lorem ipsum).',
  '- For images, use placeholder divs with bg-gradient backgrounds or emoji/SVG icons.',
  '- Add subtle animations where appropriate (hover:scale, transition-all, etc).',
  '- Export the component as: export default function ComponentName() { ... }',
  '',
  'OUTPUT FORMAT:',
  '- Output ONLY the raw JSX/JavaScript code.',
  '- Do NOT wrap in markdown fences (no ```jsx or ```).',
  '- Do NOT include any explanation, comments about the code, or anything other than the component code itself.',
].join('\n');

/**
 * Make a direct fetch call to the LLM provider for code generation.
 * This bypasses the orchestrator's JSON parsing since we want raw text.
 */
async function callForCode(prompt, systemPrompt) {
  // Prefer OpenRouter for code gen (no rate limits), fall back to main LLM
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY;
  const baseUrl = process.env.OPENROUTER_API_KEY
    ? 'https://openrouter.ai/api/v1'
    : (process.env.LLM_BASE_URL || '');
  const model = process.env.OPENROUTER_API_KEY
    ? 'nvidia/nemotron-3.5-lightning:free'
    : (process.env.LLM_MODEL || 'gemini-2.5-flash');

  if (!apiKey) return null;

  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
      }),
    });

    clearTimeout(timer);

    if (!res.ok) {
      console.error(`[emitComponentLLM] provider returned ${res.status}`);
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : null;
  } catch (e) {
    clearTimeout(timer);
    console.error('[emitComponentLLM] fetch error:', e?.message || e);
    return null;
  }
}

/**
 * Generate a React component using the LLM, falling back to the deterministic
 * emitter if the model call fails for any reason.
 */
export async function emitComponentLLM(ir, prompt) {
  const fallbackSource = deterministicEmit(ir);

  // No prompt means no design intent to work with — deterministic is fine.
  if (!prompt) return fallbackSource;

  const userMessage = [
    'USER DESIGN PROMPT: ' + prompt,
    '',
    'LAYOUT SPECIFICATION (IR):',
    JSON.stringify(ir, null, 2),
    '',
    'Generate the React component now. Remember: raw code only, no markdown fences, no explanations.',
  ].join('\n');

  const source = await callForCode(userMessage, SYSTEM_PROMPT);

  if (!source || !source.trim()) {
    console.error('[emitComponentLLM] LLM returned empty, using fallback');
    return fallbackSource;
  }

  // Strip markdown fences if the model included them despite instructions
  let cleaned = source;
  cleaned = cleaned.replace(/^```(?:jsx|javascript|js|tsx)?\s*\n?/i, '');
  cleaned = cleaned.replace(/\n?```\s*$/i, '');

  return cleaned.trim();
}
