import React from 'react';
import { CheckCircle2, AlertCircle, Sparkles, Database, ArrowRight, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

const AnalysisSummaryPanel = ({
  hybridResult,
  analysisCards,
  rankedAlerts,
  isLockedSnapshotActive = false,
  onCommit,
  onResetToIdle,
}) => {
  if (!hybridResult) return null;
  const parsedSalesTotal = Number(analysisCards?.salesTotal);
  const formattedSalesTotal = Number.isFinite(parsedSalesTotal)
    ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(parsedSalesTotal)
    : String(analysisCards?.salesTotal ?? 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto"
    >
      <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-[2.5rem] p-8 backdrop-blur-md relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
          <Sparkles size={80} className="text-blue-400" />
        </div>

        <div className="flex flex-col md:flex-row gap-12 relative z-10">
          <div className="md:w-2/3 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-blue-400 text-[10px] font-black uppercase tracking-widest">
                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                Model Check Active
              </div>
            </div>
            <h2 className="text-3xl font-black tracking-tight text-white leading-tight">Analysis Result</h2>
            <div className="flex items-center gap-4 pt-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                <CheckCircle2 size={16} className={hybridResult.confidence_score >= 75 ? 'text-emerald-400' : 'text-amber-400'} />
                AI Confidence: {String(hybridResult.confidence_score ?? 'N/A')}%
                <span className="ml-1 opacity-50">({hybridResult.confidence_score >= 75 ? 'TRUSTED' : 'REVIEW REQUIRED'})</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-slate-700" />
              <div className="text-xs font-bold text-slate-400">Pipeline: 11-Phase COO Engine</div>
              {isLockedSnapshotActive && (
                <>
                  <div className="w-1 h-1 rounded-full bg-slate-700" />
                  <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                    Locked Snapshot
                  </div>
                </>
              )}
            </div>

            {hybridResult.metadata?.ingestion_report?.length > 0 && (
              <div className="mt-4 p-4 border border-rose-500/20 bg-rose-500/5 rounded-2xl">
                <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <AlertCircle size={12} />
                  AI Audit Warnings ({hybridResult.metadata.ingestion_report.filter((r) => r.includes('WARNING')).length})
                </h4>
                <ul className="space-y-1">
                  {hybridResult.metadata.ingestion_report.map((report, i) => (
                    <li key={i} className="text-[10px] text-slate-400 font-medium list-disc ml-4">{report}</li>
                  ))}
                </ul>

                {Array.isArray(hybridResult.metadata?.sheet_diagnostics) && hybridResult.metadata.sheet_diagnostics.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-rose-500/20">
                    <h5 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Multi-Sheet Diagnostics</h5>
                    <div className="space-y-2">
                      {hybridResult.metadata.sheet_diagnostics.map((sheet, idx) => (
                        <div key={`${sheet.sheet_name}-${idx}`} className="text-[10px] text-slate-300 bg-white/5 border border-white/10 rounded-xl p-2">
                          <div className="font-black uppercase tracking-wider text-slate-200">{sheet.sheet_name} | {sheet.classification}</div>
                          <div className="text-slate-400">rows: {sheet.rows_after_clean}/{sheet.raw_rows} | confidence: {sheet.confidence}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(hybridResult.metadata?.sheet_analysis_summary) && hybridResult.metadata.sheet_analysis_summary.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-blue-500/20">
                    <h5 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">Sheet Contribution Matrix</h5>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {hybridResult.metadata.sheet_analysis_summary.map((sheet, idx) => (
                        <div key={`${sheet.sheet_name}-${idx}`} className="text-[10px] text-slate-300 bg-white/5 border border-white/10 rounded-xl p-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-black uppercase tracking-wider text-slate-200 truncate">{sheet.sheet_name} | {sheet.sheet_type}</div>
                            <div className="text-slate-400">
                              raw: {sheet.raw_rows} | normalized: {sheet.normalized_rows} | P/S/R/U: {sheet.purchase_rows}/{sheet.sale_rows}/{sheet.return_rows}/{sheet.unknown_rows}
                            </div>
                          </div>
                          <div className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider ${sheet.contributed_to_final_analysis ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>
                            {sheet.contributed_to_final_analysis ? 'Contributed' : 'No Contribution'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}


          </div>

          <div className="md:w-1/3 space-y-4">
            <h4 className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Top Recommendations</h4>
            <div className="space-y-2">
              {hybridResult.recommendations?.map((rec, i) => (
                <div key={i} className="flex items-start gap-3 bg-[var(--bg-accent)] p-3 rounded-xl border border-[var(--border-subtle)] hover:border-blue-500/20 transition-all">
                  <ArrowRight size={14} className="mt-0.5 text-blue-400 shrink-0" />
                  <span className="text-xs text-[var(--text-muted)] font-medium">{rec}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="rounded-[2rem] border border-white/10 bg-white/5 backdrop-blur-md p-6 shadow-[0_8px_32px_rgba(0,0,0,0.1)] min-h-[220px] transition-all hover:bg-white/[0.08] hover:border-white/20">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <Zap size={16} className="text-blue-400" />
              </div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Sales Overview</div>
            </div>
            <div className="space-y-1">
              <div className="text-[42px] leading-tight font-black text-white tabular-nums tracking-tighter">{formattedSalesTotal}</div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 font-bold uppercase tracking-widest">Trend Analysis:</span>
                <span className="text-[11px] text-blue-400 font-black uppercase tracking-widest font-mono">{String(analysisCards.salesTrend)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/5 backdrop-blur-md p-6 shadow-[0_8px_32px_rgba(0,0,0,0.1)] min-h-[220px] transition-all hover:bg-white/[0.08] hover:border-white/20">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20">
                <Database size={16} className="text-orange-400" />
              </div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Stock Status</div>
            </div>
            {analysisCards.schemaStatus === 'MAPPING_REQUIRED' ? (
              <div className="flex flex-col items-center justify-center h-24 text-center">
                <AlertCircle size={20} className="text-amber-500/50 mb-2" />
                <div className="text-[10px] text-amber-500/70 font-black uppercase tracking-widest">Mapping Required</div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <div className="flex flex-col"><span className="text-[9px] font-black text-rose-500/70 uppercase tracking-widest mb-1">Out of Stock</span><span className="text-xl font-black text-white font-mono leading-none">{analysisCards.outOfStock}</span></div>
                  <div className="flex flex-col"><span className="text-[9px] font-black text-rose-400/70 uppercase tracking-widest mb-1">Low Stock</span><span className="text-xl font-black text-white font-mono leading-none">{analysisCards.lowStock}</span></div>
                  <div className="flex flex-col"><span className="text-[9px] font-black text-orange-400/70 uppercase tracking-widest mb-1">Deadstock</span><span className="text-xl font-black text-white font-mono leading-none">{analysisCards.deadstockCount}</span></div>
                  <div className="flex flex-col"><span className="text-[9px] font-black text-blue-400/70 uppercase tracking-widest mb-1">Overstock</span><span className="text-xl font-black text-white font-mono leading-none">{analysisCards.overStock}</span></div>
                </div>
                <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Healthy Inventory</span>
                  <span className="text-xs font-black text-emerald-400 font-mono">{analysisCards.healthy} Items</span>
                </div>
              </>
            )}
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/5 backdrop-blur-md p-6 shadow-[0_8px_32px_rgba(0,0,0,0.1)] min-h-[220px] transition-all hover:bg-white/[0.08] hover:border-white/20 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20"><AlertCircle size={16} className="text-rose-400" /></div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Priority Alerts</div>
              </div>
              {rankedAlerts.length > 0 && (
                <div className="px-2 py-0.5 rounded-md bg-white/5 text-[8px] font-black text-slate-500 uppercase tracking-widest">Top 5</div>
              )}
            </div>
            {rankedAlerts.length > 0 ? (
              <div className="space-y-2 overflow-y-auto max-h-[120px] pr-2 custom-scrollbar">
                {rankedAlerts.map((alert, idx) => {
                  const isCritical = String(alert.type || '').toUpperCase().includes('CRITICAL');
                  return (
                    <div key={idx} className={`group/alert flex items-center justify-between p-2.5 rounded-xl border transition-all ${isCritical ? 'bg-rose-500/5 border-rose-500/10 hover:bg-rose-500/10' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                      <div className="flex flex-col min-w-0">
                        <span className={`text-[8px] font-black uppercase tracking-tighter ${isCritical ? 'text-rose-400' : 'text-slate-500'}`}>{alert.type}</span>
                        <span className="text-[11px] font-bold text-slate-200 truncate pr-2">{alert.product}</span>
                      </div>
                      <ArrowRight size={12} className={`shrink-0 transition-transform group-hover/alert:translate-x-1 ${isCritical ? 'text-rose-400/50' : 'text-slate-600'}`} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30">
                <div className="w-8 h-8 rounded-full border border-dashed border-slate-500 mb-2" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">No telemetry data</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default AnalysisSummaryPanel;
