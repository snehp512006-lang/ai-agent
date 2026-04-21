import React, { useContext } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AuthContext } from '../context/AuthContext';
import {
  LayoutDashboard,
  UploadCloud,
  FileJson,
  History,
  Settings,
  BrainCircuit,
  AlertTriangle,
  BarChart3,
  Factory,
  FileSpreadsheet,
  Mail,
  Zap,
  Menu,
  ChevronLeft,
  LogOut,
  ShieldCheck,
  ListChecks
} from 'lucide-react';

const navSections = [
  {
    label: 'Main Tools',
    items: [
      { title: 'Business Home', icon: LayoutDashboard, path: '/' },
      { title: 'Email Assistant', icon: Mail, path: '/email' },
      { title: 'Stock Alerts', icon: AlertTriangle, path: '/risks' },
      { title: 'Sales Forecast', icon: BarChart3, path: '/forecast' },
      { title: 'Client Records', icon: ListChecks, path: '/clients' },
      { title: 'Past Results', icon: ShieldCheck, path: '/audit' },
    ]
  },
  {
    label: 'Data & Designs',
    items: [
      { title: 'Data Cleaner', icon: Zap, path: '/ai-processor' },
      { title: 'Page Designer', icon: FileSpreadsheet, path: '/builder' },
      { title: 'Action Plan', icon: History, path: '/tasks' },
    ]
  }
];

const Sidebar = ({ isCollapsed, setIsCollapsed }) => {
  const { user, logout } = useContext(AuthContext);
  
  const getInitials = (name) => {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 96 : 280 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="h-screen bg-gradient-to-b from-emerald-950 via-emerald-950 to-emerald-900/90 border-r border-emerald-900/50 flex flex-col z-20 overflow-hidden relative shadow-xl"
    >
      {/* Premium Glow Effect */}
      <div className="absolute -left-20 -top-20 w-40 h-40 bg-emerald-500/5 blur-[100px] pointer-events-none" />
      <div className="absolute -right-20 -bottom-20 w-40 h-40 bg-blue-500/5 blur-[100px] pointer-events-none" />

      <div className={`relative flex flex-col gap-4 ${isCollapsed ? 'px-3 py-4 items-center' : 'p-6 pb-2'}`}>
        <div className={`flex items-center w-full rounded-2xl bg-emerald-50/95 border border-emerald-100/60 shadow-[0_10px_24px_rgba(0,0,0,0.12)] ${isCollapsed ? 'justify-center px-2 py-2' : 'justify-between px-3 py-2.5'}`}>
          <button
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="flex items-center gap-3 group overflow-hidden"
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            <div className="min-w-[40px] w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-lg shadow-emerald-500/10 group-hover:scale-105 transition-transform duration-300">
              <BrainCircuit size={22} strokeWidth={2.5} />
            </div>
            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="whitespace-nowrap"
              >
                <div className="text-sm font-black text-emerald-800 tracking-widest uppercase flex items-center gap-1.5">
                  AI Ops <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.6)] animate-pulse" />
                </div>
                <div className="text-[9px] font-black text-emerald-600 uppercase tracking-[0.2em] opacity-90">Brain Platform</div>
              </motion.div>
            )}
          </button>
          
          {!isCollapsed && (
            <button 
              onClick={() => setIsCollapsed(true)}
              className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-700 hover:text-emerald-900 transition-all"
              title="Collapse"
            >
              <ChevronLeft size={18} />
            </button>
          )}
        </div>
      </div>

      <nav className={`flex-1 overflow-y-auto custom-scrollbar sidebar-scrollbar space-y-7 relative ${isCollapsed ? 'px-2 py-4' : 'px-4 py-6'}`}>
        {navSections.map(section => (
          <div key={section.label} className="space-y-2">
            {!isCollapsed && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.7 }}
                className="px-4 text-[10px] font-black text-emerald-100/70 uppercase tracking-[0.22em]"
              >
                {section.label}
              </motion.div>
            )}
            <div className="space-y-1">
              {section.items.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  title={isCollapsed ? item.title : ''}
                  className={({ isActive }) => `
                    flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all duration-200 group relative
                    ${isCollapsed ? 'justify-center px-0' : ''}
                    ${isActive
                      ? 'bg-white/95 text-emerald-800 border border-white/70 shadow-sm'
                      : 'text-emerald-100/80 hover:text-white hover:bg-white/10'}
                  `}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.div
                          layoutId="activeSide"
                          className="absolute left-0 w-[3px] h-6 rounded-r-full bg-emerald-500 shadow-[4px_0_12px_rgba(16,185,129,0.5)]"
                        />
                      )}

                      <item.icon
                        size={18}
                        className={`transition-colors shrink-0 ${
                          isActive ? 'text-emerald-700' : 'text-emerald-100/70 group-hover:text-white'
                        }`}
                      />
                      {!isCollapsed && <span className="tracking-wide whitespace-nowrap">{item.title}</span>}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className={`p-4 mt-auto border-t border-emerald-900/40 bg-emerald-900/30 relative group transition-all duration-300 ${isCollapsed ? 'p-3' : 'p-6'}`}>
        <div
          onClick={isCollapsed ? logout : undefined}
          title={isCollapsed ? 'Sign Out' : ''}
          className={`flex items-center gap-3 p-3 rounded-2xl bg-white/[0.06] border border-white/10 hover:bg-white/[0.1] transition-all relative ${isCollapsed ? 'justify-center p-2 cursor-pointer' : ''}`}
        >
          <div className="w-10 h-10 min-w-[40px] rounded-xl bg-slate-800 border-2 border-slate-900 flex items-center justify-center text-emerald-500 shadow-xl font-black text-xs uppercase tabular-nums transition-transform group-hover:scale-105">
            {getInitials(user?.username || 'User')}
          </div>

          {!isCollapsed && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex-1 min-w-0"
            >
              <div className="text-[11px] font-black text-[var(--text-main)] truncate uppercase tracking-tight">
                {user?.username || 'Guest'}
              </div>
              <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest opacity-80">
                Super Admin
              </div>
            </motion.div>
          )}

          {!isCollapsed && (
            <button 
              onClick={logout}
              className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-500 transition-colors group/logout"
              title="Sign Out"
            >
              <LogOut size={14} />
            </button>
          )}
          
          {isCollapsed && (
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#060b19] shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
          )}
        </div>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
