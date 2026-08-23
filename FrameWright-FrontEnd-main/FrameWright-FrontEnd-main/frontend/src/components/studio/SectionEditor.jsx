import { Download } from "lucide-react";
import { DesignTab } from "./DesignTab";
import { downloadCode } from "../../data/mock";

export function SectionEditor({ elements, accent, code, onUpdate, onReorder, onContentChange }) {
  return (
    <div className="section-editor" data-testid="composer-section-editor-wrap">
      <div className="disclosure-toggle section-editor-label"><span>&#9662; Edit layout &amp; content</span></div>
      <DesignTab elements={elements} accent={accent} onUpdate={onUpdate} onReorder={onReorder} onContentChange={onContentChange} scope="composer" />
      <div className="section-editor-code">
        <div className="section-editor-code-head">
          <span>GENERATED CODE</span>
          <button type="button" onClick={() => downloadCode(code)} data-testid="download-code-button"><Download size={13} /> Download .jsx</button>
        </div>
        <pre className="section-editor-code-preview" data-testid="composer-code-preview">{code}</pre>
      </div>
    </div>
  );
}
