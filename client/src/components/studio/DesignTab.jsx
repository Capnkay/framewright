import { useState } from "react";
import { motion } from "framer-motion";
import { CANVAS_H, CANVAS_W, ELEMENT_LABELS } from "../../data/mock";

const WEIGHTS = [400, 500, 600, 650, 700];
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

export function DesignLayers({ elements, selectedId, onSelect, onReorder, scope = "pipeline" }) {
  const selectedEl = elements.find(e => e.id === selectedId) || elements[0];
  const p = scope === "composer" ? "composer-" : "";
  const tid = name => `${p}${name}`;
  return (
    <div className="design-layers" data-testid={tid("design-layers-list")}>
      <span className="design-layers-label">LAYERS</span>
      {elements.map((el, i) => (
        <div key={el.id} className={`design-layer-row ${selectedEl?.id === el.id ? "selected" : ""}`} onClick={() => onSelect(el.id)} data-testid={tid(`design-layer-${el.id}`)}>
          <span>{el.label || ELEMENT_LABELS[el.id] || el.id}</span>
          <div className="design-layer-actions">
            <button type="button" disabled={i === 0} onClick={e => { e.stopPropagation(); onReorder(el.id, -1); }} data-testid={tid(`design-layer-${el.id}-up`)}>&#8593;</button>
            <button type="button" disabled={i === elements.length - 1} onClick={e => { e.stopPropagation(); onReorder(el.id, 1); }} data-testid={tid(`design-layer-${el.id}-down`)}>&#8595;</button>
          </div>
        </div>
      ))}
      <p className="design-hint">Drag blocks on the canvas to reposition them freely.</p>
    </div>
  );
}

export function DesignCanvas({ elements, selectedId, onSelect, onUpdate, accent, scope = "pipeline" }) {
  const selectedEl = elements.find(e => e.id === selectedId) || elements[0];
  const effectiveColor = /^#[0-9a-fA-F]{3,8}$/.test(accent || "") ? accent : "#3b82f6";
  const p = scope === "composer" ? "composer-" : "";
  const tid = name => `${p}${name}`;
  const actualHeight = Math.max(CANVAS_H, elements.reduce((max, el) => Math.max(max, (el.y || 0) + (el.height || 50)), CANVAS_H) + 50);

  return (
    <div className="design-canvas-wrap" style={{ overflowY: 'auto' }}>
      <div className={`design-canvas ${elements.length === 0 ? 'empty' : ''}`} style={{ width: CANVAS_W, height: actualHeight }} data-testid={tid("design-canvas")}>
        {elements.length === 0 ? (
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#71717a', fontSize: '13px'}}>
            Awaiting generation...
          </div>
        ) : (
          elements.map(el => {
            const bg = el.bg || (el.type === "button" ? effectiveColor : el.type === "image" ? "#e5e5e0" : "transparent");
            const maxX = Math.max(0, CANVAS_W - el.width);
            const maxY = Math.max(0, actualHeight - (el.height || 30));
            return (
              <motion.div
                key={el.id}
                className={`design-block type-${el.type} ${selectedEl?.id === el.id ? "selected" : ""}`}
                style={{
                  x: el.x, y: el.y, width: el.width, height: el.height || undefined,
                  fontSize: el.fontSize || undefined, fontWeight: el.fontWeight || undefined,
                  color: el.color || undefined, background: bg, textAlign: el.align, padding: el.padding,
                  position: 'absolute',
                  borderRadius: el.borderRadius, boxShadow: el.boxShadow
                }}
                drag dragMomentum={false}
                dragConstraints={{ left: 0, top: 0, right: maxX, bottom: maxY }}
                onPointerDown={() => onSelect(el.id)}
                onDragEnd={(e, info) => onUpdate(el.id, {
                  x: Math.round(clamp(el.x + info.offset.x, 0, maxX)),
                  y: Math.round(clamp(el.y + info.offset.y, 0, maxY)),
                })}
                data-testid={tid(`design-block-${el.id}`)}
              >
                {el.type !== "image" ? el.content : null}
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function DesignInspector({ elements, selectedId, accent, onUpdate, onContentChange, scope = "pipeline" }) {
  const selectedEl = elements.find(e => e.id === selectedId) || elements[0];
  const effectiveColor = /^#[0-9a-fA-F]{3,8}$/.test(accent || "") ? accent : "#3b82f6";
  const p = scope === "composer" ? "composer-" : "";
  const tid = name => `${p}${name}`;

  if (!selectedEl) return null;

  return (
    <div className="design-inspector" data-testid={tid("design-inspector")}>
      <div className="design-inspector-head">{selectedEl.label || ELEMENT_LABELS[selectedEl.id] || selectedEl.id}</div>
      {selectedEl.type !== "image" && (
        <label className="field">Content
          <textarea value={selectedEl.content} onChange={e => onContentChange(selectedEl.id, e.target.value)} data-testid={tid("design-content-input")} />
        </label>
      )}
      <div className="design-inspector-grid">
        {selectedEl.type !== "image" && (
          <>
            <label>Font size<input type="number" value={selectedEl.fontSize} onChange={e => onUpdate(selectedEl.id, { fontSize: Number(e.target.value) })} data-testid={tid("design-fontsize-input")} /></label>
            <label>Weight
              <select value={selectedEl.fontWeight} onChange={e => onUpdate(selectedEl.id, { fontWeight: Number(e.target.value) })} data-testid={tid("design-fontweight-select")}>
                {WEIGHTS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </label>
            <label>Text colour<input type="color" value={selectedEl.color} onChange={e => onUpdate(selectedEl.id, { color: e.target.value })} data-testid={tid("design-textcolor-input")} /></label>
          </>
        )}
        <label>Background<input type="color" value={selectedEl.bg || effectiveColor} onChange={e => onUpdate(selectedEl.id, { bg: e.target.value })} data-testid={tid("design-bgcolor-input")} /></label>
        <label>Width<input type="number" value={selectedEl.width} onChange={e => onUpdate(selectedEl.id, { width: Number(e.target.value) })} data-testid={tid("design-width-input")} /></label>
        {selectedEl.type === "image" && <label>Height<input type="number" value={selectedEl.height || 0} onChange={e => onUpdate(selectedEl.id, { height: Number(e.target.value) })} data-testid={tid("design-height-input")} /></label>}
        <label>Padding<input type="number" value={selectedEl.padding} onChange={e => onUpdate(selectedEl.id, { padding: Number(e.target.value) })} data-testid={tid("design-padding-input")} /></label>
      </div>
      {selectedEl.type !== "image" && (
        <div className="design-align-row" data-testid={tid("design-align-selector")}>
          {["left", "center", "right"].map(a => (
            <button key={a} type="button" className={selectedEl.align === a ? "selected" : ""} onClick={() => onUpdate(selectedEl.id, { align: a })} data-testid={tid(`design-align-${a}-button`)}>{a}</button>
          ))}
        </div>
      )}
      {selectedEl.bg && <button type="button" className="accent-reset design-bg-reset" onClick={() => onUpdate(selectedEl.id, { bg: "" })} data-testid={tid("design-bg-reset")}>Reset to accent</button>}
    </div>
  );
}

export function DesignTab({ elements, accent, onUpdate, onReorder, onContentChange, scope = "pipeline" }) {
  const [selected, setSelected] = useState(elements[0]?.id || null);

  return (
    <div className="design-tab" data-testid={scope === "composer" ? "composer-section-editor" : "pipeline-design-tab"}>
      <DesignLayers elements={elements} selectedId={selected} onSelect={setSelected} onReorder={onReorder} scope={scope} />
      <DesignCanvas elements={elements} selectedId={selected} onSelect={setSelected} onUpdate={onUpdate} accent={accent} scope={scope} />
      <DesignInspector elements={elements} selectedId={selected} accent={accent} onUpdate={onUpdate} onContentChange={onContentChange} scope={scope} />
    </div>
  );
}
