import { motion } from "framer-motion";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { Label } from "../Shell";
import { buildPreviewDoc } from "../../data/mock";

const WIDTHS = { Mobile: 360, Tablet: 720, Desktop: null };
const ICONS = { Mobile: Smartphone, Tablet: Tablet, Desktop: Monitor };

export function LivePreviewPanel({ breakpoint, setBreakpoint, page, section, elements, accent }) {
  const doc = buildPreviewDoc({ page, section, elements, accent });
  const width = WIDTHS[breakpoint];
  return (
    <section className="panel live-preview-panel" data-testid="live-preview-panel">
      <div className="panel-title">
        <div><Label>LIVE PREVIEW</Label><h2>{page || "Untitled page"} / {section || "Section"}</h2></div>
        <div className="viewport-toggle" data-testid="breakpoint-toggle">
          {["Mobile", "Tablet", "Desktop"].map(bp => {
            const Icon = ICONS[bp];
            return (
              <button key={bp} className={breakpoint === bp ? "selected" : ""} onClick={() => setBreakpoint(bp)} data-testid={`breakpoint-${bp.toLowerCase()}-button`}>
                <Icon size={13} />{bp}
              </button>
            );
          })}
        </div>
      </div>
      <div className="live-preview-frame-wrap" data-testid="live-preview-frame-wrap">
        <motion.div className="live-preview-frame" animate={{ width: width || "100%" }} transition={{ duration: .28 }}>
          <iframe title="Live section preview" srcDoc={doc} sandbox="allow-same-origin" data-testid="live-preview-iframe" />
        </motion.div>
      </div>
    </section>
  );
}
