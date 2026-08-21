import React, { useState, useEffect } from 'react';

export default function QuestionPrompt({ jobId, status, onResumed }) {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [normalisation, setNormalisation] = useState(null);

  useEffect(() => {
    if (status !== 'awaiting-input') return;
    
    let isMounted = true;
    const fetchQuestions = async () => {
      try {
        const [res, normRes] = await Promise.all([
          fetch(`/api/jobs/${jobId}/questions`),
          fetch(`/api/jobs/${jobId}/artifacts/s2-preprocessing-normalization.json`)
        ]);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setQuestions(data || []);
        }
        if (normRes.ok) {
          const normData = await normRes.json();
          if (isMounted) setNormalisation(normData);
        }
      } catch (err) {
        console.error(err);
      }
    };
    
    fetchQuestions();
    
    return () => { isMounted = false; };
  }, [jobId, status]);

  if (status !== 'awaiting-input' || questions.length === 0) {
    return null;
  }

  const handleChoice = (questionId, choice) => {
    setAnswers(prev => ({ ...prev, [questionId]: choice }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const answersArray = Object.entries(answers).map(([questionId, choice]) => ({
      questionId,
      choice
    }));

    try {
      const res = await fetch(`/api/jobs/${jobId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: answersArray })
      });
      if (res.ok) {
        if (onResumed) onResumed();
      }
    } catch (err) {
      console.error(err);
    }
    setSubmitting(false);
  };

  const allAnswered = questions.every(q => answers[q.questionId]);

  return (
    <div className="flex flex-col gap-4 p-4 border rounded shadow-sm bg-white mt-4">
      <h3 className="font-semibold text-lg text-amber-700">Action Required: Awaiting Input</h3>
      <p className="text-sm text-gray-600">The model has low confidence on some elements. Please help identify them.</p>
      
      {questions.map((q, idx) => {
        let overlayStyle = {};
        if (q.bbox && normalisation) {
          overlayStyle = {
            left: `${(q.bbox[0] / normalisation.width) * 100}%`,
            top: `${(q.bbox[1] / normalisation.height) * 100}%`,
            width: `${(q.bbox[2] / normalisation.width) * 100}%`,
            height: `${(q.bbox[3] / normalisation.height) * 100}%`
          };
        }

        return (
          <div key={q.questionId} className="border-t pt-4 mt-2">
            <p className="font-medium mb-2">{q.prompt} (Confidence: {q.confidence})</p>
            
            <div className="relative inline-block border border-gray-200 rounded overflow-hidden w-full max-w-xl">
              <img 
                src={`/api/jobs/${jobId}/artifacts/s2-normalised.jpg`} 
                alt="Source context"
                className="w-full h-auto block"
              />
              {q.bbox && normalisation && (
                <div 
                  className="absolute border-2 border-red-500 bg-red-500 bg-opacity-20 pointer-events-none"
                  style={overlayStyle}
                />
              )}
            </div>
            
            <div className="mt-4 flex flex-wrap gap-3">
              {q.options.map(opt => (
                <label key={opt} className="flex items-center gap-1 cursor-pointer">
                  <input 
                    type="radio" 
                    name={`q-${q.questionId}`}
                    value={opt}
                    checked={answers[q.questionId] === opt}
                    onChange={() => handleChoice(q.questionId, opt)}
                  />
                  <span className="text-sm">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}

      <div className="mt-4 pt-4 border-t flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={!allAnswered || submitting}
          className="bg-blue-600 text-white px-4 py-2 rounded font-medium disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit Answers'}
        </button>
      </div>
    </div>
  );
}
