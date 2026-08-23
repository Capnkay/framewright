import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button, Label, Logo, fade } from "../components/Shell";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div className="auth-page">
      <motion.div className="auth-card" {...fade} data-testid="login-card">
        <Logo />
        <div className="auth-copy"><Label>AUTHENTICATED WORKSPACE</Label><h1>Welcome back.</h1><p>Sign in to continue building with Framewright.</p></div>
        <form onSubmit={e => { e.preventDefault(); localStorage.setItem("framewright.session", JSON.stringify({ email })); navigate("/generate"); }}>
          <label>Email address<input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" data-testid="login-email-input" /></label>
          <label>Password<input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" data-testid="login-password-input" /></label>
          <Button primary type="submit" testid="login-submit-button">Sign in to Studio <ArrowRight size={16} /></Button>
        </form>
        <div className="auth-foot">Mock workspace &middot; any credentials accepted</div>
      </motion.div>
    </div>
  );
}
