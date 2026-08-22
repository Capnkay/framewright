// client/src/studio/Logo.jsx
//
// The Framewright mark — a Lucide `Frame` glyph (a frame/viewfinder shape,
// literal for a "wireframe-to-section" tool) in a small accent-tinted badge,
// paired with the wordmark. One mark, reused everywhere the Studio chrome
// needs a logo (Nav, LoginPage) rather than redrawn per surface.

import React from 'react';
import { Frame } from 'lucide-react';

const SIZES = {
  sm: { badge: 'h-6 w-6', icon: 'h-3.5 w-3.5', text: 'text-studio-sm' },
  md: { badge: 'h-8 w-8', icon: 'h-4 w-4', text: 'text-studio-lg' },
  lg: { badge: 'h-10 w-10', icon: 'h-5 w-5', text: 'text-studio-xl' },
};

export default function Logo({ size = 'md', withWordmark = true, className = '' }) {
  const s = SIZES[size] ?? SIZES.md;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`flex ${s.badge} shrink-0 items-center justify-center rounded-studio-sm border border-studio-accent/25 bg-studio-accent/10`}
      >
        <Frame className={`${s.icon} text-studio-accent`} strokeWidth={2} />
      </div>
      {withWordmark && (
        <span className={`font-studio ${s.text} font-semibold tracking-tight text-studio-text-primary`}>
          Framewright
        </span>
      )}
    </div>
  );
}
