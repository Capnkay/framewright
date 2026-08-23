import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Label, fade } from "../components/Shell";
import SideEditor from "../studio/SideEditor";
import { useDispatch } from "react-redux";
import { fetchElementsByIds } from "../redux/fetchElementsByIds.js";

const generatedModules = import.meta.glob('../sections/generated/*.jsx', { eager: true });

// WHICH FILE A SECTION RENDERS FROM.
//
// This used to read `section.componentFile`. No section record has ever carried
// that field -- §2's document shape does not define it, and the emitter reports
// the written path on the JOB record, not the section. So the lookup key was
// the string "undefined" for every section on every page, `generatedModules`
// missed, and this route rendered "Failed to load component undefined" instead
// of the product. Verified against the live store: 21 sections, 0 with a
// `componentFile`.
//
// The filename is derivable, and derivation is the right answer rather than
// backfilling the field, because §7 already fixes the name:
//   <SectionName>-<sectionId>-v<variation>.jsx
// with SectionName stripped of everything outside [a-zA-Z0-9_]. That rule lives
// in server/src/generate/writeComponentFile.js#buildComponentFilename and the
// two must agree; if §7's naming ever changes, both change together.
//
// `section.componentFile` is still honoured when present, so a store that does
// start carrying it keeps working without a second edit here.
//
// NOTE ON `variations` vs `variation`. §2 spells the COUNT `variations`; the
// index of the one to render is `variation`. Reading the count as an index is
// how a section declaring two variations asks for "-v2" and gets a miss, so
// only `variation` is consulted and it defaults to 1.
function componentKeyFor(section) {
  if (section.componentFile) {
    const basename = String(section.componentFile).split(/[\\/]/).pop();
    return `../sections/generated/${basename}`;
  }
  const safeName = String(section.sectionName || 'Section').replace(/[^a-zA-Z0-9_]/g, '');
  const variation = section.variation || 1;
  return `../sections/generated/${safeName}-${section.sectionId}-v${variation}.jsx`;
}

function SectionWrapper({ section, Component, pageName }) {
  return (
    <div className="relative group mb-8">
      <Component key={section.sectionId} pageName={pageName} />
    </div>
  );
}

export default function Preview() {
  const { pageName = 'Home' } = useParams();
  const [variation, setVariation] = useState("A");
  const [sectionDocs, setSectionDocs] = useState([]);
  
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [editorPos, setEditorPos] = useState({ top: 0, left: 0 });

  const dispatch = useDispatch();

  useEffect(() => {
    fetch('/api/sections')
      .then((r) => r.json())
      .then((sections) => {
        setSectionDocs(sections.filter(s => s.pageName === pageName));
      })
      .catch((err) => console.error(err));

    // Hydrate Redux with the CMS data for this page
    dispatch(fetchElementsByIds({ pageName }));
  }, [pageName, dispatch]);

  const variations = ["A", "B", "C"];

  const handleDocumentClick = (e) => {
    const ignoreClicks = e.target.closest('.side-editor-ignore');
    if (ignoreClicks) return;
    
    const editable = e.target.closest('[data-field-id]');
    if (editable) {
      e.preventDefault();
      e.stopPropagation();
      const rect = editable.getBoundingClientRect();
      const id = editable.getAttribute('data-field-id');
      setEditorPos({ top: rect.top + window.scrollY, left: rect.right + 10 });
      setEditingFieldId(id);
    } else {
      setEditingFieldId(null);
    }
  };

  useEffect(() => {
    document.addEventListener('click', handleDocumentClick, { capture: true });
    return () => document.removeEventListener('click', handleDocumentClick, { capture: true });
  }, []);

  return (
    <div className="live-preview-page h-screen flex flex-col overflow-hidden">
      <div className="preview-toolbar side-editor-ignore shrink-0">
        <div><Label>LIVE PREVIEW</Label><h1>{pageName}</h1></div>
        <div className="variation-toggle" data-testid="design-variation-toggle">
          <span>Design preview</span>
          {variations.map(v => (
            <button key={v} className={variation === v ? "selected" : ""} onClick={() => setVariation(v)} data-testid={`variation-${v.toLowerCase()}-button`}>
              0{v === "A" ? 1 : v === "B" ? 2 : 3}
            </button>
          ))}
        </div>
      </div>
      
      <AnimatePresence mode="wait">
        <motion.div key={variation} className={`site-preview variation-${variation.toLowerCase()} flex-1 overflow-y-auto w-full max-w-full`} {...fade} data-testid="live-site-preview">
          <div className="custom-preview-frame mx-auto w-full max-w-[1920px]" data-testid="custom-preview-frame" style={{ minHeight: '100%', background: 'white', position: 'relative'}}>
            {sectionDocs.length === 0 ? (
              <div style={{padding: '2rem', color: '#666', textAlign: 'center'}}>No sections generated for {pageName} yet. Head to the Studio to create one.</div>
            ) : (
              sectionDocs.map((section) => {
                const modKey = componentKeyFor(section);
                const mod = generatedModules[modKey];
                const Component = mod ? mod.default : null;

                if (!Component) {
                  return (
                    <div key={section.sectionId} style={{padding: '2rem', color: 'red'}}>
                      Failed to load component {modKey.split('/').pop()} &mdash; the section record exists but no generated file matches §7&rsquo;s name.
                    </div>
                  );
                }

                return (
                  <SectionWrapper 
                    key={section.sectionId} 
                    section={section} 
                    Component={Component} 
                    pageName={pageName} 
                  />
                );
              })
            )}

            <AnimatePresence>
              {editingFieldId && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    position: 'absolute',
                    top: editorPos.top,
                    left: editorPos.left,
                    zIndex: 9999
                  }}
                  className="side-editor-ignore"
                >
                  <SideEditor
                    fieldId={editingFieldId}
                    onClose={() => setEditingFieldId(null)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
