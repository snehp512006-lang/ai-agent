import React from 'react';
import { BrainCircuit, Zap, RefreshCw, Upload } from 'lucide-react';
import { motion } from 'framer-motion';

const ProcessorHeader = ({
  isNeuralCooldown,
  stats,
  status,
  isLight,
  onStartProcessing,
  onRequestReAnalyze,
  onResetToIdle,
  isReanalysisMode,
  reanalysisSheetLabel,
}) => {
  return (
    <header className="flex items-center justify-between max-w-7xl mx-auto">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
          <BrainCircuit className="text-emerald-400" size={28} />
        </div>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tighter">AI DATA ORCHESTRATOR</h1>
            {isNeuralCooldown && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2"
              >
                <span className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">
                  Expert Audit Verified
                </span>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">
                  Confidence Guided Output
                </span>
              </motion.div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Real-Time Autonomous Ingestion Engine</p>
            <div className="w-1 h-1 rounded-full bg-slate-800" />
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-md">
              <div className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Hybrid Sync Active</span>
            </div>
            {isReanalysisMode && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded-md max-w-[280px]">
                <div className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[8px] font-black text-amber-400 uppercase tracking-widest truncate" title={reanalysisSheetLabel || 'Uploaded Sheet'}>
                  Re-Analyzing: {reanalysisSheetLabel || 'Uploaded Sheet'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-8 bg-[var(--bg-sidebar)] px-8 py-3 rounded-2xl border border-[var(--border-subtle)] shadow-sm">
          <div className="text-center">
            <div className="text-xl font-mono font-black text-rose-500">{stats.anomalies}</div>
            <div className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Business Risks</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-mono font-black text-emerald-500">{stats.cleaned}</div>
            <div className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Items Fixed</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-mono font-black text-blue-500">{stats.predictions}</div>
            <div className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Forecasts</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-mono font-black text-purple-500">{stats.verified}</div>
            <div className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Audit Passed</div>
          </div>
        </div>

        {(status === 'READY' || status === 'HALTED') && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onStartProcessing}
            title={status === 'HALTED' ? 'Resume Pipeline' : 'Initialize Pipeline'}
            className={`bg-emerald-500 w-12 h-12 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 ${isLight ? 'text-white' : 'text-slate-950'}`}
          >
            <Zap size={20} fill="currentColor" />
          </motion.button>
        )}

        {(status === 'READY' || status === 'COMPLETED' || status === 'HALTED') && (
          <button
            onClick={onResetToIdle}
            title="Upload New Sheet"
            aria-label="Upload New Sheet"
            className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center hover:bg-blue-500/20 active:scale-95 transition-all"
          >
            <Upload size={20} />
          </button>
        )}

        {(status === 'COMPLETED' || status === 'HALTED') && (
          <div className="flex items-center gap-3">
            <button
              onClick={onRequestReAnalyze}
              title="Re-Analyze"
              className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 text-slate-400 flex items-center justify-center hover:bg-white/10 hover:text-white transition-all active:scale-95"
            >
              <RefreshCw size={20} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default ProcessorHeader;
