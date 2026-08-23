import { useEffect, useState, cloneElement } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Menu } from "lucide-react";

export const fade = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0, transition: { duration: .32 } } };

export function Logo() {
  return (
    <div className="logo" data-testid="framewright-logo">
      <img src="/navbar-logo.jpg" alt="Framewright Logo" style={{ height: "32px", width: "auto", mixBlendMode: 'lighten' }} />
    </div>
  );
}

export function BootAnimation() {
  const [show, setShow] = useState(() => !sessionStorage.getItem('framewright_booted'));

  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        setShow(false);
        sessionStorage.setItem('framewright_booted', 'true');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6, ease: "easeInOut" } }}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'var(--bg, #000)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
        >
          <motion.img 
            src="/boot-logo.png"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, transition: { duration: 0.8, ease: "easeOut" } }}
            style={{ width: '160px', height: 'auto', objectFit: 'contain' }}
            alt="Booting..."
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Badge({ children, tone = "blue" }) {
  return <span className={`badge badge-${tone}`} data-testid="status-badge">{tone === "green" && <span className="live-dot" />}{children}</span>;
}

export function Label({ children }) {
  return <div className="section-label"><span className="label-line" />{children}</div>;
}

export function Button({ children, primary = false, onClick, testid, type = "button" }) {
  return <button type={type} className={`btn ${primary ? "btn-primary" : "btn-ghost"}`} onClick={onClick} data-testid={testid}>{children}</button>;
}

export function Field({ label, value, onChange, placeholder, area = false, testid }) {
  const Tag = area ? "textarea" : "input";
  return <label className="field">{label}<Tag value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} data-testid={testid} /></label>;
}

function Nav() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const session = localStorage.getItem("framewright.session");
  const links = [["/", "Home"], ["/generate", "Studio"]];
  const go = to => { setOpen(false); navigate(to); };
  return (
    <header className="top-nav" data-testid="main-navigation">
      <Logo />
      <nav className="nav-segment">
        {links.map(([to, name]) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} data-testid={`nav-${name.toLowerCase()}-link`}>
            {({ isActive }) => <>{isActive && <motion.span layoutId="nav-active" className="nav-active" transition={{ duration: .22 }} />}{name}</>}
          </NavLink>
        ))}
      </nav>
      <div className="nav-account">
        {session ? (
          <button className="avatar" onClick={() => { localStorage.removeItem("framewright.session"); go("/"); }} data-testid="user-avatar-button">
            {JSON.parse(session).email[0].toUpperCase()}
          </button>
        ) : (
          <NavLink className="signin-pill" to="/login" data-testid="nav-sign-in-button">Sign in <ArrowRight size={13} /></NavLink>
        )}
        <button className="mobile-menu" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="mobile-menu-button"><Menu size={18} /></button>
        {open && (
          <div className="mobile-drawer" data-testid="mobile-navigation-drawer">
            {links.map(([to, name]) => <button key={to} onClick={() => go(to)} data-testid={`mobile-nav-${name.toLowerCase()}-link`}>{name}<ArrowRight size={13} /></button>)}
          </div>
        )}
      </div>
    </header>
  );
}

/**
 * Is this document rendering inside a frame? §7 R11.
 *
 * The Studio embeds /preview/:pageName in an iframe on purpose — R11's stacking
 * comes from a `md:` media query, and only a real viewport triggers one, so a
 * narrowed container would be a width preview rather than a layout preview.
 * The consequence is that any chrome this Shell renders appears a SECOND time
 * inside the preview pane, nested in the Studio already showing it.
 *
 * BOTH GUARDS ARE LOAD-BEARING. `window.top` throws on a cross-origin parent,
 * and these routes are also rendered by `renderToString` (quality/render.js)
 * where there is no `window` at all. Either one throwing during render takes
 * the whole page down. Defaulting to `true` on a throw is the safe direction:
 * the cost of a wrong `true` is a missing nav on a page that has other ways
 * back, and the cost of a wrong `false` is the doubled nav this exists to stop.
 */
export function isFramed() {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function Shell({ children }) {
  const location = useLocation();
  const pinnedChildren = cloneElement(children, { location });
  const framed = isFramed();
  return (
    <>
      <BootAnimation />
      {framed ? null : <Nav />}
      <AnimatePresence mode="wait" initial={false}>
        <motion.main key={location.pathname} className="page-shell" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .16 }}>
          {pinnedChildren}
        </motion.main>
      </AnimatePresence>
    </>
  );
}
