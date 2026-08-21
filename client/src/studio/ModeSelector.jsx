import React, { useState } from 'react';
import UploadForm from './UploadForm.jsx';
import { buildFormData } from './CodePromptInputs.logic.js';
import { MODES, visibleInputsFor } from './ModeSelector.logic.js';

// Display names only. The VALUES come from MODES (§13); these are just how they
// read to a human, and are deliberately kept out of the logic module so nobody
// mistakes a label for a wire value.
const MODE_LABELS = {
  wireframe: 'Wireframe',
  code: 'Code',
  prompt: 'Prompt',
  combined: 'Combined',
};

function TextModeForm({ mode, onSubmit }) {
  const [error, setError] = useState(null);
  const [pageName, setPageName] = useState('Home');
  const [sectionName, setSectionName] = useState('Custom');
  const [code, setCode] = useState('');
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const activeCode = (mode === 'code' || mode === 'combined') ? code : '';
    const activePrompt = (mode === 'prompt' || mode === 'combined') ? prompt : '';

    const result = buildFormData({ 
      code: activeCode, 
      prompt: activePrompt, 
      pageName, 
      sectionName 
    });
    
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    if (onSubmit) {
      onSubmit(result.formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4 border rounded">
      <h2 className="text-lg font-semibold mb-2">
        {mode === 'code' ? 'Generate from Code' : mode === 'prompt' ? 'Generate from Prompt' : 'Generate from Code and Prompt'}
      </h2>
      
      {error && (
        <div className="p-3 bg-red-50 text-red-700 border border-red-300 rounded text-sm font-medium">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Page Name</label>
        <input 
          type="text" 
          name="pageName" 
          value={pageName} 
          onChange={e => setPageName(e.target.value)} 
          className="w-full p-2 border rounded" 
          required 
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Section Name</label>
        <input 
          type="text" 
          name="sectionName" 
          value={sectionName} 
          onChange={e => setSectionName(e.target.value)} 
          className="w-full p-2 border rounded" 
          required 
        />
      </div>

      {visibleInputsFor(mode).code && (
        <div>
          <label className="block text-sm font-medium mb-1">
            React Code{mode === 'combined' ? ' (Optional if prompt provided)' : ''}
          </label>
          <textarea 
            name="code" 
            value={code} 
            onChange={e => setCode(e.target.value)} 
            className="w-full p-2 border rounded font-mono text-sm" 
            rows="8" 
          />
        </div>
      )}

      {visibleInputsFor(mode).prompt && (
        <div>
          <label className="block text-sm font-medium mb-1">
            Design Prompt{mode === 'combined' ? ' (Optional if code provided)' : ''}
          </label>
          <textarea 
            name="prompt" 
            value={prompt} 
            onChange={e => setPrompt(e.target.value)} 
            className="w-full p-2 border rounded" 
            rows="4" 
          />
        </div>
      )}

      <button type="submit" className="px-4 py-2 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 transition-colors">
        Generate
      </button>
    </form>
  );
}

export default function ModeSelector({ onSubmit }) {
  const [mode, setMode] = useState('wireframe');
  
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-6 p-4 border rounded bg-gray-50 items-center">
        <span className="font-semibold">Mode:</span>
        {/* Rendered from MODES so the control list cannot drift from §13's four
            values. Adding a radio the server would 400 is a silent UI break. */}
        {MODES.map((m) => (
          <label key={m} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="mode"
              value={m}
              checked={mode === m}
              onChange={() => setMode(m)}
            />
            {MODE_LABELS[m]}
          </label>
        ))}
      </div>

      {visibleInputsFor(mode).wireframe ? (
        <UploadForm onSubmit={onSubmit} />
      ) : (
        <TextModeForm mode={mode} onSubmit={onSubmit} />
      )}
    </div>
  );
}
