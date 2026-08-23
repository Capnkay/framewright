import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Plus, Sparkles, Upload } from "lucide-react";
import { Badge, Field, Label } from "../components/Shell";
import { AccentColorField } from "../components/studio/AccentColor";
import { LivePreviewPanel } from "../components/studio/LivePreviewPanel";
import { PipelinePanel } from "../components/studio/PipelinePanel";
import { SectionEditor } from "../components/studio/SectionEditor";
import { defaultElements, generateCode, getStageStatuses, jobs, NEEDS_INPUT_QUESTION, FAILED_MESSAGE, parseCodeToElements } from "../data/mock";
import { DesignLayers, DesignInspector } from "../components/studio/DesignTab";
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
  const [elements, setElements] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [codeText, setCodeText] = useState(() => generateCode(elements, accent));

  const [realTrace, setRealTrace] = useState(null);

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
    setSelectedStage(null);
    setTab("Stages");
    setRunningIndex(0);
    setRealTrace(null);

    // Mock progress visual effect while waiting
    const progressTimer = setInterval(() => {
      setRunningIndex(prev => (prev < 6 ? prev + 1 : prev));
    }, 1500);

    try {
      const formData = new FormData();
      formData.append("mode", mode.toLowerCase());
      
      const sanitizeName = (str) => {
        let clean = str.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        if (!/^[A-Za-z]/.test(clean)) clean = 'Component-' + clean;
        return clean || 'Component';
      };
      
      formData.append("pageName", sanitizeName(form.page));
      formData.append("sectionName", sanitizeName(form.section));
      
      if (form.code) formData.append("code", form.code);
      if (form.prompt) formData.append("prompt", form.prompt);
      
      if (mode === "Wireframe" && form.fileObj) {
        formData.append("wireframe", form.fileObj);
      }
      
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
            const mappedElements = fetchedElements.map((el, index) => ({
              id: el.fieldId,
              label: el.elementName || el.fieldId,
              type: el.contentType === "Button" ? "button" : el.contentType === "Image" ? "image" : "text",
              content: el.content || (el.loop ? "[Cards/List]" : ""),
              x: 20,
              y: 20 + (index * 60),
              width: 380,
              fontSize: el.tag === "h1" ? 36 : el.tag === "h2" ? 24 : 16,
              fontWeight: el.tag === "h1" || el.tag === "h2" || el.contentType === "Button" ? 700 : 400,
              color: "#18181b",
              align: "left",
              bg: el.contentType === "Button" ? undefined : "transparent"
            }));
            setElements(mappedElements);
            setSelectedField(mappedElements[0]?.id || null);
          }
        }
        setRealTrace(data.job.trace);
        
        // Fetch the real generated React component code
        const codeRes = await fetch(`/api/jobs/${data.job.jobId}/component`);
        if (codeRes.ok) {
          const fetchedCode = await codeRes.text();
          if (fetchedCode) setCodeText(fetchedCode);
        }
      }
      
      clearInterval(progressTimer);
      setJobState("done");
      setRunningIndex(-1);
    } catch(err) {
      clearInterval(progressTimer);
      setJobState("failed");
      console.error(err);
    }
  };

  const handleDevState = value => {
    clearInterval(timerRef.current);
    setSelectedStage(null);
    setTab("Stages");
    if (value === "running") { setRunningIndex(3); setJobState("running"); }
    else setJobState(value);
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

  return (
    <div className="studio-page">
      <div className="studio-heading">
        <div><Label>GENERATOR STUDIO</Label><h1>Build a section.</h1><p>Give Framewright a signal. Watch every decision happen.</p></div>
        <div className="studio-actions"><button className="icon-btn" data-testid="new-job-button"><Plus size={16} /></button><span className="job-count"><span className="live-dot" />3 jobs</span></div>
      </div>
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
        <div className="studio-right-column">
          <SectionEditor elements={elements} accent={accent} code={codeText} selectedField={selectedField} setSelectedField={setSelectedField} onUpdate={onElementUpdate} />
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
    </div>
  );
}
