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
        <label className="block text-sm font-medium mb-1">Page Name</label>
        <input 
          type="text" 
          value={pageName} 
          onChange={e => setPageName(e.target.value)} 
          className="w-full p-2 border rounded" 
          placeholder="Home"
        />
        <p className="text-xs text-muted-foreground mt-1">Case-sensitive key for the store.</p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Section Name</label>
        <input 
          type="text" 
          value={sectionName} 
          onChange={e => setSectionName(e.target.value)} 
          className="w-full p-2 border rounded" 
          placeholder="Custom"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Accent Colour</label>
        <select 
          value={accent} 
          onChange={e => setAccent(e.target.value)} 
          className="w-full p-2 border rounded"
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
