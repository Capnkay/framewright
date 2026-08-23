import { Download } from "lucide-react";
import { DesignCanvas } from "./DesignTab";
import { downloadCode } from "../../data/mock";

export function SectionEditor({ elements, accent, code, selectedField, setSelectedField, onUpdate }) {
  return (
    <div className="section-editor" data-testid="composer-section-editor-wrap">
      <DesignCanvas elements={elements} accent={accent} selectedId={selectedField} onSelect={setSelectedField} onUpdate={onUpdate} scope="composer" />
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
