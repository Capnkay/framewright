import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Activity, ArrowRight, ArrowUpRight, Check, Code2, Cpu, ImagePlus, Layers3, Play, ShieldCheck, Terminal, WandSparkles } from "lucide-react";
import { Button, Label, fade } from "../components/Shell";

function Bento({ title, copy, icon, children }) {
  return (
    <motion.article className="bento-card" whileHover={{ y: -3 }} initial={{ opacity: 0, scale: .96 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} data-testid={`bento-${title.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="card-heading"><span className="card-icon">{icon}</span><div><h3>{title}</h3><p>{copy}</p></div></div>
      {children}
    </motion.article>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  return (
    <div className="landing landing-modern">
      <div className="hero-glow" />
      <div className="ambient-grid" />
      <section className="hero-modern">
        <motion.div className="hero-copy" {...fade}>
          <div className="hero-kicker"><span className="pulse-ring"><span /></span>FRAMEWRIGHT / GENERATION OS <span className="kicker-line" /> <span>v1.0.0</span></div>
          <h1>Turn rough ideas into <span className="gradient-text">shippable surfaces.</span></h1>
          <p>One intelligent workspace for translating wireframes, React code, and product intent into CMS-ready components.</p>
          <div className="hero-actions">
            <Button primary onClick={() => navigate("/generate")} testid="enter-studio-button"><WandSparkles size={16} />Enter Generator Studio <ArrowRight size={16} /></Button>
            <Button onClick={() => navigate("/preview")} testid="launch-preview-button">Launch Live Preview <Play size={14} /></Button>
          </div>
          <div className="hero-trust"><span>BUILT FOR THE DETAIL-OBSESSED</span><span className="trust-separator" /><span><ShieldCheck size={13} /> 13 quality gates</span><span><Activity size={13} /> live telemetry</span></div>
        </motion.div>
        <motion.div className="hero-console glass-panel" initial={{ opacity: 0, x: 26, scale: .97 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ delay: .16, duration: .42 }} data-testid="hero-generation-console">
          <div className="console-top"><span className="window-dots"><i /><i /><i /></span><code>framewright / live-run</code><span className="console-live"><span className="live-dot" /> LIVE</span></div>
          <div className="console-title"><div><Label>ACTIVE GENERATION</Label><h2>Marketing / Hero</h2></div><span className="console-score">96<span>%</span></span></div>
          <div className="console-graph">
            <div className="graph-grid" />
            <div className="graph-orbit orbit-a" />
            <div className="graph-orbit orbit-b" />
            <div className="graph-node node-a"><Cpu size={14} /><span>Vision</span></div>
            <div className="graph-node node-b"><Layers3 size={14} /><span>AST</span></div>
            <div className="graph-node node-c"><ShieldCheck size={14} /><span>QA pass</span></div>
            <svg viewBox="0 0 440 155" preserveAspectRatio="none" aria-hidden="true"><path d="M36 112 C100 18 168 138 235 58 S350 68 410 24" /></svg>
          </div>
          <div className="console-steps">
            {[["Input acquired", "42ms"], ["Component planned", "118ms"], ["Output delivered", "203ms"]].map(([name, time]) => (
              <div key={name}><span className="step-check"><Check size={10} /></span><span>{name}</span><em>{time}</em></div>
            ))}
          </div>
          <div className="console-foot"><span><span className="live-dot" /> CMS store synced</span><ArrowUpRight size={14} /></div>
        </motion.div>
      </section>
      <div className="signal-rail" data-testid="signal-rail">
        <span>INPUT SIGNALS</span>
        <div><span><ImagePlus size={14} /> wireframe image</span><span><Code2 size={14} /> React source</span><span><WandSparkles size={14} /> design intent</span></div>
        <strong>&rarr; ONE EDITABLE SECTION</strong>
      </div>
      <section className="feature-deck" data-testid="pipeline-bento">
        <Bento title="Visual Perception" icon={<Terminal size={17} />} copy="Contour detection, OCR, and semantic region extraction.">
          <div className="mini-terminal"><span><i /> contours mapped</span><span><i /> regions classified</span><strong>203ms</strong></div>
        </Bento>
        <Bento title="AST Code Emitter" icon={<Code2 size={17} />} copy="Stable element IDs and editable content slots, emitted cleanly.">
          <div className="slot-map"><span>hero.heading</span><span>hero.cta</span><span>hero.media</span></div>
        </Bento>
        <Bento title="Quality Gates" icon={<ShieldCheck size={17} />} copy="Bundle cost, accessibility, pixel match, and sanitizer checks before delivery.">
          <div className="quality-strip"><strong>100</strong><span>/100 A11y</span><strong>95%</strong><span>pixel match</span></div>
        </Bento>
      </section>
      <section className="closing-prompt glass-panel">
        <div><Label>THE LAST MILE, VISIBLE</Label><h2>Ship the idea, not the scaffolding.</h2></div>
        <button onClick={() => navigate("/generate")} data-testid="closing-studio-button">Open Studio <ArrowRight size={15} /></button>
      </section>
    </div>
  );
}
