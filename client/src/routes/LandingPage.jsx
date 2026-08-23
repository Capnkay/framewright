import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Upload, Code, Database, Cpu, ShieldCheck, ArrowRight, Frame, Activity } from 'lucide-react';
import Logo from '../studio/Logo.jsx';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-studio-bg-base text-studio-text-primary overflow-x-hidden flex flex-col justify-center items-center px-4 py-12 md:py-24">
      {/* Glow Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] pointer-events-none opacity-20 blur-[150px] bg-gradient-to-b from-studio-accent to-transparent"></div>
      
      <div className="relative z-10 max-w-6xl w-full flex flex-col items-center">
        {/* Version Capsule */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-studio-full border border-studio-border bg-studio-bg-raised text-studio-text-secondary text-studio-xs mb-8 shadow-studio-sm animate-fade-in">
          <span className="w-1.5 h-1.5 rounded-full bg-studio-success animate-pulse"></span>
          <span>v1.0.0 Production-Ready</span>
        </div>

        {/* Hero Headline */}
        <h1 className="text-center font-studio text-studio-text-display font-semibold tracking-tight leading-none max-w-4xl mb-6 text-studio-text-primary">
          From wireframe to <span className="bg-gradient-to-r from-studio-accent via-studio-accent-hover to-studio-success bg-clip-text text-transparent">live React component</span>
        </h1>

        {/* Subtitle */}
        <p className="text-center text-studio-text-secondary text-studio-lg max-w-2xl mb-10 leading-relaxed">
          Framewright parses spatial wireframes, AST structures, and prompts into CMS-ready React sections with full Redux store liveness and built-in quality gates.
        </p>

        {/* Primary CTA */}
        <div className="flex flex-col sm:flex-row gap-4 mb-20">
          <Link
            to="/generate"
            className="group inline-flex items-center justify-center gap-2 rounded-studio-md bg-studio-accent px-6 py-3 text-studio-base font-medium text-studio-accent-foreground transition-all duration-studio-fast hover:bg-studio-accent-hover focus:outline-none focus:shadow-studio-glow"
          >
            <span>Enter Generator Studio</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-studio-fast group-hover:translate-x-1" />
          </Link>
          <Link
            to="/preview"
            className="inline-flex items-center justify-center rounded-studio-md border border-studio-border bg-studio-bg-raised px-6 py-3 text-studio-base font-medium text-studio-text-primary transition-colors duration-studio-fast hover:border-studio-border-strong hover:bg-studio-bg-overlay"
          >
            Launch Live Preview
          </Link>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left">
          {/* Card 1: Visual Perception */}
          <div className="md:col-span-2 rounded-studio-lg border border-studio-border bg-studio-bg-raised p-6 shadow-studio-sm flex flex-col justify-between group hover:border-studio-border-strong transition-colors duration-studio-fast">
            <div>
              <div className="h-10 w-10 rounded-studio-md border border-studio-border bg-studio-bg-overlay flex items-center justify-center mb-4">
                <Cpu className="h-5 w-5 text-studio-accent" />
              </div>
              <h3 className="text-studio-lg font-semibold mb-2">Visual Perception Pipeline</h3>
              <p className="text-studio-text-secondary text-studio-sm leading-relaxed mb-6">
                Multi-stage processing engine with OpenCV normalization, contour region mapping, and optical character recognition for spatial accuracy.
              </p>
            </div>
            
            {/* Visual simulation of pipeline */}
            <div className="w-full bg-studio-bg-base border border-studio-border rounded-studio-md p-4 flex flex-col gap-3 font-studio-mono text-studio-xs">
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
          </div>

          {/* Card 2: Interactive CMS */}
          <div className="rounded-studio-lg border border-studio-border bg-studio-bg-raised p-6 shadow-studio-sm flex flex-col justify-between group hover:border-studio-border-strong transition-colors duration-studio-fast">
            <div>
              <div className="h-10 w-10 rounded-studio-md border border-studio-border bg-studio-bg-overlay flex items-center justify-center mb-4">
                <Database className="h-5 w-5 text-studio-accent" />
              </div>
              <h3 className="text-studio-lg font-semibold mb-2">CMS Store Synchronization</h3>
              <p className="text-studio-text-secondary text-studio-sm leading-relaxed mb-6">
                Back-end hydration and positional mapping keep every generated element reactive. Modifying fields in the sidebar propagates updates instantly.
              </p>
            </div>
            
            <div className="bg-studio-bg-base border border-studio-border rounded-studio-md p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-studio-accent animate-pulse"></div>
                <span className="text-studio-xs text-studio-text-secondary font-studio-mono">Liveness Asserted</span>
              </div>
              <div className="w-full bg-studio-bg-overlay h-2.5 rounded-studio-full overflow-hidden">
                <div className="bg-studio-accent h-full w-[88%] rounded-studio-full"></div>
              </div>
            </div>
          </div>

          {/* Card 3: AST Generator */}
          <div className="rounded-studio-lg border border-studio-border bg-studio-bg-raised p-6 shadow-studio-sm flex flex-col justify-between group hover:border-studio-border-strong transition-colors duration-studio-fast">
            <div>
              <div className="h-10 w-10 rounded-studio-md border border-studio-border bg-studio-bg-overlay flex items-center justify-center mb-4">
                <Code className="h-5 w-5 text-studio-accent" />
              </div>
              <h3 className="text-studio-lg font-semibold mb-2">AST Code Emitter</h3>
              <p className="text-studio-text-secondary text-studio-sm leading-relaxed mb-4">
                Parses React structures to capture developer patterns and layout hierarchy without running raw code.
              </p>
            </div>
            <div className="rounded-studio-md bg-studio-bg-base border border-studio-border p-3 font-studio-mono text-studio-xs text-studio-text-secondary overflow-hidden max-h-24">
              <span className="text-studio-accent">const</span> ids = &#123;<br />
              &nbsp;&nbsp;headline: <span className="text-studio-success">"3489274910"</span>,<br />
              &nbsp;&nbsp;ctaButton: <span className="text-studio-success">"3000000002"</span><br />
              &#125;;
            </div>
          </div>

          {/* Card 4: Quality & Compliance */}
          <div className="md:col-span-2 rounded-studio-lg border border-studio-border bg-studio-bg-raised p-6 shadow-studio-sm flex flex-col justify-between group hover:border-studio-border-strong transition-colors duration-studio-fast">
            <div>
              <div className="h-10 w-10 rounded-studio-md border border-studio-border bg-studio-bg-overlay flex items-center justify-center mb-4">
                <ShieldCheck className="h-5 w-5 text-studio-accent" />
              </div>
              <h3 className="text-studio-lg font-semibold mb-2">Automated Quality Gates</h3>
              <p className="text-studio-text-secondary text-studio-sm leading-relaxed mb-6">
                Evaluates every section's production readiness through bundle-cost gates, accessibility audits (axe-core), and pixel-perfect layout verification.
              </p>
            </div>
            
            {/* Simulation of quality scores */}
            <div className="grid grid-cols-3 gap-4 text-center font-studio-mono">
              <div className="bg-studio-bg-base border border-studio-border rounded-studio-md p-3">
                <div className="text-studio-success text-studio-base font-semibold">100/100</div>
                <div className="text-studio-text-tertiary text-[10px] mt-1">A11y (Axe)</div>
              </div>
              <div className="bg-studio-bg-base border border-studio-border rounded-studio-md p-3">
                <div className="text-studio-success text-studio-base font-semibold">95%</div>
                <div className="text-studio-text-tertiary text-[10px] mt-1">Pixel Match</div>
              </div>
              <div className="bg-studio-bg-base border border-studio-border rounded-studio-md p-3">
                <div className="text-studio-success text-studio-base font-semibold">Pass</div>
                <div className="text-studio-text-tertiary text-[10px] mt-1">CSS Sanitizer</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
