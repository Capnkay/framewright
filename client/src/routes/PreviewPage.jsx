import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import SideEditor from '../studio/SideEditor';

// Eagerly discover all generated JSX components.
// Keys are relative paths: '../sections/generated/SectionName-1000000001-v1.jsx'
const generatedModules = import.meta.glob('../sections/generated/*.jsx', { eager: true });

function SectionWrapper({ section, Component, pageName }) {
  const [regeneratePrompt, setRegeneratePrompt] = useState('');
  const [regenerateVariation, setRegenerateVariation] = useState(section.variations || section.variation || '1');
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState(null);

  const handleRegenerate = async (e) => {
    e.preventDefault();
    setRegenerating(true);
    try {
      const res = await fetch(`/api/sections/${section.sectionId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'prompt',
          prompt: regeneratePrompt || undefined,
          variation: regenerateVariation,
          variations: regenerateVariation
        })
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      let message = `Regenerate failed with status ${res.status}`;
      try {
        const body = await res.json();
        if (body?.error && typeof body.error.message === 'string') message = body.error.message;
      } catch {}
      setRegenerateError(message);
    } catch (err) {
      setRegenerateError(err.message);
    }
    setRegenerating(false);
  };

  return (
    <div className="relative group border border-studio-border rounded-studio-lg mb-8 p-4 bg-studio-bg-raised">
      <form 
        onSubmit={handleRegenerate}
        className="absolute top-2 right-2 bg-studio-bg-overlay border border-studio-border shadow-studio-md rounded-studio-md px-3 py-2 z-10 flex flex-col gap-2 text-studio-sm opacity-0 group-hover:opacity-100 transition-opacity side-editor-ignore"
      >
        <div className="font-semibold text-studio-text-secondary">Regenerate Section</div>
        {regenerateError && (
          <p className="rounded-studio-sm bg-studio-destructive/10 border border-studio-destructive/30 px-2 py-1 text-studio-xs text-studio-destructive">{regenerateError}</p>
        )}
        <div className="flex gap-2 items-center justify-between text-studio-text-primary">
          <label>Prompt:</label>
          <input 
            type="text"
            placeholder="e.g. four stats, green accent"
            value={regeneratePrompt}
            onChange={(e) => setRegeneratePrompt(e.target.value)}
            className="bg-studio-bg-base border border-studio-border p-1 rounded-studio-sm text-studio-xs w-48 text-studio-text-primary focus:outline-none focus:border-studio-accent"
          />
        </div>
        <div className="flex gap-2 items-center justify-between text-studio-text-primary">
          <div>
            <label className="mr-2">Variation:</label>
            <select 
              value={regenerateVariation} 
              onChange={(e) => setRegenerateVariation(e.target.value)}
              className="bg-studio-bg-base border border-studio-border p-1 rounded-studio-sm text-studio-xs text-studio-text-primary focus:outline-none focus:border-studio-accent"
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </div>
          <button 
            type="submit" 
            disabled={regenerating}
            className="bg-studio-accent hover:bg-studio-accent-hover text-studio-accent-foreground px-2 py-1 rounded-studio-sm text-studio-xs font-medium disabled:opacity-50"
          >
            {regenerating ? 'Wait...' : 'Go'}
          </button>
        </div>
      </form>
      <Component key={section.sectionId} pageName={pageName} />
    </div>
  );
}

export default function PreviewPage() {
  const { pageName = 'Home' } = useParams();
  const [sectionDocs, setSectionDocs] = useState([]);
  
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [editorPos, setEditorPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    let active = true;
    fetch(`/api/sections?pageName=${pageName}`)
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        setSectionDocs(Array.isArray(data) ? data : []);
      })
      .catch(err => console.error(err));
    return () => { active = false; };
  }, [pageName]);

  const sections = useSelector((state) => state.cms.allSections[pageName]);
  const missing = useSelector((state) => state.cms.missing[pageName]);
  const status = useSelector((state) => state.cms.status);
  const error = useSelector((state) => state.cms.error);

  // Click-to-edit canvas logic
  useEffect(() => {
    const handleClick = (e) => {
      const el = e.target.closest('[id]');
      
      // Dismiss if clicking outside a valid field and not inside the editor
      if (!el || !sections || sections[el.id] === undefined) {
        if (!e.target.closest('.side-editor-ignore') && !e.target.closest('.side-editor-container')) {
          setEditingFieldId(null);
        }
        return;
      }
      
      if (e.target.closest('.side-editor-ignore') || e.target.closest('.side-editor-container')) return;

      e.preventDefault();
      e.stopPropagation();
      
      const rect = el.getBoundingClientRect();
      setEditorPos({
        top: window.scrollY + rect.top,
        left: window.scrollX + rect.left + (rect.width > 300 ? rect.width / 2 : rect.width) + 10,
      });
      setEditingFieldId(el.id);
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [sections]);

  const keyCount = sections ? Object.keys(sections).length : 0;
  const missingCount = Array.isArray(missing) ? missing.length : 0;

  const unbuilt = [];

  const renderedSections = sectionDocs.map((section) => {
    const safeName = String(section.sectionName || 'Section').replace(/[^a-zA-Z0-9_]/g, '');
    const filename = `${safeName}-${section.sectionId}-v${section.variations || section.variation || '1'}.jsx`;
    const moduleKey = `../sections/generated/${filename}`;
    const Component = generatedModules[moduleKey]?.default;

    if (!Component) {
      // In case the module is not found, render a fallback.
      // NOTHING IS RENDERED FOR A SECTION THIS MACHINE CANNOT BUILD, and that is a
      // change from showing an explanatory card for each one.
      //
      // The card was right when there were three of them. Measured on a store that
      // had accumulated a few weeks of runs: 163 sections on `Home`, 54 with a
      // component file and **109 without** — so the page opened with a hundred
      // identical "isn't built here" blocks and the real sections were somewhere
      // past them. An explanation repeated a hundred times is not an explanation,
      // it is the page.
      //
      // The state is not hidden, it is COUNTED, and the count sits with the other
      // §9 diagnostics below. One line saying "109 sections are not built here"
      // tells a reader more than a hundred cards saying it individually, and it
      // keeps the fact available rather than silently dropping it.
      unbuilt.push(section);
      return null;
    }
    
    return <SectionWrapper key={section.sectionId} section={section} Component={Component} pageName={pageName} />;
    // The above hands <Component key={section.sectionId} pageName={pageName} /> to the wrapper.
  });

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-studio-bg-base p-6 text-studio-text-primary relative">
      <div className="flex flex-col gap-8">{renderedSections}</div>

      {sectionDocs.length === 0 ? (
        <p className="max-w-prose rounded-studio-lg border border-dashed border-studio-border p-6 text-studio-sm text-studio-text-secondary">
          No sections on <span className="font-medium text-studio-text-primary">{pageName}</span> yet.
          Generate one in the Studio and it will appear here.
        </p>
      ) : null}

      {/* Floating Canvas Editor */}
      {editingFieldId && (
        <div 
          className="absolute z-50 bg-studio-bg-overlay border border-studio-border shadow-studio-lg rounded-studio-lg p-4 side-editor-container"
          style={{ top: editorPos.top, left: editorPos.left, width: '300px' }}
        >
          <div className="flex justify-between items-center mb-2 border-b border-studio-border pb-2">
            <span className="text-studio-xs font-semibold uppercase text-studio-text-secondary">Edit Field</span>
            <button 
              onClick={() => setEditingFieldId(null)}
              className="text-studio-text-secondary hover:text-studio-text-primary"
            >
              ×
            </button>
          </div>
          <SideEditor fieldId={editingFieldId} pageName={pageName} apiUrl="/api" />
        </div>
      )}

      <details className="mt-12 max-w-md rounded-studio-lg border border-studio-border bg-studio-bg-raised p-4 text-studio-sm">
        <summary className="cursor-pointer font-medium text-studio-text-primary">
          Content status
          <span className="ml-2 font-normal text-studio-text-secondary">
            {status === 'succeeded' && missingCount === 0
              ? `${keyCount} field${keyCount === 1 ? '' : 's'} loaded`
              : status === 'loading'
                ? 'loading…'
                : 'not loaded'}
          </span>
        </summary>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
          <dt className="text-studio-text-secondary">Hydration status</dt>
          <dd className="font-studio-mono text-studio-text-primary">{status}</dd>

          <dt className="text-studio-text-secondary">Keys in allSections</dt>
          <dd className="font-studio-mono text-studio-text-primary">{keyCount}</dd>

          <dt className="text-studio-text-secondary">Missing IDs</dt>
          <dd className="font-studio-mono text-studio-text-primary">{missingCount}</dd>

          <dt className="text-studio-text-secondary">Not built here</dt>
          <dd className="font-studio-mono text-studio-text-primary">{unbuilt.length}</dd>
        </dl>

        {unbuilt.length > 0 ? (
          <p className="mt-3 text-studio-text-secondary">
            {unbuilt.length} section{unbuilt.length === 1 ? '' : 's'} on this page {unbuilt.length === 1 ? 'has' : 'have'} content
            saved but no component file on this machine, so {unbuilt.length === 1 ? 'it is' : 'they are'} not shown. Generate
            {unbuilt.length === 1 ? ' it' : ' them'} again from the Studio to see {unbuilt.length === 1 ? 'it' : 'them'} render.
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-studio-sm bg-studio-destructive/10 border border-studio-destructive/30 p-3 text-studio-destructive">{error}</p>
        ) : null}

        {keyCount === 0 ? (
          <p className="mt-3 rounded-studio-sm bg-studio-warn/10 border border-studio-warn/30 p-3 text-studio-warn">
            No content loaded for <span className="font-medium">{pageName}</span>. The sections
            below are showing their built-in defaults, so the page looks finished while nothing is
            actually coming from the store — check that the API is running.
          </p>
        ) : null}
      </details>
    </main>
  );
}
