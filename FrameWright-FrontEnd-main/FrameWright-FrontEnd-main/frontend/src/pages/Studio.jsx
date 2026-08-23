import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Plus, Sparkles, Upload } from "lucide-react";
import { Badge, Field, Label } from "../components/Shell";
import { AccentColorField } from "../components/studio/AccentColor";
import { LivePreviewPanel } from "../components/studio/LivePreviewPanel";
import { PipelinePanel } from "../components/studio/PipelinePanel";
import { SectionEditor } from "../components/studio/SectionEditor";
import { defaultElements, generateCode, getStageStatuses, jobs, NEEDS_INPUT_QUESTION, FAILED_MESSAGE, parseCodeToElements } from "../data/mock";
import "../studio.css";

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

function Composer({ mode, setMode, form, setForm, accent, setAccent, generate, running, elements, code, onElementUpdate, onElementReorder, onContentChange }) {
  const file = useRef();
  const set = key => value => setForm(f => ({ ...f, [key]: value }));
  return (
    <section className="composer panel" data-testid="composer-panel">
      <div className="panel-title"><div><Label>INPUT ACQUISITION</Label><h2>Compose a section</h2></div><span className="kbd">&#8984; K</span></div>
      <Modes mode={mode} setMode={setMode} />
      <AnimatePresence mode="wait">
        <motion.div className="mode-content" key={mode} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
          {mode === "Wireframe" && (
            <div className="upload-zone" onClick={() => file.current?.click()} data-testid="wireframe-upload-zone">
              <input ref={file} type="file" hidden onChange={e => set("file")(e.target.files[0]?.name || "wireframe.png")} data-testid="wireframe-file-input" />
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
      <SectionEditor elements={elements} accent={accent} code={code} onUpdate={onElementUpdate} onReorder={onElementReorder} onContentChange={onContentChange} />
      <button className="btn btn-primary generate-btn" onClick={generate} disabled={running} data-testid="generate-button"><Sparkles size={16} />{running ? "Generating\u2026" : "Generate section"} <ArrowRight size={16} /></button>
      <div className="mock-note"><span className="live-dot" />Mock generation &middot; pipeline telemetry included</div>
    </section>
  );
}

const STORAGE_KEY = "framewright.studio-design";

export default function Studio() {
  const [mode, setMode] = useState("Wireframe");
  const [form, setForm] = useState({ page: "Marketing site", section: "Hero section", file: "", code: "", prompt: "" });
  const [accent, setAccent] = useState("");
  const [breakpoint, setBreakpoint] = useState("Desktop");
  const [jobState, setJobState] = useState("idle");
  const [runningIndex, setRunningIndex] = useState(-1);
  const [selectedStage, setSelectedStage] = useState(null);
  const [tab, setTab] = useState("Stages");
  const [chosenAnswer, setChosenAnswer] = useState(null);
  const [elements, setElements] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (saved?.elements?.length) return saved.elements; } catch { /* ignore */ }
    return defaultElements;
  });
  const [selectedField, setSelectedField] = useState("headline");
  const [codeText, setCodeText] = useState(() => generateCode(elements, accent));

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

  const generate = () => {
    if (jobState === "running") return;
    clearInterval(timerRef.current);
    setJobState("running");
    setSelectedStage(null);
    setTab("Stages");
    setRunningIndex(0);
    let i = 0;
    timerRef.current = setInterval(() => {
      i += 1;
      if (i > 6) {
        clearInterval(timerRef.current);
        setJobState("done"); setRunningIndex(-1);
        setCodeText(generateCode(elements, accent));
        return;
      }
      setRunningIndex(i);
    }, 480);
  };

  const handleDevState = value => {
    clearInterval(timerRef.current);
    setSelectedStage(null);
    setTab("Stages");
    if (value === "running") { setRunningIndex(3); setJobState("running"); }
    else setJobState(value);
    if (value === "done") setCodeText(generateCode(elements, accent));
  };

  const stages = getStageStatuses(jobState, runningIndex);

  return (
    <div className="studio-page">
      <div className="studio-heading">
        <div><Label>GENERATOR STUDIO</Label><h1>Build a section.</h1><p>Give Framewright a signal. Watch every decision happen.</p></div>
        <div className="studio-actions"><button className="icon-btn" data-testid="new-job-button"><Plus size={16} /></button><span className="job-count"><span className="live-dot" />3 jobs</span></div>
      </div>
      <div className="studio-layout">
        <Composer
          mode={mode} setMode={setMode} form={form} setForm={setForm} accent={accent} setAccent={setAccent}
          generate={generate} running={jobState === "running"}
          elements={elements} code={codeText} onElementUpdate={onElementUpdate} onElementReorder={onElementReorder} onContentChange={onContentChange}
        />
        <div className="studio-right-column">
          <LivePreviewPanel
            breakpoint={breakpoint} setBreakpoint={setBreakpoint}
            page={form.page} section={form.section}
            elements={elements} accent={accent}
          />
          <PipelinePanel
            jobState={jobState} setJobState={handleDevState}
            stages={stages} selectedStage={selectedStage} setSelectedStage={setSelectedStage}
            question={NEEDS_INPUT_QUESTION} chosenAnswer={chosenAnswer} onChoose={setChosenAnswer}
            tab={tab} setTab={setTab} code={codeText} onCodeChange={onCodeChange}
            elements={elements} accent={accent}
            selectedField={selectedField} setSelectedField={setSelectedField} onContentChange={onContentChange}
            onElementUpdate={onElementUpdate} onElementReorder={onElementReorder}
            errorMessage={FAILED_MESSAGE}
          />
        </div>
      </div>
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
  );
}
