import React, { useState } from 'react';

import { validateFile } from './UploadForm.logic.js';

// Re-exported so callers that imported it from the component keep working.
export { validateFile };

export default function UploadForm({ onSubmit }) {
  const [error, setError] = useState(null);
  const [pageName, setPageName] = useState('Home');
  const [sectionName, setSectionName] = useState('Custom');
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const formElements = e.target.elements;
    const fileInput = formElements.wireframe;
    const file = fileInput.files[0];

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);

    const formData = new FormData();
    formData.append('mode', 'wireframe');
    formData.append('wireframe', file);
    formData.append('pageName', pageName);
    formData.append('sectionName', sectionName);
    if (prompt) {
      formData.append('prompt', prompt);
    }
    formData.append('code', ''); // Required by some parsing logic sometimes, but we can omit or send empty. The spec says mode wireframe is valid.

    if (onSubmit) {
      onSubmit(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4 border rounded">
      <h2 className="text-lg font-semibold mb-2">Upload Wireframe</h2>
      
      {error && (
        <div className="p-3 bg-destructive/10 text-destructive border border-destructive/20 rounded text-sm font-medium">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Wireframe Image (PNG, JPEG, WebP, max 8MB)</label>
        <input 
          type="file" 
          name="wireframe" 
          accept="image/png, image/jpeg, image/webp" 
          className="w-full p-2 border rounded" 
        />
      </div>

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
        <label className="block text-sm font-medium mb-1">Additional Prompt (Optional)</label>
        <textarea 
          name="prompt" 
          value={prompt} 
          onChange={e => setPrompt(e.target.value)} 
          className="w-full p-2 border rounded" 
          rows="3" 
        />
      </div>

      <button type="submit" className="px-4 py-2 bg-accent text-white font-semibold rounded hover:bg-accent-hover transition-colors">
        Upload and Generate
      </button>
    </form>
  );
}
