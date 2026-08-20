// client/src/routes/PreviewPage.jsx
//
// The preview shell — CONTRACT.md §7. At T-001 this is deliberately a shell: it
// resolves `pageName` from the route and reports what the store currently holds
// for it. Mounting the golden HeroSection here is T-011; discovering generated
// components by Vite eager glob is T-029; the full shell with variation
// selection is T-050.
//
// What it DOES do now, and the reason it is worth having this early: it makes
// the §9 store-liveness question visible from the first hour. It reads
// `state.cms.allSections[pageName]` and `state.cms.missing[pageName]` and shows
// the counts. An empty store is the failure §9 exists to catch, and §9 says the
// assertion must run "from the first hour the preview exists" — a preview that
// cannot show you whether the store is alive is the thing that hides it.
//
// It does NOT render any CMS text through a default fallback, on purpose. That
// pattern (`data?.[id] || "DEFAULT"`) is exactly the mask §9 warns about, and
// putting it here before any element is wired would make a dead store look fine
// on this page too.

import React from 'react';
import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';

export default function PreviewPage() {
  // §1: pageName is case-sensitive. Whatever case the URL carries is the key.
  const { pageName = 'Home' } = useParams();

  const sections = useSelector((state) => state.cms.allSections[pageName]);
  const missing = useSelector((state) => state.cms.missing[pageName]);
  const status = useSelector((state) => state.cms.status);
  const error = useSelector((state) => state.cms.error);

  const keyCount = sections ? Object.keys(sections).length : 0;
  const missingCount = Array.isArray(missing) ? missing.length : 0;

  return (
    <main className="p-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">
          Preview — <span className="font-mono">{pageName}</span>
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Section mounting arrives with T-011 and T-029. This shell exists now so the store's
          state is observable from the first hour (§9).
        </p>
      </header>

      <dl className="grid max-w-md grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-gray-600">Hydration status</dt>
        <dd className="font-mono">{status}</dd>

        <dt className="text-gray-600">Keys in allSections</dt>
        <dd className="font-mono">{keyCount}</dd>

        <dt className="text-gray-600">Missing IDs</dt>
        <dd className="font-mono">{missingCount}</dd>
      </dl>

      {error ? (
        <p className="mt-4 max-w-prose rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}

      {keyCount === 0 ? (
        <p className="mt-4 max-w-prose rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Nothing hydrated for <span className="font-mono">{pageName}</span> yet. That is expected
          until <span className="font-mono">GET /api/elements</span> and the mount-time fetch are
          wired (T-015, T-011). A page that looked complete while this number stayed at zero would
          be the §9 failure exactly.
        </p>
      ) : null}
    </main>
  );
}
