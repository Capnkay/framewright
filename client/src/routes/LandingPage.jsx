import React from 'react';
import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-8 text-center overflow-x-hidden">
      <div className="max-w-4xl w-full">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground mb-6">
          From Wireframe to <span className="text-accent">Live Component</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
          Framewright transforms hand-drawn wireframes and plain-text prompts into production-ready React sections, backed by a live CMS store. 
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center mb-16">
          <div className="bg-card border border-border rounded-lg p-6 shadow-sm flex flex-col items-center">
            <h3 className="text-sm font-bold tracking-wider text-muted-foreground uppercase mb-4">Input</h3>
            <div className="w-full h-64 bg-background border border-border border-dashed rounded flex items-center justify-center overflow-hidden">
              <img 
                src="/gpu-test/wireframe.png" 
                alt="Hand-drawn wireframe input" 
                className="max-h-full object-contain mix-blend-multiply dark:mix-blend-normal dark:opacity-80"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'block';
                }}
              />
              <span className="hidden text-muted-foreground text-sm italic">Wireframe (gpu-test/wireframe.png)</span>
            </div>
          </div>
          
          <div className="bg-card border border-border rounded-lg p-6 shadow-sm flex flex-col items-center">
            <h3 className="text-sm font-bold tracking-wider text-muted-foreground uppercase mb-4">Output</h3>
            <div className="w-full h-64 bg-background border border-border rounded flex flex-col items-start justify-center p-6 overflow-hidden">
               <div className="w-full">
                  <div className="w-2/3 h-6 bg-accent/20 rounded mb-4"></div>
                  <div className="w-full h-4 bg-text-muted/20 rounded mb-2"></div>
                  <div className="w-5/6 h-4 bg-text-muted/20 rounded mb-6"></div>
                  <div className="flex gap-4">
                    <div className="w-32 h-10 bg-accent rounded"></div>
                    <div className="w-32 h-10 border border-border rounded"></div>
                  </div>
               </div>
            </div>
          </div>
        </div>

        <div>
          <Link 
            to="/generate" 
            className="inline-block bg-accent hover:bg-accent-hover text-white font-medium text-lg px-8 py-3 rounded-lg shadow-base transition-colors duration-200"
          >
            Go to Studio
          </Link>
        </div>
      </div>
    </main>
  );
}
