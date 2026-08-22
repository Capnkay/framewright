import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Loader2 } from 'lucide-react';
import { login } from '../studio/auth/mockAuth.js';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isPending, setIsPending] = useState(false);
  
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsPending(true);
    setError(null);

    login({ email, password })
      .then((data) => {
        localStorage.setItem('framewright.session', JSON.stringify({ email: data.user.email }));
        navigate('/generate');
      })
      .catch((err) => {
        setError(err.message || 'An error occurred during login.');
      })
      .finally(() => {
        setIsPending(false);
      });
  };

  return (
    <div className="studio-theme min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm rounded-studio-lg border border-studio-border bg-studio-bg-raised p-8 font-studio text-studio-text-primary shadow-studio-sm">
        <h1 className="mb-6 text-center text-studio-2xl font-medium">Sign in</h1>
        
        {error && (
          <div className="mb-5 rounded-studio-sm border border-studio-destructive/30 bg-studio-destructive/10 px-3 py-2 text-studio-sm text-studio-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-studio-sm text-studio-text-secondary">
            <span className="sr-only">Email</span>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Mail className="h-4 w-4 text-studio-text-tertiary" strokeWidth={1.75} />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                disabled={isPending}
                className="w-full rounded-studio-md border border-studio-border bg-studio-bg-base py-2.5 pl-10 pr-3 text-studio-sm text-studio-text-primary placeholder:text-studio-text-tertiary focus:border-studio-accent focus:outline-none focus:shadow-studio-glow disabled:opacity-50"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5 text-studio-sm text-studio-text-secondary">
            <span className="sr-only">Password</span>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Lock className="h-4 w-4 text-studio-text-tertiary" strokeWidth={1.75} />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                disabled={isPending}
                className="w-full rounded-studio-md border border-studio-border bg-studio-bg-base py-2.5 pl-10 pr-3 text-studio-sm text-studio-text-primary placeholder:text-studio-text-tertiary focus:border-studio-accent focus:outline-none focus:shadow-studio-glow disabled:opacity-50"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={isPending}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-studio-md bg-studio-accent px-4 py-2 text-studio-sm font-medium text-studio-accent-foreground transition-colors duration-studio-fast hover:bg-studio-accent-hover focus:outline-none focus:shadow-studio-glow disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />}
            {isPending ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
