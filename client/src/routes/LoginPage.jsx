import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Lock, Mail } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    // Mock Auth
    localStorage.setItem('framewright.session', JSON.stringify({ email }));
    navigate('/generate');
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm studio-glass-raised rounded-2xl p-8"
      >
        <div className="text-center mb-8">
          <h1 className="text-studio-xl font-bold tracking-tight mb-2">Welcome Back</h1>
          <p className="text-studio-sm text-studio-text-secondary">Sign in to Generator Studio</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <label className="text-studio-xs font-semibold text-studio-text-primary block" htmlFor="email">Email address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-studio-text-tertiary" />
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black/30 border border-studio-border rounded-studio-md py-2 pl-9 pr-3 text-studio-sm text-white focus:outline-none focus:border-studio-accent focus:ring-1 focus:ring-studio-focus-ring transition-all duration-studio-fast"
                placeholder="developer@example.com"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-studio-xs font-semibold text-studio-text-primary block" htmlFor="password">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-studio-text-tertiary" />
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/30 border border-studio-border rounded-studio-md py-2 pl-9 pr-3 text-studio-sm text-white focus:outline-none focus:border-studio-accent focus:ring-1 focus:ring-studio-focus-ring transition-all duration-studio-fast"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full mt-6 bg-studio-accent hover:bg-studio-accent-hover text-white font-medium rounded-studio-md py-2.5 transition-colors duration-studio-fast focus:outline-none focus:shadow-studio-glow active:scale-[0.98] active:duration-studio-instant"
          >
            Sign in
          </button>
        </form>
      </motion.div>
    </div>
  );
}
