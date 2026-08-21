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
    <div className="side-editor">
      <h3>
        Edit Field: {fieldId}
        <span className="ml-2">
          <ConfidenceBadge confidence={confidenceFromStore} />
        </span>
      </h3>
      <form onSubmit={handleSave}>
        <div>
          <label>Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>
        <div>
          <label>CSS</label>
          <textarea
            value={css}
            onChange={(e) => setCss(e.target.value)}
          />
        </div>
        <button type="submit" disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving...' : 'Save'}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
      {status === 'success' && <div className="success">Saved</div>}
    </div>
  );
}
