import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { highlight, TOKEN_COLOURS } from './GeneratedSourceView.logic.js';

export default function GeneratedSourceView({ jobId, pageName = 'Home' }) {
  const [sourceCode, setSourceCode] = useState('');
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!jobId) return;

    let isMounted = true;
    const fetchComponent = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/component`);
        if (!res.ok) {
          throw new Error('Failed to fetch component source');
        }
        const text = await res.text();
        if (isMounted) setSourceCode(text);
      } catch (err) {
        if (isMounted) setError(err.message);
      }
    };

    fetchComponent();
    
    return () => { isMounted = false; };
  }, [jobId]);

  // Recomputed only when the source changes — the scanner is linear, but so is typing in
  // the copy button's `setTimeout`, and re-tokenising 400 lines on a "Copied" flash is
  // work nobody asked for.
  const lines = React.useMemo(() => highlight(sourceCode), [sourceCode]);

  const handleCopy = () => {
    navigator.clipboard.writeText(sourceCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-red-500 text-sm p-4">{error}</p>}
      
      {sourceCode ? (
        <div className="rounded-xl overflow-hidden border border-studio-border/50 shadow-2xl studio-glass-raised flex flex-col h-[75vh] min-h-[600px]">
          {/* IDE Header (Mac style) */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#1e1e1e] border-b border-[#2d2d2d] shrink-0">
            <div className="flex gap-2 items-center">
              <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
              <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
              <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
              <span className="ml-3 text-xs text-[#858585] font-mono tracking-tight">{pageName}.jsx</span>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={handleCopy}
                className="text-xs text-[#cccccc] bg-[#2d2d2d] hover:bg-[#3d3d3d] px-3 py-1.5 rounded transition-colors flex items-center gap-1.5"
              >
                {copied ? (
                  <><svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Copied</>
                ) : (
                  <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Copy</>
                )}
              </button>
              <Link 
                to={`/preview/${pageName}`}
                target="_blank"
                className="text-xs bg-studio-accent text-white px-3 py-1.5 rounded hover:bg-studio-accent-hover transition-colors"
              >
                Preview
              </Link>
            </div>
          </div>
          
          {/* Editor Body.

              FR-G06 (T-049) — generated source renders READ-ONLY, and a <pre><code>
              block is how that is stated and how the test reads it. No textarea, no
              contentEditable: there is nothing here for a stray keystroke to change.
              The colouring is our own scanner (GeneratedSourceView.logic.js); the
              package that used to do it needs `document` at import time and took eight
              unrelated tests down with it. */}
          <div className="flex-1 overflow-auto bg-[#1e1e1e]">
            <pre className="m-0 p-5 text-[0.85rem] leading-relaxed font-mono">
              <code className="grid">
                {lines.map((tokens, index) => (
                  <span key={index} className="grid grid-cols-[2.5em_1fr] gap-4">
                    <span
                      className="select-none text-right tabular-nums"
                      style={{ color: '#6e7681' }}
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <span className="whitespace-pre">
                      {tokens.map((token, at) => (
                        <span key={at} style={{ color: TOKEN_COLOURS[token.kind] }}>
                          {token.text}
                        </span>
                      ))}
                    </span>
                  </span>
                ))}
              </code>
            </pre>
          </div>
        </div>
      ) : (
        !error && (
          <div className="flex items-center justify-center p-12 rounded-xl border border-studio-border/50 studio-glass-raised bg-[#1e1e1e]">
            <p className="text-sm text-studio-text-tertiary flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-studio-text-tertiary animate-pulse"></span>
              Loading source...
            </p>
          </div>
        )
      )}
    </div>
  );
}
