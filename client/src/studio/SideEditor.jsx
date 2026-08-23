import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { submitPatch, applyPatchResponse } from './SideEditor.logic.js';
import ConfidenceBadge from './ConfidenceBadge.jsx';

export default function SideEditor({ fieldId, pageName = 'Home', apiUrl = '/api' }) {
  const dispatch = useDispatch();
  
  const contentFromStore = useSelector(state => state.cms.allSections[pageName]?.[fieldId]);
  const cssFromStore = useSelector(state => state.cms.allSectionsCss[pageName]?.[fieldId]);
  const confidenceFromStore = useSelector(state => state.cms.allSections[pageName]?.[`__confidence__:${fieldId}`]);
  
  const [content, setContent] = useState('');
  const [css, setCss] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  useEffect(() => {
    // Only pre-fill content if it's a string. A Cards top-level field is an array.
    setContent(typeof contentFromStore === 'string' ? contentFromStore : '');
    setCss(typeof cssFromStore === 'string' ? cssFromStore : '');
    setStatus('idle');
    setError(null);
  }, [fieldId, contentFromStore, cssFromStore]);

  if (!fieldId) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setStatus('saving');
    setError(null);
    
    // Validate CSS client-side per A 8
    const cssToPatch = css.trim() === '' ? null : css;
    if (cssToPatch) {
      const allowedProps = ['color', 'background-color', 'font-size', 'font-weight', 'text-align', 'margin', 'padding', 'border', 'border-radius'];
      // Split by ';' and check properties
      const declarations = cssToPatch.split(';');
      for (const decl of declarations) {
        if (!decl.trim()) continue;
        const parts = decl.split(':');
        if (parts.length < 2) continue; // Malformed, let server handle or just ignore here, but actually we should check if prop is in allowedProps.
        const prop = parts[0].trim();
        if (!allowedProps.includes(prop)) {
          setStatus('error');
          setError(`CSS property '${prop}' is not allowed. (A 8)`);
          return;
        }
      }
    }

    try {
      const data = await submitPatch({ apiUrl, fieldId, content, css: cssToPatch });
      applyPatchResponse(dispatch, data, pageName);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  };

  return (
    <div className="side-editor flex flex-col gap-4">
      <h3 className="text-studio-sm font-semibold text-studio-text-primary flex items-center justify-between">
        <span className="font-studio-mono">{fieldId}</span>
        <ConfidenceBadge confidence={confidenceFromStore} />
      </h3>
      <form onSubmit={handleSave} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-studio-xs font-medium text-studio-text-secondary uppercase">Content</label>
          <textarea
            className="w-full min-h-24 bg-studio-bg-base border border-studio-border rounded-studio-sm p-2 text-studio-sm text-studio-text-primary focus:outline-none focus:border-studio-accent font-studio-mono"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-studio-xs font-medium text-studio-text-secondary uppercase">CSS (e.g. color: red;)</label>
          <textarea
            className="w-full min-h-16 bg-studio-bg-base border border-studio-border rounded-studio-sm p-2 text-studio-sm text-studio-text-primary focus:outline-none focus:border-studio-accent font-studio-mono"
            value={css}
            onChange={(e) => setCss(e.target.value)}
            placeholder="color, font-size, text-align..."
          />
        </div>
        <button 
          type="submit" 
          disabled={status === 'saving'}
          className="w-full bg-studio-accent hover:bg-studio-accent-hover text-studio-accent-foreground font-semibold py-2 rounded-studio-sm disabled:opacity-50 transition-colors mt-2"
        >
          {status === 'saving' ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
      {error && <div className="text-studio-xs text-studio-destructive bg-studio-destructive/10 border border-studio-destructive/30 rounded-studio-sm p-2 mt-2">{error}</div>}
      {status === 'success' && <div className="text-studio-xs text-green-500 bg-green-500/10 border border-green-500/30 rounded-studio-sm p-2 mt-2">Saved successfully</div>}
    </div>
  );
}
