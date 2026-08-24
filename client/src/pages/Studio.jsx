import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Plus, Sparkles, Upload } from "lucide-react";
import { Badge, Field, Label } from "../components/Shell";
import { AccentColorField } from "../components/studio/AccentColor";
import { PipelinePanel } from "../components/studio/PipelinePanel";
import { SectionEditor } from "../components/studio/SectionEditor";
import ComponentToolkit from "../components/studio/ComponentToolkit";
import { defaultElements, generateCode, getStageStatuses, jobs, NEEDS_INPUT_QUESTION, FAILED_MESSAGE, parseCodeToElements } from "../data/mock";
import { mockWireframes } from "../data/mockWireframes";
import { DesignLayers, DesignInspector } from "../components/studio/DesignTab";
import "../studio.css";

// A page name reaches two places that disagree about what a name may contain:
// the API's §2 pageName, and the URL of /preview/:pageName that the Studio now
// frames. Sanitising once, at module scope, is what keeps them the same string
// -- when this lived inside generate() the iframe was pointed at the raw typed
// value ("Marketing site") while the section was stored under "Marketing-site".
export function sanitizeName(str) {
  let clean = String(str || '').replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!/^[A-Za-z]/.test(clean)) clean = 'Component-' + clean;
  return clean || 'Component';
}

function Modes({ mode, setMode }) {
  return (
    <div className="mode-selector" data-testid="mode-selector">
      {["Wireframe", "Code", "Prompt", "Combined"].map(x => (
        <button key={x} className={mode === x ? "selected" : ""} onClick={() => setMode(x)} data-testid={`mode-${x.toLowerCase()}-button`}>
          {mode === x && <motion.span layoutId="mode-active" className="mode-active" />}
          {x}
        </button>
      ))}
    </div>
  );
}

function Composer({ mode, setMode, form, setForm, accent, setAccent, generate, running, elements, selectedField, setSelectedField, onElementUpdate, onElementReorder, onContentChange }) {
  const file = useRef();
  const set = key => value => setForm(f => ({ ...f, [key]: value }));
  return (
    <section className="composer panel" data-testid="composer-panel">
      <div className="panel-title"><div><Label>INPUT ACQUISITION</Label><h2>Compose a section</h2></div></div>
      <Modes mode={mode} setMode={setMode} />
      <AnimatePresence mode="wait">
        <motion.div className="mode-content" key={mode} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {mode === "Wireframe" && (
            <div className="upload-zone" onClick={() => file.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const dropped = e.dataTransfer.files[0]; set("file")(dropped?.name || "wireframe.png"); set("fileObj")(dropped); }} data-testid="wireframe-upload-zone">
              <input ref={file} type="file" hidden onChange={e => { const picked = e.target.files[0]; set("file")(picked?.name || "wireframe.png"); set("fileObj")(picked); }} data-testid="wireframe-file-input" />
              <div className="upload-icon"><Upload size={18} /></div>
              <strong>{form.file || "Drop a wireframe here"}</strong>
              <span>PNG, JPG or WEBP &middot; max 8MB</span>
            </div>
          )}
          <div className="fields-grid">
            <Field label="Page name" value={form.page} onChange={set("page")} placeholder="Marketing site" testid="page-name-input" />
            <Field label="Section name" value={form.section} onChange={set("section")} placeholder="Hero section" testid="section-name-input" />
          </div>
          {(mode === "Code" || mode === "Combined") && <Field label="React code (optional)" value={form.code} onChange={set("code")} area placeholder={'export function Hero() {\n  return <section>...</section>\n}'} testid="react-code-textarea" />}
          {(mode === "Prompt" || mode === "Combined") && <Field label="Design prompt (optional)" value={form.prompt} onChange={set("prompt")} area placeholder="A focused hero for a developer platform..." testid="design-prompt-textarea" />}
        </motion.div>
      </AnimatePresence>
      <AccentColorField value={accent} onChange={setAccent} />
      
      <div className="composer-inspector-wrap">
        <div className="disclosure-toggle section-editor-label" style={{marginBottom: 10, marginTop: 10}}><span>&#9662; Edit layout &amp; content</span></div>
        <DesignLayers elements={elements} selectedId={selectedField} onSelect={setSelectedField} onReorder={onElementReorder} scope="composer" />
        <DesignInspector elements={elements} selectedId={selectedField} accent={accent} onUpdate={onElementUpdate} onContentChange={onContentChange} scope="composer" />
      </div>

      <button 
        className="btn btn-primary generate-btn" 
        onClick={generate} 
        disabled={running || (mode === "Wireframe" && !form.fileObj) || (mode === "Code" && !form.code) || (mode === "Prompt" && !form.prompt) || (mode === "Combined" && !form.fileObj && !form.code && !form.prompt)} 
        data-testid="generate-button" 
        style={{marginTop: 15}}
      >
        <Sparkles size={16} />{running ? "Generating\u2026" : "Generate section"} <ArrowRight size={16} />
      </button>
      <div className="mock-note"><span className="live-dot" />Live generation &middot; POST /api/generate, seven traced stages</div>
    </section>
  );
}

const STORAGE_KEY = "framewright.studio-design";

export default function Studio() {
  const [mode, setMode] = useState("Wireframe");
  const [form, setForm] = useState({ page: "Marketing site", section: "Hero section", file: "", code: "", prompt: "" });
  const [accent, setAccent] = useState("");
  const [jobState, setJobState] = useState("idle");
  const [runningIndex, setRunningIndex] = useState(-1);
  const [selectedStage, setSelectedStage] = useState(null);
  const [tab, setTab] = useState("Stages");
  const [chosenAnswer, setChosenAnswer] = useState(null);
  const [elements, setElements] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [codeText, setCodeText] = useState(() => generateCode(elements, accent));

  const [realTrace, setRealTrace] = useState(null);
  // What the preview iframe points at, and what remounts it. Both are set only
  // after a generation SUCCEEDS, so a failed run leaves the last good section
  // on screen instead of blanking it.
  const [previewPage, setPreviewPage] = useState("Home");
  const [previewKey, setPreviewKey] = useState(0);
  // §12 degradation, run-level. POST /api/generate answers with a `warnings`
  // array beside `job` -- it is where "Hosted model not used: <reason>" lands,
  // and it is the only place the Studio can learn that a section came back as
  // the reference template rather than from the model. The stage trace does not
  // carry it (those warnings are per-stage), so it gets its own strip.
  const [runWarnings, setRunWarnings] = useState([]);

  const timerRef = useRef(null);
  useEffect(() => () => clearInterval(timerRef.current), []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ elements, accent, page: form.page, section: form.section }));
  }, [elements, accent, form.page, form.section]);

  const onElementUpdate = (id, patch) => {
    setElements(els => { const next = els.map(el => (el.id === id ? { ...el, ...patch } : el)); setCodeText(generateCode(next, accent)); return next; });
  };
  const onContentChange = (id, value) => onElementUpdate(id, { content: value });
  const onElementReorder = (id, dir) => {
    setElements(els => {
      const i = els.findIndex(el => el.id === id);
      const j = i + dir;
      if (j < 0 || j >= els.length) return els;
      const next = [...els];
      [next[i], next[j]] = [next[j], next[i]];
      setCodeText(generateCode(next, accent));
      return next;
    });
  };
  const onCodeChange = value => {
    setCodeText(value);
    const parsed = parseCodeToElements(value, elements, accent);
    if (parsed) setElements(parsed);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setCodeText(generateCode(elements, accent)); }, [accent]);

  const generate = async () => {
    if (jobState === "running") return;
    clearInterval(timerRef.current);
    setJobState("running");
    setSelectedStage(0);
    setTab("Stages");
    setRunningIndex(0);
    setRealTrace(null);
    setRunWarnings([]);

    // Mock progress visual effect while waiting
    const progressTimer = setInterval(() => {
      setRunningIndex(prev => {
        const next = prev < 6 ? prev + 1 : prev;
        setSelectedStage(next);
        return next;
      });
    }, 1500);

    try {
      const formData = new FormData();
      formData.append("mode", mode.toLowerCase());
      
      const pageName = sanitizeName(form.page);
      formData.append("pageName", pageName);
      formData.append("sectionName", sanitizeName(form.section));
      
      if (form.code) formData.append("code", form.code);
      if (form.prompt) formData.append("prompt", form.prompt);
      
      if (mode === "Wireframe" && form.fileObj) {
        formData.append("wireframe", form.fileObj);
      }
      
      const pageNameStr = sanitizeName(form.page);
      

      const res = await fetch("/api/generate", { method: "POST", body: formData });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody?.error?.message || "API failed with status " + res.status);
      }
      const data = await res.json();
      
      // Fetch the newly generated elements
      if (data.job && data.job.sectionId) {
        const elementsRes = await fetch(`/api/elements?sectionId=${data.job.sectionId}`);
        if (elementsRes.ok) {
          const fetchedElements = await elementsRes.json();
          if (fetchedElements && fetchedElements.length > 0) {
            // A fixed 60px step per element overlapped as soon as any real content
            // wrapped to a second line -- a 36pt headline at 380px wide wraps almost
            // immediately, but the next element still landed exactly 60px below its
            // start. Stacking by an estimated wrapped-text height (chars-per-line at
            // this fontSize and width, times line-height) keeps blocks from
            // colliding without needing an actual DOM measurement pass.
            const CANVAS_WIDTH = 380;
            const GAP = 16;
            let yCursor = 20;
            const mappedElements = fetchedElements.map((el) => {
              const fontSize = el.tag === "h1" ? 36 : el.tag === "h2" ? 24 : 16;
              const content = el.content || (el.loop ? "[Cards/List]" : "");
              const charsPerLine = Math.max(1, Math.floor(CANVAS_WIDTH / (fontSize * 0.55)));
              const lineCount = Math.max(1, Math.ceil((content.length || 1) / charsPerLine));
              const lineHeight = fontSize * 1.3;
              const estimatedHeight = Math.round(lineCount * lineHeight) + 12;

              const mapped = {
                id: el.fieldId,
                label: el.elementName || el.fieldId,
                type: el.contentType === "Button" ? "button" : el.contentType === "Image" ? "image" : "text",
                content,
                x: 20,
                y: yCursor,
                width: CANVAS_WIDTH,
                height: estimatedHeight,
                fontSize,
                fontWeight: el.tag === "h1" || el.tag === "h2" || el.contentType === "Button" ? 700 : 400,
                color: "#18181b",
                align: "left",
                bg: el.contentType === "Button" ? undefined : "transparent"
              };
              yCursor += estimatedHeight + GAP;
              return mapped;
            });
            setElements(mappedElements);
            setSelectedField(mappedElements[0]?.id || null);
          }
        }
        // The job record spells its stage trace `stages` (§11), not `trace`.
        // Reading the wrong key gave `undefined`, and the `realTrace ? … : …`
        // below then fell through to getStageStatuses() -- the MOCK timeline
        // from data/mock.js. So the Glass Box showed invented stage names and
        // durations for a run that had really happened, on every generation.
        // Verified against a live POST /api/generate: the response carries
        // job.stages and no job.trace.
        setRealTrace(data.job.stages || data.job.trace || null);
        
        // Fetch the real generated React component code
        const codeRes = await fetch(`/api/jobs/${data.job.jobId}/component`);
        if (codeRes.ok) {
          const fetchedCode = await codeRes.text();
          if (fetchedCode) setCodeText(fetchedCode);
        }
      }
      
      // The emitter has written client/src/sections/generated/<...>.jsx by the
      // time /api/generate resolves, so remounting the frame here is what makes
      // the new section appear. Vite's glob in Preview.jsx picks the new module
      // up on its own HMR pass; the remount is what forces the route to re-run.
      setRunWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      setPreviewPage(pageNameStr);
      setPreviewKey(k => k + 1);

      clearInterval(progressTimer);
      setJobState("done");
      setRunningIndex(-1);
      setSelectedStage(6); // Select last stage on success
    } catch(err) {
      clearInterval(progressTimer);
      setJobState("failed");
      setSelectedStage(4); // Select failed stage
      console.error(err);
    }
  };

  const handleDevState = value => {
    clearInterval(timerRef.current);
    setRealTrace(null);
    setTab("Stages");
    if (value === "running") { 
      setRunningIndex(3); 
      setJobState("running"); 
      setSelectedStage(3);
    } else { 
      setJobState(value);
      if (value === "needs-input") setSelectedStage(2);
      else if (value === "failed") setSelectedStage(4);
      else if (value === "done") setSelectedStage(6);
      else setSelectedStage(null);
    }
    if (value === "done") setCodeText(generateCode(elements, accent));
  };

  const getRealStageStatuses = (trace) => {
    // Fill 7 slots representing the 7 backend stages
    const result = Array.from({ length: 7 }, (_, i) => {
      const stageRecord = trace.find(t => t.stage === i + 1);
      if (!stageRecord) return { name: `Stage ${i + 1}`, status: "skipped" };
      return {
        name: stageRecord.name,
        status: stageRecord.status,
        duration: stageRecord.ms,
        input: stageRecord.input || "N/A",
        output: stageRecord.output || "N/A",
        model: stageRecord.model || null,
        confidence: stageRecord.confidence || 0,
        warnings: stageRecord.warnings || [],
      };
    });
    return result;
  };

  const stages = realTrace ? getRealStageStatuses(realTrace) : getStageStatuses(jobState, runningIndex);

  const [viewMode, setViewMode] = useState("design");

  return (
    <div className="studio-page">
      <div className="studio-heading">
        <div><Label>GENERATOR STUDIO</Label><h1>Build a section.</h1><p>Give Framewright a signal. Watch every decision happen.</p></div>
        <div className="studio-actions"><button className="icon-btn" data-testid="new-job-button"><Plus size={16} /></button><span className="job-count"><span className="live-dot" />3 jobs</span></div>
      </div>
      {runWarnings.length > 0 && (
        <div className="studio-run-warnings" data-testid="run-warnings" style={{ margin: '0 0 12px', padding: '10px 14px', border: '1px solid var(--border)', borderLeft: '3px solid #d97706', borderRadius: '6px', background: 'var(--surface)' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            HOW THIS RUN DEGRADED
          </div>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {runWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      <div className="studio-layout">
        <div className="studio-left-column" style={{ display: 'flex', flexDirection: 'column', gap: '13px', overflowY: 'auto', height: '100%' }}>
          <Composer
            mode={mode} setMode={setMode} form={form} setForm={setForm} accent={accent} setAccent={setAccent}
            generate={generate} running={jobState === "running"}
            elements={elements} selectedField={selectedField} setSelectedField={setSelectedField}
            onElementUpdate={onElementUpdate} onElementReorder={onElementReorder} onContentChange={onContentChange}
          />
          <section className="history panel" data-testid="job-history">
            <div className="history-head"><div><Label>JOB HISTORY</Label><h2>Recent generations</h2></div><button className="text-btn" data-testid="view-all-jobs-button">View all <ArrowRight size={13} /></button></div>
            <div className="history-list">
              {jobs.map(job => (
                <button className="history-item" key={job.id} data-testid={`history-job-${job.id}`}>
                  <span className="history-status"><Check size={12} /></span>
                  <span className="history-name"><strong>{job.name}</strong><small>{job.mode} &middot; {job.time}</small></span>
                  <Badge tone="green">Ready</Badge>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          </section>
        </div>
        <div className="studio-right-column" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', paddingRight: '4px' }}>
          <SectionEditor 
            elements={elements} accent={accent} code={codeText} 
            selectedField={selectedField} setSelectedField={setSelectedField} 
            onUpdate={onElementUpdate} onCodeChange={onCodeChange}
            pageName={previewPage} previewKey={previewKey} 
            viewMode={viewMode} setViewMode={setViewMode}
          />
          <ComponentToolkit
            elements={elements}
            selectedField={selectedField}
            onElementUpdate={onElementUpdate}
            onAdd={(newEl) => {
              setElements(prev => {
                const next = [...prev, newEl];
                setCodeText(generateCode(next, accent));
                setSelectedField(newEl.id);
                return next;
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}
