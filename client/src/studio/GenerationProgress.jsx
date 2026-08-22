import React, { useEffect, useState } from 'react';

const STAGE_NAMES = {
  1: 'Input Acquisition',
  2: 'Preprocessing & Normalization',
  3: 'Multimodal Understanding',
  4: 'Semantic Planning & IR',
  5: 'Code Generation & Assembly',
  6: 'Validation & QA',
  7: 'Output Delivery'
};

export default function GenerationProgress({ jobId, initialJob }) {
  const [job, setJob] = useState(initialJob || null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!jobId) return;

    let timeoutId;
    let isMounted = true;

    const pollJob = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) {
          throw new Error('Failed to fetch job status');
        }
        const data = await res.json();
        
        if (isMounted) {
          setJob(data);
          // Only poll if running or queued
          if (data.status === 'running' || data.status === 'queued') {
            timeoutId = setTimeout(pollJob, 1000);
          }
        }
      } catch (err) {
        if (isMounted) setError(err.message);
      }
    };

    // start polling
    pollJob();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [jobId]);

  if (!job) return null;

  const stages = job.stages || [];
  
  return (
    <div className="flex flex-col gap-3 p-4 bg-background border rounded shadow-sm">
      <h3 className="font-semibold text-foreground">Generation Progress ({job.status})</h3>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      
      <div className="flex flex-col gap-2">
        {[1, 2, 3, 4, 5, 6, 7].map(stageNum => {
          const stageRecords = stages.filter(s => s.stage === stageNum);
          const record = stageRecords.length > 0 ? stageRecords[stageRecords.length - 1] : null;
          
          let statusText = 'pending';
          let textColor = 'text-gray-400';
          
          if (record) {
            statusText = record.status;
            if (statusText === 'running') textColor = 'text-accent font-medium motion-safe:animate-pulse';
            else if (statusText === 'ok') textColor = 'text-green-600 font-medium';
            else if (statusText === 'degraded') textColor = 'text-amber-600 font-medium';
            else if (statusText === 'failed') textColor = 'text-red-600 font-medium';
            else if (statusText === 'skipped') textColor = 'text-muted-foreground';
          } else if (job.status === 'failed' && stageNum > stages.length) {
             statusText = 'aborted';
             textColor = 'text-gray-300';
          }

          return (
            <div key={stageNum} className="flex justify-between items-center text-sm border-b pb-1 last:border-0">
              <span className="text-muted-foreground">{stageNum}. {STAGE_NAMES[stageNum]}</span>
              <span className={textColor}>{statusText}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
