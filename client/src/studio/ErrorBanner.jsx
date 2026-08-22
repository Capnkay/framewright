import React from 'react';

const ERROR_MESSAGES = {
  400: 'The information provided was incomplete or invalid. Please check your input and try again.',
  413: 'The uploaded file is too large. Please keep files under 8 MB.',
  422: 'We could not process this request right now. The perception service may be unavailable.',
  500: 'An unexpected system error occurred. Please try again later.'
};

export default function ErrorBanner({ statusCode, message }) {
  if (!statusCode && !message) return null;
  
  const displayMessage = ERROR_MESSAGES[statusCode] || message || 'An unknown error occurred.';

  return (
    <div
      className="rounded-studio-sm border border-studio-destructive/30 bg-studio-destructive/10 px-4 py-3 text-studio-sm text-studio-destructive"
      role="alert"
    >
      <strong className="font-semibold">Error: </strong>
      <span>{displayMessage}</span>
    </div>
  );
}
