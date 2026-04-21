import React from 'react';
import { motion } from 'framer-motion';

const GlassCard = ({ children, title, className = '', style = {}, delay = 0, premium = false, shimmer = false }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: [0.23, 1, 0.32, 1] }}
      className={`
        ${premium ? 'glass-premium' : 'glass-card'} 
        ${shimmer ? 'shimmer-effect' : ''} 
        group hover:border-emerald-500/40 transition-all duration-700 
        p-8 relative overflow-hidden
        ${className}
      `}
      style={style}
    >
      {title && (
        <div className="mb-6 pb-4 border-b border-white/5 flex items-center justify-between">
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] opacity-50 group-hover:opacity-100 group-hover:text-emerald-500 transition-all duration-500">
            {title}
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-slate-800 group-hover:bg-emerald-500 transition-colors shadow-[0_0_10px_rgba(16,185,129,0)] group-hover:shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
        </div>
      )}
      <div className="relative z-10 w-full">
        {children}
      </div>
    </motion.div>
  );
};

export default GlassCard;
