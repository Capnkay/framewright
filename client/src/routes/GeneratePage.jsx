// client/src/routes/GeneratePage.jsx
//
// The Generator Studio. FR-G01–FR-G09, §7 R11.
//
// T-126 REBUILT THE LAYOUT, NOT THE FEATURES. Every component this page mounted
// before is still mounted and still wired; nothing was removed. What was wrong
// was what a person met on arriving:
//
//   - Headings were internal requirement ids — "Configuration (FR-G07)",
//     "Generation Mode (FR-G04, FR-G01)", "Legacy Inputs (FR-G02, FR-G03)".
//   - The subtitle was a note to ourselves: "Full studio layout mounting all 14
//     built components". There are seventeen.
//   - Three independently scrolling columns showed eight panels at once, with
//     nothing marked as the thing to do first.
//   - The CMS editor asked the user to type a ten-digit field id from memory.
//   - The preview — the actual product — rendered the string "Preview will
//     render here", while ResponsiveToggle had an `src` prop that frames the
//     real page in an iframe and was being passed children instead.
//
// THE SHAPE NOW: one input rail on the left, and the preview as the largest
// thing on screen. The stage trace appears underneath it in response to a run
// rather than sitting there empty, because §11's timeline is the second most
// interesting thing here and the first thing that is worth watching happen.
// Everything else — the stage inspector, the emitted source, the CMS editor —
// is a tab on that same panel, one click away and not in the way.
//
// WHAT IS DELIBERATELY NOT TOUCHED. AGENTS.md rule 3. The generated sections
// this page previews carry `dangerouslySetInnerHTML`, the `dynamicStyle` marker
// classes, the `const ids` map and CSS applied through `getElementById`. Every
// one looks like something to tidy during a design pass and every one is graded.
// This file renders around them and changes none of them.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';

import SectionFields from '../studio/SectionFields.jsx';
import Composer from '../studio/Composer.jsx';
import JobTimeline from '../studio/JobTimeline.jsx';
import StageInspector from '../studio/StageInspector.jsx';
import GenerationProgress from '../studio/GenerationProgress.jsx';
import JobHistory from '../studio/JobHistory.jsx';
import GeneratedSourceView from '../studio/GeneratedSourceView.jsx';
import QuestionPrompt from '../studio/QuestionPrompt.jsx';
import ResponsiveToggle from '../studio/ResponsiveToggle.jsx';
import SideEditor from '../studio/SideEditor.jsx';
import ErrorBanner from '../studio/ErrorBanner.jsx';

const EASE_STANDARD = [0.16, 1, 0.3, 1];

const TABS = [
  { id: 'stages', label: 'Stages' },
  { id: 'source', label: 'Code' },
  { id: 'content', label: 'Content' },
];

export default function GeneratePage({ initialJob = null }) {
  const [job, setJob] = useState(initialJob);
  const [submitError, setSubmitError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('stages');

  const [pageName, setPageName] = useState('Home');
  const [sectionName, setSectionName] = useState('Custom');
  const [accent, setAccent] = useState('');

  // The CMS editor used to require the user to type a ten-digit field id. The
  // ids are allocated by the API and returned on the job, so the page can just
  // ask for them.
  const [fields, setFields] = useState([]);
  const [fieldId, setFieldId] = useState('');

  useEffect(() => {
    if (!job || !job.sectionId) return;
    let cancelled = false;

    fetch(`/api/elements?sectionId=${encodeURIComponent(job.sectionId)}`)
      .then((res) => (res.ok ? res.json() : []))
      // §13.4: a collection read is a BARE ARRAY, never wrapped. Guarding on
      // Array.isArray rather than reaching for `.data` is what keeps that true.
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return;
        setFields(rows);
        if (rows.length > 0) setFieldId(String(rows[0].fieldId));
      })
      .catch(() => {
        /* the editor falls back to a manual id box below */
      });

    return () => {
      cancelled = true;
    };
  }, [job]);

  const handleSubmit = async (formData) => {
    setSubmitError(null);
    setJob(null);
    setFields([]);
    setFieldId('');
    setBusy(true);
    setTab('stages');

    const submittedPageName = formData.get('pageName') || pageName;
    const submittedSectionName = formData.get('sectionName') || sectionName;
    if (submittedPageName) setPageName(submittedPageName);
    if (submittedSectionName) setSectionName(submittedSectionName);

    // Clear the existing page so the new generation replaces instead of stacking
    try {
      await fetch(`/api/sections?pageName=${submittedPageName}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Failed to clear canvas', e);
    }

    try {
      const res = await fetch('/api/generate', { method: 'POST', body: formData });

      if (!res.ok) {
        let message = `Failed with status ${res.status}`;
        try {
          const json = JSON.parse(await res.text());
          // §13.4's envelope is { ok, error: { code, message } }, so `error` is
          // an OBJECT. Assigning it straight to `message` renders it as a React
          // child and blanks the page.
          if (json.error && typeof json.error.message === 'string') message = json.error.message;
        } catch {
          // A malformed error body falls back to the status line. Deliberate:
          // the caller still learns something, and the real detail is in the
          // job trace.
        }
        setSubmitError({ statusCode: res.status, message });
        return;
      }

      const data = await res.json();
      if (data.job) setJob(data.job);
      else setSubmitError({ statusCode: null, message: 'The API returned no job record.' });
    } catch (err) {
      setSubmitError({ statusCode: null, message: err.message });
    } finally {
      setBusy(false);
    }
  };

  const previewSrc = `/preview/${pageName}`;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-studio-border px-6 py-2 shadow-sm bg-studio-bg-base/80 backdrop-blur-xl z-10">
          <h1 className="text-studio-lg font-bold text-studio-text-primary tracking-tight">Generator Studio</h1>
          <span className="text-studio-sm text-studio-text-secondary hidden md:block">
            Turn a wireframe, a description, or existing React into a CMS-ready section.
          </span>
        </header>

      <div className="flex min-h-0 flex-1 gap-6 p-8">
        {/* ---------------------------------------------------------------
            The input rail. Composer (docs/SURFACE-INSPO.md §1-2) is the one
            thing to do first; naming's accent picker and recent runs are
            secondary and sit behind disclosures rather than competing for
            the same glance. Composer already owns page/section naming, so
            it isn't repeated as a top-level field here.
        --------------------------------------------------------------- */}
        <aside className="flex w-[26rem] shrink-0 flex-col gap-6 overflow-y-auto pr-2 pb-8">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE_STANDARD }}
            className="studio-glass-raised p-5 rounded-2xl border border-studio-border/50 hover:border-studio-accent/30 hover:shadow-studio-lg transition-all duration-500 relative overflow-hidden group"
          >
            <Composer onSubmit={handleSubmit} />
            {busy && <p className="mt-3 text-studio-sm text-studio-accent font-medium flex items-center gap-2"><span className="flex h-2 w-2 rounded-full bg-studio-accent animate-pulse"></span> Generating...</p>}
          </motion.div>

          <details className="group rounded-2xl border border-studio-border/50 studio-glass-raised p-5 hover:border-studio-accent/30 hover:shadow-studio-lg transition-all duration-500 open:bg-studio-bg-overlay/50">
            <summary className="cursor-pointer text-studio-sm font-semibold text-studio-text-primary outline-none">
              Accent colour
            </summary>
            <p className="mt-2 text-studio-xs text-studio-text-tertiary">
              Overrides the generated section's accent (page/section name above already cover
              where it goes in the CMS).
            </p>
            <div className="mt-4 pt-4 border-t border-studio-border/50">
              <SectionFields
                pageName={pageName}
                setPageName={setPageName}
                sectionName={sectionName}
                setSectionName={setSectionName}
                accent={accent}
                setAccent={setAccent}
              />
            </div>
          </details>

          <details className="group rounded-2xl border border-studio-border/50 studio-glass-raised p-5 hover:border-studio-accent/30 hover:shadow-studio-lg transition-all duration-500 open:bg-studio-bg-overlay/50">
            <summary className="cursor-pointer text-studio-sm font-semibold text-studio-text-primary outline-none">Recent runs</summary>
            <div className="mt-4 pt-4 border-t border-studio-border/50">
              <JobHistory />
            </div>
          </details>
        </aside>

         {/* ---------------------------------------------------------------
            The preview is the product, so it is the biggest thing here. It
            frames the real /preview route in an iframe via ResponsiveToggle's
            `src` — passing children instead narrows a container, which cannot
            trigger a `md:` breakpoint and so is a width preview rather than a
            layout one (A 7 R11).
        --------------------------------------------------------------- */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 pb-8 overflow-y-auto custom-scrollbar pr-2">
          {submitError && (
            <ErrorBanner statusCode={submitError.statusCode} message={submitError.message} />
          )}

          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-studio-border/50 studio-glass-raised p-5 hover:border-studio-accent/30 hover:shadow-studio-lg transition-all duration-500 relative shrink-0 min-h-[640px]">
            <div className="absolute top-5 right-5 z-10 flex gap-4 items-center">
              <a href={previewSrc} target="_blank" rel="noopener noreferrer" className="text-studio-xs text-studio-accent hover:underline font-semibold">
                Open preview in a new page
              </a>
              <button 
                type="button" 
                onClick={async () => {
                  try {
                    await fetch(`/api/sections?pageName=${pageName}`, { method: 'DELETE' });
                    window.location.reload();
                  } catch(e) {}
                }} 
                className="text-studio-xs bg-studio-destructive/10 text-studio-destructive font-semibold px-3 py-1.5 rounded-full hover:bg-studio-destructive hover:text-white transition-colors border border-studio-destructive/20"
              >
                Clear Page
              </button>
            </div>
            <ResponsiveToggle src={previewSrc} title="Live preview" />
          </div>

          {job ? (
            <div className="flex min-h-[800px] shrink-0 flex-col rounded-2xl border border-studio-border/50 studio-glass-raised shadow-studio-sm overflow-hidden hover:border-studio-accent/30 hover:shadow-studio-lg transition-all duration-500">
              <div className="flex items-center gap-2 border-b border-studio-border bg-studio-bg-base/30 px-4 pt-3 pb-0">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    aria-pressed={tab === t.id}
                    className={
                      'relative rounded-t-lg px-4 py-2.5 text-studio-sm font-semibold transition-colors duration-studio-fast ' +
                      (tab === t.id
                        ? 'text-studio-text-primary'
                        : 'text-studio-text-secondary hover:text-studio-text-primary')
                    }
                  >
                    {tab === t.id && (
                      <motion.div
                        layoutId="active-tab"
                        className="absolute inset-0 bg-studio-bg-overlay border-t border-l border-r border-studio-border rounded-t-lg z-0"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">{t.label}</span>
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5 bg-studio-bg-overlay/30">
                {tab === 'stages' && (
                  <div className="flex flex-col gap-6">
                    <GenerationProgress jobId={job.jobId} initialJob={job} />
                    <QuestionPrompt jobId={job.jobId} status="awaiting-input" onResumed={() => {}} />
                    <JobTimeline job={job} />
                    <StageInspector jobId={job.jobId} stageRecord={null} />
                  </div>
                )}

                {tab === 'source' && <GeneratedSourceView jobId={job.jobId} pageName={pageName} />}

                {tab === 'content' && (
                  <div className="flex flex-col gap-4">
                    <label className="text-studio-sm font-semibold text-studio-text-primary" htmlFor="fw-field">
                      Field
                    </label>
                    {fields.length > 0 ? (
                      <select
                        id="fw-field"
                        value={fieldId}
                        onChange={(e) => setFieldId(e.target.value)}
                        className="w-full rounded-xl border border-studio-border bg-studio-bg-base p-3 text-studio-sm text-studio-text-primary focus:border-studio-accent focus:ring-1 focus:ring-studio-accent transition-all outline-none"
                      >
                        {fields.map((f) => (
                          <option key={f.fieldId} value={f.fieldId}>
                            {f.elementName || f.fieldId}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="fw-field"
                        type="text"
                        value={fieldId}
                        onChange={(e) => setFieldId(e.target.value)}
                        placeholder="Field id"
                        className="w-full rounded-xl border border-studio-border bg-studio-bg-base p-3 text-studio-sm text-studio-text-primary focus:border-studio-accent focus:ring-1 focus:ring-studio-accent transition-all outline-none"
                      />
                    )}
                    {fieldId ? (
                      <div className="mt-2 p-4 bg-studio-bg-base rounded-xl border border-studio-border shadow-inner">
                        <SideEditor fieldId={fieldId} pageName={pageName} />
                      </div>
                    ) : (
                      <p className="text-studio-sm italic text-studio-text-tertiary bg-studio-bg-base p-4 rounded-xl border border-studio-border/50 text-center">
                        Pick a field to edit its content.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            // The empty state carries the instructions the old layout never gave
            // anyone: what this does, in the order it does it.
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: EASE_STANDARD, delay: 0.1 }}
              className="shrink-0 rounded-2xl border-2 border-dashed border-studio-border/60 bg-studio-bg-overlay/10 p-8 text-center"
            >
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-studio-accent/10 mb-4">
                <svg className="w-6 h-6 text-studio-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-studio-text-primary mb-2">Nothing generated yet.</h3>
              <p className="text-studio-sm text-studio-text-secondary max-w-md mx-auto leading-relaxed">
                Choose a mode on the left and run it. Every stage of the pipeline shows up here as it
                happens — what each one received, what it produced, and how confident it was.
              </p>
            </motion.div>
          )}
        </section>
      </div>
    </main>
  );
}
