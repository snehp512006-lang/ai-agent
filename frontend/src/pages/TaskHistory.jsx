import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
  TrendingUp,
  Wrench,
  Users,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnalysis } from '../context/analysisContext';
import api from '../api/client';

const LAST_ANALYSIS_STORAGE_KEY = 'ai-ops-last-analysis-snapshot';

const statusClassMap = {
  'PENDING': 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  'IN_PROGRESS': 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  'COMPLETED': 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
};

const priorityClassMap = {
  'HIGH': 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
  'MEDIUM': 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  'LOW': 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
};

const timeframeClassMap = {
  'IMMEDIATE': 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
  'SHORT_TERM': 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  'LONG_TERM': 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
};

const typeConfig = {
  'ALERT': { icon: AlertTriangle, color: 'text-rose-400' },
  'RISK': { icon: AlertCircle, color: 'text-amber-400' },
  'FORECAST': { icon: TrendingUp, color: 'text-blue-400' },
  'OPTIMIZATION': { icon: Wrench, color: 'text-emerald-400' },
  'INGESTION': { icon: FileSpreadsheet, color: 'text-cyan-400' },
  'CUSTOMER': { icon: Users, color: 'text-indigo-400' },
};

const toTitle = (raw) => String(raw || '').replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (s) => s.toUpperCase());

const normalizeRiskLabel = (value) => {
  const raw = String(value || '').toUpperCase();
  if (raw.includes('OUT')) return 'OUT OF STOCK';
  if (raw.includes('LOW')) return 'LOW STOCK';
  if (raw.includes('OVER')) return 'OVERSTOCK';
  if (raw.includes('DEAD') || raw.includes('NOT SELLING')) return 'DEADSTOCK';
  if (raw.includes('HEALTHY')) return 'HEALTHY';
  return raw;
};

const formatUnits = (n) => {
  const v = Number(n || 0);
  return Number.isFinite(v) ? Math.round(v) : 0;
};

const timeframeLabel = (timeframe) => {
  if (timeframe === 'IMMEDIATE') return 'Present';
  if (timeframe === 'SHORT_TERM') return 'Next 7 Days';
  return 'Future';
};

const buildProductAction = (product, risk) => {
  const name = String(product?.name || 'Unknown SKU');
  const sku = String(product?.sku || product?.code || product?.product_id || product?.id || '').trim();
  const label = sku ? `${name} (${sku})` : name;
  const sales = formatUnits(product?.sales_velocity ?? product?.avg_sales);
  const stock = formatUnits(product?.current_stock);

  if (risk === 'OUT OF STOCK') {
    return `${label}: Increase procurement immediately (target +30%) and prioritize supplier dispatch; current stock ${stock}, sales velocity ${sales}.`;
  }
  if (risk === 'LOW STOCK') {
    return `${label}: Increase reorder quantity by 15-20% this cycle; current stock ${stock}, sales velocity ${sales}.`;
  }
  if (risk === 'OVERSTOCK') {
    return `${label}: Do not increase purchase next cycle; apply 10-20% markdown to improve sell-through (stock ${stock}, velocity ${sales}).`;
  }
  if (risk === 'DEADSTOCK') {
    return `${label}: Stop new procurement and run aggressive liquidation (25-40% discount / bundle clearance).`;
  }
  return `${label}: Monitor weekly and keep procurement aligned to demand.`;
};

const buildAffectedItems = (productsByRisk, riskLabel, limit = 6) => {
  const source = Array.isArray(productsByRisk[riskLabel]) ? productsByRisk[riskLabel] : [];
  return source
    .slice()
    .sort((a, b) => Number(b?.sales_velocity || b?.avg_sales || 0) - Number(a?.sales_velocity || a?.avg_sales || 0))
    .slice(0, limit)
    .map((p) => {
      const name = String(p?.name || 'Unknown Product');
      const sku = String(p?.sku || p?.code || p?.product_id || p?.id || 'N/A');
      const stock = formatUnits(p?.current_stock);
      const velocity = formatUnits(p?.sales_velocity ?? p?.avg_sales);

      let itemAction = 'Monitor weekly and keep current purchase plan.';
      if (riskLabel === 'OUT OF STOCK') itemAction = 'Create emergency PO and dispatch priority restock.';
      if (riskLabel === 'LOW STOCK') itemAction = 'Increase reorder quantity in this cycle.';
      if (riskLabel === 'OVERSTOCK') itemAction = 'Pause purchase and run markdown/bundle offer.';
      if (riskLabel === 'DEADSTOCK') itemAction = 'Stop purchase and run clearance campaign.';

      return {
        name,
        sku,
        stock,
        velocity,
        itemAction,
      };
    });
};

const buildTasksFromAnalysis = (analysis) => {
  if (!analysis) return [];

  const stock = analysis.stock_analysis || {};
  const products = Array.isArray(analysis.products) ? analysis.products : [];
  const recommendations = Array.isArray(analysis.recommendations) ? analysis.recommendations : [];
  const alerts = Array.isArray(analysis.alerts) ? analysis.alerts : [];
  const forecast = Array.isArray(analysis.demand_forecast)
    ? analysis.demand_forecast
    : (Array.isArray(analysis.forecast?.next_3_months)
      ? analysis.forecast.next_3_months.map((value, idx) => ({ date: `M+${idx + 1}`, predicted_demand: value }))
      : []);
  const confidenceBase = Math.max(50, Math.min(99, Number(analysis.confidence_score || 80)));

  const productsByRisk = products.reduce((acc, p) => {
    const label = normalizeRiskLabel(p?.risk);
    if (!acc[label]) acc[label] = [];
    acc[label].push(p);
    return acc;
  }, {});

  const topRiskProducts = (riskLabel, limit = 8) => {
    const arr = Array.isArray(productsByRisk[riskLabel]) ? productsByRisk[riskLabel] : [];
    return arr
      .slice()
      .sort((a, b) => Number(b?.sales_velocity || 0) - Number(a?.sales_velocity || 0))
      .slice(0, limit)
      .map((p) => buildProductAction(p, riskLabel));
  };

  const candidates = [];
  const pushTask = (task) => {
    if (!task?.title) return;
    candidates.push({
      ...task,
      id: `${task.type}-${task.title}`,
      confidence: Math.max(45, Math.min(99, Number(task.confidence || confidenceBase))),
      proof: Array.isArray(task.proof) ? task.proof.filter(Boolean) : [],
    });
  };

  const outOfStock = Number(stock.out_of_stock_items || 0);
  const lowStock = Number(stock.low_stock_items || 0);
  const deadstock = Number(stock.deadstock_items || 0);
  const overstock = Number(stock.overstock_items || 0);
  const healthy = Number(stock.healthy_items || 0);

  if (outOfStock > 0) {
    pushTask({
      title: `Low Stock Risk Detected in ${outOfStock} SKU${outOfStock > 1 ? 's' : ''}`,
      type: 'RISK',
      priority: 'HIGH',
      status: 'PENDING',
      timeframe: 'IMMEDIATE',
      description: `${outOfStock} products are already out of stock and may impact fulfillment.` ,
      action: 'Order priority SKUs today, move available stock between locations, and prevent missed orders.',
      actionOptions: [
        'Create emergency PO for top-selling SKUs.',
        'Transfer stock from slow branches to fast branches.',
        'Offer substitute SKUs until restock arrives.'
      ],
      proof: [
        `Out of stock items: ${outOfStock}`,
        `Low stock items: ${lowStock}`,
      ],
      affectedItems: buildAffectedItems(productsByRisk, 'OUT OF STOCK', 8),
      productActions: topRiskProducts('OUT OF STOCK'),
      confidence: confidenceBase,
    });
  }

  if (lowStock > 0) {
    pushTask({
      title: `Replenishment Needed for ${lowStock} Low-Stock Item${lowStock > 1 ? 's' : ''}`,
      type: 'ALERT',
      priority: lowStock > 10 ? 'HIGH' : 'MEDIUM',
      status: 'IN_PROGRESS',
      timeframe: 'SHORT_TERM',
      description: `${lowStock} items are approaching risk threshold based on current demand velocity.`,
      action: 'Raise replenishment POs for this week and lock supplier delivery slots.',
      actionOptions: [
        'Build 7-day restock plan using current sell-through.',
        'Increase reorder point for fast SKUs by 10-15%.',
        'Confirm supplier ETA for priority SKUs.'
      ],
      proof: [
        `Low stock items: ${lowStock}`,
        `Analysis confidence: ${Math.round(confidenceBase)}%`,
      ],
      affectedItems: buildAffectedItems(productsByRisk, 'LOW STOCK', 8),
      productActions: topRiskProducts('LOW STOCK'),
      confidence: confidenceBase - 2,
    });
  }

  if (deadstock > 0 || overstock > 0) {
    const total = deadstock + overstock;
    pushTask({
      title: `Overstock Identified in ${total} Product Line${total > 1 ? 's' : ''}`,
      type: 'OPTIMIZATION',
      priority: total > 8 ? 'MEDIUM' : 'LOW',
      status: 'PENDING',
      timeframe: 'SHORT_TERM',
      description: `${deadstock} deadstock and ${overstock} overstock items are tying up working capital.`,
      action: 'Run controlled markdown + bundle plan this week to release blocked cash.',
      actionOptions: [
        'Pause new PO for overstock SKUs until sell-through improves.',
        'Apply 10-25% markdown by ageing bucket.',
        'Bundle slow movers with fast sellers.',
        'Push excess units via B2B/secondary channels.',
        'Reduce next cycle purchase quantity.'
      ],
      proof: [
        `Deadstock count: ${deadstock}`,
        `Overstock count: ${overstock}`,
      ],
      affectedItems: [
        ...buildAffectedItems(productsByRisk, 'OVERSTOCK', 4),
        ...buildAffectedItems(productsByRisk, 'DEADSTOCK', 4),
      ],
      productActions: [
        ...topRiskProducts('OVERSTOCK', 5),
        ...topRiskProducts('DEADSTOCK', 5),
      ],
      confidence: confidenceBase - 3,
    });
  }

  if (forecast.length > 0) {
    const predictedTotal = forecast.reduce((sum, item) => sum + Number(item?.predicted_demand || 0), 0);
    const avgForecast = predictedTotal / Math.max(1, forecast.length);
    pushTask({
      title: 'Demand Spike Predicted for Upcoming Cycle',
      type: 'FORECAST',
      priority: avgForecast > 0 ? 'MEDIUM' : 'LOW',
      status: 'PENDING',
      timeframe: 'LONG_TERM',
      description: `Forecast engine projects average demand near ${Math.round(avgForecast)} units over the next cycle.`,
      action: 'Increase production and purchase planning by 15-20% for fast SKUs.',
      actionOptions: [
        'Increase production target for high-demand SKUs.',
        'Secure raw-material buffer before demand spike.',
        'Pre-position inventory to top conversion zones.'
      ],
      proof: [
        `Forecast data points: ${forecast.length}`,
        `Average predicted demand: ${Math.round(avgForecast)} units`,
      ],
      productActions: forecast
        .slice(0, 5)
        .map((f) => `Forecast ${String(f?.date || f?.day || 'upcoming')}: plan capacity for predicted demand ${formatUnits(f?.predicted_demand)} units.`),
      confidence: confidenceBase - 1,
    });
  }

  alerts.slice(0, 5).forEach((alert, idx) => {
    pushTask({
      title: `${toTitle(alert.type || 'Risk')} Signal: ${alert.product || `Item ${idx + 1}`}`,
      type: 'RISK',
      priority: String(alert.type || '').toUpperCase() === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
      status: 'PENDING',
      timeframe: 'IMMEDIATE',
      description: alert.message || 'AI detected a business-critical exception in uploaded data.',
      action: 'Open affected SKU, verify root cause, and assign same-day owner for closure.',
      actionOptions: [
        'Check stock, sales, and supplier lead-time values.',
        'Assign owner + deadline in current shift.',
        'Escalate critical alerts to operations manager.'
      ],
      proof: [
        `Alert type: ${String(alert.type || 'RISK').toUpperCase()}`,
        `Alert product: ${alert.product || `Item ${idx + 1}`}`,
      ],
      confidence: confidenceBase - 2,
    });
  });

  recommendations.slice(0, 6).forEach((rec, idx) => {
    pushTask({
      title: `Optimization Insight ${idx + 1}`,
      type: idx % 2 === 0 ? 'OPTIMIZATION' : 'FORECAST',
      priority: 'LOW',
      status: 'PENDING',
      timeframe: idx < 2 ? 'SHORT_TERM' : 'LONG_TERM',
      description: rec,
      action: 'Review this recommendation with operations and schedule controlled rollout.',
      actionOptions: [
        'Validate impact against current category baseline.',
        'Run small pilot before full rollout.',
        'Track KPI movement for 7 days.'
      ],
      proof: [`Source: AI recommendation ${idx + 1}`],
      confidence: confidenceBase - 5,
    });
  });

  const churnCustomers = (analysis.customers || []).filter(c => c.risk === 'CHURN_RISK');
  if (churnCustomers.length > 0) {
    pushTask({
      title: `Retention Alert: ${churnCustomers.length} At-Risk Account${churnCustomers.length > 1 ? 's' : ''}`,
      type: 'CUSTOMER',
      priority: 'HIGH',
      status: 'PENDING',
      timeframe: 'IMMEDIATE',
      description: `${churnCustomers.length} valuable customers show a declining purchase trend this month. Contact immediately.`,
      action: 'Reach out to at-risk accounts with personalized retention offers or satisfaction surveys.',
      actionOptions: churnCustomers.slice(0, 10).map(c => 
        `${c.name || c.customer_id}${c.company ? ` (${c.company})` : ''}: ${c.email || 'No email info'} | ${c.phone || 'No phone info'}`
      ),
      confidence: confidenceBase - 4,
      proof: [`At-risk customers: ${churnCustomers.length}`],
      affectedItems: churnCustomers.slice(0, 8).map((c) => ({
        name: String(c?.name || c?.customer_id || 'Customer'),
        sku: String(c?.company || 'Direct Account'),
        stock: Number.isFinite(Number(c?.total_purchase)) ? formatUnits(c.total_purchase) : 'N/A',
        velocity: c?.last_purchase_date ? String(c.last_purchase_date) : 'N/A',
        itemAction: 'Call this account and offer retention plan immediately.',
      })),
    });
  }

  if (healthy > 0 && candidates.length === 0) {
    pushTask({
      title: 'System Optimized',
      type: 'OPTIMIZATION',
      priority: 'LOW',
      status: 'COMPLETED',
      timeframe: 'IMMEDIATE',
      description: `No active risks detected across ${healthy} healthy inventory records.`,
      action: 'Maintain current strategy and continue periodic monitoring.',
      actionOptions: [
        'Keep procurement and pricing policy unchanged this cycle.',
        'Continue weekly monitoring to catch early deviations.',
        'Document current strategy as benchmark playbook.'
      ],
      confidence: confidenceBase,
      proof: [`Healthy items: ${healthy}`],
    });
  }

  const unique = new Map();
  candidates.forEach((task) => {
    if (!unique.has(task.id)) unique.set(task.id, task);
  });
  return Array.from(unique.values());
};

const TaskHistory = () => {
  const { analysis, latestMeta, selectedUploadId } = useAnalysis();
  const [viewFilter, setViewFilter] = useState('all');
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [historyTasks, setHistoryTasks] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [analysisSnapshot, setAnalysisSnapshot] = useState(null);

  useEffect(() => {
    if (analysis) {
      setAnalysisSnapshot(analysis);
      return;
    }

    let cancelled = false;

    const loadFallback = async () => {
      let fallback = null;
      try {
        const raw = localStorage.getItem(LAST_ANALYSIS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          fallback = parsed?.analysis ?? parsed?.payload?.analysis ?? parsed;
        }
      } catch {
        fallback = null;
      }

      if (!fallback && selectedUploadId) {
        try {
          const res = await api.get(`/ingestion/upload-analysis/${selectedUploadId}/`);
          fallback = res?.data?.analysis || null;
        } catch {
          fallback = null;
        }
      }

      if (!fallback) {
        try {
          const res = await api.get('/ingestion/latest-analysis/');
          fallback = res?.data?.analysis || null;
        } catch {
          fallback = null;
        }
      }

      if (!cancelled && fallback) {
        setAnalysisSnapshot(fallback);
      }
    };

    loadFallback();
    return () => {
      cancelled = true;
    };
  }, [analysis, selectedUploadId]);

  useEffect(() => {
    const fetchPastTasks = async () => {
      setAuditLoading(true);
      setAuditError('');
      try {
        let uploads = [];
        let cleaner = [];
        try {
          const res = await api.get('/ingestion/uploads-list/?limit=120');
          uploads = Array.isArray(res?.data) ? res.data : [];
        } catch {
          uploads = [];
        }

        try {
          const runRes = await api.get('/ingestion/data-cleaner-runs/?limit=120');
          const rawCleaner = Array.isArray(runRes?.data)
            ? runRes.data
            : Array.isArray(runRes?.data?.results)
              ? runRes.data.results
              : [];
          cleaner = rawCleaner;
        } catch {
          cleaner = [];
        }

        const uploadsCombined = [...uploads, ...cleaner];

        const completed = uploadsCombined
          .filter((item) => ['COMPLETED', 'SUCCESS', 'FAILED'].includes(String(item.analysis_status || '').toUpperCase()))
          .slice(0, 20)
          .map((item) => ({
            id: `past-upload-${item.id}`,
            title: `Analysis ${String(item.analysis_status || 'COMPLETED')}: ${item.file_name || `Upload ${item.id}`}`,
            type: 'INGESTION',
            priority: String(item.analysis_status || '').toUpperCase() === 'FAILED' ? 'MEDIUM' : 'LOW',
            status: 'COMPLETED',
            timeframe: 'IMMEDIATE',
            description: `Upload ${item.id} processed using ingestion + analysis pipeline.`,
            action: 'Open Data Cleaner or Past Results to inspect full analysis output for this upload.',
            actionOptions: [
              `File: ${item.file_name || 'N/A'}`,
              `Type: ${item.file_type || 'N/A'}`,
              `Completed: ${item.completed_at || 'N/A'}`,
            ],
            confidence: Number(
              item?.confidence_score
              ?? item?.analysis?.confidence_score
              ?? item?.aggregate_accuracy
              ?? 0
            ) || 0,
            proof: [
              `Analysis status: ${String(item.analysis_status || 'COMPLETED').toUpperCase()}`,
              `Upload id: ${item.id ?? 'N/A'}`,
            ],
            auditDetails: item,
          }));

        setHistoryTasks(completed);
      } catch {
        setAuditError('Unable to load upload history right now.');
        setHistoryTasks([]);
      } finally {
        setAuditLoading(false);
      }
    };

    fetchPastTasks();
  }, []);

  const tasks = useMemo(() => buildTasksFromAnalysis(analysisSnapshot), [analysisSnapshot]);

  const grouped = useMemo(() => {
    const present = tasks.filter((task) => task.status !== 'COMPLETED' && (task.timeframe === 'IMMEDIATE' || task.timeframe === 'SHORT_TERM'));
    const future = tasks.filter((task) => task.status !== 'COMPLETED' && task.timeframe === 'LONG_TERM');
    const pastFromCurrent = tasks.filter((task) => task.status === 'COMPLETED');
    const past = [...pastFromCurrent, ...historyTasks];
    const uniquePast = Array.from(new Map(past.map((p) => [p.id, p])).values());
    return { present, future, past: uniquePast };
  }, [tasks, historyTasks]);

  const taskOverview = useMemo(() => {
    const allVisible = [...grouped.present, ...grouped.future, ...grouped.past];
    const highPriority = allVisible.filter((t) => String(t.priority).toUpperCase() === 'HIGH').length;
    const confidenceValues = allVisible
      .map((t) => Number(t.confidence))
      .filter((v) => Number.isFinite(v) && v > 0);
    const avgConfidence = confidenceValues.length
      ? confidenceValues.reduce((s, v) => s + v, 0) / confidenceValues.length
      : 0;

    return {
      present: grouped.present.length,
      future: grouped.future.length,
      completed: grouped.past.length,
      highPriority,
      avgConfidence,
    };
  }, [grouped]);

  const isAnalyzing = Boolean(latestMeta?.uploadId) && latestMeta?.status && latestMeta.status !== 'COMPLETED';
  const progress = latestMeta?.status === 'PROCESSING' ? 72 : latestMeta?.status === 'UPLOADING' ? 38 : 18;

  const renderTaskCard = (task, idx) => {
    const cfg = typeConfig[task.type] || typeConfig.ALERT;
    const Icon = cfg.icon;
    const isExpanded = expandedTaskId === task.id;
    const realActions = Array.isArray(task.productActions) && task.productActions.length > 0 ? task.productActions : null;
    const actions = (realActions || (Array.isArray(task.actionOptions) && task.actionOptions.length > 0 ? task.actionOptions : [task.action]));
    const proof = Array.isArray(task.proof) ? task.proof.slice(0, isExpanded ? 4 : 2) : [];
    const hasAffectedItems = Array.isArray(task.affectedItems) && task.affectedItems.length > 0;
    const affectedItemsToShow = hasAffectedItems
      ? task.affectedItems.slice(0, isExpanded ? Math.max(task.affectedItems.length, 8) : 3)
      : [];
    return (
      <motion.div
        key={task.id}
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ delay: idx * 0.03 }}
        className={`rounded-2xl border transition-all cursor-pointer ${isExpanded ? 'p-6 border-emerald-300 bg-gradient-to-br from-emerald-50/70 via-white to-white shadow-[0_16px_34px_rgba(16,185,129,0.12)]' : 'p-5 border-slate-200 bg-white hover:border-emerald-300 hover:shadow-[0_10px_22px_rgba(15,23,42,0.08)]'}`}
        onClick={() => setExpandedTaskId((prev) => (prev === task.id ? null : task.id))}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[var(--bg-accent)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
              <Icon size={18} className={cfg.color} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <h4 className="text-sm font-bold text-[var(--text-main)] truncate">{task.title}</h4>
                <span className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest">{task.type}</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-2">{task.description}</p>
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Direct Action</p>
                <p className="text-xs text-slate-700 leading-relaxed">{task.action || 'Execute in sequence and verify result daily.'}</p>
              </div>
              {hasAffectedItems && (
                <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700 mb-2">Specific Items and What To Do</p>
                  <div className="space-y-2">
                    {affectedItemsToShow.map((item, itemIdx) => (
                      <div key={`${task.id}-affected-${itemIdx}`} className="rounded-lg border border-indigo-200/80 bg-white px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] font-black text-slate-900">{item.name}</p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{item.sku}</p>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-slate-600">
                          <span>Stock: <strong>{item.stock}</strong></span>
                          <span>Velocity/Last: <strong>{item.velocity}</strong></span>
                        </div>
                        <p className="mt-1 text-[11px] text-indigo-700 font-semibold">{item.itemAction}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-2">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-emerald-400 mb-2">
                  <ArrowRight size={13} />
                  {realActions ? 'Real Product Actions' : task.status === 'COMPLETED' ? 'Action Taken' : 'Suggested Actions'}
                </div>
                <ul className="space-y-1.5">
                  {actions
                    .slice(0, isExpanded ? Math.max(actions.length, 8) : 3)
                    .map((item, actionIdx) => (
                    <li key={`${task.id}-action-${actionIdx}`} className="text-xs text-[var(--text-muted)] leading-relaxed flex items-start gap-2">
                      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                {(realActions || (Array.isArray(task.actionOptions) && task.actionOptions.length > 3)) && (
                  <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1">
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {isExpanded ? 'Show Less' : 'More Actions Available'}
                  </div>
                )}
                {proof.length > 0 && (
                  <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-700 mb-1">Data Proof</p>
                    <ul className="space-y-1">
                      {proof.map((item, pIdx) => (
                        <li key={`${task.id}-proof-${pIdx}`} className="text-[11px] text-blue-800 leading-relaxed">- {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {isExpanded && (
                  <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">What We Will Do</p>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">{task.action || 'Execute these actions in priority order and monitor results daily.'}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${statusClassMap[task.status] || statusClassMap.PENDING}`}>
              {toTitle(task.status)}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${priorityClassMap[task.priority] || priorityClassMap.MEDIUM}`}>
              {task.priority}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${timeframeClassMap[task.timeframe] || timeframeClassMap.SHORT_TERM}`}>
              {timeframeLabel(task.timeframe)}
            </span>
            <div className="text-[10px] font-black text-[var(--text-dim)] uppercase tracking-widest">
              Confidence {Number(task.confidence) > 0 ? `${Math.round(Number(task.confidence))}%` : 'N/A'}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-10 pb-20">
      <div className="flex items-end justify-between px-2">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-main)] mb-2">Action Plan</h1>
          <p className="text-[var(--text-muted)] text-xs font-medium flex items-center gap-2">
            <BrainCircuit size={14} className="text-emerald-500" />
            AI-generated tasks based on your uploaded data — what to do now, next, and later
          </p>
        </div>

        <div className="flex bg-[var(--bg-accent)] p-1.5 rounded-2xl border border-[var(--border-subtle)]">
          {['all', 'present', 'future', 'past'].map(tab => (
            <button
              key={tab}
              onClick={() => setViewFilter(tab)}
              className={`px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                viewFilter === tab ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {isAnalyzing && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-premium p-8 rounded-3xl"
          >
            <div className="flex items-center gap-3 mb-3">
              <Loader2 size={18} className="text-emerald-500 animate-spin" />
              <h3 className="text-lg font-bold text-[var(--text-main)]">AI is analyzing your data...</h3>
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-5">Detecting stock risk, demand shifts, and optimization opportunities.</p>
            <div className="h-2 w-full bg-[var(--bg-accent)] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8 }}
                className="h-full bg-emerald-500"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isAnalyzing && (tasks.length > 0 || historyTasks.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Present Tasks</p>
            <p className="text-2xl font-black text-emerald-800 mt-1">{taskOverview.present}</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-blue-700">Future Tasks</p>
            <p className="text-2xl font-black text-blue-800 mt-1">{taskOverview.future}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-amber-700">Completed</p>
            <p className="text-2xl font-black text-amber-800 mt-1">{taskOverview.completed}</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-rose-700">High Priority</p>
            <p className="text-2xl font-black text-rose-800 mt-1">{taskOverview.highPriority}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Avg Confidence</p>
            <p className="text-2xl font-black text-slate-800 mt-1">{taskOverview.avgConfidence > 0 ? `${Math.round(taskOverview.avgConfidence)}%` : 'N/A'}</p>
          </div>
        </div>
      )}

      {!isAnalyzing && tasks.length === 0 && historyTasks.length === 0 && (
        <div className="glass-premium p-10 rounded-3xl text-center">
          <CheckCircle2 size={26} className="text-emerald-500 mx-auto mb-3" />
          <h3 className="text-xl font-bold text-[var(--text-main)] mb-2">No risks detected. System optimized.</h3>
          <p className="text-sm text-[var(--text-muted)]">Upload a dataset to let AI generate current, upcoming, and future actions.</p>
        </div>
      )}

      {!isAnalyzing && (tasks.length > 0 || historyTasks.length > 0) && (
        <div className="space-y-8">
          {(auditLoading || auditError) && (
            <div className="glass-premium rounded-2xl p-4 border border-[var(--border-subtle)]">
              {auditLoading && <p className="text-xs text-[var(--text-muted)]">Loading full sheet audit results...</p>}
              {!auditLoading && auditError && <p className="text-xs text-amber-400">{auditError}</p>}
            </div>
          )}

          {(viewFilter === 'all' || viewFilter === 'present') && (
            <section>
              <h3 className="text-sm font-black text-emerald-400 uppercase tracking-widest mb-3">Do Now — Immediate Actions</h3>
              <div className="space-y-3">
                <AnimatePresence>
                  {grouped.present.map((task, idx) => renderTaskCard(task, idx))}
                </AnimatePresence>
                {grouped.present.length === 0 && <p className="text-xs text-[var(--text-muted)]">No immediate actions needed right now.</p>}
              </div>
            </section>
          )}

          {(viewFilter === 'all' || viewFilter === 'future') && (
            <section>
              <h3 className="text-sm font-black text-blue-400 uppercase tracking-widest mb-3">Upcoming — Plan Ahead</h3>
              <div className="space-y-3">
                <AnimatePresence>
                  {grouped.future.map((task, idx) => renderTaskCard(task, idx))}
                </AnimatePresence>
                {grouped.future.length === 0 && <p className="text-xs text-[var(--text-muted)]">No upcoming actions predicted at this time.</p>}
              </div>
            </section>
          )}

          {(viewFilter === 'all' || viewFilter === 'past') && (
            <section>
              <h3 className="text-sm font-black text-amber-400 uppercase tracking-widest mb-3">Completed — Done Tasks</h3>
              <div className="space-y-3">
                <AnimatePresence>
                  {grouped.past.map((task, idx) => renderTaskCard(task, idx))}
                </AnimatePresence>
                {grouped.past.length === 0 && <p className="text-xs text-[var(--text-muted)]">No completed tasks yet. Actions will appear here after execution.</p>}
              </div>
            </section>
          )}
        </div>
      )}

      {!analysis && !isAnalyzing && (
        <div className="glass-premium p-8 rounded-3xl text-center">
          <Clock size={20} className="text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--text-muted)]">No analysis available yet. Upload data in Data Cleaner to generate AI tasks.</p>
        </div>
      )}
    </div>
  );
};

export default TaskHistory;
