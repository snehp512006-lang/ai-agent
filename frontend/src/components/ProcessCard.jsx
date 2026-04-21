import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

const ProcessCard = ({ 
  title, 
  description, 
  icon: Icon, 
  status, 
  stats, 
  color = 'emerald', 
  delay = 0,
  onClick 
}) => {
  const colorMap = {
    emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/20 text-emerald-400Icon hover:border-emerald-500/40',
    blue: 'from-blue-500/20 to-blue-500/5 border-blue-500/20 text-blue-400 hover:border-blue-500/40',
    purple: 'from-purple-500/20 to-purple-500/5 border-purple-500/20 text-purple-400 hover:border-purple-500/40',
    amber: 'from-amber-500/20 to-amber-500/5 border-amber-500/20 text-amber-400 hover:border-amber-500/40',
    rose: 'from-rose-500/20 to-rose-500/5 border-rose-500/20 text-rose-400 hover:border-rose-500/40',
  };

  const glowMap = {
    emerald: 'group-hover:shadow-[0_0_30px_rgba(16,185,129,0.15)]',
    blue: 'group-hover:shadow-[0_0_30px_rgba(59,130,246,0.15)]',
    purple: 'group-hover:shadow-[0_0_30px_rgba(168,85,247,0.15)]',
    amber: 'group-hover:shadow-[0_0_30px_rgba(245,158,11,0.15)]',
    rose: 'group-hover:shadow-[0_0_30px_rgba(244,63,94,0.15)]',
  };

  const dotMap = {
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -5 }}
      onClick={onClick}
      className={`shimmer-effect group relative flex flex-col p-6 rounded-3xl border bg-gradient-to-br transition-all duration-500 cursor-pointer overflow-hidden ${colorMap[color]} ${glowMap[color]}`}
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-current opacity-[0.03] rounded-full blur-3xl group-hover:opacity-[0.08] transition-opacity duration-500" />
      
      <div className="flex items-start justify-between mb-8">
        <div className={`p-3 rounded-2xl bg-white/5 border border-white/10 group-hover:scale-110 transition-transform duration-500`}>
          {Icon && <Icon className="w-6 h-6" />}
        </div>
        {status && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${dotMap[color]}`} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">{status}</span>
          </div>
        )}
      </div>

      <div className="space-y-2 mb-8">
        <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors duration-300">
          {title}
        </h3>
        <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">
          {description}
        </p>
      </div>

      <div className="mt-auto flex items-center justify-between">
        {stats ? (
          <div className="flex flex-col">
            <span className="text-xl font-black text-white">{stats.value}</span>
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{stats.label}</span>
          </div>
        ) : (
          <div className="w-1" />
        )}
        
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 border border-white/10 group-hover:bg-current group-hover:text-slate-950 transition-all duration-500">
          <ArrowRight className="w-5 h-5" />
        </div>
      </div>
    </motion.div>
  );
};

export default ProcessCard;