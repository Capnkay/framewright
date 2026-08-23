import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Cpu, Database, Code, ShieldCheck, ArrowRight } from 'lucide-react';

const EASE_STANDARD = [0.16, 1, 0.3, 1];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_STANDARD } }
};

const bentoVariants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: EASE_STANDARD } }
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-studio-bg-base text-studio-text-primary overflow-x-hidden flex flex-col items-center pt-32 px-4 pb-24">
      {/* Glow Effects - Single subtle instance per spec */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] pointer-events-none opacity-[0.15] blur-[120px] bg-studio-accent rounded-full"></div>
      
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 max-w-5xl w-full flex flex-col items-center"
      >
        {/* Version Capsule */}
        <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-studio-border bg-studio-bg-raised text-studio-text-secondary text-studio-xs mb-8 shadow-studio-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-studio-success animate-pulse"></span>
          <span>v1.0.0 Production-Ready</span>
        </motion.div>

        {/* Hero Headline */}
        <motion.h1 variants={itemVariants} className="text-center font-bold tracking-tight text-5xl md:text-7xl max-w-4xl mb-6 text-studio-text-primary">
          From wireframe to <span className="bg-gradient-to-r from-studio-accent to-studio-success bg-clip-text text-transparent bg-[length:200%_200%] animate-[gradient-x_8s_ease_infinite]">live React component</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p variants={itemVariants} className="text-center text-studio-text-secondary text-studio-lg max-w-2xl mb-10 leading-relaxed font-medium">
          Framewright parses spatial wireframes, AST structures, and prompts into CMS-ready React sections with full Redux store liveness and built-in quality gates.
        </motion.p>

        {/* Primary CTA */}
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 mb-24">
          <Link
            to="/generate"
            className="group inline-flex items-center justify-center gap-2 rounded-lg bg-studio-accent px-6 py-3 text-studio-base font-semibold text-white transition-colors duration-studio-fast hover:bg-studio-accent-hover focus:outline-none focus:shadow-studio-glow active:scale-[0.98]"
          >
            <span>Enter Generator Studio</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-studio-fast group-hover:translate-x-1" />
          </Link>
          <Link
            to="/preview"
            className="inline-flex items-center justify-center rounded-lg border border-studio-border bg-studio-bg-raised px-6 py-3 text-studio-base font-medium text-studio-text-primary transition-colors duration-studio-fast hover:border-studio-border-strong hover:bg-studio-bg-overlay active:scale-[0.98]"
          >
            Launch Live Preview
          </Link>
        </motion.div>

        {/* Bento Grid */}
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left"
        >
          {/* Card 1: Visual Perception */}
          <motion.div variants={bentoVariants} className="md:col-span-2 rounded-2xl border border-studio-border bg-studio-bg-raised p-6 shadow-studio-sm flex flex-col justify-between group hover:border-studio-border-strong hover:-translate-y-0.5 hover:shadow-studio-md transition-all duration-studio-fast">
            <div>
              <div className="h-10 w-10 rounded-lg border border-studio-border bg-studio-bg-overlay flex items-center justify-center mb-4">
                <Cpu className="h-5 w-5 text-studio-accent" />
              </div>
              <h3 className="text-studio-lg font-semibold mb-2">Visual Perception Pipeline</h3>
              <p className="text-studio-text-secondary text-studio-sm leading-relaxed mb-6">
                Multi-stage processing engine with OpenCV normalization, contour region mapping, and optical character recognition for spatial accuracy.
              </p>
            </div>
            
            <div className="w-full bg-studio-bg-base border border-studio-border rounded-lg p-4 flex flex-col gap-3 font-studio-mono text-studio-xs">
              <div className="flex items-center justify-between border-b border-studio-border/50 pb-2">
                <span className="text-studio-text-secondary">Stage 2: Normalize</span>
                <span className="text-studio-success">Completed (120ms)</span>
              </div>
              <div className="flex items-center justify-between border-b border-studio-border/50 pb-2">
                <span className="text-studio-text-secondary">Stage 3a: Contours</span>
                <span className="text-studio-success">7 Regions Detected</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-studio-text-secondary">Stage 3b: OCR Engine</span>
                <span className="text-studio-success">"TRAIN WITHOUT LIMITS"</span>
              </div>
            </div>
          </motion.div>

          {/* Card 2: Interactive CMS */}
          <motion.div variants={bentoVariants} className="rounded-2xl border border-studio-border bg-studio-bg-raised p-6 shadow-studio-sm flex flex-col justify-between group hover:border-studio-border-strong hover:-translate-y-0.5 hover:shadow-studio-md transition-all duration-studio-fast">
            <div>
              <div className="h-10 w-10 rounded-lg border border-studio-border bg-studio-bg-overlay flex items-center justify-center mb-4">
                <Database className="h-5 w-5 text-studio-accent" />
              </div>
              <h3 className="text-studio-lg font-semibold mb-2">CMS Store Synchronization</h3>
              <p className="text-studio-text-secondary text-studio-sm leading-relaxed mb-6">
                Back-end hydration and positional mapping keep every generated element reactive. Modifying fields in the sidebar propagates updates instantly.
              </p>
            </div>
            
            <div className="bg-studio-bg-base border border-studio-border rounded-lg p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-studio-accent animate-pulse"></div>
                <span className="text-studio-xs text-studio-text-secondary font-studio-mono">Liveness Asserted</span>
              </div>
              <div className="w-full bg-studio-bg-overlay h-2.5 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} whileInView={{ width: '88%' }} transition={{ duration: 1.2, ease: "circOut" }} viewport={{ once: true }} className="bg-studio-accent h-full rounded-full"></motion.div>
              </div>
            </div>
          </motion.div>

          {/* Card 3: AST Generator */}
          <motion.div variants={bentoVariants} className="rounded-2xl border border-studio-border bg-studio-bg-raised p-6 shadow-studio-sm flex flex-col justify-between group hover:border-studio-border-strong hover:-translate-y-0.5 hover:shadow-studio-md transition-all duration-studio-fast">
            <div>
              <div className="h-10 w-10 rounded-lg border border-studio-border bg-studio-bg-overlay flex items-center justify-center mb-4">
                <Code className="h-5 w-5 text-studio-accent" />
              </div>
              <h3 className="text-studio-lg font-semibold mb-2">AST Code Emitter</h3>
              <p className="text-studio-text-secondary text-studio-sm leading-relaxed mb-4">
                Parses React structures to capture developer patterns and layout hierarchy without running raw code.
              </p>
            </div>
            <div className="rounded-lg bg-studio-bg-base border border-studio-border p-3 font-studio-mono text-studio-xs text-studio-text-secondary overflow-hidden max-h-24">
              <span className="text-studio-accent">const</span> ids = &#123;<br />
              &nbsp;&nbsp;headline: <span className="text-studio-success">"3489274910"</span>,<br />
              &nbsp;&nbsp;ctaButton: <span className="text-studio-success">"3000000002"</span><br />
              &#125;;
            </div>
          </motion.div>

          {/* Card 4: Quality & Compliance */}
          <motion.div variants={bentoVariants} className="md:col-span-2 rounded-2xl border border-studio-border bg-studio-bg-raised p-6 shadow-studio-sm flex flex-col justify-between group hover:border-studio-border-strong hover:-translate-y-0.5 hover:shadow-studio-md transition-all duration-studio-fast">
            <div>
              <div className="h-10 w-10 rounded-lg border border-studio-border bg-studio-bg-overlay flex items-center justify-center mb-4">
                <ShieldCheck className="h-5 w-5 text-studio-accent" />
              </div>
              <h3 className="text-studio-lg font-semibold mb-2">Automated Quality Gates</h3>
              <p className="text-studio-text-secondary text-studio-sm leading-relaxed mb-6">
                Evaluates every section's production readiness through bundle-cost gates, accessibility audits (axe-core), and pixel-perfect layout verification.
              </p>
            </div>
            
            {/* Simulation of quality scores */}
            <div className="grid grid-cols-3 gap-4 text-center font-studio-mono">
              <div className="bg-studio-bg-base border border-studio-border rounded-lg p-3">
                <div className="text-studio-success text-studio-base font-semibold">100/100</div>
                <div className="text-studio-text-tertiary text-[10px] mt-1">A11y (Axe)</div>
              </div>
              <div className="bg-studio-bg-base border border-studio-border rounded-lg p-3">
                <div className="text-studio-success text-studio-base font-semibold">95%</div>
                <div className="text-studio-text-tertiary text-[10px] mt-1">Pixel Match</div>
              </div>
              <div className="bg-studio-bg-base border border-studio-border rounded-lg p-3">
                <div className="text-studio-success text-studio-base font-semibold">Pass</div>
                <div className="text-studio-text-tertiary text-[10px] mt-1">CSS Sanitizer</div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}
