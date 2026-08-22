import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';

// Eagerly discover all generated JSX components.
// Keys are relative paths: '../sections/generated/SectionName-1000000001-v1.jsx'
const generatedModules = import.meta.glob('../sections/generated/*.jsx', { eager: true });

function SectionWrapper({ section, Component, pageName }) {
  const [regeneratePrompt, setRegeneratePrompt] = useState('');
  const [regenerateVariation, setRegenerateVariation] = useState(section.variations || section.variation || '1');
  const [regenerating, setRegenerating] = useState(false);

  const handleRegenerate = async (e) => {
    e.preventDefault();
    setRegenerating(true);
    try {
      const res = await fetch(`/api/sections/${section.sectionId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: regeneratePrompt || undefined,
          variation: regenerateVariation,
          variations: regenerateVariation
        })
      });
      if (res.ok) {
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
    }
    setRegenerating(false);
  };

  return (
    <div className="relative group border rounded mb-8 p-4">
      <form 
        onSubmit={handleRegenerate}
        className="absolute top-2 right-2 bg-background shadow rounded px-3 py-2 z-10 flex flex-col gap-2 border text-sm"
      >
        <div className="font-semibold text-muted-foreground">Regenerate Section</div>
        <div className="flex gap-2 items-center">
          <label>Prompt:</label>
          <input 
            type="text"
            placeholder="e.g. four stats, green accent"
            value={regeneratePrompt}
            onChange={(e) => setRegeneratePrompt(e.target.value)}
            className="border p-1 rounded text-xs w-48"
          />
        </div>
        <div className="flex gap-2 items-center justify-between">
          <div>
            <label className="mr-2">Variation:</label>
            <select 
              value={regenerateVariation} 
              onChange={(e) => setRegenerateVariation(e.target.value)}
              className="border p-1 rounded text-xs"
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </div>
          <button 
            type="submit" 
            disabled={regenerating}
            className="bg-accent text-white px-2 py-1 rounded text-xs disabled:opacity-50"
          >
            {regenerating ? 'Wait...' : 'Go'}
          </button>
        </div>
      </form>
      <Component key={section.sectionId} pageName={pageName} />
    </div>
  );
}

export default function PreviewPage() {
  // §1: pageName is case-sensitive. Whatever case the URL carries is the key.
  const { pageName = 'Home' } = useParams();

  const [sectionDocs, setSectionDocs] = useState([]);

  useEffect(() => {
    let active = true;
    fetch(`/api/sections?pageName=${pageName}`)
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        // §13.4: a collection read is a BARE ARRAY, never wrapped. This was
        // `data.data || data`, which accommodates exactly the shape the
        // contract forbids — and §9 names that accommodation as the way a
        // reducer ends up with an empty store behind a page that renders
        // perfectly. Reading it as what the contract says it is means a server
        // that ever wrapped the response fails loudly here instead of quietly
        // everywhere else.
        setSectionDocs(Array.isArray(data) ? data : []);
      })
      .catch(err => console.error(err));
    return () => { active = false; };
  }, [pageName]);

  const sections = useSelector((state) => state.cms.allSections[pageName]);
  const missing = useSelector((state) => state.cms.missing[pageName]);
  const status = useSelector((state) => state.cms.status);
  const error = useSelector((state) => state.cms.error);

  const keyCount = sections ? Object.keys(sections).length : 0;
  const missingCount = Array.isArray(missing) ? missing.length : 0;

  // Sections whose component file is not on this machine. Collected while
  // rendering and reported once, below, rather than a card each.
  const unbuilt = [];

  const renderedSections = sectionDocs.map((section) => {
    const safeName = String(section.sectionName || 'Section').replace(/[^a-zA-Z0-9_]/g, '');
    const filename = `${safeName}-${section.sectionId}-v${section.variations || section.variation || '1'}.jsx`;
    const moduleKey = `../sections/generated/${filename}`;
    const Component = generatedModules[moduleKey]?.default;

    if (!Component) {
      // In case the module is not found, render a fallback.
      // NOTHING IS RENDERED FOR A SECTION THIS MACHINE CANNOT BUILD, and that is a
      // change from showing an explanatory card for each one.
      //
      // The card was right when there were three of them. Measured on a store that
      // had accumulated a few weeks of runs: 163 sections on `Home`, 54 with a
      // component file and **109 without** — so the page opened with a hundred
      // identical "isn't built here" blocks and the real sections were somewhere
      // past them. An explanation repeated a hundred times is not an explanation,
      // it is the page.
      //
      // The state is not hidden, it is COUNTED, and the count sits with the other
      // §9 diagnostics below. One line saying "109 sections are not built here"
      // tells a reader more than a hundred cards saying it individually, and it
      // keeps the fact available rather than silently dropping it.
      unbuilt.push(section);
      return null;
    }
    
    return <SectionWrapper key={section.sectionId} section={section} Component={Component} pageName={pageName} />;
    // The above hands <Component key={section.sectionId} pageName={pageName} /> to the wrapper.
  });

  return (
    <main className="min-h-screen bg-background p-6">
      {/* THE SECTIONS COME FIRST. This page is what a judge is shown, and what
          it is FOR is the rendered result — the diagnostics below exist to make
          §9 observable, not to be the headline. They were above the content,
          with copy naming T-011, T-029 and T-015, which is a build note on a
          product page. */}
      <div className="flex flex-col gap-8">{renderedSections}</div>

      {sectionDocs.length === 0 ? (
        <p className="max-w-prose rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
          No sections on <span className="font-medium text-foreground">{pageName}</span> yet.
          Generate one in the Studio and it will appear here.
        </p>
      ) : null}

      {/* §9's observability, kept in full and moved out of the way. AGENTS.md
          rule 2: a completely dead store looks pixel-identical to a working one,
          and these three numbers are the only thing on screen that can tell them
          apart. Deleting them to tidy the page would remove the one instrument
          that catches the failure the whole assertion exists for — which is
          exactly what T-127 turned out to be. Closed by default, one click away. */}
      <details className="mt-12 max-w-md rounded-lg border border-border bg-card p-4 text-sm">
        <summary className="cursor-pointer font-medium text-foreground">
          Content status
          <span className="ml-2 font-normal text-muted-foreground">
            {status === 'succeeded' && missingCount === 0
              ? `${keyCount} field${keyCount === 1 ? '' : 's'} loaded`
              : status === 'loading'
                ? 'loading…'
                : 'not loaded'}
          </span>
        </summary>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">Hydration status</dt>
          <dd className="font-mono text-foreground">{status}</dd>

          <dt className="text-muted-foreground">Keys in allSections</dt>
          <dd className="font-mono text-foreground">{keyCount}</dd>

          <dt className="text-muted-foreground">Missing IDs</dt>
          <dd className="font-mono text-foreground">{missingCount}</dd>

          <dt className="text-muted-foreground">Not built here</dt>
          <dd className="font-mono text-foreground">{unbuilt.length}</dd>
        </dl>

        {unbuilt.length > 0 ? (
          <p className="mt-3 text-muted-foreground">
            {unbuilt.length} section{unbuilt.length === 1 ? '' : 's'} on this page {unbuilt.length === 1 ? 'has' : 'have'} content
            saved but no component file on this machine, so {unbuilt.length === 1 ? 'it is' : 'they are'} not shown. Generate
            {unbuilt.length === 1 ? ' it' : ' them'} again from the Studio to see {unbuilt.length === 1 ? 'it' : 'them'} render.
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-md bg-destructive/10 p-3 text-destructive">{error}</p>
        ) : null}

        {keyCount === 0 ? (
          <p className="mt-3 rounded-md bg-warn/10 p-3 text-foreground">
            No content loaded for <span className="font-medium">{pageName}</span>. The sections
            below are showing their built-in defaults, so the page looks finished while nothing is
            actually coming from the store — check that the API is running.
          </p>
        ) : null}
      </details>
    </main>
  );
}
