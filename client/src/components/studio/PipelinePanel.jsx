import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Copy, Download, Loader2, Sparkles, X } from "lucide-react";
import { Label } from "../Shell";
import { DesignTab } from "./DesignTab";
import { ELEMENT_LABELS, downloadCode } from "../../data/mock";

const STATE_CONFIG = {
  idle: { label: "IDLE", tone: "gray" },
  running: { label: "RUNNING", tone: "blue", pulse: true },
  "needs-input": { label: "NEEDS INPUT", tone: "amber" },
  done: { label: "DONE", tone: "green" },
  failed: { label: "FAILED", tone: "red" },
};

function StatusPill({ jobState }) {
  const cfg = STATE_CONFIG[jobState];
  return (
    <span className={`status-pill tone-${cfg.tone}`} data-testid="pipeline-status-pill">
      <span className={`status-pill-dot ${cfg.pulse ? "pulsing" : ""}`} />{cfg.label}
    </span>
  );
}

function DevStateSwitcher({ jobState, setJobState }) {
  const options = [["Idle", "idle"], ["Running", "running"], ["Needs Input", "needs-input"], ["Done", "done"], ["Failed", "failed"]];
  return (
    <div className="dev-switcher" data-testid="dev-state-switcher">
      <span>DEV &middot; JOB STATE</span>
      <div className="dev-switcher-pills">
        {options.map(([label, value]) => (
          <button key={value} className={jobState === value ? "selected" : ""} onClick={() => setJobState(value)} data-testid={`dev-state-${value}-button`}>{label}</button>
        ))}
      </div>
    </div>
  );
}

function StageNode({ index, stage, selected, onSelect }) {
  return (
    <button className={`stage-node status-${stage.status} ${selected ? "selected" : ""}`} onClick={() => onSelect(index)} data-testid={`stage-node-${index}`}>
      <span className="stage-dot">
        {stage.status === "ok" && <Check size={10} />}
        {stage.status === "running" && <Loader2 size={11} className="spin" />}
        {stage.status === "degraded" && <AlertTriangle size={10} />}
        {stage.status === "failed" && <X size={10} />}
      </span>
      <span className="stage-node-label">{stage.name}</span>
      {stage.duration && <span className="stage-node-duration">{stage.duration}ms</span>}
    </button>
  );
}

function StageTimeline({ stages, selected, onSelect }) {
  return (
    <div className="stage-timeline" data-testid="stage-timeline">
      {stages.map((stage, i) => <StageNode key={stage.name} index={i} stage={stage} selected={selected === i} onSelect={onSelect} />)}
    </div>
  );
}

function StageInspectorStrip({ stage }) {
  if (stage == null) return null;
  return (
    <motion.div className="stage-inspector-strip" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} data-testid="stage-inspector-strip">
      <div className="inspector-strip-row"><span>INPUT</span><code>{stage.input}</code></div>
      <div className="inspector-strip-row"><span>OUTPUT</span><code>{stage.output}</code></div>
      <div className="inspector-strip-row"><span>MODEL</span><code>{stage.model || "\u2014 (deterministic)"}</code></div>
      <div className="inspector-strip-row"><span>CONFIDENCE</span><code>{stage.confidence}%</code></div>
      {stage.warnings.length > 0 && <div className="inspector-strip-warn"><AlertTriangle size={12} /> {stage.warnings[0]}</div>}
    </motion.div>
  );
}

function QuestionCard({ question, chosen, onChoose }) {
  return (
    <div className="question-card" data-testid="needs-input-question-card">
      <div className="question-thumb"><span /><span /><span /></div>
      <div className="question-body">
        <div className="question-head"><span className="status-pill tone-amber"><span className="status-pill-dot" />NEEDS INPUT</span><span className="question-confidence">{question.confidence}% confident</span></div>
        <p>We think this region is <strong>{question.guessedLabel}</strong>. Confirm or correct the label to continue.</p>
        <div className="mode-selector question-choices" data-testid="question-choice-selector">
          {question.choices.map(c => (
            <button key={c} className={chosen === c ? "selected" : ""} onClick={() => onChoose(c)} data-testid={`question-choice-${c.toLowerCase().replaceAll(" ", "-")}`}>
              {chosen === c && <motion.span layoutId="question-choice-active" className="mode-active" />}
              {c}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DoneTabs({ tab, setTab }) {
  return (
    <div className="source-tabs pipeline-tabs" data-testid="pipeline-tab-bar">
      {["Stages", "Code", "Content", "Design"].map(t => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)} data-testid={`pipeline-tab-${t.toLowerCase()}-button`}>{t}</button>)}
    </div>
  );
}

function CodeTab({ code, onCodeChange }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(code)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1000); })
      .catch(() => {});
  };
  const download = () => downloadCode(code);
  return (
    <div className="source-box pipeline-code-box" data-testid="pipeline-code-tab">
      <div className="pipeline-code-actions">
        <button onClick={copy} data-testid="pipeline-code-copy-button">
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
        </button>
        <button onClick={download} data-testid="pipeline-code-download-button"><Download size={13} /> Download</button>
      </div>
      <textarea className="code-editor" value={code} onChange={e => onCodeChange(e.target.value)} spellCheck={false} data-testid="pipeline-code-editor" />
      <span className="code-editor-hint">Editable \u2014 changes sync live to the canvas and preview above.</span>
    </div>
  );
}

function ContentTab({ elements, selected, setSelected, onContentChange }) {
  const textEls = elements.filter(el => el.type !== "image");
  const field = textEls.find(f => f.id === selected) || textEls[0];
  return (
    <div className="content-tab" data-testid="pipeline-content-tab">
      <label className="field">Editable field
        <select value={field.id} onChange={e => setSelected(e.target.value)} data-testid="content-field-select">
          {textEls.map(f => <option key={f.id} value={f.id}>{ELEMENT_LABELS[f.id] || f.id}</option>)}
        </select>
      </label>
      <label className="field">Content
        <textarea value={field.content} onChange={e => onContentChange(field.id, e.target.value)} placeholder="Field content" data-testid="content-field-value-textarea" />
      </label>
    </div>
  );
}

export function PipelinePanel({ jobState, setJobState, stages, selectedStage, setSelectedStage, question, chosenAnswer, onChoose, tab, setTab, code, onCodeChange, elements, accent, selectedField, setSelectedField, onContentChange, onElementUpdate, onElementReorder, errorMessage }) {
  const heading = {
    idle: "Awaiting input",
    running: "Constructing your section...",
    "needs-input": "Confirm a detail to continue",
    done: "Section ready for review",
    failed: "Generation failed",
  }[jobState];
  const showTimeline = jobState !== "idle" && (jobState !== "done" || tab === "Stages");
  return (
    <section className="panel pipeline" data-testid="pipeline-panel">
      <div className="pipeline-head">
        <div><Label>GENERATION PIPELINE</Label><h2>{heading}</h2></div>
        <StatusPill jobState={jobState} />
      </div>
      <DevStateSwitcher jobState={jobState} setJobState={setJobState} />
      {jobState === "idle" ? (
        <div className="empty-pipeline">
          <div className="empty-mark"><Sparkles size={22} /></div>
          <h3>Telemetry starts here</h3>
          <p>Run a generation to inspect visual parsing, planning, and QA in real time.</p>
        </div>
      ) : (
        <div className="pipeline-body">
          {jobState === "failed" && <div className="error-banner" data-testid="pipeline-error-banner"><AlertTriangle size={15} /> {errorMessage}</div>}
          {jobState === "needs-input" && <QuestionCard question={question} chosen={chosenAnswer} onChoose={onChoose} />}
          {jobState === "done" && <DoneTabs tab={tab} setTab={setTab} />}
          {showTimeline && (
            <>
              <StageTimeline stages={stages} selected={selectedStage} onSelect={setSelectedStage} />
              <AnimatePresence>{selectedStage != null && <StageInspectorStrip stage={stages[selectedStage]} />}</AnimatePresence>
            </>
          )}
          {jobState === "done" && tab === "Code" && <CodeTab code={code} onCodeChange={onCodeChange} />}
          {jobState === "done" && tab === "Content" && <ContentTab elements={elements} selected={selectedField} setSelected={setSelectedField} onContentChange={onContentChange} />}
          {jobState === "done" && tab === "Design" && <DesignTab elements={elements} accent={accent} onUpdate={onElementUpdate} onReorder={onElementReorder} onContentChange={onContentChange} />}
        </div>
      )}
    </section>
  );
}
