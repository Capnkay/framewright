import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { HexColorPicker } from "react-colorful";

const PRESETS = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ec4899"];

export function AccentColorField({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="accent-disclosure" data-testid="accent-colour-disclosure">
      <button type="button" className="disclosure-toggle" onClick={() => setOpen(o => !o)} data-testid="accent-colour-toggle">
        <ChevronDown size={12} className={open ? "rotate" : ""} /> Accent colour <span className="disclosure-hint">optional</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="accent-body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .2 }}>
            <div style={{ marginBottom: "12px", width: "100%" }}>
              <HexColorPicker color={value || "#3b82f6"} onChange={onChange} style={{ width: "100%", height: "120px" }} />
            </div>
            <div className="accent-swatch-row">
              <span className="accent-value">{value ? value.toUpperCase() : "Default blue \u00b7 #3B82F6"}</span>
              {value && <button type="button" className="accent-reset" onClick={() => onChange("")} data-testid="accent-colour-reset">Reset</button>}
            </div>
            <div className="accent-presets">
              {PRESETS.map(p => (
                <button type="button" key={p} className={`accent-preset ${value === p ? "selected" : ""}`} style={{ "--swatch": p }} onClick={() => onChange(p)} data-testid={`accent-preset-${p.replace("#", "")}`} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
