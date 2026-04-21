import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mail, 
  Send, 
  Sparkles, 
  Loader2, 
  Copy, 
  CheckCircle2, 
  MessageSquare,
  FileText,
  AtSign,
  Briefcase
} from 'lucide-react';
import api from '../api/client';

const EmailAgent = () => {
  const [formData, setFormData] = useState({
    user_email_address: '',
    user_email: '',
    conversation_history: '',
    project_context: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copiedData, setCopiedData] = useState(false);

  const handleCopy = () => {
    if (result?.body) {
      navigator.clipboard.writeText(`Subject: ${result.subject}\n\n${result.body}`);
      setCopiedData(true);
      setTimeout(() => setCopiedData(false), 2000);
    }
  };

  const generateResponse = async () => {
    if (!formData.user_email_address || !formData.user_email) return;

    setLoading(true);
    setResult(null);

    try {
      // Send the request relative to backend endpoint
      // Using /email-agent/generate/ assuming backend paths mapped to views.py
      // Depending on urls.py we might need just '/email_agent/generate/' or similar
      // Notice: Will rely on standard api client which usually hits /api/
      // Need to make sure endpoint is correct -> standard assumption: `/email-agent/generate/`
      const res = await api.post('/email/generate/', formData);
      setResult(res.data);
    } catch (error) {
      console.error('Error generating email:', error);
      setResult({
        subject: "Generation Error",
        body: "Failed to connect to the Gemini AI backend. Please verify your GEMINI_API_KEY and backend services.",
        metadata: { ai_confidence: "0.00" }
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-theme(spacing.24))] w-full bg-[var(--bg-base)] p-6 flex flex-col items-center">
      <div className="w-full max-w-7xl flex items-center justify-between mb-8 px-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.15)]">
               <Sparkles size={20} className="text-emerald-500" strokeWidth={2.5}/>
            </div>
            <h1 className="text-2xl font-black text-[var(--text-main)] tracking-tight flex items-center gap-3">
               AI Agent Intelligence 
               <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest text-emerald-500 translate-y-[1px]">
                 Gemini 2.0 Flash
               </span>
            </h1>
          </div>
          <p className="text-slate-500 text-sm font-medium tracking-wide">Autonomous Context-Aware Email Response Engine</p>
        </div>
      </div>

      <div className="flex-1 w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-8 relative px-4 pb-12">
        {/* LEFT PANE: Input context */}
        <div className="flex flex-col gap-6 w-full max-h-full">
          <div className="bg-white rounded-3xl p-8 border border-emerald-500/10 shadow-2xl flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">
             
             <div className="space-y-4">
               <label className="flex items-center gap-2 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest pl-1">
                 <AtSign size={14} /> Sender Email Address *
               </label>
               <input 
                 value={formData.user_email_address}
                 onChange={e => setFormData({...formData, user_email_address: e.target.value})}
                 placeholder="client@enterprise.com"
                 className="w-full bg-[var(--bg-accent)] border border-[var(--border-subtle)] rounded-2xl px-5 py-4 text-sm font-medium text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all placeholder:text-[var(--text-dim)]"
               />
             </div>

              <div className="space-y-4 flex-1 flex flex-col">
                <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                  <Mail size={14} /> Incoming Message *
                </label>
                <textarea 
                  value={formData.user_email}
                  onChange={e => setFormData({...formData, user_email: e.target.value})}
                  placeholder="Paste the email content you want the AI to reply to..."
                  className="flex-1 min-h-[160px] w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all resize-none placeholder:text-slate-400 custom-scrollbar"
                />
              </div>
             
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-4">
                 <label className="flex items-center gap-2 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest pl-1">
                   <Briefcase size={14} /> Project Context
                 </label>
                 <textarea 
                   value={formData.project_context}
                   onChange={e => setFormData({...formData, project_context: e.target.value})}
                   placeholder="e.g. Contract negotiation for Q4."
                   className="h-28 w-full bg-[var(--bg-accent)] border border-[var(--border-subtle)] rounded-2xl px-4 py-3 text-xs font-medium text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all resize-none placeholder:text-[var(--text-dim)] custom-scrollbar"
                 />
               </div>
               <div className="space-y-4">
                 <label className="flex items-center gap-2 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest pl-1">
                   <MessageSquare size={14} /> Thread History
                 </label>
                 <textarea 
                   value={formData.conversation_history}
                   onChange={e => setFormData({...formData, conversation_history: e.target.value})}
                   placeholder="Prior context..."
                   className="h-28 w-full bg-[var(--bg-accent)] border border-[var(--border-subtle)] rounded-2xl px-4 py-3 text-xs font-medium text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all resize-none placeholder:text-[var(--text-dim)] custom-scrollbar"
                 />
               </div>
             </div>

             <button
                onClick={generateResponse}
                disabled={loading || !formData.user_email || !formData.user_email_address}
                className="mt-2 w-full flex items-center justify-center gap-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/30 text-white dark:text-emerald-950 font-black tracking-widest uppercase text-xs rounded-2xl py-5 transition-all active:scale-[0.98]"
             >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                {loading ? 'Synthesizing Response...' : 'Generate AI Reply'}
             </button>
          </div>
        </div>

        {/* RIGHT PANE: Output Result */}
        <div className="flex flex-col w-full h-full relative">
           <AnimatePresence mode="wait">
             {!result && !loading && (
               <motion.div 
                 key="empty"
                 initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                 className="absolute inset-0 flex flex-col items-center justify-center bg-transparent border-2 border-dashed border-slate-200 dark:border-white/10 rounded-3xl"
               >
                  <div className="w-20 h-20 rounded-3xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/5 flex items-center justify-center text-slate-300 dark:text-slate-700 mb-6 relative">
                     <FileText size={32} strokeWidth={1.5} />
                     <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white border-4 border-slate-50 dark:border-slate-950 shadow-lg">
                        <Sparkles size={12} fill="currentColor" />
                     </div>
                  </div>
                  <h3 className="text-lg font-black text-[var(--text-muted)] tracking-tight">Awaiting Parameters</h3>
                  <p className="text-sm font-medium text-slate-400 dark:text-slate-600 max-w-xs text-center mt-2">Provide context and the client's email to instantly draft a highly personalized, contextual reply.</p>
               </motion.div>
             )}

             {loading && (
               <motion.div
                 key="loading"
                 initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                 className="absolute inset-0 flex flex-col items-center justify-center bg-white/50 dark:bg-[#0a0f1c]/50 border border-emerald-500/20 rounded-3xl z-10"
               >
                  <div className="w-24 h-24 mb-6 relative flex items-center justify-center">
                    <div className="absolute inset-0 border-4 border-emerald-500/10 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-emerald-500 rounded-full border-t-transparent animate-spin"></div>
                    <Sparkles size={32} className="text-emerald-500 animate-pulse" />
                  </div>
                  <div className="text-emerald-500 font-black tracking-[0.2em] uppercase text-xs">Gemini Flash Active</div>
                  <p className="text-slate-500 text-sm font-medium mt-3">Analyzing sentiment and cross-referencing context...</p>
               </motion.div>
             )}

              {result && !loading && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col h-full bg-white rounded-3xl border border-emerald-500/30 overflow-hidden shadow-2xl"
                >
                  <div className="flex items-center justify-between px-8 py-5 border-b border-emerald-50 bg-emerald-50/30">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[9px] font-black tracking-widest uppercase">
                         <CheckCircle2 size={12} /> Response Ready
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Confidence: <span className="text-emerald-500 font-black">{result?.metadata?.ai_confidence || "High"}</span>
                      </span>
                    </div>
                    <button 
                      onClick={handleCopy}
                      className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-emerald-500 transition-colors"
                    >
                      {copiedData ? <span className="text-emerald-500 flex items-center gap-1"><CheckCircle2 size={14}/> Copied!</span> : <><Copy size={14} /> Copy Thread</>}
                    </button>
                 </div>

                  <div className="p-8 pb-4 border-b border-emerald-50">
                     <label className="block text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-2">Generated Subject</label>
                     <div className="text-lg font-bold text-slate-900 tracking-tight">
                        {result?.subject}
                     </div>
                  </div>

                  <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                     <label className="block text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-4">Email Draft</label>
                     <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-800 font-medium font-sans">
                        {result?.body}
                     </div>
                  </div>
                 
                 {result?.metadata?.context_utilized?.length > 0 && (
                 <div className="px-8 py-4 bg-[var(--bg-sidebar)] border-t border-slate-200 dark:border-white/5">
                    <div className="flex flex-wrap gap-2">
                       <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">Context Tags:</span>
                       {result.metadata.context_utilized.map((tag, i) => (
                         <span key={i} className="text-[9px] font-bold px-2 py-0.5 rounded pl-1.5 uppercase tracking-wider bg-white/10 text-slate-400">#{tag}</span>
                       ))}
                    </div>
                 </div>
                 )}
               </motion.div>
             )}
           </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default EmailAgent;
