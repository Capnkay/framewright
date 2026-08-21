import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export default function GeneratedSourceView({ jobId, pageName = 'Home' }) {
  const [sourceCode, setSourceCode] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!jobId) return;

    let isMounted = true;
    const fetchComponent = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/component`);
        if (!res.ok) {
          throw new Error('Failed to fetch component source');
        }
        const text = await res.text();
        if (isMounted) setSourceCode(text);
      } catch (err) {
        if (isMounted) setError(err.message);
      }
    };

    fetchComponent();
    
    return () => { isMounted = false; };
  }, [jobId]);

  return (
    <div className="flex flex-col gap-4 p-4 border rounded shadow-sm bg-white">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-800">Generated JSX</h3>
        <Link 
          to={`/preview/${pageName}`}
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
        >
          View in Preview
        </Link>
      </div>
      
      {error && <p className="text-red-500 text-sm">{error}</p>}
      
      {sourceCode ? (
        <pre className="bg-gray-50 p-4 rounded overflow-auto max-h-96 text-sm text-gray-800 border">
          <code>{sourceCode}</code>
        </pre>
      ) : (
        !error && <p className="text-sm text-gray-500">Loading source...</p>
      )}
    </div>
  );
}
