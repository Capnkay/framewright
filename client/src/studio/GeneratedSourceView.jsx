import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

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
          
          {/* Editor Body */}
          <div className="flex-1 overflow-hidden bg-[#1e1e1e]">
            <SyntaxHighlighter 
              language="jsx" 
              style={vscDarkPlus} 
              showLineNumbers={true}
              customStyle={{ 
                margin: 0, 
                padding: '1.25rem',
                backgroundColor: 'transparent',
                fontSize: '0.85rem',
                height: '100%',
                overflow: 'auto'
              }}
              lineNumberStyle={{
                minWidth: '2.5em',
                paddingRight: '1em',
                color: '#6e7681',
                textAlign: 'right'
              }}
            >
              {sourceCode}
            </SyntaxHighlighter>
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
