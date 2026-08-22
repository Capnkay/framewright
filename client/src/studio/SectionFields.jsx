// client/src/studio/SectionFields.jsx
import React from 'react';

const ACCENT_COLOURS = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink',
  'rose', 'slate', 'gray', 'zinc', 'neutral', 'stone', 'black', 'white'
];

export default function SectionFields({ pageName, setPageName, sectionName, setSectionName, accent, setAccent }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-studio-xs font-medium text-studio-text-secondary">Page Name</label>
        <input
          type="text"
          value={pageName}
          onChange={e => setPageName(e.target.value)}
          className="w-full rounded-studio-sm border border-studio-border bg-studio-bg-base px-2.5 py-1.5 text-studio-sm text-studio-text-primary focus:border-studio-accent focus:outline-none"
          placeholder="Home"
        />
        <p className="mt-1 text-studio-xs text-studio-text-tertiary">Case-sensitive key for the store.</p>
      </div>
      <div>
        <label className="mb-1 block text-studio-xs font-medium text-studio-text-secondary">Section Name</label>
        <input
          type="text"
          value={sectionName}
          onChange={e => setSectionName(e.target.value)}
          className="w-full rounded-studio-sm border border-studio-border bg-studio-bg-base px-2.5 py-1.5 text-studio-sm text-studio-text-primary focus:border-studio-accent focus:outline-none"
          placeholder="Custom"
        />
      </div>
      <div>
        <label className="mb-1 block text-studio-xs font-medium text-studio-text-secondary">Accent Colour</label>
        <select
          value={accent}
          onChange={e => setAccent(e.target.value)}
          className="w-full rounded-studio-sm border border-studio-border bg-studio-bg-base px-2.5 py-1.5 text-studio-sm text-studio-text-primary focus:border-studio-accent focus:outline-none"
        >
          <option value="">Default (Red)</option>
          {ACCENT_COLOURS.map(c => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
