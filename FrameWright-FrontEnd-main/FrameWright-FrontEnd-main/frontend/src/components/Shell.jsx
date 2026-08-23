import { cloneElement, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Menu } from "lucide-react";

export const fade = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0, transition: { duration: .32 } } };

export function Logo() {
  return <div className="logo" data-testid="framewright-logo"><span className="logo-mark"><span /></span><span>framewright</span></div>;
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
  const links = [["/", "Home"], ["/generate", "Studio"], ["/preview", "Preview"]];
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

export function Shell({ children }) {
  const location = useLocation();
  const pinnedChildren = cloneElement(children, { location });
  return (
    <>
      <Nav />
      <AnimatePresence mode="wait" initial={false}>
        <motion.main key={location.pathname} className="page-shell" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .16 }}>
          {pinnedChildren}
        </motion.main>
      </AnimatePresence>
    </>
  );
}
