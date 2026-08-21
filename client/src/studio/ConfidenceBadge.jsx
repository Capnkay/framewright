import React from 'react';

export default function ConfidenceBadge({ confidence }) {
  if (confidence === null || confidence === undefined) {
    return null;
  }

  // A 10 bands
  let bgColor = 'bg-red-100 text-red-800'; // < 0.60
  if (confidence >= 0.85) {
    bgColor = 'bg-green-100 text-green-800';
  } else if (confidence >= 0.60) {
    bgColor = 'bg-amber-100 text-amber-800';
  }

  const rounded = (confidence * 100).toFixed(0) + '%';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${bgColor}`} title="Confidence score">
      {rounded}
    </span>
  );
}
