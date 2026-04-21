import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ProcessingStatusFooter = ({
  status,
  showCompletionHold,
  isLight,
  phaseLabel,
  dynamicStatusText,
  telemetry,
  formattedProgress,
  processingSnapshot,
  displayProgressPct,
  isReanalysisMode,
  reanalysisSheetLabel,
  onEmergencyHalt,
}) => {
  const hasMeaningfulProgress = Number(displayProgressPct || 0) > 0.1
    || Number(processingSnapshot?.processed || 0) > 0;

  if (!(status === 'PROCESSING' && hasMeaningfulProgress)) return null;

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-[680px] px-4 z-50">
      <div className={`shadow-2xl border rounded-2xl p-6 backdrop-blur-xl ${
        isLight
          ? 'bg-white/90 border-slate-200 shadow-slate-300/35'
          : 'bg-slate-900/82 border-emerald-500/20 shadow-emerald-500/10'
      }`}>
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h4 className="text-base font-black tracking-tight text-[var(--text-main)]">AI Engine Analysis</h4>
            </div>
            {isReanalysisMode && (
              <div className="mt-1 text-[10px] font-black uppercase tracking-widest text-amber-500 truncate" title={reanalysisSheetLabel || 'Uploaded Sheet'}>
                Re-Analyzing Sheet: {reanalysisSheetLabel || 'Uploaded Sheet'}
              </div>
            )}
            <AnimatePresence mode="wait">
              <motion.p
                key={`${phaseLabel}-${dynamicStatusText}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: 'easeInOut' }}
                className="text-[11px] text-[var(--text-muted)] font-bold uppercase tracking-widest truncate"
              >
                {phaseLabel} • {dynamicStatusText}
              </motion.p>
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            <span>ETA: {Math.max(0, Math.round(telemetry.etaSeconds))}s</span>
            <span>RPS: {telemetry.recordsPerSecond.toFixed(1)}</span>
            <span>Anomalies: {telemetry.anomaliesDetected}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="text-4xl leading-none font-black text-[var(--text-main)] tabular-nums">
            {formattedProgress}
          </div>
          <div className="text-[11px] font-bold text-[var(--text-muted)] text-right">
            Processing {Number(processingSnapshot.processed || 0).toLocaleString()} / {Number(processingSnapshot.total || 0).toLocaleString()} records
          </div>
        </div>

        <div className={`relative h-[14px] w-full rounded-xl overflow-hidden ${isLight ? 'bg-slate-200 shadow-[inset_0_2px_5px_rgba(15,23,42,0.08)]' : 'bg-white/10 shadow-[inset_0_2px_6px_rgba(2,6,23,0.45)]'}`}>
          <motion.div
            className="h-full rounded-xl bg-gradient-to-r from-[#22c55e] to-[#3b82f6]"
            animate={{ width: `${Math.max(0, Math.min(100, displayProgressPct))}%` }}
            transition={{ duration: 0.24, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute top-0 h-full w-24 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            initial={{ x: '-120%' }}
            animate={{ x: ['-120%', '450%'] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
            Real-time AI computation synchronized with stream.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProcessingStatusFooter;
