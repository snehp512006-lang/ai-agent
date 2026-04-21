import React, { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { Network, Lock, User as UserIcon, Loader2, Sparkles, UploadCloud, BarChart3, Settings, CheckCircle2, LineChart } from 'lucide-react';
import { motion } from 'framer-motion';
import backgroundImage from '../images/agent.png';

const Login = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirm, setSignupConfirm] = useState('');
  const [signupAllowed, setSignupAllowed] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Animated process flow onboarding state - disabled
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Process flow card data - updated with easy English
  const processCards = [
    {
      icon: <UploadCloud size={40} className="text-emerald-500 mb-2" />, 
      title: 'Upload Your Data', 
      desc: 'Simply drag and drop your spreadsheets.',
      color: 'emerald'
    },
    {
      icon: <Settings size={40} className="text-blue-500 mb-2" />, 
      title: 'Smart Processing', 
      desc: 'AI processes everything automatically in the background.',
      color: 'blue'
    },
    {
      icon: <BarChart3 size={40} className="text-purple-500 mb-2" />, 
      title: 'Real Insights', 
      desc: 'See patterns and trends your business needs to know.',
      color: 'purple'
    },
    {
      icon: <LineChart size={40} className="text-amber-500 mb-2" />, 
      title: 'Predict & Plan', 
      desc: 'Know what sells next with 94% accuracy.',
      color: 'amber'
    }
  ];

  const { login, signup, getSignupAllowed } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    const loadSignupState = async () => {
      const allowed = await getSignupAllowed();
      setSignupAllowed(allowed);
      if (!allowed) {
        setIsSignup(false);
      }
    };
    loadSignupState();
  }, [getSignupAllowed]);


  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (isSignup) {
      const result = await signup({
        username: signupUsername,
        email: signupEmail,
        password: signupPassword,
        confirm_password: signupConfirm
      });
      if (result.success) {
        setSignupAllowed(false);
        navigate('/');
      } else {
        setError(result.error);
      }
    } else {
      const result = await login(identifier, password);
      if (result.success) {
        navigate('/');
      } else {
        setError(result.error);
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex flex-col items-center justify-center p-4 relative overflow-hidden transition-colors duration-500 font-[Inter,sans-serif]">
      {/* Professional Background System */}
      <div className="absolute inset-0 z-0 overflow-visible pointer-events-none">
        {/* Background Image with enhanced clarity */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 scale-105"
          style={{
            backgroundImage: `url(${backgroundImage})`,
            filter: 'brightness(0.7) contrast(1.08) saturate(1.15) blur(0.5px)'
          }}
        />
        {/* Multi-stop gradient overlay for depth */}
        <div
          className="absolute inset-0 pointer-events-none transition-all duration-500"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(255,255,255,0.85) 0%, rgba(236,253,245,0.55) 60%, rgba(16,185,129,0.08) 100%), linear-gradient(120deg, rgba(16,185,129,0.04) 0%, rgba(59,130,246,0.03) 100%)',
            backdropFilter: 'blur(2.5px)'
          }}
        />
        {/* Elegant, softer grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--grid-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid-line)_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-5" />
        {/* Subtle vignette for focus */}
        <div className="absolute inset-0 pointer-events-none" style={{background: 'radial-gradient(ellipse 90% 70% at 50% 45%, rgba(0,0,0,0) 70%, rgba(16,24,40,0.08) 100%)'}} />
      </div>

      {/* Main Container with Grid Layout */}
      <div className="relative z-10 max-w-7xl w-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <motion.h1 
            className="text-6xl font-black mb-3 tracking-tighter leading-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 via-blue-600 to-emerald-600"
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.7, type: 'spring' }}
          >
            AI Ops Brain
          </motion.h1>
          <motion.p 
            className="text-emerald-600 dark:text-emerald-400 text-[12px] font-black uppercase tracking-widest"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            Control Your Business • Smart Decisions • Real Results
          </motion.p>
        </motion.div>

        {/* Two-Column Layout: Process Cards (Left) + Login Form (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Process Cards - Left Column */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="lg:col-span-1 space-y-4"
          >
            <div className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-6 px-2">Why Use AI Ops Brain?</div>
            {processCards.map((card, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 + idx * 0.08 }}
                className={`group p-6 rounded-3xl backdrop-blur-[10px] border transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 cursor-default`}
                style={{
                  borderColor: card.color === 'emerald' ? 'rgba(16, 185, 129, 0.4)' : 
                               card.color === 'blue' ? 'rgba(59, 130, 246, 0.4)' :
                               card.color === 'purple' ? 'rgba(139, 92, 246, 0.4)' :
                               'rgba(217, 119, 6, 0.4)',
                  background: card.color === 'emerald' ? 'rgba(16, 185, 129, 0.12)' :
                              card.color === 'blue' ? 'rgba(59, 130, 246, 0.12)' :
                              card.color === 'purple' ? 'rgba(139, 92, 246, 0.12)' :
                              'rgba(217, 119, 6, 0.12)',
                  boxShadow: card.color === 'emerald' ? '0 8px 32px rgba(16, 185, 129, 0.15)' :
                             card.color === 'blue' ? '0 8px 32px rgba(59, 130, 246, 0.15)' :
                             card.color === 'purple' ? '0 8px 32px rgba(139, 92, 246, 0.15)' :
                             '0 8px 32px rgba(217, 119, 6, 0.15)'
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    {card.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-[12px] font-black tracking-tight mb-1 ${
                      card.color === 'emerald' ? 'text-emerald-700 dark:text-emerald-400' :
                      card.color === 'blue' ? 'text-blue-700 dark:text-blue-400' :
                      card.color === 'purple' ? 'text-purple-700 dark:text-purple-400' :
                      'text-amber-700 dark:text-amber-400'
                    }`}>
                      {card.title}
                    </h3>
                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                      {card.desc}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Login Form - Right Column */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="lg:col-span-2"
          >

        {/* Card: white, clean, shadow for light mode; glassy for dark, with fade-in */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="p-12 rounded-[2.5rem] border border-[var(--border-premium)] bg-white/98 dark:bg-slate-900/70 dark:backdrop-blur-[15px] relative overflow-hidden transition-all duration-500 hover:shadow-2xl"
          style={{ boxShadow: '0 25px 50px -12px rgba(16, 185, 129, 0.25), 0 10px 25px -5px rgba(59, 130, 246, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2)' }}
        >
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
          
          <form onSubmit={handleSubmit} className="flex flex-col gap-6 relative z-10">
            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl text-red-500 text-[10px] font-bold uppercase tracking-widest text-center"
              >
                {error}
              </motion.div>
            )}


            {!isSignup && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">Username or Email</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[var(--text-dim)] group-focus-within:text-emerald-500 transition-colors">
                    <UserIcon size={18} />
                  </div>
                  <input
                    type="text"
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    autoComplete="username"
                    className="w-full bg-[var(--bg-input)]/50 border border-[var(--border-input)] rounded-2xl py-3.5 pl-12 pr-4 text-[var(--text-main)] font-medium text-sm focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:bg-[var(--bg-input)] transition-all placeholder:text-[var(--text-dim)]/40 hover:bg-[var(--bg-input)]/75"
                    placeholder="Enter username or email"
                    required
                  />
                </div>
              </div>
            )}

            {isSignup && (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">Username</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[var(--text-dim)] group-focus-within:text-emerald-500 transition-colors">
                      <UserIcon size={18} />
                    </div>
                    <input
                      type="text"
                      value={signupUsername}
                      onChange={e => setSignupUsername(e.target.value)}
                      autoComplete="username"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-2xl py-3.5 pl-12 pr-4 text-[var(--text-main)] font-medium text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 transition-all placeholder:text-[var(--text-dim)]/50"
                      placeholder="Enter username"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">Email</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[var(--text-dim)] group-focus-within:text-emerald-500 transition-colors">
                      <UserIcon size={18} />
                    </div>
                    <input
                      type="email"
                      value={signupEmail}
                      onChange={e => setSignupEmail(e.target.value)}
                      autoComplete="email"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-2xl py-3.5 pl-12 pr-4 text-[var(--text-main)] font-medium text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 transition-all placeholder:text-[var(--text-dim)]/50"
                      placeholder="Enter email"
                      required
                    />
                  </div>
                </div>
              </>
            )}

            {!isSignup && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[var(--text-dim)] group-focus-within:text-emerald-500 transition-colors">
                    <Lock size={18} />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full bg-[var(--bg-input)]/50 border border-[var(--border-input)] rounded-2xl py-3.5 pl-12 pr-4 text-[var(--text-main)] font-medium text-sm focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:bg-[var(--bg-input)] transition-all placeholder:text-[var(--text-dim)]/40 hover:bg-[var(--bg-input)]/75"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>
            )}

            {isSignup && (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">Password</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[var(--text-dim)] group-focus-within:text-emerald-500 transition-colors">
                      <Lock size={18} />
                    </div>
                    <input
                      type="password"
                      value={signupPassword}
                      onChange={e => setSignupPassword(e.target.value)}
                      autoComplete="new-password"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-2xl py-3.5 pl-12 pr-4 text-[var(--text-main)] font-medium text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 transition-all placeholder:text-[var(--text-dim)]/50"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1">Confirm Password</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[var(--text-dim)] group-focus-within:text-emerald-500 transition-colors">
                      <Lock size={18} />
                    </div>
                    <input
                      type="password"
                      value={signupConfirm}
                      onChange={e => setSignupConfirm(e.target.value)}
                      autoComplete="new-password"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-2xl py-3.5 pl-12 pr-4 text-[var(--text-main)] font-medium text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 transition-all placeholder:text-[var(--text-dim)]/50"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>
              </>
            )}

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="mt-6 w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-extrabold text-[13px] uppercase tracking-wider py-4 px-4 rounded-2xl transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 group focus:outline-none focus:ring-4 focus:ring-emerald-300/40 border border-emerald-400/30"
              style={{ boxShadow: '0 12px 32px 0 rgba(16, 185, 129, 0.35), 0 4px 12px 0 rgba(16, 185, 129, 0.2)' }}
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <>
                  <Sparkles size={18} className="group-hover:rotate-12 transition-transform" />
                  {isSignup ? 'Create Account' : 'Admin Login'}
                </>
              )}
            </motion.button>
          </form>

          {signupAllowed && (
            <div className="mt-6 text-center text-[10px] font-bold uppercase tracking-widest text-[var(--text-dim)]">
              <button
                type="button"
                onClick={() => setIsSignup(prev => !prev)}
                className="text-emerald-500 hover:text-emerald-400 transition-colors"
              >
                {isSignup ? 'Back to Login' : 'Create Admin Account'}
              </button>
            </div>
          )}

          <div className="mt-8 text-center text-[9px] font-bold text-[var(--text-dim)] uppercase tracking-widest">
            Level 4 Encryption Active — System Ver. 2026.1
          </div>
        </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Login;
