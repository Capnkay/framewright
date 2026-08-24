// server/src/generate/emitComponentLLM.js
//
// LLM-powered code generation — takes an IR + the user's design prompt
// and asks the model to write a beautiful, production-quality React component
// with Tailwind CSS, interactive React state, and working buttons.

import { emitComponent as deterministicEmit } from './emitComponent.js';

const SYSTEM_PROMPT = [
  'You are an elite, world-class Principal UI Engineer and Product Designer (ex-Vercel, ex-Linear, ex-Stripe).',
  'You receive a JSON layout specification (IR) and a user design prompt.',
  'Your mission: Generate a SINGLE, PRODUCTION-READY, FULLY INTERACTIVE React functional component.',
  '',
  'HIGH-QUALITY DESIGN REQUIREMENTS:',
  '- Aesthetic: Ultra-modern, premium dark/light themes, sleek glassmorphism (backdrop-blur), rich gradients, glowing accents, subtle borders (border-slate-800 or border-slate-200), and crisp typography.',
  '- Components to include: Navigation bar, Hero section with interactive CTA buttons, Feature grid with hover effects, Interactive tabs/filters, Stats counter grid, Testimonial/User card, and an interactive Modal/Drawer dialog state.',
  '- Responsiveness: 100% mobile-friendly with Tailwind breakpoints (sm:, md:, lg:, xl:).',
  '',
  'INTERACTIVITY & STATE (CRITICAL - ALL BUTTONS MUST BE FUNCTIONAL):',
  '- Use React hooks: `import React, { useState } from "react";`',
  '- Add interactive state for: active tabs, modal popup visibility, button click notifications/alerts, counter increments, or search/filter queries.',
  '- EVERY BUTTON MUST DO SOMETHING INTERACTIVE when clicked (e.g. `onClick={() => setModalOpen(true)}`, `onClick={() => setActiveTab("overview")}`, `onClick={() => setNotification("Saved!")}`).',
  '- Render an interactive Modal or Slide-over when primary buttons like "Get Started", "Sign Up", or "Explore" are clicked.',
  '',
  'TECHNICAL CONSTRAINTS:',
  '- Code must be self-contained in a SINGLE file (no external imports except `React` and `{ useState, useEffect }`).',
  '- Use custom SVG icons inline (e.g. <svg className="w-5 h-5"...>) or clean Tailwind elements.',
  '- Do NOT use markdown code fences in output (no ```jsx or ```).',
  '- Export the component as: `export default function GeneratedSection() { ... }`',
  '- Output ONLY raw JSX/JavaScript code — no introductory text, no explanations, no markdown fences.',
].join('\n');

/**
 * Make a direct fetch call to the LLM provider for code generation.
 */
async function callForCode(prompt, systemPrompt) {
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

  if (!prompt) return fallbackSource;

  const userMessage = [
    'USER DESIGN PROMPT: ' + prompt,
    '',
    'LAYOUT SPECIFICATION (IR):',
    JSON.stringify(ir, null, 2),
    '',
    'Write the production-ready interactive React component now. Include React useState hooks, interactive button click handlers, tab switching, and modal dialog state. Raw code only, no markdown fences.',
  ].join('\n');

  const source = await callForCode(userMessage, SYSTEM_PROMPT);

  if (!source || !source.trim()) {
    console.error('[emitComponentLLM] LLM returned empty, using fallback');
    return fallbackSource;
  }

  // Strip markdown fences if present
  let cleaned = source;
  cleaned = cleaned.replace(/^```(?:jsx|javascript|js|tsx)?\s*\n?/i, '');
  cleaned = cleaned.replace(/\n?```\s*$/i, '');

  return cleaned.trim();
}
