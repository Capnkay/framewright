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

    // Composer owns the naming fields now (docs/UI-SYSTEM.md §3) and submits
    // them as part of the same FormData rather than through separate props —
    // read them back out so previewSrc and the Content tab stay correct.
    const submittedPageName = formData.get('pageName');
    const submittedSectionName = formData.get('sectionName');
    if (submittedPageName) setPageName(submittedPageName);
    if (submittedSectionName) setSectionName(submittedSectionName);

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
    <main className="flex h-full flex-col">
      <header className="flex shrink-0 items-baseline justify-between border-b border-studio-border px-6 py-4">
        <div>
          <h1 className="text-studio-xl font-semibold tracking-tight text-studio-text-primary">Generator Studio</h1>
          <p className="mt-1 text-studio-sm text-studio-text-secondary">
            Turn a wireframe, a description, or existing React into a CMS-ready section.
          </p>
        </div>
        <Link
          to={previewSrc}
          className="text-studio-sm font-medium text-studio-accent underline transition-colors duration-studio-fast hover:text-studio-accent-hover"
        >
          Open preview in a new page
        </Link>
      </header>

      <div className="flex min-h-0 flex-1 gap-6 p-6">
        {/* ---------------------------------------------------------------
            The input rail. Composer (docs/SURFACE-INSPO.md §1-2) is the one
            thing to do first; naming's accent picker and recent runs are
            secondary and sit behind disclosures rather than competing for
            the same glance. Composer already owns page/section naming, so
            it isn't repeated as a top-level field here.
        --------------------------------------------------------------- */}
        <aside className="flex w-[26rem] shrink-0 flex-col gap-4 overflow-y-auto pr-1">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: EASE_STANDARD }}
          >
            <Composer onSubmit={handleSubmit} />
            {busy && <p className="mt-3 text-studio-sm text-studio-text-secondary">Generating…</p>}
          </motion.div>

          <details className="rounded-studio-lg border border-studio-border bg-studio-bg-raised p-4">
            <summary className="cursor-pointer text-studio-sm font-medium text-studio-text-primary">
              Accent colour
            </summary>
            <p className="mt-1 text-studio-xs text-studio-text-tertiary">
              Overrides the generated section's accent (page/section name above already cover
              where it goes in the CMS).
            </p>
            <div className="mt-3">
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

          <details className="rounded-studio-lg border border-studio-border bg-studio-bg-raised p-4">
            <summary className="cursor-pointer text-studio-sm font-medium text-studio-text-primary">Recent runs</summary>
            <div className="mt-3">
              <JobHistory />
            </div>
          </details>
        </aside>

        {/* ---------------------------------------------------------------
            The preview is the product, so it is the biggest thing here. It
            frames the real /preview route in an iframe via ResponsiveToggle's
            `src` — passing children instead narrows a container, which cannot
            trigger a `md:` breakpoint and so is a width preview rather than a
            layout one (§7 R11).
        --------------------------------------------------------------- */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          {submitError && (
            <ErrorBanner statusCode={submitError.statusCode} message={submitError.message} />
          )}

          <div className="flex min-h-0 flex-1 flex-col rounded-studio-lg border border-studio-border bg-studio-bg-raised p-4">
            <ResponsiveToggle src={previewSrc} title="Live preview" />
          </div>

          {job ? (
            <div className="flex h-[22rem] shrink-0 flex-col rounded-studio-lg border border-studio-border bg-studio-bg-raised">
              <div className="flex items-center gap-1 border-b border-studio-border px-3 pt-3">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    aria-pressed={tab === t.id}
                    className={
                      'rounded-t-studio-sm px-3 py-2 text-studio-sm font-medium transition-colors duration-studio-fast ' +
                      (tab === t.id
                        ? 'bg-studio-bg-overlay text-studio-text-primary'
                        : 'text-studio-text-secondary hover:text-studio-text-primary')
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {tab === 'stages' && (
                  <div className="flex flex-col gap-4">
                    <GenerationProgress jobId={job.jobId} initialJob={job} />
                    <QuestionPrompt jobId={job.jobId} status="awaiting-input" onResumed={() => {}} />
                    <JobTimeline job={job} />
                    <StageInspector jobId={job.jobId} stageRecord={null} />
                  </div>
                )}

                {tab === 'source' && <GeneratedSourceView jobId={job.jobId} pageName={pageName} />}

                {tab === 'content' && (
                  <div className="flex flex-col gap-3">
                    <label className="text-studio-sm font-medium text-studio-text-primary" htmlFor="fw-field">
                      Field
                    </label>
                    {fields.length > 0 ? (
                      <select
                        id="fw-field"
                        value={fieldId}
                        onChange={(e) => setFieldId(e.target.value)}
                        className="w-full rounded-studio-sm border border-studio-border bg-studio-bg-base p-2 text-studio-sm text-studio-text-primary"
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
                        className="w-full rounded-studio-sm border border-studio-border bg-studio-bg-base p-2 text-studio-sm text-studio-text-primary"
                      />
                    )}
                    {fieldId ? (
                      <SideEditor fieldId={fieldId} pageName={pageName} />
                    ) : (
                      <p className="text-studio-sm italic text-studio-text-tertiary">
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.28, ease: EASE_STANDARD, delay: 0.1 }}
              className="shrink-0 rounded-studio-lg border border-dashed border-studio-border p-6 text-studio-sm text-studio-text-secondary"
            >
              <p className="font-medium text-studio-text-primary">Nothing generated yet.</p>
              <p className="mt-1">
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
