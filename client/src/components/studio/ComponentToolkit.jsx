import { useState } from "react";
import {
  Plus, Square, Type, Image, CreditCard, ToggleLeft,
  Circle, Minus, TextCursor, Star, ChevronDown, Layers,
  Settings2, Palette, Move, Eye, EyeOff
} from "lucide-react";

/* ─── component library ─────────────────────────────────────────── */

const COMPONENT_LIBRARY = [
  {
    id: "card",
    label: "Card",
    Icon: CreditCard,
    category: "Layout",
    defaults: {
      type: "text", tag: "div",
      content: "Card content goes here",
      width: 280, height: 160, fontSize: 13, fontWeight: 400,
      color: "#18181b", bg: "#ffffff", align: "left", padding: 16,
      borderRadius: 12, opacity: 1, boxShadow: "sm", border: "1px solid #e4e4e7",
      overflow: "hidden",
    },
  },
  {
    id: "button",
    label: "Button",
    Icon: Square,
    category: "Interactive",
    defaults: {
      type: "button", tag: "button",
      content: "Click me",
      width: 140, height: null, fontSize: 13, fontWeight: 600,
      color: "#ffffff", bg: "", align: "center", padding: 12,
      borderRadius: 8, opacity: 1, boxShadow: "none", border: "none",
      overflow: "visible",
    },
  },
  {
    id: "badge",
    label: "Badge",
    Icon: Star,
    category: "Interactive",
    defaults: {
      type: "text", tag: "span",
      content: "New",
      width: 56, height: null, fontSize: 10, fontWeight: 600,
      color: "#ffffff", bg: "#3b82f6", align: "center", padding: 6,
      borderRadius: 999, opacity: 1, boxShadow: "none", border: "none",
      overflow: "visible",
    },
  },
  {
    id: "avatar",
    label: "Avatar",
    Icon: Circle,
    category: "Media",
    defaults: {
      type: "image", tag: "div",
      content: "",
      width: 48, height: 48, fontSize: 0, fontWeight: 400,
      color: "", bg: "#d4d4d8", align: "center", padding: 0,
      borderRadius: 999, opacity: 1, boxShadow: "none", border: "2px solid #e4e4e7",
      overflow: "hidden",
    },
  },
  {
    id: "text-block",
    label: "Text Block",
    Icon: Type,
    category: "Typography",
    defaults: {
      type: "text", tag: "p",
      content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
      width: 340, height: null, fontSize: 14, fontWeight: 400,
      color: "#52525b", bg: "transparent", align: "left", padding: 0,
      borderRadius: 0, opacity: 1, boxShadow: "none", border: "none",
      overflow: "visible",
    },
  },
  {
    id: "heading",
    label: "Heading",
    Icon: Type,
    category: "Typography",
    defaults: {
      type: "text", tag: "h2",
      content: "Section Heading",
      width: 380, height: null, fontSize: 28, fontWeight: 700,
      color: "#18181b", bg: "transparent", align: "left", padding: 0,
      borderRadius: 0, opacity: 1, boxShadow: "none", border: "none",
      overflow: "visible",
    },
  },
  {
    id: "input-field",
    label: "Input",
    Icon: TextCursor,
    category: "Interactive",
    defaults: {
      type: "text", tag: "div",
      content: "Placeholder text...",
      width: 260, height: null, fontSize: 13, fontWeight: 400,
      color: "#a1a1aa", bg: "#fafafa", align: "left", padding: 12,
      borderRadius: 8, opacity: 1, boxShadow: "none", border: "1px solid #d4d4d8",
      overflow: "hidden",
    },
  },
  {
    id: "divider",
    label: "Divider",
    Icon: Minus,
    category: "Layout",
    defaults: {
      type: "image", tag: "div",
      content: "",
      width: 380, height: 1, fontSize: 0, fontWeight: 400,
      color: "", bg: "#e4e4e7", align: "left", padding: 0,
      borderRadius: 0, opacity: 1, boxShadow: "none", border: "none",
      overflow: "visible",
    },
  },
  {
    id: "image-block",
    label: "Image",
    Icon: Image,
    category: "Media",
    defaults: {
      type: "image", tag: "div",
      content: "",
      width: 300, height: 200, fontSize: 0, fontWeight: 400,
      color: "", bg: "#e5e5e0", align: "center", padding: 0,
      borderRadius: 8, opacity: 1, boxShadow: "sm", border: "none",
      overflow: "hidden",
    },
  },
  {
    id: "toggle",
    label: "Toggle",
    Icon: ToggleLeft,
    category: "Interactive",
    defaults: {
      type: "text", tag: "div",
      content: "⚪",
      width: 44, height: 24, fontSize: 14, fontWeight: 400,
      color: "#ffffff", bg: "#3b82f6", align: "left", padding: 2,
      borderRadius: 999, opacity: 1, boxShadow: "none", border: "none",
      overflow: "hidden",
    },
  },
];

const CATEGORIES = ["All", "Layout", "Typography", "Interactive", "Media"];

const SHADOW_PRESETS = [
  { label: "None", value: "none" },
  { label: "XS", value: "xs" },
  { label: "SM", value: "sm" },
  { label: "MD", value: "md" },
  { label: "LG", value: "lg" },
  { label: "XL", value: "xl" },
];

const OVERFLOW_OPTIONS = ["visible", "hidden", "scroll", "auto"];

/* ─── style inspector ────────────────────────────────────────────── */

function StyleInspector({ element, onUpdate }) {
  if (!element) return (
    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--dim)', fontSize: '11px' }}>
      Select an element to edit its styles
    </div>
  );

  const set = (key, val) => onUpdate(element.id, { [key]: val });

  const SliderRow = ({ label, prop, min = 0, max = 100, step = 1, unit = "" }) => (
    <div className="tk-slider-row">
      <label>{label}</label>
      <div className="tk-slider-ctrl">
        <input
          type="range" min={min} max={max} step={step}
          value={element[prop] ?? min}
          onChange={e => set(prop, Number(e.target.value))}
        />
        <span className="tk-slider-val">{element[prop] ?? min}{unit}</span>
      </div>
    </div>
  );

  const ColorRow = ({ label, prop }) => (
    <div className="tk-color-row">
      <label>{label}</label>
      <div className="tk-color-ctrl">
        <input type="color" value={element[prop] || "#000000"} onChange={e => set(prop, e.target.value)} />
        <span className="tk-color-hex">{element[prop] || "inherit"}</span>
      </div>
    </div>
  );

  const SelectRow = ({ label, prop, options }) => (
    <div className="tk-select-row">
      <label>{label}</label>
      <select value={element[prop] || options[0]} onChange={e => set(prop, e.target.value)}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <div className="tk-inspector">
      <div className="tk-inspector-title">
        <Settings2 size={12} />
        <span>STYLE PROPERTIES</span>
      </div>

      {/* ── Dimension ── */}
      <div className="tk-section">
        <div className="tk-section-label"><Move size={10} /> Position & Size</div>
        <div className="tk-grid-2">
          <div className="tk-num-field">
            <label>X</label>
            <input type="number" value={element.x ?? 0} onChange={e => set("x", Number(e.target.value))} />
          </div>
          <div className="tk-num-field">
            <label>Y</label>
            <input type="number" value={element.y ?? 0} onChange={e => set("y", Number(e.target.value))} />
          </div>
          <div className="tk-num-field">
            <label>W</label>
            <input type="number" value={element.width ?? 0} onChange={e => set("width", Number(e.target.value))} />
          </div>
          <div className="tk-num-field">
            <label>H</label>
            <input type="number" value={element.height ?? 0} onChange={e => set("height", Number(e.target.value) || null)} />
          </div>
        </div>
      </div>

      {/* ── Typography (non-image only) ── */}
      {element.type !== "image" && (
        <div className="tk-section">
          <div className="tk-section-label"><Type size={10} /> Typography</div>
          <SliderRow label="Font Size" prop="fontSize" min={8} max={72} unit="px" />
          <SliderRow label="Font Weight" prop="fontWeight" min={100} max={900} step={100} />
          <SliderRow label="Line Height" prop="lineHeight" min={0.8} max={3} step={0.05} />
          <SliderRow label="Letter Spacing" prop="letterSpacing" min={-2} max={8} step={0.5} unit="px" />
          <ColorRow label="Text Color" prop="color" />
          <SelectRow label="Text Align" prop="align" options={["left", "center", "right"]} />
          <SelectRow label="Text Transform" prop="textTransform" options={["none", "uppercase", "lowercase", "capitalize"]} />
        </div>
      )}

      {/* ── Appearance ── */}
      <div className="tk-section">
        <div className="tk-section-label"><Palette size={10} /> Appearance</div>
        <ColorRow label="Background" prop="bg" />
        <SliderRow label="Border Radius" prop="borderRadius" min={0} max={50} unit="px" />
        <SliderRow label="Opacity" prop="opacity" min={0} max={1} step={0.05} />
        <SliderRow label="Padding" prop="padding" min={0} max={64} unit="px" />

        {/* Border */}
        <div className="tk-color-row">
          <label>Border</label>
          <input
            type="text"
            className="tk-text-input"
            value={element.border || "none"}
            onChange={e => set("border", e.target.value)}
            placeholder="1px solid #ccc"
          />
        </div>

        {/* Shadow Preset */}
        <div className="tk-select-row">
          <label>Box Shadow</label>
          <div className="tk-pill-group">
            {SHADOW_PRESETS.map(s => (
              <button
                key={s.value}
                className={(element.boxShadow || "none") === s.value ? "selected" : ""}
                onClick={() => set("boxShadow", s.value)}
              >{s.label}</button>
            ))}
          </div>
        </div>

        {/* Overflow */}
        <SelectRow label="Overflow" prop="overflow" options={OVERFLOW_OPTIONS} />
      </div>

      {/* ── Layout extras ── */}
      <div className="tk-section">
        <div className="tk-section-label"><Layers size={10} /> Layout</div>
        <SliderRow label="Z-Index" prop="zIndex" min={0} max={100} step={1} />
        <SliderRow label="Rotation" prop="rotate" min={-180} max={180} step={1} unit="°" />
      </div>
    </div>
  );
}


/* ─── component library grid ─────────────────────────────────────── */

function ComponentLibrary({ onAdd }) {
  const [cat, setCat] = useState("All");
  const filtered = cat === "All" ? COMPONENT_LIBRARY : COMPONENT_LIBRARY.filter(c => c.category === cat);

  return (
    <div className="tk-library">
      <div className="tk-library-title">
        <Layers size={12} />
        <span>COMPONENT LIBRARY</span>
      </div>
      <div className="tk-cat-pills">
        {CATEGORIES.map(c => (
          <button key={c} className={cat === c ? "selected" : ""} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <div className="tk-comp-grid">
        {filtered.map(comp => (
          <button key={comp.id} className="tk-comp-card" onClick={() => onAdd(comp)}>
            <div className="tk-comp-icon"><comp.Icon size={18} /></div>
            <span>{comp.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}


/* ─── main export ────────────────────────────────────────────────── */

export default function ComponentToolkit({ elements, selectedField, onElementUpdate, onAdd }) {
  const [activeTab, setActiveTab] = useState("library");
  const selectedEl = elements.find(e => e.id === selectedField) || null;

  const handleAdd = (comp) => {
    // Position near bottom of existing elements
    const maxY = elements.length ? Math.max(...elements.map(e => (e.y || 0) + (e.height || 40))) + 20 : 40;
    const newEl = {
      id: `${comp.id}-${Date.now()}`,
      label: comp.label,
      ...comp.defaults,
      x: 40,
      y: Math.min(maxY, 360),
    };
    onAdd(newEl);
  };

  return (
    <div className="component-toolkit" data-testid="component-toolkit">
      <div className="tk-tabs">
        <button className={activeTab === "library" ? "selected" : ""} onClick={() => setActiveTab("library")}>
          <Plus size={12} /> Add
        </button>
        <button className={activeTab === "style" ? "selected" : ""} onClick={() => setActiveTab("style")}>
          <Settings2 size={12} /> Style
        </button>
      </div>
      {activeTab === "library" ? (
        <ComponentLibrary onAdd={handleAdd} />
      ) : (
        <StyleInspector element={selectedEl} onUpdate={onElementUpdate} />
      )}
    </div>
  );
}
