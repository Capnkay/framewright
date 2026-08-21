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

const STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-500 border-gray-200',
  running: 'bg-blue-50 text-blue-700 border-blue-300 animate-pulse',
  ok: 'bg-green-50 text-green-700 border-green-300',
  degraded: 'bg-amber-50 text-amber-700 border-amber-300',
  failed: 'bg-red-50 text-red-700 border-red-300',
  skipped: 'bg-slate-100 text-slate-600 border-slate-300',
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
    <div className="flex flex-col gap-2 p-4">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold">Job Timeline</h2>
        {job.score !== null && job.score !== undefined && (
          <div className="bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1 rounded-full text-sm font-bold shadow-sm" title="Quality Score (A 18.1)">
            Score: {job.score}
          </div>
        )}
      </div>
      {replayError && <div className="text-red-600 text-sm mb-2 font-medium">{replayError}</div>}
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

        const colorClass = STATUS_COLORS[status] || STATUS_COLORS.pending;

        return (
          <div key={stageNum} className={`flex items-center gap-4 p-3 rounded border ${colorClass}`}>
            <div className={`flex-none w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-white opacity-80 shadow-sm`}>
              {stageNum}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {name}
              </p>
              <p className="text-xs opacity-80 uppercase tracking-wide">
                {status}
              </p>
            </div>
            <div className="flex-none text-xs font-mono opacity-80 text-right mr-4">
              {duration}
            </div>
            <button 
              className="text-xs bg-white text-gray-700 font-medium px-2 py-1 rounded shadow-sm hover:bg-gray-50 border border-gray-200"
              onClick={() => handleReplay(stageNum)}
            >
              Replay from here
            </button>
          </div>
        );
      })}
    </div>
  );
}
