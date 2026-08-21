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

  if (!stageRecord) return <div className="p-4 text-gray-500">Select a stage to inspect</div>;

  const { confidence, warnings } = extractStageInfo(stageRecord);

  return (
    <div className="flex flex-col h-full border rounded bg-white">
      <div className="p-3 bg-gray-50 border-b flex justify-between items-center">
        <h3 className="font-medium text-sm text-gray-800">
          Stage {stageRecord.stage}: {stageRecord.name}
        </h3>
        <div className="flex gap-2 text-xs">
          {confidence !== null && (
            <div className="flex items-center gap-1">
              <span className="font-medium text-gray-700">Confidence:</span>
              <ConfidenceBadge confidence={confidence} />
            </div>
          )}
          {warnings.length > 0 && (
            <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium">
              {warnings.length} Warning{warnings.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>
      
      {warnings.length > 0 && (
        <div className="p-3 bg-amber-50 border-b text-xs text-amber-900">
          <ul className="list-disc pl-4 space-y-1">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 p-3 overflow-auto bg-gray-900 text-gray-100 font-mono text-xs whitespace-pre">
        {loading ? (
          <span className="text-gray-400">Loading artifact...</span>
        ) : error ? (
          <span className="text-red-400">Error: {error}</span>
        ) : content ? (
          content
        ) : !stageRecord.outputRef ? (
          <span className="text-gray-400">No artifact recorded for this stage</span>
        ) : null}
      </div>
    </div>
  );
}
