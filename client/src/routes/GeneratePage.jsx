// client/src/routes/GeneratePage.jsx
//
// The Generator Studio's route. A shell at T-001 — the nine numbered
// requirements FR-G01 to FR-G09 are Phase 3 tasks (T-043 to T-049), and the
// studio is scored as its own 10-point line item rather than folded into "the
// app works", so each of those gets built deliberately.
//
// This page lists them rather than faking them. A placeholder form that looked
// like the real thing would make it harder, not easier, to see what is actually
// finished.

import React from 'react';
import { Link } from 'react-router-dom';

const REQUIREMENTS = [
  ['FR-G01', 'Wireframe upload — PNG, JPEG, WebP, 8 MB cap (§13.1)', 'T-043'],
  ['FR-G02', 'Paste existing component code', 'T-044'],
  ['FR-G03', 'Natural-language prompt', 'T-044'],
  ['FR-G04', 'Mode selector — wireframe | code | prompt | combined (§13)', 'T-045'],
  ['FR-G05', 'Generation progress and plain-language errors', 'T-047'],
  ['FR-G06', 'Read-only generated JSX, plus a link to the preview (§11.2)', 'T-049'],
  ['FR-G07', 'pageName, sectionName, accent colour', 'T-046'],
  ['FR-G08', 'Job history — the last 5 jobs', 'T-048'],
  ['FR-G09', 'Zip export of a generated section', 'T-042'],
];

export default function GeneratePage() {
  return (
    <main className="p-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Generator Studio</h1>
        <p className="mt-1 max-w-prose text-sm text-gray-600">
          Route shell. Each control below is a scheduled task rather than a placeholder, so what is
          built and what is not stays legible.
        </p>
      </header>

      <ul className="max-w-2xl divide-y divide-gray-200 text-sm">
        {REQUIREMENTS.map(([id, what, task]) => (
          <li key={id} className="flex items-baseline gap-3 py-1.5">
            <span className="w-16 shrink-0 font-mono text-xs text-gray-500">{id}</span>
            <span className="flex-1">{what}</span>
            <span className="shrink-0 font-mono text-xs text-gray-400">{task}</span>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-sm">
        <Link to="/preview/Home" className="text-blue-700 underline">
          Open the preview for Home
        </Link>
      </p>
    </main>
  );
}
