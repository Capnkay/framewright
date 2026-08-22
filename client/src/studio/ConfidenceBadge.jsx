import React from 'react';

export default function ConfidenceBadge({ confidence }) {
  if (confidence === null || confidence === undefined) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-card text-muted-foreground border border-border" title="Confidence score">
        N/A
      </span>
    );
  }

  // A 10 bands
  let bgColor = 'bg-destructive/10 text-destructive border-destructive/20'; // < 0.60
  if (confidence >= 0.85) {
    bgColor = 'bg-success/10 text-success border-success/20';
  } else if (confidence >= 0.60) {
    bgColor = 'bg-warn/10 text-warn border-warn/20';
  }

  const rounded = (confidence * 100).toFixed(0) + '%';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${bgColor}`} title="Confidence score">
      {rounded}
    </span>
  );
}
