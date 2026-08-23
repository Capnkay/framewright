import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowRight, Play, Sparkles, Box, Database, Eye, Zap, 
  Layout, Type, Image as ImageIcon, Code, Settings, CheckCircle2,
  PenTool, Wand2, Monitor, Rocket, MessageSquare
} from 'lucide-react';

const Github = (props) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" /></svg>;
const Twitter = (props) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" /></svg>;
const Linkedin = (props) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" /><rect width="4" height="12" x="2" y="9" /><circle cx="4" cy="4" r="2" /></svg>;

const EASE_STANDARD = [0.4, 0.0, 0.2, 1];

export default function LandingPage() {
  return (
    <div className="selection:bg-studio-accent/30 overflow-x-hidden font-sans">
      
      {/* 
        HERO SECTION
      */}
      <section className="relative w-full max-w-7xl mx-auto px-6 pt-6 pb-24 md:pt-10 md:pb-32 grid lg:grid-cols-2 gap-16 items-center">
        {/* Background glow */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-studio-accent/20 rounded-full blur-[120px] pointer-events-none" />
        
        {/* Left: Copy */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE_STANDARD }}
          className="relative z-10 flex flex-col items-start text-left"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-8 rounded-full bg-studio-bg-raised border border-studio-border text-studio-text-secondary text-sm font-medium">
            <Sparkles className="w-4 h-4 text-studio-text-primary" />
            <span className="text-studio-text-primary">FrameWright Studio v2.0</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-semibold tracking-tight mb-6 leading-[1.1]">
            From Wireframe <br />
            <span className="text-studio-text-secondary">to Live Component</span>
          </h1>
          
          <p className="text-lg md:text-xl text-studio-text-secondary mb-10 max-w-xl leading-relaxed">
            Transform hand-drawn wireframes and plain-text prompts into production-ready React sections, backed by a live CMS store.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <Link 
              to="/generate" 
              className="group inline-flex items-center gap-2 bg-white text-black font-medium text-sm px-6 py-3 rounded-full hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
            >
              Enter the Studio
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <button className="inline-flex items-center gap-2 bg-transparent text-white border border-studio-border font-medium text-sm px-6 py-3 rounded-full hover:bg-studio-bg-overlay transition-colors focus:outline-none focus:ring-2 focus:ring-studio-border">
              <Play className="w-4 h-4" />
              See it in Action
            </button>
          </div>
        </motion.div>

        {/* Right: Abstract UI / Browser Mockup */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: EASE_STANDARD, delay: 0.1 }}
          className="relative z-10"
        >
          {/* Main Browser Window */}
          <div className="relative rounded-2xl border border-studio-border bg-studio-bg-raised p-2 shadow-2xl shadow-black/50 overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            
            {/* Browser Header */}
            <div className="flex items-center gap-2 px-4 py-3 mb-2 border-b border-studio-border/50">
              <div className="w-2.5 h-2.5 rounded-full bg-studio-border" />
              <div className="w-2.5 h-2.5 rounded-full bg-studio-border" />
              <div className="w-2.5 h-2.5 rounded-full bg-studio-border" />
            </div>

            <div className="flex gap-4 p-2">
              {/* Sidebar */}
              <div className="w-12 flex flex-col gap-4 items-center py-4 border-r border-studio-border/50">
                <Layout className="w-5 h-5 text-studio-text-secondary" />
                <Type className="w-5 h-5 text-studio-text-secondary" />
                <ImageIcon className="w-5 h-5 text-studio-text-secondary" />
                <Code className="w-5 h-5 text-studio-text-secondary" />
                <Settings className="w-5 h-5 text-studio-text-secondary mt-auto" />
              </div>
              
              {/* Main Content Area */}
              <div className="flex-1 flex flex-col gap-4">
                <div className="rounded-xl border border-studio-border bg-studio-bg-overlay p-6 relative overflow-hidden">
                  <div className="flex justify-between items-center mb-10">
                    <span className="text-sm text-studio-text-secondary">Hero Section</span>
                    <div className="flex items-center gap-2 bg-studio-bg-base rounded-full px-3 py-1 border border-studio-border text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      Live
                    </div>
                  </div>
                  <h2 className="text-3xl font-semibold mb-4 leading-tight">
                    Build beautiful<br />interfaces faster
                  </h2>
                  <p className="text-studio-text-secondary text-sm mb-6">
                    Modern. Fast. Production ready.
                  </p>
                  <div className="flex gap-3">
                    <div className="h-9 w-28 bg-white rounded-md" />
                    <div className="h-9 w-28 border border-studio-border rounded-md" />
                  </div>
                </div>
                
                {/* Lower Cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-studio-border bg-studio-bg-overlay p-4">
                    <h3 className="text-sm font-medium mb-2">AI Assistant</h3>
                    <p className="text-xs text-studio-text-tertiary mb-3">Generating section...</p>
                    <div className="w-full h-1 bg-studio-bg-base rounded-full overflow-hidden">
                      <div className="w-2/3 h-full bg-studio-text-primary rounded-full" />
                    </div>
                  </div>
                  <div className="rounded-xl border border-studio-border bg-studio-bg-overlay p-4">
                    <h3 className="text-sm font-medium mb-2">CMS Store</h3>
                    <div className="flex items-center gap-2 text-xs text-studio-text-secondary mt-3">
                      <CheckCircle2 className="w-4 h-4 text-studio-text-primary" />
                      Synced
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* 
        FEATURES GRID (4 Columns)
      */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          <div className="group rounded-2xl border border-studio-border bg-studio-bg-raised p-6 hover:bg-studio-bg-overlay transition-colors flex flex-col">
            <div className="w-12 h-12 rounded-xl border border-studio-border bg-studio-bg-base flex items-center justify-center mb-6">
              <Box className="w-6 h-6 text-studio-text-primary" />
            </div>
            <h3 className="text-base font-semibold mb-3">Multi-Modal Inputs</h3>
            <p className="text-sm text-studio-text-secondary leading-relaxed mb-6">
              Feed the pipeline plain text, wireframes, or both simultaneously.
            </p>
            <div className="mt-auto flex justify-end">
              <div className="w-8 h-8 rounded-full border border-studio-border flex items-center justify-center group-hover:bg-studio-bg-base transition-colors">
                <ArrowRight className="w-4 h-4 text-studio-text-tertiary group-hover:text-studio-text-primary transition-colors" />
              </div>
            </div>
          </div>

          <div className="group rounded-2xl border border-studio-border bg-studio-bg-raised p-6 hover:bg-studio-bg-overlay transition-colors flex flex-col">
            <div className="w-12 h-12 rounded-xl border border-studio-border bg-studio-bg-base flex items-center justify-center mb-6">
              <Database className="w-6 h-6 text-studio-text-primary" />
            </div>
            <h3 className="text-base font-semibold mb-3">Live CMS State</h3>
            <p className="text-sm text-studio-text-secondary leading-relaxed mb-6">
              Every generated component binds automatically to the global CMS store.
            </p>
            <div className="mt-auto flex justify-end">
              <div className="w-8 h-8 rounded-full border border-studio-border flex items-center justify-center group-hover:bg-studio-bg-base transition-colors">
                <ArrowRight className="w-4 h-4 text-studio-text-tertiary group-hover:text-studio-text-primary transition-colors" />
              </div>
            </div>
          </div>

          <div className="group rounded-2xl border border-studio-border bg-studio-bg-raised p-6 hover:bg-studio-bg-overlay transition-colors flex flex-col">
            <div className="w-12 h-12 rounded-xl border border-studio-border bg-studio-bg-base flex items-center justify-center mb-6">
              <Eye className="w-6 h-6 text-studio-text-primary" />
            </div>
            <h3 className="text-base font-semibold mb-3">Instant Preview</h3>
            <p className="text-sm text-studio-text-secondary leading-relaxed mb-6">
              Interact in a sandboxed iframe. Ensure it responds perfectly to all screen sizes.
            </p>
            <div className="mt-auto flex justify-end">
              <div className="w-8 h-8 rounded-full border border-studio-border flex items-center justify-center group-hover:bg-studio-bg-base transition-colors">
                <ArrowRight className="w-4 h-4 text-studio-text-tertiary group-hover:text-studio-text-primary transition-colors" />
              </div>
            </div>
          </div>

          <div className="group rounded-2xl border border-studio-border bg-studio-bg-raised p-6 hover:bg-studio-bg-overlay transition-colors flex flex-col">
            <div className="w-12 h-12 rounded-xl border border-studio-border bg-studio-bg-base flex items-center justify-center mb-6">
              <Zap className="w-6 h-6 text-studio-text-primary" />
            </div>
            <h3 className="text-base font-semibold mb-3">Ready for Production</h3>
            <p className="text-sm text-studio-text-secondary leading-relaxed mb-6">
              Valid JSX. Tailwind classes. Dynamic styling support. Zero manual refactoring.
            </p>
            <div className="mt-auto flex justify-end">
              <div className="w-8 h-8 rounded-full border border-studio-border flex items-center justify-center group-hover:bg-studio-bg-base transition-colors">
                <ArrowRight className="w-4 h-4 text-studio-text-tertiary group-hover:text-studio-text-primary transition-colors" />
              </div>
            </div>
          </div>
          
        </div>
      </section>

      {/* 
        STATS BAR
      */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <div className="rounded-2xl border border-studio-border bg-studio-bg-raised p-8 grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-studio-border/50 text-center relative overflow-hidden">
          {/* Subtle gradient behind stats */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />
          
          <div className="flex flex-col items-center justify-center relative z-10 border-l-0">
            <h4 className="text-4xl font-semibold mb-2">10K+</h4>
            <p className="text-sm text-studio-text-secondary">Components Generated</p>
          </div>
          <div className="flex flex-col items-center justify-center relative z-10">
            <h4 className="text-4xl font-semibold mb-2">3K+</h4>
            <p className="text-sm text-studio-text-secondary">Developers</p>
          </div>
          <div className="flex flex-col items-center justify-center relative z-10">
            <h4 className="text-4xl font-semibold mb-2">98%</h4>
            <p className="text-sm text-studio-text-secondary">Time Saved</p>
          </div>
          <div className="flex flex-col items-center justify-center relative z-10">
            <h4 className="text-4xl font-semibold mb-2">24/7</h4>
            <p className="text-sm text-studio-text-secondary">Live Sync</p>
          </div>
        </div>
      </section>

      {/* 
        SHOWCASE SECTION
      */}
      <section className="max-w-7xl mx-auto px-6 py-20 grid lg:grid-cols-[1fr_2fr] gap-12 items-center">
        <div>
          <h2 className="text-3xl font-semibold mb-4 leading-tight">Built for<br />modern builders</h2>
          <p className="text-sm text-studio-text-secondary mb-8 max-w-sm leading-relaxed">
            Create, preview, and ship components without leaving your flow.
          </p>
          <Link 
            to="/generate" 
            className="group inline-flex items-center gap-2 bg-studio-bg-raised border border-studio-border text-studio-text-primary font-medium text-sm px-6 py-2.5 rounded-full hover:bg-studio-bg-overlay transition-colors"
          >
            Explore Showcase
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-studio-border bg-studio-bg-raised overflow-hidden flex flex-col">
            <div className="h-40 bg-studio-bg-base/50 p-4 border-b border-studio-border flex flex-col justify-center items-center">
              {/* Mockup SVG/Divs */}
              <div className="w-full h-24 rounded border border-studio-border/50 bg-studio-bg-base flex flex-col p-3">
                <div className="w-20 h-2 bg-studio-text-secondary rounded mb-2" />
                <div className="w-3/4 h-3 bg-studio-text-primary rounded mb-1" />
                <div className="w-1/2 h-3 bg-studio-text-primary rounded mb-4" />
                <div className="w-16 h-4 bg-studio-text-tertiary rounded mt-auto" />
              </div>
            </div>
            <div className="p-4 bg-studio-bg-overlay">
              <h4 className="text-sm font-medium">SaaS Landing Hero</h4>
            </div>
          </div>
          
          <div className="rounded-xl border border-studio-border bg-studio-bg-raised overflow-hidden flex flex-col">
            <div className="h-40 bg-studio-bg-base/50 p-4 border-b border-studio-border flex gap-2 justify-center items-center">
              {/* Mockup for Pricing */}
              {[19, 49, 99].map((price, i) => (
                <div key={i} className="flex-1 h-28 rounded border border-studio-border/50 bg-studio-bg-base p-2 flex flex-col items-center">
                  <div className="w-8 h-1.5 bg-studio-text-tertiary rounded mb-2" />
                  <div className="text-xs font-bold mb-4">${price}</div>
                  <div className="w-full h-1 bg-studio-text-tertiary/20 rounded mb-1" />
                  <div className="w-full h-1 bg-studio-text-tertiary/20 rounded mb-1" />
                  <div className="w-full h-4 bg-white/10 rounded mt-auto" />
                </div>
              ))}
            </div>
            <div className="p-4 bg-studio-bg-overlay">
              <h4 className="text-sm font-medium">Pricing Section</h4>
            </div>
          </div>

          <div className="rounded-xl border border-studio-border bg-studio-bg-raised overflow-hidden flex flex-col">
            <div className="h-40 bg-studio-bg-base/50 p-4 border-b border-studio-border grid grid-cols-2 grid-rows-2 gap-2">
              {/* Mockup for Testimonial */}
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="rounded border border-studio-border/50 bg-studio-bg-base p-2 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-studio-text-secondary/50" />
                    <div className="w-10 h-1.5 bg-studio-text-tertiary rounded" />
                  </div>
                  <div className="w-full h-1 bg-studio-text-tertiary/30 rounded" />
                  <div className="w-4/5 h-1 bg-studio-text-tertiary/30 rounded" />
                </div>
              ))}
            </div>
            <div className="p-4 bg-studio-bg-overlay">
              <h4 className="text-sm font-medium">Testimonial Grid</h4>
            </div>
          </div>
        </div>
      </section>

      {/* 
        HOW IT WORKS
      */}
      <section className="max-w-5xl mx-auto px-6 py-20 text-center">
        <h2 className="text-xl font-medium mb-16">How it works</h2>
        
        <div className="relative flex flex-col md:flex-row justify-between items-center md:items-start gap-8 md:gap-4">
          {/* Connecting line (hidden on mobile) */}
          <div className="hidden md:block absolute top-8 left-12 right-12 h-px border-t border-dashed border-studio-border" />
          
          {[
            { num: '01', title: 'Input', icon: PenTool, desc: 'Provide wireframes, text prompts, or both.' },
            { num: '02', title: 'Generate', icon: Wand2, desc: 'AI understands and builds your component.' },
            { num: '03', title: 'Preview', icon: Monitor, desc: 'Inspect and interact in real-time sandbox.' },
            { num: '04', title: 'Sync', icon: Database, desc: 'Component binds to live CMS store.' },
            { num: '05', title: 'Deploy', icon: Rocket, desc: 'Copy, paste, and ship to production.' },
          ].map((step, i) => (
            <div key={i} className="relative z-10 flex flex-col items-center max-w-[140px]">
              <div className="w-16 h-16 rounded-full border border-studio-border bg-studio-bg-raised flex items-center justify-center mb-6 shadow-sm">
                <step.icon className="w-6 h-6 text-studio-text-primary" />
              </div>
              <span className="text-xs font-mono text-studio-text-tertiary mb-2">{step.num}</span>
              <h3 className="text-sm font-semibold mb-2">{step.title}</h3>
              <p className="text-xs text-studio-text-secondary leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 
        BOTTOM CTA
      */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="relative overflow-hidden rounded-3xl border border-studio-border bg-studio-bg-raised p-12 md:p-16 flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Abstract background shapes */}
          <div className="absolute -top-24 -left-24 w-64 h-64 bg-white/5 rounded-full blur-[80px]" />
          <div className="absolute -bottom-24 -right-24 w-64 h-64 border border-white/10 rounded-full" />
          <div className="absolute -bottom-12 -right-12 w-48 h-48 border border-white/5 rounded-full" />
          
          <div className="relative z-10 flex items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-studio-bg-overlay border border-studio-border flex items-center justify-center hidden sm:flex">
              <Box className="w-8 h-8 text-studio-text-primary" />
            </div>
            <div>
              <h2 className="text-3xl font-semibold mb-3">Ready to build faster?</h2>
              <p className="text-studio-text-secondary text-sm">Join thousands of developers building better interfaces with FrameWright.</p>
            </div>
          </div>
          
          <div className="relative z-10 shrink-0">
            <Link 
              to="/generate" 
              className="group inline-flex items-center gap-2 bg-white text-black font-medium text-sm px-8 py-4 rounded-full hover:bg-gray-100 transition-colors shadow-xl shadow-white/10"
            >
              Enter the Studio
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* 
        FOOTER
      */}
      <footer className="w-full border-t border-studio-border bg-studio-bg-base pt-16 pb-8 px-6 mt-12">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-16">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <Box className="w-6 h-6 text-studio-text-primary" />
              <span className="font-semibold text-lg">FrameWright</span>
            </div>
            <p className="text-xs text-studio-text-secondary max-w-xs leading-relaxed mb-6">
              The modern studio to transform wireframes into live React components.
            </p>
            <div className="flex items-center gap-4 text-studio-text-tertiary">
              <a href="#" className="hover:text-studio-text-primary transition-colors"><Github className="w-4 h-4" /></a>
              <a href="#" className="hover:text-studio-text-primary transition-colors"><Twitter className="w-4 h-4" /></a>
              <a href="#" className="hover:text-studio-text-primary transition-colors"><MessageSquare className="w-4 h-4" /></a>
              <a href="#" className="hover:text-studio-text-primary transition-colors"><Linkedin className="w-4 h-4" /></a>
            </div>
          </div>
          
          <div>
            <h4 className="text-sm font-semibold mb-4 text-studio-text-primary">Studio</h4>
            <ul className="space-y-3 text-xs text-studio-text-secondary">
              <li><Link to="/generate" className="hover:text-studio-text-primary transition-colors">Overview</Link></li>
              <li><Link to="/preview" className="hover:text-studio-text-primary transition-colors">Preview</Link></li>
              <li><a href="#" className="hover:text-studio-text-primary transition-colors">Changelog</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-sm font-semibold mb-4 text-studio-text-primary">Resources</h4>
            <ul className="space-y-3 text-xs text-studio-text-secondary">
              <li><a href="#" className="hover:text-studio-text-primary transition-colors">Docs</a></li>
              <li><a href="#" className="hover:text-studio-text-primary transition-colors">Guides</a></li>
              <li><a href="#" className="hover:text-studio-text-primary transition-colors">Help Center</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-sm font-semibold mb-4 text-studio-text-primary">Company</h4>
            <ul className="space-y-3 text-xs text-studio-text-secondary">
              <li><a href="#" className="hover:text-studio-text-primary transition-colors">About Us</a></li>
              <li><a href="#" className="hover:text-studio-text-primary transition-colors">Careers</a></li>
              <li><a href="#" className="hover:text-studio-text-primary transition-colors">Contact</a></li>
            </ul>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between pt-8 border-t border-studio-border/50 text-xs text-studio-text-tertiary">
          <p>© 2025 FrameWright. All rights reserved.</p>
          <div className="mt-4 md:mt-0 flex items-center gap-4">
            <span>Stay updated</span>
            <div className="flex bg-studio-bg-raised border border-studio-border rounded-full overflow-hidden">
              <input type="email" placeholder="Enter your email" className="bg-transparent border-none outline-none text-xs px-4 py-2 w-48 placeholder:text-studio-text-tertiary text-studio-text-primary" />
              <button className="bg-studio-bg-overlay px-3 border-l border-studio-border hover:bg-studio-border transition-colors">
                <ArrowRight className="w-3 h-3 text-studio-text-primary" />
              </button>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
