import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { submitPatch, applyPatchResponse } from './SideEditor.logic.js';

export default function SideEditor({ fieldId, pageName = 'Home', apiUrl = '/api' }) {
  const dispatch = useDispatch();
  
  const contentFromStore = useSelector(state => state.cms.allSections[pageName]?.[fieldId]);
  const cssFromStore = useSelector(state => state.cms.allSectionsCss[pageName]?.[fieldId]);
  
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
    try {
      // Pass empty string as null css to clear overlay as per spec
      const cssToPatch = css.trim() === '' ? null : css;
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
      <h3>Edit Field: {fieldId}</h3>
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
