import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Code, LayoutGrid, RotateCw, ArrowLeft, Download, Layers } from 'lucide-react';
import SideEditor from '../studio/SideEditor';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/themes/prism-tomorrow.css';

// Eagerly discover all generated JSX components.
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
    <div className="relative group border border-studio-border rounded-studio-lg mb-6 p-4 bg-studio-bg-raised">
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
  const [viewMode, setViewMode] = useState('design'); // 'design' | 'code'
  const [displayFilter, setDisplayFilter] = useState('latest'); // 'latest' | 'all'
  const [codeText, setCodeText] = useState('');
  
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [editorPos, setEditorPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    let active = true;
    fetch(`/api/sections?pageName=${pageName}`)
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        const docs = Array.isArray(data) ? data : [];
        setSectionDocs(docs);

        // Fetch latest component code for code editor
        if (docs.length > 0) {
          const latestDoc = docs[docs.length - 1];
          if (latestDoc?.jobId) {
            fetch(`/api/jobs/${latestDoc.jobId}/component`)
              .then(r => r.ok ? r.text() : '')
              .then(code => { if (active && code) setCodeText(code); })
              .catch(() => {});
          }
        }
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

  const highlightWithPrism = (codeStr) => {
    return Prism.highlight(codeStr || '', Prism.languages.jsx, 'jsx');
  };

  const keyCount = sections ? Object.keys(sections).length : 0;
  const missingCount = Array.isArray(missing) ? missing.length : 0;
  const unbuilt = [];

  // Filter sections: if displayFilter === 'latest', show only the newest section!
  const filteredDocs = displayFilter === 'latest' && sectionDocs.length > 0 
    ? [sectionDocs[sectionDocs.length - 1]] 
    : sectionDocs;

  const renderedSections = filteredDocs.map((section) => {
    const safeName = String(section.sectionName || 'Section').replace(/[^a-zA-Z0-9_]/g, '');
    const filename = `${safeName}-${section.sectionId}-v${section.variations || section.variation || '1'}.jsx`;
    const moduleKey = `../sections/generated/${filename}`;
    const Component = generatedModules[moduleKey]?.default;

    if (!Component) {
      unbuilt.push(section);
      return null;
    }
    
    return <SectionWrapper key={section.sectionId} section={section} Component={Component} pageName={pageName} />;
  });

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-studio-bg-base p-6 text-studio-text-primary relative">
      
      {/* Top Preview Control Bar */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6 pb-4 border-b border-studio-border bg-studio-bg-raised p-4 rounded-studio-lg shadow-studio-sm">
        <div className="flex items-center gap-3">
          <Link to="/" className="p-2 rounded-studio-md hover:bg-studio-bg-base text-studio-text-secondary hover:text-studio-text-primary transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-studio-lg font-bold tracking-tight text-studio-text-primary">
              Live Preview: <span className="text-studio-accent">{pageName}</span>
            </h1>
            <p className="text-studio-xs text-studio-text-secondary">
              {displayFilter === 'latest' ? 'Showing latest generation' : `Showing all ${sectionDocs.length} sections`}
            </p>
          </div>
        </div>

        {/* Action Controls & Mode Selectors */}
        <div className="flex items-center gap-3">
          {/* Display Mode Filter: Latest vs All */}
          <div className="flex bg-studio-bg-base border border-studio-border p-1 rounded-studio-md text-studio-xs">
            <button 
              onClick={() => setDisplayFilter('latest')}
              className={`px-3 py-1.5 rounded-studio-sm font-medium transition-all ${displayFilter === 'latest' ? 'bg-studio-bg-overlay text-studio-text-primary shadow-sm' : 'text-studio-text-secondary hover:text-studio-text-primary'}`}
            >
              Latest Section
            </button>
            <button 
              onClick={() => setDisplayFilter('all')}
              className={`px-3 py-1.5 rounded-studio-sm font-medium transition-all ${displayFilter === 'all' ? 'bg-studio-bg-overlay text-studio-text-primary shadow-sm' : 'text-studio-text-secondary hover:text-studio-text-primary'}`}
            >
              All Stacked ({sectionDocs.length})
            </button>
          </div>

          {/* View Mode Toggle: Design Preview vs Code Editor */}
          <div className="flex bg-studio-bg-base border border-studio-border p-1 rounded-studio-md text-studio-xs">
            <button 
              onClick={() => setViewMode('design')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-studio-sm font-medium transition-all ${viewMode === 'design' ? 'bg-studio-accent text-studio-accent-foreground shadow-sm' : 'text-studio-text-secondary hover:text-studio-text-primary'}`}
            >
              <LayoutGrid size={14} /> Design
            </button>
            <button 
              onClick={() => setViewMode('code')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-studio-sm font-medium transition-all ${viewMode === 'code' ? 'bg-studio-accent text-studio-accent-foreground shadow-sm' : 'text-studio-text-secondary hover:text-studio-text-primary'}`}
            >
              <Code size={14} /> Code Editor
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === 'design' ? (
        <div className="flex flex-col gap-8">
          {renderedSections}
          {sectionDocs.length === 0 && (
            <p className="max-w-prose rounded-studio-lg border border-dashed border-studio-border p-6 text-studio-sm text-studio-text-secondary">
              No sections on <span className="font-medium text-studio-text-primary">{pageName}</span> yet.
              Generate one in the Studio and it will appear here.
            </p>
          )}
        </div>
      ) : (
        /* Full Code Editor View */
        <div className="rounded-studio-lg border border-studio-border bg-[#0d0d0e] p-4 shadow-studio-lg">
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-studio-border/50 text-studio-xs text-studio-text-secondary">
            <span className="font-mono text-studio-accent">Component Source Code (.jsx)</span>
            <button 
              onClick={() => {
                const blob = new Blob([codeText], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${pageName}.jsx`;
                a.click();
              }}
              className="flex items-center gap-1.5 px-3 py-1 bg-studio-bg-overlay border border-studio-border hover:border-studio-accent rounded-studio-md text-studio-text-primary transition-all"
            >
              <Download size={13} /> Download .jsx
            </button>
          </div>
          <div className="overflow-auto max-h-[650px] font-mono text-studio-xs rounded-studio-md border border-studio-border/40 p-3 bg-[#111113]">
            <Editor
              value={codeText || '// Loading generated React code...'}
              onValueChange={code => setCodeText(code)}
              highlight={highlightWithPrism}
              padding={10}
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 13,
                backgroundColor: 'transparent',
              }}
            />
          </div>
        </div>
      )}

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

      {/* Status Details */}
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

        {unbuilt.length > 0 && (
          <p className="mt-3 text-studio-text-secondary">
            {unbuilt.length} section{unbuilt.length === 1 ? '' : 's'} on this page {unbuilt.length === 1 ? 'has' : 'have'} content
            saved but no component file on this machine, so {unbuilt.length === 1 ? 'it is' : 'they are'} not shown.
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-studio-sm bg-studio-destructive/10 border border-studio-destructive/30 p-3 text-studio-destructive">{error}</p>
        )}
      </details>
    </main>
  );
}
