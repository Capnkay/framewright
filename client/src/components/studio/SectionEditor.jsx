import { useState } from "react";
import { Download, Eye, Code } from "lucide-react";
import { DesignCanvas } from "./DesignTab";
import { downloadCode } from "../../data/mock";

export function SectionEditor({ elements, accent, code, selectedField, setSelectedField, onUpdate }) {
  const [viewMode, setViewMode] = useState("preview");

  return (
    <div className="section-editor" data-testid="composer-section-editor-wrap" style={{ display: 'flex', flexDirection: 'column' }}>
      
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        
        {/* Left side: Download Button OR Label */}
        <div>
          {viewMode === "code" ? (
            <button className="text-btn" type="button" onClick={() => downloadCode(code)} data-testid="download-code-button">
              <Download size={13} /> Download .jsx
            </button>
          ) : (
            <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', letterSpacing: '1px' }}>PREVIEW</span>
          )}
        </div>

        {/* Right side: Toggle */}
        <div style={{ display: 'flex', background: 'var(--bg)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <button 
            onClick={() => setViewMode("preview")}
            style={{ padding: '4px 10px', fontSize: '12px', border: 'none', background: viewMode === "preview" ? 'var(--surface)' : 'transparent', color: viewMode === "preview" ? 'var(--text)' : 'var(--text-muted)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Eye size={14} /> Preview
          </button>
          <button 
            onClick={() => setViewMode("code")}
            style={{ padding: '4px 10px', fontSize: '12px', border: 'none', background: viewMode === "code" ? 'var(--surface)' : 'transparent', color: viewMode === "code" ? 'var(--text)' : 'var(--text-muted)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Code size={14} /> Code
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === "preview" ? (
        <DesignCanvas elements={elements} accent={accent} selectedId={selectedField} onSelect={setSelectedField} onUpdate={onUpdate} scope="composer" />
      ) : (
        <pre className="section-editor-code-preview" data-testid="composer-code-preview" style={{ flex: 1, margin: 0, padding: '16px', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
          {code}
        </pre>
      )}

    </div>
  );
}
