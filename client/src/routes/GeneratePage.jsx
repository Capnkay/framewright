import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import ModeSelector from '../studio/ModeSelector.jsx';
import SectionFields from '../studio/SectionFields.jsx';
import GenerationProgress from '../studio/GenerationProgress.jsx';
import JobTimeline from '../studio/JobTimeline.jsx';
import QuestionPrompt from '../studio/QuestionPrompt.jsx';
import StageInspector from '../studio/StageInspector.jsx';
import JobHistory from '../studio/JobHistory.jsx';
import GeneratedSourceView from '../studio/GeneratedSourceView.jsx';
import ResponsiveToggle from '../studio/ResponsiveToggle.jsx';
import SideEditor from '../studio/SideEditor.jsx';
import ErrorBanner from '../studio/ErrorBanner.jsx';
import CodePromptInputs from '../studio/CodePromptInputs.jsx';

export default function GeneratePage() {
  const [jobId, setJobId] = useState(null);
  const [pageName, setPageName] = useState('Home');
  const [sectionName, setSectionName] = useState('Custom');
  const [accent, setAccent] = useState('');
  const [fieldId, setFieldId] = useState('');

  const handleSubmit = (formData) => {
    if (formData && formData.get && formData.get('jobId')) {
      setJobId(formData.get('jobId'));
    }
  };

  return (
    <main className="p-6 h-screen flex flex-col bg-gray-50">
      <header className="mb-4 shrink-0 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Generator Studio</h1>
          <p className="mt-1 max-w-prose text-sm text-gray-600">Full studio layout mounting all 14 built components.</p>
        </div>
        <Link to={"\/preview\/"} className="text-blue-700 underline text-sm font-medium">Open Full Preview</Link>
      </header>

      <div className="flex-1 flex gap-6 min-h-0 overflow-hidden">
        <div className="w-1/4 flex flex-col gap-6 overflow-y-auto pr-2 pb-8">
          <section className="bg-white p-4 rounded shadow-sm border">
            <h2 className="font-medium mb-4">Configuration (FR-G07)</h2>
            <SectionFields pageName={pageName} setPageName={setPageName} sectionName={sectionName} setSectionName={setSectionName} accent={accent} setAccent={setAccent} />
          </section>
          <section className="bg-white p-4 rounded shadow-sm border">
            <h2 className="font-medium mb-4">Generation Mode (FR-G04, FR-G01)</h2>
            <ModeSelector onSubmit={handleSubmit} />
          </section>
          <section className="bg-white p-4 rounded shadow-sm border">
            <h2 className="font-medium mb-4">Legacy Inputs (FR-G02, FR-G03)</h2>
            <details>
              <summary className="cursor-pointer text-sm text-gray-600">Show Manual Code/Prompt Form</summary>
              <div className="mt-4"><CodePromptInputs onSubmit={handleSubmit} /></div>
            </details>
          </section>
        </div>

        <div className="w-1/3 flex flex-col gap-6 overflow-y-auto pr-2 pb-8">
          {jobId && (
            <section className="flex flex-col gap-4">
              <ErrorBanner statusCode={null} message={null} />
              <GenerationProgress jobId={jobId} />
              <QuestionPrompt jobId={jobId} status="awaiting-input" onResumed={() => {}} />
              <JobTimeline job={{ jobId }} />
              <StageInspector jobId={jobId} stageRecord={null} />
              <GeneratedSourceView jobId={jobId} pageName={pageName} />
            </section>
          )}
          <section className="bg-white rounded shadow-sm border flex-1">
            <JobHistory />
          </section>
        </div>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden bg-white p-4 rounded shadow-sm border">
          <ResponsiveToggle src={"\/preview\/"} title="Live Preview">
             <div className="p-4 text-center text-gray-500">Preview will render here</div>
          </ResponsiveToggle>
          <div className="mt-4 pt-4 border-t shrink-0">
            <h2 className="font-medium mb-2 text-sm text-gray-700">CMS Side Editor</h2>
            <div className="flex gap-2 mb-4">
              <input type="text" placeholder="Enter field ID to edit" value={fieldId} onChange={e => setFieldId(e.target.value)} className="border p-2 rounded text-sm w-full" />
            </div>
            {fieldId ? <SideEditor fieldId={fieldId} pageName={pageName} /> : <div className="text-sm text-gray-500 italic">Enter a field ID to open the editor.</div>}
          </div>
        </div>
      </div>
    </main>
  );
}
