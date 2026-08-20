import React from 'react';

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

export default function JobTimeline({ job }) {
  if (!job) return null;

  const stages = job.stages || [];
  
  return (
    <div className="flex flex-col gap-2 p-4">
      <h2 className="text-lg font-semibold mb-2">Job Timeline</h2>
      {[1, 2, 3, 4, 5, 6, 7].map((stageNum) => {
        const stageRecords = stages.filter(s => s.stage === stageNum);
        const record = stageRecords.length > 0 ? stageRecords[stageRecords.length - 1] : null;

        const name = STAGE_NAMES[stageNum];
        const status = record ? record.status : 'pending';
        
        let duration = '-';
        if (record && record.startedAt) {
          if (record.finishedAt) {
            duration = `${new Date(record.finishedAt).getTime() - new Date(record.startedAt).getTime()}ms`;
          } else if (record.ms !== undefined) {
            duration = `${record.ms}ms`;
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
            <div className="flex-none text-xs font-mono opacity-80 text-right">
              {duration}
            </div>
          </div>
        );
      })}
    </div>
  );
}
