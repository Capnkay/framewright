// client/src/studio/StudioNav.jsx
//
// The dark Studio-chrome nav — used only on routes that have been migrated
// onto the studio-* token system (currently /generate). LandingPage still
// uses App.jsx's original light Nav; that migration is deliberately last
// (docs/UI-SYSTEM.md §2). Do not reuse this on the landing route yet.

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import Logo from './Logo.jsx';

export default function StudioNav() {
  const { pathname } = useLocation();
  const link = (to, label) => (
    <Link
      to={to}
      className={
        'rounded-studio-sm px-3 py-1.5 text-studio-sm font-medium transition-colors duration-studio-fast ' +
        (pathname.startsWith(to)
          ? 'bg-studio-bg-overlay text-studio-text-primary'
          : 'text-studio-text-secondary hover:text-studio-text-primary')
      }
    >
      {label}
    </Link>
  );

  return (
    <nav className="flex items-center justify-between border-b border-studio-border px-6 py-3">
      <Link to="/generate">
        <Logo size="sm" />
      </Link>
      <div className="flex items-center gap-1">
        {link('/generate', 'Studio')}
        {link('/preview', 'Preview')}
      </div>
    </nav>
  );
}
