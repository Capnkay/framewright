import React, { useState, useEffect } from 'react';
import { extractStageInfo, fetchArtifactContent } from './StageInspector.logic.js';
import ConfidenceBadge from './ConfidenceBadge.jsx';

export default function StageInspector({ jobId, stageRecord }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    if (!jobId || !stageRecord || !stageRecord.outputRef) {
      setContent(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setContent(null);

    fetchArtifactContent(jobId, stageRecord)
      .then(data => {
        if (isMounted) {
          setContent(data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [jobId, stageRecord]);

  if (!stageRecord) return <div className="p-4 text-muted-foreground">Select a stage to inspect</div>;

  const { confidence, warnings } = extractStageInfo(stageRecord);

  return (
    <div className="flex flex-col h-full border border-border rounded-lg bg-background shadow-base overflow-hidden">
      <div className="p-4 bg-card border-b border-border flex justify-between items-center">
        <h3 className="font-semibold text-foreground tracking-tight">
          Stage {stageRecord.stage}: <span className="capitalize">{stageRecord.name.replace(/-/g, ' ')}</span>
        </h3>
        <div className="flex gap-3 text-sm">
          {confidence !== null && (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-muted-foreground">Confidence:</span>
              <ConfidenceBadge confidence={confidence} />
            </div>
          )}
          {warnings.length > 0 && (
            <span className="bg-warn/10 text-warn border border-warn/20 px-2 py-0.5 rounded font-bold text-xs uppercase tracking-wider">
              {warnings.length} Warning{warnings.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>
      
      {warnings.length > 0 && (
        <div className="p-4 bg-warn/5 border-b border-warn/10 text-sm text-warn font-medium">
          <ul className="list-disc pl-5 space-y-1">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 p-4 overflow-auto bg-gray-900 text-gray-100 font-mono text-sm leading-relaxed whitespace-pre rounded-b-lg">
        {loading ? (
          <span className="text-gray-400 motion-safe:animate-pulse">Loading artifact...</span>
        ) : error ? (
          <span className="text-destructive">Error: {error}</span>
        ) : content ? (
          content
        ) : !stageRecord.outputRef ? (
          <span className="text-muted-foreground italic">No artifact recorded for this stage</span>
        ) : null}
      </div>
    </div>
  );
}
