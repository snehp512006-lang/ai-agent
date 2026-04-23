import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Lock,
  User as UserIcon,
  Loader2,
  Sparkles,
  UploadCloud,
  BarChart3,
  Settings,
  LineChart,
} from 'lucide-react';
import { AuthContext } from '../context/AuthContext';

const processCards = [
  {
    icon: <UploadCloud size={26} className="text-emerald-600" />,
    title: 'Add your data',
    desc: 'Upload your file and start in a few simple steps.',
  },
  {
    icon: <Settings size={26} className="text-sky-600" />,
    title: 'Automatic processing',
    desc: 'The system checks your data and prepares results for you.',
  },
  {
    icon: <BarChart3 size={26} className="text-violet-600" />,
    title: 'Clear insights',
    desc: 'See stock, trends, and key numbers in one place.',
  },
  {
    icon: <LineChart size={26} className="text-amber-600" />,
    title: 'Better planning',
    desc: 'Use forecasts to make faster and better decisions.',
  },
];

const inputClassName = 'w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 transition-all focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-500/10';

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
        confirm_password: signupConfirm,
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
    <div
      className="relative min-h-screen overflow-hidden px-4 py-6 font-[Inter,sans-serif] md:px-6"
      style={{
        background: 'linear-gradient(180deg, #f8fafc 0%, #edf3f7 55%, #e6eef4 100%)',
      }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at top left, rgba(14,165,233,0.10), transparent 30%), radial-gradient(circle at bottom right, rgba(16,185,129,0.10), transparent 28%)',
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:5rem_5rem] opacity-50" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl items-center">
        <div className="w-full">
          <motion.div
            initial={{ opacity: 0, y: -18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="mb-8 text-center"
          >
            <h1 className="text-4xl font-black tracking-tight text-slate-900 md:text-5xl">
              AI Ops Brain
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              Manage your business with simple insights and clear actions.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.55, delay: 0.1 }}
              className="space-y-4"
            >
              <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.35)] backdrop-blur-sm">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Why teams use it
                </p>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900 md:text-[2rem]">
                  Simple tools for business work
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                  Upload data, check results, and make better decisions without a complex setup.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {processCards.map((card, idx) => (
                  <motion.div
                    key={card.title}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: 0.14 + idx * 0.08 }}
                    className="rounded-[1.5rem] border border-slate-200 bg-white/88 p-5 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.35)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-300"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                        {card.icon}
                      </div>
                      <div>
                        <h3 className="text-sm font-black tracking-tight text-slate-900">
                          {card.title}
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {card.desc}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.55, delay: 0.18 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, ease: 'easeOut' }}
                className="relative overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white/95 p-8 shadow-[0_30px_80px_-42px_rgba(15,23,42,0.35)] md:p-10"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-500 via-emerald-500 to-sky-500" />

                <div className="relative z-10 mb-7">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Secure access
                  </p>
                  <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900">
                    {isSignup ? 'Create your admin account' : 'Sign in to your workspace'}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {isSignup
                      ? 'Enter your details below to create the main account.'
                      : 'Enter your details to open the dashboard and continue your work.'}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="relative z-10 flex flex-col gap-5">
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-xs font-semibold text-rose-700"
                    >
                      {error}
                    </motion.div>
                  )}

                  {!isSignup && (
                    <div className="space-y-2">
                      <label className="ml-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        Username or email
                      </label>
                      <div className="group relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400 group-focus-within:text-emerald-600">
                          <UserIcon size={18} />
                        </div>
                        <input
                          type="text"
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                          autoComplete="username"
                          className={inputClassName}
                          placeholder="Enter username or email"
                          required
                        />
                      </div>
                    </div>
                  )}

                  {isSignup && (
                    <>
                      <div className="space-y-2">
                        <label className="ml-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          Username
                        </label>
                        <div className="group relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400 group-focus-within:text-emerald-600">
                            <UserIcon size={18} />
                          </div>
                          <input
                            type="text"
                            value={signupUsername}
                            onChange={(e) => setSignupUsername(e.target.value)}
                            autoComplete="username"
                            className={inputClassName}
                            placeholder="Enter username"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="ml-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          Email
                        </label>
                        <div className="group relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400 group-focus-within:text-emerald-600">
                            <UserIcon size={18} />
                          </div>
                          <input
                            type="email"
                            value={signupEmail}
                            onChange={(e) => setSignupEmail(e.target.value)}
                            autoComplete="email"
                            className={inputClassName}
                            placeholder="Enter email"
                            required
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {!isSignup && (
                    <div className="space-y-2">
                      <label className="ml-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        Password
                      </label>
                      <div className="group relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400 group-focus-within:text-emerald-600">
                          <Lock size={18} />
                        </div>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="current-password"
                          className={inputClassName}
                          placeholder="Enter password"
                          required
                        />
                      </div>
                    </div>
                  )}

                  {isSignup && (
                    <>
                      <div className="space-y-2">
                        <label className="ml-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          Password
                        </label>
                        <div className="group relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400 group-focus-within:text-emerald-600">
                            <Lock size={18} />
                          </div>
                          <input
                            type="password"
                            value={signupPassword}
                            onChange={(e) => setSignupPassword(e.target.value)}
                            autoComplete="new-password"
                            className={inputClassName}
                            placeholder="Create password"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="ml-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          Confirm password
                        </label>
                        <div className="group relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400 group-focus-within:text-emerald-600">
                            <Lock size={18} />
                          </div>
                          <input
                            type="password"
                            value={signupConfirm}
                            onChange={(e) => setSignupConfirm(e.target.value)}
                            autoComplete="new-password"
                            className={inputClassName}
                            placeholder="Re-enter password"
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
                    className="mt-2 flex w-full items-center justify-center gap-3 rounded-2xl border border-emerald-500 bg-emerald-600 px-4 py-4 text-[13px] font-extrabold uppercase tracking-wider text-white shadow-lg transition-all focus:outline-none focus:ring-4 focus:ring-emerald-300/30 hover:bg-emerald-500 active:scale-95"
                    style={{ boxShadow: '0 18px 36px -18px rgba(5, 150, 105, 0.55)' }}
                  >
                    {loading ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <>
                        <Sparkles size={18} className="transition-transform group-hover:rotate-12" />
                        {isSignup ? 'Create account' : 'Admin login'}
                      </>
                    )}
                  </motion.button>
                </form>

                {signupAllowed && (
                  <div className="mt-6 text-center text-[11px] font-semibold text-slate-500">
                    <button
                      type="button"
                      onClick={() => setIsSignup((prev) => !prev)}
                      className="text-emerald-600 transition-colors hover:text-emerald-500"
                    >
                      {isSignup ? 'Back to login' : 'Create admin account'}
                    </button>
                  </div>
                )}

                <div className="mt-6 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Secure login | System version 2026.1
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
