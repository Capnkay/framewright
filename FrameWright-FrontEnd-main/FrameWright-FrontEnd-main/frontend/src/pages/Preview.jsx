import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Label, fade } from "../components/Shell";
import { buildPreviewDoc } from "../data/mock";

export default function Preview() {
  const [variation, setVariation] = useState("A");
  const [custom, setCustom] = useState(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("framewright.studio-design"));
      if (saved?.elements?.length) setCustom(saved);
    } catch { /* ignore */ }
  }, []);

  const variations = custom ? ["A", "B", "C"] : ["A", "B"];

  return (
    <div className="live-preview-page">
      <div className="preview-toolbar">
        <div><Label>LIVE PREVIEW</Label><h1>Northstar / Marketing site</h1></div>
        <div className="variation-toggle" data-testid="design-variation-toggle">
          <span>Design preview</span>
          {variations.map(v => <button className={variation === v ? "selected" : ""} onClick={() => setVariation(v)} key={v} data-testid={`variation-${v.toLowerCase()}-button`}>0{v === "A" ? 1 : v === "B" ? 2 : 3}</button>)}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={variation} className={`site-preview variation-${variation.toLowerCase()}`} {...fade} data-testid="live-site-preview">
          {variation === "C" && custom ? (
            <div className="custom-preview-frame" data-testid="custom-preview-frame">
              <iframe title="Studio design preview" srcDoc={buildPreviewDoc(custom)} sandbox="allow-same-origin" data-testid="custom-preview-iframe" />
            </div>
          ) : (
            <>
              <div className="site-nav">
                <b>northstar</b>
                <div>
                  <a href="#product" data-testid="site-product-link">Product</a>
                  <a href="#approach" data-testid="site-approach-link">Approach</a>
                  <a href="#journal" data-testid="site-journal-link">Journal</a>
                  <button data-testid="site-cta-button">Get started <ArrowRight size={14} /></button>
                </div>
              </div>
              <div className="site-hero">
                <div>
                  <div className="site-kicker">{variation === "A" ? "A NEW STANDARD FOR TEAMWORK" : "MAKE SPACE FOR MOMENTUM"}</div>
                  <h2>{variation === "A" ? "The clearest path from idea to impact." : "Good work deserves a better rhythm."}</h2>
                  <p>Northstar brings your planning, projects, and people into one precise, beautifully calm workspace.</p>
                  <button data-testid="site-hero-cta">Explore the workspace <ArrowRight size={16} /></button>
                </div>
                <div className="site-visual">
                  <div className="visual-window">
                    <div className="window-bar"><span /><span /><span /></div>
                    <div className="window-content"><div className="window-sidebar" /><div className="window-main"><span /><span /><span /><div className="window-chart" /></div></div>
                  </div>
                </div>
              </div>
              <div className="site-footer-strip"><span>Used by teams at</span><strong>ARC / LUMA / ORBIT / VANTA</strong></div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

