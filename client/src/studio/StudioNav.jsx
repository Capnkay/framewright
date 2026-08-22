// client/src/studio/StudioNav.jsx
import React, { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Logo from './Logo.jsx';

export default function StudioNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e) => {
      // ignore if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      
      // We don't want to break standard modifier shortcuts like Ctrl+P
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      
      if (e.key === 'g' || e.key === 'G') navigate('/generate');
      if (e.key === 'p' || e.key === 'P') navigate('/preview');
      if (e.key === 'h' || e.key === 'H') navigate('/');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const link = (to, label, shortcut) => {
    const active = pathname.startsWith(to) && to !== '/' || (to === '/' && pathname === '/');
    return (
      <Link
        to={to}
        className={
          'group flex items-center gap-2 rounded-studio-sm px-3 py-1.5 text-studio-sm font-medium transition-colors duration-studio-fast ' +
          (active
            ? 'bg-studio-bg-overlay text-studio-text-primary shadow-studio-xs'
            : 'text-studio-text-secondary hover:text-studio-text-primary hover:bg-studio-bg-raised')
        }
      >
        <span>{label}</span>
        {shortcut && (
          <span 
            className={`flex h-5 items-center rounded border px-1.5 text-[10px] font-medium transition-colors duration-studio-fast ${
              active 
                ? 'border-studio-border-strong bg-studio-bg-base text-studio-text-secondary' 
                : 'border-studio-border bg-studio-bg-base text-studio-text-tertiary group-hover:border-studio-border-strong group-hover:text-studio-text-secondary'
            }`}
          >
            {shortcut}
          </span>
        )}
      </Link>
    );
  };

  // We read the mockAuth session to see if signed in, but default to 'TJ' for visual completeness as requested.
  const sessionStr = typeof window !== 'undefined' ? localStorage.getItem('framewright.session') : null;
  const session = sessionStr ? JSON.parse(sessionStr) : { email: 'tony@stark.com' };
  const initial = session?.email ? session.email.charAt(0).toUpperCase() : 'U';

  return (
    // We add .studio-theme here so the nav can be used on non-studio pages (like Landing) and still be dark.
    <nav className="studio-theme sticky top-0 z-50 flex items-center justify-between border-b border-studio-border bg-studio-bg-base px-6 py-3">
      <div className="flex items-center gap-8">
        <Link to="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
          <Logo size="sm" />
          <span className="font-semibold tracking-tight text-studio-text-primary">Framewright</span>
        </Link>
        <div className="flex items-center gap-1">
          {link('/', 'Home', 'H')}
          {link('/generate', 'Studio', 'G')}
          {link('/preview', 'Preview', 'P')}
        </div>
      </div>
      <div className="flex items-center gap-4">
        {pathname !== '/login' && !sessionStr && (
          <Link to="/login" className="text-studio-sm font-medium text-studio-text-secondary hover:text-studio-text-primary">
            Sign in
          </Link>
        )}
        <div className="h-8 w-8 rounded-full bg-studio-accent flex items-center justify-center text-studio-sm font-medium text-studio-accent-foreground shadow-studio-sm">
          {initial}
        </div>
      </div>
    </nav>
  );
}
