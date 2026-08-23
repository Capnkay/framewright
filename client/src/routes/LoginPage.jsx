import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Mail, Lock, Loader2 } from 'lucide-react';
import { login } from '../studio/auth/mockAuth.js';
import Logo from '../studio/Logo.jsx';

// Entrance timing/easing straight from docs/DESIGN-TOKENS.md §6 — no new
// values invented for this pass, and easeOutExpo matches --studio-ease-standard.
const EASE_STANDARD = [0.16, 1, 0.3, 1];
const fieldVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: EASE_STANDARD, delay: 0.08 + i * 0.05 },
  }),
};

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
    <div className="relative flex min-h-[calc(100vh-5rem)] items-center justify-center overflow-hidden">
      {/* Ambient glow — Vercel's "low-amplitude, continuous" reference (VISUAL-INSPO §2),
          not a moving spotlight. Fixed, very low opacity, no animation of its own; it
          exists so the page isn't flat black behind the card, not to draw the eye. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.15] blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--studio-accent) 0%, transparent 70%)' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: EASE_STANDARD }}
        className="relative flex w-full max-w-sm flex-col items-center gap-6"
      >
        <Logo size="lg" />

        <div className="w-full rounded-studio-lg border border-studio-border bg-studio-bg-raised p-8 font-studio text-studio-text-primary shadow-studio-md">
          <h1 className="mb-6 text-center text-studio-xl font-medium">Sign in</h1>

          {error && (
            <div className="mb-5 rounded-studio-sm border border-studio-destructive/30 bg-studio-destructive/10 px-3 py-2 text-studio-sm text-studio-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <motion.label
              custom={0}
              initial="hidden"
              animate="visible"
              variants={fieldVariants}
              className="flex flex-col gap-1.5 text-studio-sm text-studio-text-secondary"
            >
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
                  className="w-full rounded-studio-md border border-studio-border bg-studio-bg-base py-2.5 pl-10 pr-3 text-studio-sm text-studio-text-primary placeholder:text-studio-text-tertiary transition-colors duration-studio-fast focus:border-studio-accent focus:outline-none focus:shadow-studio-glow disabled:opacity-50"
                />
              </div>
            </motion.label>

            <motion.label
              custom={1}
              initial="hidden"
              animate="visible"
              variants={fieldVariants}
              className="flex flex-col gap-1.5 text-studio-sm text-studio-text-secondary"
            >
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
                  className="w-full rounded-studio-md border border-studio-border bg-studio-bg-base py-2.5 pl-10 pr-3 text-studio-sm text-studio-text-primary placeholder:text-studio-text-tertiary transition-colors duration-studio-fast focus:border-studio-accent focus:outline-none focus:shadow-studio-glow disabled:opacity-50"
                />
              </div>
            </motion.label>

            <motion.button
              custom={2}
              initial="hidden"
              animate="visible"
              variants={fieldVariants}
              type="submit"
              disabled={isPending}
              whileTap={{ scale: 0.98 }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-studio-md bg-studio-accent px-4 py-2 text-studio-sm font-medium text-studio-accent-foreground transition-colors duration-studio-fast hover:bg-studio-accent-hover focus:outline-none focus:shadow-studio-glow disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />}
              {isPending ? 'Signing in...' : 'Sign in'}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
