import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Brain, Activity, Target, ShieldCheck, Box, AlertCircle } from 'lucide-react';
import api from '../api/client';
import { useAnalysis } from '../context/analysisContext';

const ICON_MAP = {
  'Activity': Activity,
  'Zap': Zap,
  'Box': Box,
  'Brain': Brain,
  'ShieldCheck': ShieldCheck,
  'Target': Target,
  'AlertCircle': AlertCircle,
};

const AIPulse = () => {
  const { analysis: liveAnalysis, selectedUploadId } = useAnalysis();
  const [messages, setMessages] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecommendations();
    const timer = setInterval(fetchRecommendations, 30000); // Refresh every 30 seconds
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchRecommendations();
  }, [liveAnalysis]);

  const fetchRecommendations = async () => {
    try {
      const analysis = liveAnalysis || null;
      if (analysis) {
        const alerts = Array.isArray(analysis.alerts) ? analysis.alerts : [];
        const recs = Array.isArray(analysis.recommendations) ? analysis.recommendations : [];
        const alertMsgs = alerts.map(a => ({
          text: a.message || `${a.type || 'ALERT'}: ${a.product || 'Item'}`,
          icon: 'AlertCircle',
          color: a.type === 'CRITICAL' ? "var(--rose)" : a.type === 'WARNING' ? "var(--blue)" : "var(--emerald)"
        }));
        const recMsgs = recs.map(text => ({
          text,
          icon: 'Activity',
          color: "var(--emerald)"
        }));
        const merged = [...alertMsgs, ...recMsgs].filter(m => m.text).slice(0, 10);
        if (merged.length > 0) {
          setMessages(merged);
          setLoading(false);
          return;
        }
      }

      const response = await api.get('/ai/decisions/');
      if (response.data.decisions && Array.isArray(response.data.decisions)) {
        const msgs = response.data.decisions.map(d => ({
          text: d.explanation || d.title,
          icon: 'AlertCircle',
          color: d.action === 'BUY' ? "var(--blue)" : d.action === 'STOP' ? "var(--rose)" : "var(--emerald)"
        }));
        
        setMessages(msgs.slice(0, 10));
        setLoading(false);
      }
    } catch (error) {
      console.error('Failed to fetch recommendations:', error);
      // Fallback: show generic message
      setMessages([{
        text: "Analyzing current inventory and sales data...",
        icon: 'Activity',
        color: "var(--emerald)"
      }]);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (messages.length === 0) return;
    
    const timer = setInterval(() => {
      setIndex(p => (p + 1) % messages.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [messages.length]);
  
  // Early return for loading or empty state - MUST be after all hooks
  if (loading || messages.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 glass-premium rounded-2xl border border-white/5 overflow-hidden min-h-[140px]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,1)]" />
            Live AI Intelligence
          </span>
        </div>
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 shadow-xl animate-pulse">
            <Activity size={20} className="text-emerald-500" />
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <span className="text-xs font-bold text-white tracking-wide">Processing real-time data analysis...</span>
            <div className="bg-white/5 h-1.5 rounded-full w-full overflow-hidden mt-2 border border-white/5">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 3, ease: "easeInOut", repeat: Infinity }}
                className="h-full bg-emerald-500/60" 
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const msg = messages[index];
  const Icon = ICON_MAP[msg.icon] || AlertCircle;

  return (
    <div className="flex flex-col gap-4 p-4 glass-premium rounded-2xl border border-white/5 overflow-hidden min-h-[140px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,1)]" />
          Live AI Intelligence
        </span>
        <span className="px-2 py-0.5 rounded-md bg-white/5 text-[9px] font-bold text-slate-600 uppercase tracking-tighter">
          Data-Driven Analysis
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div 
          key={index}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex items-start gap-4"
        >
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 shadow-xl" style={{ color: msg.color }}>
            <Icon size={20} />
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <span className="text-xs font-bold text-white tracking-wide line-clamp-2">{msg.text}</span>
            <span className="text-[10px] text-slate-500 font-medium">Based on real transaction data...</span>
            <div className="bg-white/5 h-1.5 rounded-full w-full overflow-hidden mt-2 border border-white/5">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 5, ease: "linear" }}
                className="h-full" 
                style={{ background: msg.color }} 
              />
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default AIPulse;

