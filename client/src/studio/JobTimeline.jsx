import React, { useState } from 'react';

const STAGE_NAMES = {
  1: 'input-acquisition',
  2: 'preprocessing-normalization',
  3: 'multimodal-understanding',
  4: 'semantic-planning-ir',
  5: 'code-generation-assembly',
  6: 'validation-qa',
  7: 'output-delivery',
};

const STATUS_STYLES = {
  pending: 'bg-card text-muted-foreground border-border opacity-60',
  running: 'bg-accent/10 text-accent border-accent/30 shadow-[0_0_15px_rgba(37,99,235,0.2)] motion-safe:animate-pulse',
  ok: 'bg-success/10 text-success border-success/30',
  degraded: 'bg-warn/10 text-warn border-warn/30',
  failed: 'bg-destructive/10 text-destructive border-destructive/30',
  skipped: 'bg-card text-muted-foreground border-border opacity-50',
};

export default function JobTimeline({ job, onRefresh }) {
  const [replayError, setReplayError] = useState(null);

  if (!job) return null;

  const handleReplay = async (stageNum) => {
    setReplayError(null);
    try {
      const res = await fetch(`/api/jobs/${job.jobId}/replay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: stageNum })
      });
      if (!res.ok) {
        if (res.status === 422) {
          throw new Error('Perception service is down or unavailable for this stage.');
        }
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to replay stage');
      }
      if (onRefresh) onRefresh();
    } catch (err) {
      setReplayError(err.message);
    }
  };

  const stages = job.stages || [];
  
  return (
    <div className="flex flex-col gap-3 p-6 bg-background border border-border rounded-lg shadow-base">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold tracking-tight text-foreground">Job Timeline</h2>
        {job.score !== null && job.score !== undefined && (
          <div className="bg-accent/10 text-accent border border-accent/30 px-3 py-1 rounded-full text-sm font-bold shadow-sm" title="Quality Score (A 18.1)">
            Score: {job.score}
          </div>
        )}
      </div>
      {replayError && <div className="text-destructive text-sm mb-2 font-medium bg-destructive/10 p-2 rounded">{replayError}</div>}
      
      <div className="flex flex-col gap-3">
        {[1, 2, 3, 4, 5, 6, 7].map((stageNum) => {
          const stageRecords = stages.filter(s => s.stage === stageNum);
          const record = stageRecords.length > 0 ? stageRecords[stageRecords.length - 1] : null;

          const name = STAGE_NAMES[stageNum];
          const status = record ? record.status : 'pending';
          
          let duration = '-';
          if (record && record.startedAt) {
            if (record.finishedAt) {
              const ms = new Date(record.finishedAt).getTime() - new Date(record.startedAt).getTime();
              duration = ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
            } else if (record.ms !== undefined) {
              duration = record.ms >= 1000 ? `${(record.ms / 1000).toFixed(1)}s` : `${record.ms}ms`;
            } else {
              duration = 'running...';
            }
          }

          const styleClass = STATUS_STYLES[status] || STATUS_STYLES.pending;

          return (
            <div 
              key={stageNum} 
              className={`flex items-center gap-4 p-3 rounded-lg border transition-all duration-300 ${styleClass}`}
            >
              <div className={`flex-none w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-background shadow-sm border border-border`}>
                {stageNum}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate capitalize">
                  {name.replace(/-/g, ' ')}
                </p>
                <p className="text-xs uppercase tracking-wider font-bold opacity-80 mt-0.5">
                  {status}
                </p>
              </div>
              <div className="flex-none text-xs font-mono font-medium opacity-80 text-right mr-4 w-16">
                {duration}
              </div>
              <button 
                className="text-xs bg-background text-muted-foreground hover:text-foreground font-medium px-3 py-1.5 rounded shadow-sm hover:bg-card border border-border transition-colors focus:ring-2 focus:ring-accent/50 outline-none"
                onClick={() => handleReplay(stageNum)}
              >
                Replay
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
