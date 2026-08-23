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
import DesignPreview from './routes/DesignPreview.jsx';
import LoginPage from './routes/LoginPage.jsx';
import StudioNav from './studio/StudioNav.jsx';

/**
 * True when this document is being displayed inside a frame.
 *
 * The Studio frames `/preview/:pageName` in an iframe (§7 R11 — a narrowed
 * container cannot trigger a `md:` breakpoint, so only a real viewport shows the
 * responsive stacking). That framed document is the same route a person can open
 * directly, so it renders the same chrome — and the result was the app's own
 * navigation appearing a second time INSIDE the preview pane.
 *
 * Wrapped because a cross-origin parent makes `window.top` throw, and because
 * this runs during render in an environment that may have no `window` at all —
 * the tests render these routes with `renderToString`.
 */
function isFramed() {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true; // access denied means there IS a parent, and a foreign one.
  }
}

function StudioLayout({ children }) {
  // Standalone keeps the nav; framed does not. One route, two contexts, and the
  // chrome belongs to only one of them.
  const framed = isFramed();

  return (
    <div className={`min-h-screen bg-background text-foreground flex flex-col ${framed ? "" : "pt-20"}`}>
      {framed ? null : <StudioNav />}
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}

// The dark, studio-* chrome — routes migrated off the frozen tokens land
// here instead of StudioLayout. See docs/UI-SYSTEM.md §1/§2: LandingPage
// stays on StudioLayout/Nav until its own (last-priority) pass.
function StudioChrome({ children }) {
  return (
    <div className="studio-theme flex min-h-screen flex-col bg-studio-bg-base text-studio-text-primary pt-20">
      <StudioNav />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<StudioLayout><LandingPage /></StudioLayout>} />
        <Route path="/login" element={<StudioLayout><LoginPage /></StudioLayout>} />
        <Route path="/generate" element={<StudioChrome><GeneratePage /></StudioChrome>} />
        {/* §1: pageName defaults to Home. */}
        <Route path="/preview" element={<Navigate to="/preview/Home" replace />} />
        <Route path="/preview/:pageName" element={<StudioLayout><PreviewPage /></StudioLayout>} />
        {/* Dev-only, unreachable from Nav — see routes/DesignPreview.jsx. */}
        <Route path="/design-preview" element={<DesignPreview />} />
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
