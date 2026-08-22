import React, { useEffect, useState } from 'react';

export default function JobHistory() {
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    let isMounted = true;
    
    const fetchHistory = async () => {
      try {
        const stored = localStorage.getItem('framewright_job_history');
        if (!stored) return;
        
        const jobIds = JSON.parse(stored);
        if (!Array.isArray(jobIds)) return;
        
        // Take at least the last 5
        const recent = jobIds.slice(-5);
        
        const fetchedJobs = await Promise.all(recent.map(async (id) => {
          try {
            const res = await fetch(`/api/jobs/${id}`);
            if (!res.ok) return null;
            return await res.json();
          } catch (e) {
            return null;
          }
        }));
        
        if (isMounted) {
          setJobs(fetchedJobs.filter(Boolean));
        }
      } catch (err) {
        console.error('Failed to load job history', err);
      }
    };
    
    fetchHistory();
    return () => { isMounted = false; };
  }, []);

  if (jobs.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 p-4 bg-background border rounded shadow-sm">
      <h3 className="font-semibold text-foreground">Job History</h3>
      <ul className="text-sm flex flex-col gap-1">
        {jobs.map(job => (
          <li key={job.jobId} className="flex justify-between border-b last:border-0 pb-1">
            <span className="text-muted-foreground">Job {job.jobId}</span>
            <span className="font-medium text-foreground">{job.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
