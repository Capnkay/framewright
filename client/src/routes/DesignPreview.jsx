// client/src/routes/DesignPreview.jsx
//
// A dev-only, unlinked route to review Studio chrome surfaces in isolation
// against docs/DESIGN-TOKENS.md, before they get wired into GeneratePage.jsx
// for real. Renders no live data and calls no API — it exists so a surface
// can be looked at without the server or the perception service running.
//
// Not reachable from Nav on purpose. Delete this file once the Studio chrome
// restyle is done and each surface is reviewed in its real place instead.

import React from 'react';
import Composer from '../studio/Composer.jsx';

export default function DesignPreview() {
  return (
    <div className="studio-theme min-h-screen px-8 py-12">
      <div className="mx-auto flex max-w-2xl flex-col items-start gap-2">
        <p className="font-studio text-studio-xs uppercase tracking-wide text-studio-text-tertiary">
          Design preview — Composer surface
        </p>
      </div>
      <div className="mt-6 flex justify-center">
        <Composer onSubmit={(formData) => console.log('[design-preview] submit', formData)} />
      </div>
    </div>
  );
}
