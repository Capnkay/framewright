import React, { useState } from 'react';

import { VIEWPORT_MODES, getModeConfig } from './ResponsiveToggle.logic.js';

/**
 * The preview shell's responsive toggle — CONTRACT.md §7 R11.
 *
 * `src` is the preview route to frame (e.g. `/preview/Home`). The preview is
 * rendered in an iframe rather than a narrowed <div> on purpose: R11's stacking
 * comes from `flex-col md:flex-row`, and `md:` is a viewport media query, so an
 * ancestor's width cannot trigger it. Only a real viewport does. See
 * ResponsiveToggle.logic.js for the full reasoning.
 *
 * `children` is still accepted for callers that want to frame already-rendered
 * content, but note that path narrows a container and therefore does NOT flip
 * the breakpoint — it is a width preview, not a layout preview.
 */
export default function ResponsiveToggle({ src, title = 'Preview', children }) {
  const [modeId, setModeId] = useState('desktop');
  const config = getModeConfig(modeId);

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-studio-sm font-semibold text-studio-text-secondary">Viewport:</span>
        {Object.values(VIEWPORT_MODES).map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => setModeId(mode.id)}
            aria-pressed={modeId === mode.id}
            className={
              'rounded-studio-sm border px-3 py-1 text-studio-sm transition-colors duration-studio-fast ' +
              (modeId === mode.id
                ? 'border-studio-accent bg-studio-accent text-studio-accent-foreground'
                : 'border-studio-border text-studio-text-secondary hover:text-studio-text-primary')
            }
          >
            {mode.label}
          </button>
        ))}
        <span className="ml-2 font-studio-mono text-studio-xs text-studio-text-tertiary">{config.width}</span>
      </div>

      <div className="flex w-full justify-center rounded-studio-md bg-studio-bg-overlay p-2">
        {src ? (
          <iframe
            title={title}
            src={src}
            style={{ width: config.width, height: '100%', minHeight: '640px', border: 0 }}
            className="bg-white shadow-studio-sm"
          />
        ) : (
          <div className={config.classes} style={{ width: config.width }}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
