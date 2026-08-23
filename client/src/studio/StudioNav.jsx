// client/src/studio/StudioNav.jsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import Logo from './Logo.jsx';

export default function StudioNav() {
  const { pathname } = useLocation();

  const link = (to, label) => {
    const active = pathname.startsWith(to) && to !== '/' || (to === '/' && pathname === '/');
    return (
      <Link
        to={to}
        className={`relative group flex items-center gap-2 rounded-full px-5 py-2 text-studio-sm font-semibold transition-colors duration-studio-fast z-10 ${
          active ? 'text-studio-text-primary' : 'text-studio-text-secondary hover:text-studio-text-primary'
        }`}
      >
        {active && (
          <motion.div
            layoutId="navbar-active-pill"
            className="absolute inset-0 z-[-1] rounded-full bg-studio-bg-overlay border border-studio-border/50 shadow-[0_0_12px_rgba(255,255,255,0.05)]"
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          />
        )}
        <span>{label}</span>
      </Link>
    );
  };

  const sessionStr = typeof window !== 'undefined' ? localStorage.getItem('framewright.session') : null;
  const session = sessionStr ? JSON.parse(sessionStr) : null;
  const initial = session?.email ? session.email.charAt(0).toUpperCase() : null;

  return (
    // iOS floating centered dock style (no nested high-contrast borders)
    // Using !bg-transparent to override the solid background color that .studio-theme applies by default,
    // which was creating an ugly rectangular box around our rounded glassmorphic capsule.
    <div className="studio-theme fixed top-5 left-1/2 -translate-x-1/2 z-50 w-fit !bg-transparent pointer-events-none">
      <nav className="flex items-center gap-6 rounded-full border border-studio-border/50 bg-studio-bg-base/60 backdrop-blur-2xl px-6 py-2 shadow-2xl shadow-black/50 pointer-events-auto">
        <Link to="/" className="flex items-center transition-opacity hover:opacity-80 shrink-0">
          <Logo size="sm" withWordmark={false} />
        </Link>
        
        {/* Dark pill container wrapper for clean links */}
        <div className="flex items-center gap-1 bg-studio-bg-raised rounded-full p-1">
          {link('/', 'Home')}
          {link('/generate', 'Studio')}
          {link('/preview', 'Preview')}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {!session ? (
            pathname !== '/login' && (
              <Link 
                to="/login" 
                className="rounded-full bg-studio-accent px-5 py-1.5 text-studio-sm font-semibold text-studio-accent-foreground transition-all hover:scale-[1.02] active:scale-[0.98] shadow-studio-sm"
              >
                Sign in
              </Link>
            )
          ) : (
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-studio-accent to-studio-accent-hover flex items-center justify-center text-studio-sm font-bold text-studio-accent-foreground shadow-studio-sm">
              {initial}
            </div>
          )}
        </div>
      </nav>
    </div>
  );
}
