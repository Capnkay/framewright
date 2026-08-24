import { useState } from "react";
import { Download, Eye, Code, Maximize, LayoutGrid, RotateCw, Monitor, Smartphone } from "lucide-react";
import { Link } from "react-router-dom";
import { DesignCanvas } from "./DesignTab";
import { downloadCode } from "../../data/mock";
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/themes/prism-tomorrow.css'; // dark theme for prism

// WHY THE PREVIEW IS AN IFRAME OF /preview AND NOT A CANVAS.
//
// This pane used to render DesignCanvas in "preview" mode. DesignCanvas draws
// the element list at x/y coordinates the Studio invents after generation
// (20px in, 60px apart — see Studio.jsx), so every section came out as the same
// left-aligned column of boxes no matter what the IR said. A pricing table, a
// testimonial and a FAQ were indistinguishable, which read as "the model is not
// working" when the model was fine and the preview was mock.
//
// /preview/:pageName renders the component the emitter actually wrote, bound to
// the CMS store — the same surface the demo shows and the same one §9's
// store-liveness assertion walks. Framing it here means the Studio cannot drift
// from the product again. GeneratePage.jsx already frames it the same way.
//
// The canvas is still reachable under its own tab; it is a layout editor, and
// that is an honest label for it. It is no longer allowed to impersonate the
// generated section.

export function SectionEditor({ elements, accent, code, selectedField, setSelectedField, onUpdate, onCodeChange, pageName = "Home", previewKey = 0, viewMode, setViewMode }) {
  const [reloadNonce, setReloadNonce] = useState(0);
  const [isDesktop, setIsDesktop] = useState(true);

  const previewSrc = `/preview/${encodeURIComponent(pageName || "Home")}`;

  const TABS = [
    { id: "design", label: "Design", Icon: LayoutGrid },
    { id: "code", label: "Code", Icon: Code },
  ];

  const highlightWithPrism = (codeStr) => {
    return Prism.highlight(codeStr || '', Prism.languages.jsx, 'jsx');
  };

  return (
    <div className="section-editor" data-testid="composer-section-editor-wrap" style={{ display: 'flex', flexDirection: 'column', flex: viewMode === "code" ? '1 1 auto' : 'unset', minHeight: viewMode === "code" ? '400px' : 'auto' }}>

      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>

        <div>
          {viewMode === "code" ? (
            <button className="text-btn" type="button" onClick={() => downloadCode(code)} data-testid="download-code-button">
              <Download size={13} /> Download .jsx
            </button>
          ) : (
            <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', letterSpacing: '1px' }}>LAYOUT EDITOR</span>
          )}
        </div>

        {/* Right side: Toggle */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {viewMode === "design" && (
            <>
              <button
                type="button"
                onClick={() => setIsDesktop(!isDesktop)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', color: 'var(--text-muted)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }}
                title={isDesktop ? "Switch to Mobile View" : "Switch to Desktop View"}
              >
                {isDesktop ? <Monitor size={14} /> : <Smartphone size={14} />}
              </button>
              <Link
                to={previewSrc}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', color: 'var(--text-muted)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', textDecoration: 'none' }}
                title="Full Screen Preview"
              >
                <Maximize size={14} />
              </Link>
            </>
          )}
          <div style={{ display: 'flex', background: 'var(--bg)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)' }}>
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setViewMode(id)}
                data-testid={`section-editor-${id}-button`}
                style={{ padding: '4px 10px', fontSize: '12px', border: 'none', background: viewMode === id ? 'var(--surface)' : 'transparent', color: viewMode === id ? 'var(--text)' : 'var(--text-muted)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', background: isDesktop || viewMode === "code" ? 'transparent' : '#1a1a1c', overflow: 'hidden', transition: 'background 0.2s', borderRadius: '0 0 8px 8px' }}>
        <div style={{ width: isDesktop || viewMode === "code" ? '100%' : 360, flexShrink: 0, transition: 'width 0.2s', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
          {viewMode === "design" ? (
            <DesignCanvas elements={elements} accent={accent} selectedId={selectedField} onSelect={setSelectedField} onUpdate={onUpdate} scope="composer" />
          ) : (
            <div className="section-editor-code-preview" data-testid="composer-code-preview" style={{ flex: 1, margin: 0, padding: 0, borderTop: 'none', borderRadius: '0 0 8px 8px', maxHeight: 'none', display: 'flex', flexDirection: 'column', overflow: 'auto', background: '#1d1f21' }}>
              <Editor
                value={code || ''}
                onValueChange={codeStr => onCodeChange ? onCodeChange(codeStr) : null}
                highlight={highlightWithPrism}
                padding={16}
                style={{
                  fontFamily: '"Fira code", "Fira Mono", monospace',
                  fontSize: 12,
                  minHeight: '100%',
                  outline: 'none'
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
