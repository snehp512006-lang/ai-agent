import React, { useEffect } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const EnterpriseNeuralResult = ({ result, onClose }) => {
  const navigate = useNavigate();
  useEffect(() => {
    if (!result || typeof onClose !== 'function') return undefined;

    const autoCloseTimer = setTimeout(() => {
      onClose();
    }, 4500);

    return () => clearTimeout(autoCloseTimer);
  }, [result, onClose]);

  if (!result) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-transparent flex items-center justify-center px-4"
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="w-full max-w-[480px] rounded-[2.5rem] border border-emerald-500/20 bg-white shadow-[0_32px_64px_rgba(16,185,129,0.12)] overflow-hidden"
      >
        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500" />
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div className="inline-flex items-center gap-2.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-4 py-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Enterprise Audit Complete</span>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all active:scale-90"
              aria-label="Close analysis modal"
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-6 text-center">
            <div className="mx-auto w-20 h-20 rounded-[2rem] bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 mb-2">
              <CheckCircle2 size={36} className="text-emerald-500" strokeWidth={2.5} />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Analysis Complete</h3>
              <p className="text-[14px] leading-relaxed text-slate-500 px-4">
                Your data has been <span className="text-emerald-600 font-bold">successfully processed</span>. You can now view your updated results on the dashboard.
              </p>
            </div>

            <button
              onClick={() => {
                onClose();
                navigate('/');
              }}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-[13px] uppercase tracking-widest shadow-lg shadow-emerald-500/25 transition-all active:scale-[0.98]"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default EnterpriseNeuralResult;
