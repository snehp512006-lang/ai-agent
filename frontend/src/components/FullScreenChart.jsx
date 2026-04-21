import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

const FullScreenChart = ({ open, onClose, children, topLeft, bottomBar }) => {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[99999]"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-indigo-50" />
      <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-sm" />

      <div className="relative h-full w-full" onClick={(event) => event.stopPropagation()}>
        {topLeft && (
          <div className="absolute left-6 top-6 z-20">
            {topLeft}
          </div>
        )}

        {bottomBar && (
          <div className="absolute bottom-8 left-1/2 z-20 -translate-x-1/2">
            {bottomBar}
          </div>
        )}

        <button
          onClick={onClose}
          className="absolute right-6 top-6 z-20 rounded-full bg-white/90 p-3 text-slate-700 shadow-lg shadow-slate-900/10 transition hover:scale-105 hover:bg-white"
          title="Exit fullscreen (ESC)"
        >
          <X size={18} />
        </button>

        <div className="absolute inset-0">
          {children}
        </div>
      </div>
    </motion.div>,
    document.body
  );
};

export default FullScreenChart;
