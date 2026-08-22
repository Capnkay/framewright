import React, { useState } from 'react';

import { buildFormData } from './CodePromptInputs.logic.js';

// Re-exported so callers importing it from the component keep working.
export { buildFormData };


export default function CodePromptInputs({ onSubmit }) {
  const [error, setError] = useState(null);
  const [pageName, setPageName] = useState('Home');
  const [sectionName, setSectionName] = useState('Custom');
  const [code, setCode] = useState('');
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const result = buildFormData({ code, prompt, pageName, sectionName });
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
      <h2 className="text-lg font-semibold mb-2">Generate from Code or Prompt</h2>
      
      {error && (
        <div className="p-3 bg-destructive/10 text-destructive border border-destructive/20 rounded text-sm font-medium">
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

      <div>
        <label className="block text-sm font-medium mb-1">React Code (Optional if prompt provided)</label>
        <textarea 
          name="code" 
          value={code} 
          onChange={e => setCode(e.target.value)} 
          className="w-full p-2 border rounded font-mono text-sm" 
          rows="8" 
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Design Prompt (Optional if code provided)</label>
        <textarea 
          name="prompt" 
          value={prompt} 
          onChange={e => setPrompt(e.target.value)} 
          className="w-full p-2 border rounded" 
          rows="4" 
        />
      </div>

      <button type="submit" className="px-4 py-2 bg-accent text-white font-semibold rounded hover:bg-accent-hover transition-colors">
        Generate
      </button>
    </form>
  );
}
