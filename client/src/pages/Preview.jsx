import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, RotateCw, Monitor, Smartphone, Tablet, ExternalLink, Code, LayoutGrid, Download } from "lucide-react";
import SideEditor from "../studio/SideEditor";
import { useDispatch } from "react-redux";
import { fetchElementsByIds } from "../redux/fetchElementsByIds.js";
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/themes/prism-tomorrow.css';

const generatedModules = import.meta.glob('../sections/generated/*.jsx', { eager: true });

function componentKeyFor(section) {
  if (section.componentFile) {
    const basename = String(section.componentFile).split(/[\\/]/).pop();
    return `../sections/generated/${basename}`;
  }
  const safeName = String(section.sectionName || 'Section').replace(/[^a-zA-Z0-9_]/g, '');
  const variation = section.variation || 1;
  return `../sections/generated/${safeName}-${section.sectionId}-v${variation}.jsx`;
}

function SectionWrapper({ section, Component, pageName }) {
  return (
    <div className="relative group mb-8">
      <Component key={section.sectionId} pageName={pageName} />
    </div>
  );
}

const VP_WIDTHS = { Desktop: "100%", Tablet: "768px", Mobile: "375px" };
const VP_ICONS = { Desktop: Monitor, Tablet: Tablet, Mobile: Smartphone };

export default function Preview() {
  const { pageName = 'Home' } = useParams();
  const navigate = useNavigate();
  const [sectionDocs, setSectionDocs] = useState([]);
  const [viewport, setViewport] = useState("Desktop");
  const [reloadKey, setReloadKey] = useState(0);
  const [viewMode, setViewMode] = useState('design'); // 'design' | 'code'
  const [displayFilter, setDisplayFilter] = useState('latest'); // 'latest' | 'all'
  const [codeText, setCodeText] = useState('');
  
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [editorPos, setEditorPos] = useState({ top: 0, left: 0 });

  const dispatch = useDispatch();

  useEffect(() => {
    let active = true;
    fetch('/api/sections')
      .then((r) => r.json())
      .then((sections) => {
        if (!active) return;
        const docs = sections.filter(s => s.pageName === pageName);
        setSectionDocs(docs);

        // Fetch latest generated code for the Code Editor tab
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
      .catch((err) => console.error(err));

    // Hydrate Redux with the CMS data for this page
    dispatch(fetchElementsByIds({ pageName }));
    return () => { active = false; };
  }, [pageName, dispatch, reloadKey]);

  const handleDocumentClick = (e) => {
    const ignoreClicks = e.target.closest('.side-editor-ignore');
    if (ignoreClicks) return;
    
    const editable = e.target.closest('[data-field-id]');
    if (editable) {
      e.preventDefault();
      e.stopPropagation();
      const rect = editable.getBoundingClientRect();
      const id = editable.getAttribute('data-field-id');
      setEditorPos({ top: rect.top + window.scrollY, left: rect.right + 10 });
      setEditingFieldId(id);
    } else {
      setEditingFieldId(null);
    }
  };

  useEffect(() => {
    document.addEventListener('click', handleDocumentClick, { capture: true });
    return () => document.removeEventListener('click', handleDocumentClick, { capture: true });
  }, []);

  const highlightWithPrism = (codeStr) => {
    return Prism.highlight(codeStr || '', Prism.languages.jsx, 'jsx');
  };

  // Display only the latest section by default to avoid stacking old test sections
  const filteredDocs = displayFilter === 'latest' && sectionDocs.length > 0 
    ? [sectionDocs[sectionDocs.length - 1]] 
    : sectionDocs;

  return (
    <div className="live-preview-page min-h-screen flex flex-col bg-[#0b0b0c]">
      {/* ── Top Bar ── */}
      <div className="preview-toolbar side-editor-ignore shrink-0" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: '12px' }}>
        {/* Left: Back + Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={() => navigate('/generate')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--muted)', borderRadius: 8, cursor: 'pointer' }}
            title="Back to Studio"
            data-testid="preview-back-button"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '1px', color: 'var(--dim)', textTransform: 'uppercase' }}>LIVE PREVIEW</div>
            <h1 style={{ fontSize: '18px', letterSpacing: '-.04em', margin: '2px 0 0', color: 'var(--text)' }}>{pageName}</h1>
          </div>
        </div>

        {/* Center: Viewport & Section View Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Viewport toggle */}
          <div style={{ display: 'flex', background: 'var(--bg)', padding: '3px', borderRadius: '8px', border: '1px solid var(--line)' }}>
            {Object.keys(VP_WIDTHS).map(vp => {
              const Icon = VP_ICONS[vp];
              return (
                <button
                  key={vp}
                  onClick={() => setViewport(vp)}
                  data-testid={`preview-vp-${vp.toLowerCase()}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '6px 10px', fontSize: '10px', border: 'none',
                    background: viewport === vp ? '#2a2a2e' : 'transparent',
                    color: viewport === vp ? 'var(--text)' : 'var(--dim)',
                    borderRadius: '6px', cursor: 'pointer',
                  }}
                >
                  <Icon size={13} />{vp}
                </button>
              );
            })}
          </div>

          {/* Section Filter: Latest vs All Stacked */}
          <div style={{ display: 'flex', background: 'var(--bg)', padding: '3px', borderRadius: '8px', border: '1px solid var(--line)' }}>
            <button 
              onClick={() => setDisplayFilter('latest')}
              style={{
                padding: '6px 10px', fontSize: '10px', border: 'none',
                background: displayFilter === 'latest' ? '#2a2a2e' : 'transparent',
                color: displayFilter === 'latest' ? 'var(--text)' : 'var(--dim)',
                borderRadius: '6px', cursor: 'pointer', fontWeight: 600
              }}
            >
              Latest Section
            </button>
            <button 
              onClick={() => setDisplayFilter('all')}
              style={{
                padding: '6px 10px', fontSize: '10px', border: 'none',
                background: displayFilter === 'all' ? '#2a2a2e' : 'transparent',
                color: displayFilter === 'all' ? 'var(--text)' : 'var(--dim)',
                borderRadius: '6px', cursor: 'pointer'
              }}
            >
              All Stacked ({sectionDocs.length})
            </button>
          </div>
        </div>

        {/* Right: Actions + View Mode (Design vs Code Editor) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Design / Code Toggle */}
          <div style={{ display: 'flex', background: 'var(--bg)', padding: '3px', borderRadius: '8px', border: '1px solid var(--line)', marginRight: '6px' }}>
            <button 
              onClick={() => setViewMode('design')}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '6px 10px', fontSize: '10px', border: 'none',
                background: viewMode === 'design' ? 'var(--blue)' : 'transparent',
                color: viewMode === 'design' ? '#fff' : 'var(--dim)',
                borderRadius: '6px', cursor: 'pointer', fontWeight: 600
              }}
            >
              <LayoutGrid size={13} /> Design
            </button>
            <button 
              onClick={() => setViewMode('code')}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '6px 10px', fontSize: '10px', border: 'none',
                background: viewMode === 'code' ? 'var(--blue)' : 'transparent',
                color: viewMode === 'code' ? '#fff' : 'var(--dim)',
                borderRadius: '6px', cursor: 'pointer', fontWeight: 600
              }}
            >
              <Code size={13} /> Code Editor
            </button>
          </div>

          <button
            onClick={() => setReloadKey(k => k + 1)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--muted)', borderRadius: 8, cursor: 'pointer' }}
            title="Reload Preview"
            data-testid="preview-reload-button"
          >
            <RotateCw size={14} />
          </button>
          <button
            onClick={() => window.open(`/preview/${pageName}`, '_blank')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--muted)', borderRadius: 8, cursor: 'pointer' }}
            title="Open in New Tab"
            data-testid="preview-newtab-button"
          >
            <ExternalLink size={14} />
          </button>
        </div>
      </div>
      
      {/* ── Main View Area (No dark mode fade bug) ── */}
      <div className="flex-1 overflow-y-auto w-full p-4" style={{ background: '#0b0b0c' }}>
        {viewMode === 'design' ? (
          <div 
            className="custom-preview-frame mx-auto" 
            data-testid="custom-preview-frame"
            style={{
              minHeight: '600px',
              background: '#ffffff',
              borderRadius: '8px',
              position: 'relative',
              width: VP_WIDTHS[viewport],
              maxWidth: VP_WIDTHS[viewport],
              transition: 'width 0.3s ease, max-width 0.3s ease',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              overflow: 'hidden'
            }}
          >
            {filteredDocs.length === 0 ? (
              <div style={{ padding: '3rem', color: '#666', textAlign: 'center' }}>
                No sections generated for {pageName} yet. Head to the Studio to create one.
              </div>
            ) : (
              filteredDocs.map((section) => {
                const modKey = componentKeyFor(section);
                const mod = generatedModules[modKey];
                const Component = mod ? mod.default : null;

                if (!Component) {
                  return (
                    <div key={section.sectionId} style={{ padding: '2rem', color: '#ef4444', background: '#fef2f2', borderBottom: '1px solid #fee2e2' }}>
                      Failed to load component {modKey.split('/').pop()} &mdash; the section record exists but no generated file matches §7&rsquo;s name.
                    </div>
                  );
                }

                return (
                  <SectionWrapper 
                    key={section.sectionId} 
                    section={section} 
                    Component={Component} 
                    pageName={pageName} 
                  />
                );
              })
            )}

            {editingFieldId && (
              <div
                style={{
                  position: 'absolute',
                  top: editorPos.top,
                  left: editorPos.left,
                  zIndex: 9999
                }}
                className="side-editor-ignore"
              >
                <SideEditor
                  fieldId={editingFieldId}
                  onClose={() => setEditingFieldId(null)}
                />
              </div>
            )}
          </div>
        ) : (
          /* Code Editor View Mode */
          <div style={{ maxWidth: '1100px', margin: '0 auto', background: '#101012', border: '1px solid var(--line)', borderRadius: '10px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--line)' }}>
              <span style={{ font: '11px/1.4 "JetBrains Mono", monospace', color: 'var(--blue2)', fontWeight: 600 }}>
                Generated React Component Code (.jsx)
              </span>
              <button 
                onClick={() => {
                  const blob = new Blob([codeText], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${pageName}.jsx`;
                  a.click();
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#1b1b1f', border: '1px solid var(--line)', borderRadius: '6px', color: 'var(--text)', fontSize: '11px', cursor: 'pointer' }}
              >
                <Download size={13} /> Download .jsx
              </button>
            </div>
            <div style={{ maxHeight: '600px', overflowY: 'auto', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', background: '#0b0b0c', padding: '12px' }}>
              <Editor
                value={codeText || '// Loading generated React component source...'}
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
      </div>
    </div>
  );
}
