import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';

// Eagerly discover all generated JSX components.
// Keys are relative paths: '../sections/generated/SectionName-1000000001-v1.jsx'
const generatedModules = import.meta.glob('../sections/generated/*.jsx', { eager: true });

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
        const extracted = data.data || data;
        setSectionDocs(Array.isArray(extracted) ? extracted : []);
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

  const renderedSections = sectionDocs.map((section) => {
    const safeName = String(section.sectionName || 'Section').replace(/[^a-zA-Z0-9_]/g, '');
    const filename = `${safeName}-${section.sectionId}-v${section.variation}.jsx`;
    const moduleKey = `../sections/generated/${filename}`;
    const Component = generatedModules[moduleKey]?.default;

    if (!Component) {
      // In case the module is not found, render a fallback.
      return (
        <div key={section.sectionId} className="p-4 border-2 border-dashed border-red-300 text-red-600 my-4 rounded">
          <p className="font-mono">Missing component file: {filename}</p>
          <p className="text-sm">The section document is in the store, but the file was not found by Vite eager-glob.</p>
        </div>
      );
    }
    
    return <Component key={section.sectionId} pageName={pageName} />;
  });

  return (
    <main className="p-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">
          Preview — <span className="font-mono">{pageName}</span>
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Section mounting arrives with T-011 and T-029. This shell exists now so the store's
          state is observable from the first hour (§9).
        </p>
      </header>

      <dl className="grid max-w-md grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-gray-600">Hydration status</dt>
        <dd className="font-mono">{status}</dd>

        <dt className="text-gray-600">Keys in allSections</dt>
        <dd className="font-mono">{keyCount}</dd>

        <dt className="text-gray-600">Missing IDs</dt>
        <dd className="font-mono">{missingCount}</dd>
      </dl>

      {error ? (
        <p className="mt-4 max-w-prose rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}

      {keyCount === 0 ? (
        <p className="mt-4 max-w-prose rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Nothing hydrated for <span className="font-mono">{pageName}</span> yet. That is expected
          until <span className="font-mono">GET /api/elements</span> and the mount-time fetch are
          wired (T-015, T-011). A page that looked complete while this number stayed at zero would
          be the §9 failure exactly.
        </p>
      ) : null}

      <div className="mt-8 flex flex-col gap-8">
        {renderedSections}
      </div>
    </main>
  );
}
