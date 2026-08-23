import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Layout, Zap, Database, Wand2, MonitorPlay } from 'lucide-react';

const EASE_STANDARD = [0.4, 0.0, 0.2, 1];

export default function LandingPage() {
  return (
    <main className="studio-theme min-h-screen bg-studio-bg-base flex flex-col items-center pt-32 pb-24 px-6 overflow-x-hidden text-studio-text-primary selection:bg-studio-accent/30">
      
      {/* Hero Section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_STANDARD }}
        className="max-w-4xl w-full text-center mb-20"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-8 rounded-full bg-studio-accent/10 border border-studio-accent/20 text-studio-accent text-sm font-medium">
          <Wand2 className="w-4 h-4" />
          <span>Framewright Studio v2.0</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight">
          From Wireframe to <br className="hidden md:block"/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-studio-accent to-purple-500">
            Live Component
          </span>
        </h1>
        
        <p className="text-xl text-studio-text-secondary mb-12 max-w-2xl mx-auto leading-relaxed">
          Transform hand-drawn wireframes and plain-text prompts into production-ready React sections, backed by a live CMS store.
        </p>

        <Link 
          to="/generate" 
          className="group inline-flex items-center gap-3 bg-studio-accent hover:bg-studio-accent-hover text-studio-accent-foreground font-semibold text-lg px-8 py-4 rounded-full shadow-lg shadow-studio-accent/20 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-studio-accent focus:ring-offset-2 focus:ring-offset-studio-bg-base"
        >
          Enter the Studio
          <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      </motion.div>

      {/* Bento Grid Features */}
      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE_STANDARD, delay: 0.2 }}
        className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        
        {/* Bento Card 1: Large Visual (Col Span 2) */}
        <div className="md:col-span-2 group relative overflow-hidden rounded-3xl border border-studio-border bg-studio-bg-raised p-8 shadow-studio-md transition-all duration-500 hover:border-studio-border-strong hover:shadow-xl hover:bg-studio-bg-overlay/50">
          <div className="absolute top-0 right-0 p-8 opacity-10 transition-opacity group-hover:opacity-20">
            <Layout className="w-32 h-32 text-studio-text-primary" />
          </div>
          <div className="relative z-10 h-full flex flex-col justify-between">
            <div className="mb-12">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6 border border-blue-500/20">
                <Layout className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-2xl font-bold mb-3 text-studio-text-primary">Multi-Modal Inputs</h3>
              <p className="text-studio-text-secondary max-w-md leading-relaxed">
                Feed the pipeline plain text, wireframes, or both simultaneously. The AI synthesizes your design intent instantly.
              </p>
            </div>
            
            {/* Visualizer */}
            <div className="grid grid-cols-2 gap-4">
              <div className="h-32 rounded-xl bg-studio-bg-base border border-dashed border-studio-border/60 flex items-center justify-center p-4">
                <div className="w-full h-full opacity-30 bg-[url('/gpu-test/wireframe.png')] bg-contain bg-center bg-no-repeat" />
              </div>
              <div className="h-32 rounded-xl bg-studio-bg-base border border-studio-border/60 p-4 flex flex-col gap-2 justify-center">
                <div className="w-2/3 h-3 bg-studio-accent/40 rounded-full" />
                <div className="w-full h-2 bg-studio-text-tertiary/20 rounded-full" />
                <div className="w-4/5 h-2 bg-studio-text-tertiary/20 rounded-full" />
                <div className="w-1/3 h-6 bg-studio-accent mt-2 rounded-md" />
              </div>
            </div>
          </div>
        </div>

        {/* Bento Card 2: CMS Backed (Col Span 1) */}
        <div className="group relative overflow-hidden rounded-3xl border border-studio-border bg-studio-bg-raised p-8 shadow-studio-md transition-all duration-500 hover:border-studio-border-strong hover:shadow-xl hover:bg-studio-bg-overlay/50">
          <div className="h-full flex flex-col">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20">
              <Database className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-2xl font-bold mb-3 text-studio-text-primary">Live CMS State</h3>
            <p className="text-studio-text-secondary leading-relaxed mb-8">
              Every generated component binds automatically to the global CMS store. Edit content in the Studio, see updates live in the preview.
            </p>
            <div className="mt-auto space-y-3">
              <div className="h-10 rounded-xl bg-studio-bg-base border border-studio-border/60 flex items-center px-4 font-mono text-xs text-studio-accent">
                &#123; "title": "Hero" &#125;
              </div>
              <div className="h-10 rounded-xl bg-studio-bg-base border border-studio-border/60 flex items-center px-4 font-mono text-xs text-studio-text-secondary">
                &#123; "subtitle": "SaaS" &#125;
              </div>
            </div>
          </div>
        </div>

        {/* Bento Card 3: Instant Preview (Col Span 1) */}
        <div className="group relative overflow-hidden rounded-3xl border border-studio-border bg-studio-bg-raised p-8 shadow-studio-md transition-all duration-500 hover:border-studio-border-strong hover:shadow-xl hover:bg-studio-bg-overlay/50">
          <div className="h-full flex flex-col">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-6 border border-purple-500/20">
              <MonitorPlay className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-2xl font-bold mb-3 text-studio-text-primary">Instant Preview</h3>
            <p className="text-studio-text-secondary leading-relaxed">
              Interact with your generated UI in a sandboxed iframe. Ensure it responds perfectly to all screen sizes.
            </p>
          </div>
        </div>

        {/* Bento Card 4: Lightning Fast (Col Span 2) */}
        <div className="md:col-span-2 group relative overflow-hidden rounded-3xl border border-studio-border bg-studio-bg-raised p-8 shadow-studio-md transition-all duration-500 hover:border-studio-border-strong hover:shadow-xl hover:bg-studio-bg-overlay/50 flex flex-col justify-center items-center text-center">
          <div className="absolute inset-0 bg-gradient-to-r from-studio-accent/5 via-transparent to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-6 border border-amber-500/20">
              <Zap className="w-8 h-8 text-amber-400" />
            </div>
            <h3 className="text-3xl font-bold mb-4 text-studio-text-primary">Ready for Production</h3>
            <p className="text-studio-text-secondary max-w-lg leading-relaxed mb-8 text-lg">
              Valid JSX. Tailwind classes. Dynamic styling support. Zero manual refactoring required.
            </p>
            <Link 
              to="/preview/Home" 
              className="inline-flex items-center gap-2 text-studio-sm font-medium text-studio-accent hover:text-studio-accent-hover transition-colors"
            >
              See a live preview
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

      </motion.div>

    </main>
  );
}
