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

import LandingPage from './routes/LandingPage.jsx';
import GeneratePage from './routes/GeneratePage.jsx';
import PreviewPage from './routes/PreviewPage.jsx';

function Nav() {
  const { pathname } = useLocation();
  const link = (to, label) => (
    <Link
      to={to}
      className={
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
        (pathname.startsWith(to) && to !== '/' || (to === '/' && pathname === '/') 
          ? 'bg-accent text-white' 
          : 'text-muted-foreground hover:bg-card hover:text-foreground')
      }
    >
      {label}
    </Link>
  );

  return (
    <nav className="flex items-center gap-2 border-b border-border px-4 py-3 bg-background">
      <Link to="/" className="mr-2 font-semibold tracking-tight text-foreground hover:text-accent transition-colors">Framewright</Link>
      {link('/generate', 'Studio')}
      {link('/preview', 'Preview')}
    </nav>
  );
}

function StudioLayout({ children }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Nav />
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<StudioLayout><LandingPage /></StudioLayout>} />
        <Route path="/generate" element={<StudioLayout><GeneratePage /></StudioLayout>} />
        {/* §1: pageName defaults to Home. */}
        <Route path="/preview" element={<Navigate to="/preview/Home" replace />} />
        <Route path="/preview/:pageName" element={<PreviewPage />} />
        <Route
          path="*"
          element={
            <StudioLayout>
              <main className="p-6">
                <h1 className="text-lg font-semibold text-foreground">No such page</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  This app serves <code>/</code>, <code>/generate</code> and <code>/preview/:pageName</code>.
                </p>
              </main>
            </StudioLayout>
          }
        />
      </Routes>
    </>
  );
}
