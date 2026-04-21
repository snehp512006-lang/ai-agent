import React, { useEffect, useRef, useState } from 'react';
import { Terminal, ShieldCheck, Zap, BrainCircuit, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';

const ProcessingLog = ({ logs }) => {
  const scrollRef = useRef(null);
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [typedCount, setTypedCount] = useState(0);

  const latestIndex = Math.max(0, (logs?.length || 1) - 1);

  useEffect(() => {
    setTypedCount(0);
    if (!logs || logs.length === 0) return undefined;
    const latest = logs[latestIndex]?.message || '';
    const timer = setInterval(() => {
      setTypedCount((prev) => {
        if (prev >= latest.length) {
          clearInterval(timer);
          return prev;
        }
        return prev + 2;
      });
    }, 16);
    return () => clearInterval(timer);
  }, [logs, latestIndex]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className={`flex flex-col h-full rounded-[2.5rem] overflow-hidden ${
      isLight
        ? 'bg-white border border-slate-200 shadow-sm'
        : 'bg-slate-950/60 border border-white/5'
    }`}>
      {/* Terminal Header */}
      <div className={`flex items-center justify-between px-6 py-4 border-b ${
        isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5'
      }`}>
        <div className="flex items-center gap-3">
          <Terminal size={14} className="text-emerald-500" />
          <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Data Processing Log</span>
        </div>
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-rose-500/30" />
          <div className="w-2 h-2 rounded-full bg-amber-500/30" />
          <div className="w-2 h-2 rounded-full bg-emerald-500/30" />
        </div>
      </div>

      {/* Terminal Body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 font-mono text-[11px] space-y-2 scrollbar-hide"
      >
        {logs.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-full gap-4 ${isLight ? 'opacity-80' : 'opacity-20 grayscale'}`}>
            <Activity className={`animate-pulse ${isLight ? 'text-emerald-500' : ''}`} size={32} />
            <p className={`font-black uppercase tracking-widest text-[9px] ${isLight ? 'text-slate-500' : ''}`}>Awaiting Data Stream...</p>
          </div>
        ) : (
          logs.map((log, i) => {
            const category = String(log.category || '').toUpperCase();
            const shownMessage = i === latestIndex
              ? String(log.message || '').slice(0, typedCount)
              : String(log.message || '');

            return (
            <motion.div
              key={`${i}-${log.message}`}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex gap-4 group"
            >
              <span className={`${isLight ? 'text-slate-400' : 'text-slate-700'} select-none shrink-0 w-8`}>{(i + 1).toString().padStart(3, '0')}</span>
              <div className="flex-1">
                 <span className={`${
                   log.type === 'error' ? 'text-rose-400' : 
                   log.type === 'success' ? 'text-emerald-400' : 
                   log.type === 'warning' ? 'text-amber-400' : 
                   (isLight ? 'text-slate-700' : 'text-slate-300')
                 }`}>
                   <span className="opacity-40 mr-2">[{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                   <span className="font-black uppercase tracking-widest text-[9px] opacity-70 mr-2">{category || 'PIPELINE'}</span>
                   <span className="font-bold">{shownMessage}</span>
                   {i === latestIndex && typedCount < String(log.message || '').length && <span className="ml-1 animate-pulse">|</span>}
                 </span>
                 {log.details && (
                   <p className={`mt-1 ml-4 pl-4 py-1 leading-relaxed ${
                     isLight ? 'text-slate-500 border-l border-slate-200 opacity-80' : 'text-slate-500 opacity-60 border-l border-white/5'
                   }`}>
                     {log.details}
                   </p>
                 )}
              </div>
              {log.type === 'success' && <ShieldCheck size={12} className="text-emerald-500 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />}
            </motion.div>
          )})
        )}
      </div>

      {/* Terminal Footer */}
      <div className={`px-6 py-3 border-t flex items-center justify-between ${
        isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/40 border-white/5'
      }`}>
         <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className={`text-[8px] font-black uppercase tracking-widest ${isLight ? 'text-emerald-600' : 'text-emerald-500/60'}`}>Live Channel 01</span>
            </div>
            <div className="flex items-center gap-1.5">
              <BrainCircuit size={10} className={isLight ? 'text-blue-500/70' : 'text-purple-500/60'} />
              <span className="text-[8px] font-black uppercase text-slate-500 tracking-widest">Gemini 2.0 Engine</span>
            </div>
         </div>
         <div className="flex items-center gap-2">
            <div className={`px-2 py-0.5 rounded-md text-[8px] font-bold text-slate-500 uppercase tracking-tighter ${isLight ? 'bg-slate-200' : 'bg-white/5'}`}>UTF-8</div>
            <Zap size={10} className="text-amber-500/40" />
         </div>
      </div>
    </div>
  );
};

export default ProcessingLog;
