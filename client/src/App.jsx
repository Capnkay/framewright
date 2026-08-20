// client/src/App.jsx
//
// The route table. Two routes exist at this stage, and they are the two the
// whole product is reached through:
//
//   /generate            the Generator Studio (FR-G01–FR-G09, Phase 3)
//   /preview/:pageName   the live preview of a generated section (§7)
//
// `pageName` is a route parameter rather than a query string because §1 makes it
// a first-class, CASE-SENSITIVE key: `Home` and `home` are different Redux keys,
// and mixing them is named in §9 as the most common way to get a preview that
// renders correctly from defaults while the store is empty. Keeping it in the
// path means the case a person typed is the case the component receives.
//
// `/preview` with no pageName redirects to `/preview/Home` rather than rendering
// an empty shell, because `Home` is §1's stated default.

import React from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';

import GeneratePage from './routes/GeneratePage.jsx';
import PreviewPage from './routes/PreviewPage.jsx';

function Nav() {
  const { pathname } = useLocation();
  const link = (to, label) => (
    <Link
      to={to}
      className={
        'rounded-md px-3 py-1.5 text-sm font-medium ' +
        (pathname.startsWith(to) ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-200')
      }
    >
      {label}
    </Link>
  );

  return (
    <nav className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
      <span className="mr-2 font-semibold tracking-tight">Framewright</span>
      {link('/generate', 'Generate')}
      {link('/preview', 'Preview')}
    </nav>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Nav />
      <Routes>
        <Route path="/" element={<Navigate to="/generate" replace />} />
        <Route path="/generate" element={<GeneratePage />} />
        {/* §1: pageName defaults to Home. */}
        <Route path="/preview" element={<Navigate to="/preview/Home" replace />} />
        <Route path="/preview/:pageName" element={<PreviewPage />} />
        <Route
          path="*"
          element={
            <main className="p-6">
              <h1 className="text-lg font-semibold">No such page</h1>
              <p className="mt-1 text-sm text-gray-600">
                This app serves <code>/generate</code> and <code>/preview/:pageName</code>.
              </p>
            </main>
          }
        />
      </Routes>
    </div>
  );
}
