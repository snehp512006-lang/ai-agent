import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import GlassCard from '../components/GlassCard';
import PredictionChart from '../components/PredictionChart';
import {
  TrendingUp,
  BarChart3,
  Zap,
  Activity,
  Box,
  X,
  Eye,
  List,
  Search,
  ChevronDown,
  Filter,
  Package,
  AlertTriangle,
  TrendingDown,
  Star,
  SlidersHorizontal,
  Clock,
  CheckCircle2,
  Tag,
  Calendar,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
} from 'recharts';
import api from '../api/client';
import { useAnalysis } from '../context/analysisContext';

// ─── Status config for forecast items ──────────────────────────────────────
const FORECAST_STATUS = {
  HIGH_DEMAND: {
    label: 'High Demand',
    description: 'This product is forecasted to have strong sales this period.',
    badge: 'High Demand',
    badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-500/30',
    bg: 'bg-emerald-50 dark:bg-emerald-500/5',
    accent: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    icon: TrendingUp,
    dotColor: 'bg-emerald-500',
  },
  MODERATE: {
    label: 'Moderate Demand',
    description: 'Steady demand expected with minor fluctuations.',
    badge: 'Moderate',
    badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-500/30',
    bg: 'bg-blue-50 dark:bg-blue-500/5',
    accent: 'bg-blue-500',
    text: 'text-blue-600 dark:text-blue-400',
    icon: SlidersHorizontal,
    dotColor: 'bg-blue-500',
  },
  LOW_DEMAND: {
    label: 'Low Demand',
    description: 'Sales forecast below average — consider reducing stock.',
    badge: 'Low Demand',
    badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-500/30',
    bg: 'bg-amber-50 dark:bg-amber-500/5',
    accent: 'bg-amber-400',
    text: 'text-amber-600 dark:text-amber-400',
    icon: TrendingDown,
    dotColor: 'bg-amber-400',
  },
  CRITICAL: {
    label: 'Critical Low',
    description: 'Forecast shows near-zero demand — review stocking plan.',
    badge: 'Critical',
    badgeColor: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
    border: 'border-red-200 dark:border-red-500/30',
    bg: 'bg-red-50 dark:bg-red-500/5',
    accent: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
    icon: AlertTriangle,
    dotColor: 'bg-red-500',
  },
  NEW_ITEM: {
    label: 'New Item',
    description: 'First forecast cycle — limited historical data available.',
    badge: 'New',
    badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-500/30',
    bg: 'bg-purple-50 dark:bg-purple-500/5',
    accent: 'bg-purple-500',
    text: 'text-purple-600 dark:text-purple-400',
    icon: Star,
    dotColor: 'bg-purple-500',
  },
};

const DEFAULT_FORECAST_STATUS = {
  label: 'Analyzing',
  description: 'Forecast being computed…',
  badge: 'Pending',
  badgeColor: 'bg-slate-100 text-slate-600',
  border: 'border-slate-200 dark:border-white/10',
  bg: 'bg-slate-50 dark:bg-white/5',
  accent: 'bg-slate-400',
  text: 'text-slate-500',
  icon: Clock,
  dotColor: 'bg-slate-400',
};

const getForecastStatus = (product) => {
  const total = (product.weeks || []).reduce((s, w) => s + Number(w.demand || 0), 0);
  const avg = total / Math.max(1, (product.weeks || []).length);
  if (avg === 0) return FORECAST_STATUS.CRITICAL;
  if (avg < 20) return FORECAST_STATUS.LOW_DEMAND;
  if (avg < 60) return FORECAST_STATUS.MODERATE;
  return FORECAST_STATUS.HIGH_DEMAND;
};

// ─── Tabs ────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'ALL', label: 'All Products', icon: Package },
  { id: 'HIGH_DEMAND', label: 'High Demand', icon: TrendingUp },
  { id: 'MODERATE', label: 'Moderate', icon: SlidersHorizontal },
  { id: 'LOW_DEMAND', label: 'Low Demand', icon: TrendingDown },
];

const getTabCount = (products, tabId) => {
  if (tabId === 'ALL') return products.length;
  return products.filter((p) => getForecastStatus(p).label === FORECAST_STATUS[tabId]?.label).length;
};

const getFilteredProducts = (products, tabId) => {
  if (tabId === 'ALL') return products;
  return products.filter((p) => getForecastStatus(p).label === FORECAST_STATUS[tabId]?.label);
};

// ─── Search bar ──────────────────────────────────────────────────────────────
const SEARCH_FIELD_OPTIONS = [
  { value: 'all', label: 'All Fields', icon: Search },
  { value: 'name', label: 'Product Name', icon: Package },
  { value: 'sku', label: 'SKU', icon: Tag },
];

const matchesProductSearch = (product, term, field) => {
  if (!term) return true;
  const q = term.toLowerCase();
  if (field === 'name') return (product.name || '').toLowerCase().includes(q);
  if (field === 'sku') return (product.sku || '').toLowerCase().includes(q);
  return (product.name || '').toLowerCase().includes(q) || (product.sku || '').toLowerCase().includes(q);
};

const SearchBar = ({ value, onChange, field, onFieldChange, totalCount, matchCount }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = SEARCH_FIELD_OPTIONS.find((o) => o.value === field) || SEARCH_FIELD_OPTIONS[0];
  const FieldIcon = selected.icon;

  return (
    <div ref={ref} className="relative w-full">
      <div className={`flex items-center bg-white dark:bg-slate-900 border-2 rounded-2xl overflow-hidden shadow-lg transition-all duration-300
        ${value ? 'border-emerald-400 dark:border-emerald-500/60 shadow-emerald-100/60 dark:shadow-emerald-500/10' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'}`}>

        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 pl-4 pr-3 py-3.5 border-r border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-slate-600 dark:text-slate-300 shrink-0"
        >
          <FieldIcon size={14} className="text-emerald-500" />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 hidden sm:block whitespace-nowrap">{selected.label}</span>
          <ChevronDown size={12} className={`transition-transform duration-200 text-slate-400 ${open ? 'rotate-180' : ''}`} />
        </button>

        <div className="flex-1 flex items-center gap-2 px-4">
          <Search size={15} className="text-slate-400 shrink-0" />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Search by ${selected.label.toLowerCase()}…`}
            className="flex-1 py-3.5 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 bg-transparent outline-none min-w-0"
          />
        </div>

        <div className="flex items-center gap-2 pr-4">
          {value && (
            <span className="text-xs font-bold text-slate-400 whitespace-nowrap hidden sm:block">
              {matchCount} found
            </span>
          )}
          {value ? (
            <button
              onClick={() => onChange('')}
              className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/10 hover:bg-emerald-50 dark:hover:bg-emerald-500/20 flex items-center justify-center text-slate-400 hover:text-emerald-500 transition-all"
            >
              <X size={13} />
            </button>
          ) : (
            <span className="text-xs text-slate-300 dark:text-slate-600 font-medium hidden sm:block">{totalCount} total</span>
          )}
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="p-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 py-2">Search by field</p>
              {SEARCH_FIELD_OPTIONS.map((opt) => {
                const Ic = opt.icon;
                const isActive = opt.value === field;
                return (
                  <button
                    key={opt.value}
                    onClick={() => { onFieldChange(opt.value); setOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                      ${isActive
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'}`}
                  >
                    <Ic size={14} className={isActive ? 'text-emerald-500' : 'text-slate-400'} />
                    {opt.label}
                    {isActive && <CheckCircle2 size={14} className="ml-auto text-emerald-500" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Mini bar chart inside card ──────────────────────────────────────────────
const MiniChart = ({ weeks, active }) => {
  const max = Math.max(...weeks.map((w) => w.demand || 1), 1);
  return (
    <div className="flex items-end gap-1.5 h-12 pt-3 relative group">
      <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
      {weeks.map((w, i) => {
        const h = (w.demand / max) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 z-10">
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(10, h)}%` }}
              className={`w-full rounded-t-md transition-all duration-500 ${active
                ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.35)]'
                : 'bg-slate-200 dark:bg-slate-700 group-hover:bg-slate-300 dark:group-hover:bg-slate-600'
                }`}
            />
          </div>
        );
      })}
    </div>
  );
};

// ─── Forecast Product Card ────────────────────────────────────────────────────
const ForecastCard = React.forwardRef(({ product, index, onViewDetail }, ref) => {
  const cfg = getForecastStatus(product);
  const StatusIcon = cfg.icon;
  const totalDemand = (product.weeks || []).reduce((s, w) => s + Number(w.demand || 0), 0);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.4 }}
      className={`relative bg-white dark:bg-slate-900 rounded-3xl border ${cfg.border} hover:shadow-xl hover:-translate-y-1 transition-all duration-400 group overflow-hidden flex flex-col`}
    >
      {/* Top accent stripe */}
      <div className={`h-1 w-full ${cfg.accent}`} />

      <div className="p-6 flex flex-col flex-1">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-12 h-12 rounded-2xl ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0`}>
              <Package size={24} className={cfg.text} strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <h4 className="text-base font-black text-slate-900 dark:text-white truncate leading-tight group-hover:text-emerald-500 transition-colors">
                {product.name || 'Unknown Product'}
              </h4>
              {product.sku && (
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">SKU: {product.sku}</p>
              )}
            </div>
          </div>

          {/* Status badge */}
          <span className={`shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide ${cfg.badgeColor}`}>
            {cfg.badge}
          </span>
        </div>

        {/* Status reason box */}
        <div className={`mb-5 px-4 py-3 rounded-2xl ${cfg.bg} border ${cfg.border} flex items-start gap-3`}>
          <StatusIcon size={15} className={`${cfg.text} mt-0.5 shrink-0`} />
          <div>
            <p className={`text-[11px] font-black uppercase tracking-wide ${cfg.text} mb-0.5`}>{cfg.label}</p>
            <p className="text-[12px] text-slate-600 dark:text-slate-300 font-medium leading-snug">
              {cfg.description}
            </p>
            <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
              <Calendar size={10} /> Total forecast: {totalDemand} units across {(product.weeks || []).length} weeks
            </p>
          </div>
        </div>

        {/* Mini chart */}
        <div className="mb-5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Weekly Demand Forecast</p>
          <MiniChart weeks={product.weeks || []} active={false} />
        </div>

        {/* Stats row */}
        <div className="space-y-3 mb-5 flex-1">
          {[
            { icon: BarChart3, label: 'Forecast Score', value: `${(product.confidence ?? product.score ?? 0).toFixed(0)}%`, hoverColor: 'group-hover/row:text-emerald-500' },
            { icon: TrendingUp, label: 'Avg Weekly Demand', value: `${Math.round(totalDemand / Math.max(1, (product.weeks || []).length))} units`, hoverColor: 'group-hover/row:text-indigo-500' },
            { icon: Activity, label: 'Peak Week Demand', value: `${Math.max(...(product.weeks || []).map(w => w.demand || 0), 0)} units`, hoverColor: 'group-hover/row:text-rose-500', truncate: true },
          ].map(({ icon: Icon, label, value, hoverColor, truncate }) => (
            <div key={label} className="group/row flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-white/5 flex items-center justify-center shrink-0">
                <Icon size={13} className={`text-slate-400 ${hoverColor} transition-colors`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                <p className={`text-[12px] text-slate-700 dark:text-slate-300 font-semibold ${truncate ? 'truncate' : ''}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Action button */}
        <button
          onClick={() => onViewDetail(product)}
          className={`mt-auto w-full py-3 rounded-2xl ${cfg.bg} border ${cfg.border} flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all group/btn`}
        >
          <span className={`text-[11px] font-black uppercase tracking-widest ${cfg.text}`}>
            View Detail
          </span>
          <ArrowRight size={14} className={`${cfg.text} group-hover/btn:translate-x-1.5 transition-transform duration-300`} />
        </button>
      </div>
    </motion.div>
  );
});

// ─── Normalization utils ─────────────────────────────────────────────────────
const normalizeActualRows = (rows = []) =>
  rows.map((d) => ({ period: d.date || d.period || d.name, actual: Number(d.actual ?? d.value ?? d.sales ?? 0) }))
    .filter((row) => row.period);

const normalizeForecastRows = (rows = []) =>
  rows.map((d) => ({
    period: d.date || d.period || d.name || 'Data not available',
    predicted: Math.round(Number(d.predicted ?? d.predicted_demand ?? d.value ?? 0)),
    lower: d.lower_bound != null ? Number(d.lower_bound) : Number(d.lower ?? 0),
    upper: d.upper_bound != null ? Number(d.upper_bound) : Number(d.upper ?? 0),
  })).filter((row) => row.period);

const buildForecastProductsFromAnalysis = (analysisPayload) => {
  const rows = Array.isArray(analysisPayload?.demand_forecast) ? analysisPayload.demand_forecast : [];
  const products = Array.isArray(analysisPayload?.products) ? analysisPayload.products : [];
  const metaBySku = new Map(
    products.map((p) => [String(p.sku || p.product || p.name || '').toUpperCase(), p])
  );

  const grouped = new Map();
  rows.forEach((row, idx) => {
    const sku = String(row.sku || row.product || `SKU-${idx + 1}`);
    const key = sku.toUpperCase();
    if (!grouped.has(key)) {
      grouped.set(key, {
        sku,
        name: String(row.product || sku),
        confidence: Number(analysisPayload?.confidence_score || 0),
        weeks: [],
      });
    }
    const entry = grouped.get(key);
    entry.weeks.push({
      date: row.date || `W+${entry.weeks.length + 1}`,
      demand: Math.max(0, Math.round(Number(row.predicted_demand ?? row.predicted ?? 0))),
      production: Math.max(0, Math.round(Number(row.production ?? row.predicted_demand ?? row.predicted ?? 0))),
      low: Number(row.lower_bound ?? row.lower ?? 0),
      high: Number(row.upper_bound ?? row.upper ?? 0),
    });
  });

  let result = Array.from(grouped.values()).map((item) => {
    const meta = metaBySku.get(String(item.sku).toUpperCase()) || {};
    return {
      ...meta,
      ...item,
      name: item.name || meta.name || meta.product || item.sku,
      confidence: Number(meta.confidence ?? meta.score ?? analysisPayload?.confidence_score ?? item.confidence ?? 0),
    };
  });

  if (result.length === 0 && products.length) {
    result = products.map((p, idx) => ({
      ...p,
      sku: p.sku || p.product || `SKU-${idx + 1}`,
      name: p.name || p.product || `Product-${idx + 1}`,
      confidence: Number(p.confidence ?? p.score ?? analysisPayload?.confidence_score ?? 0),
      weeks: Array.isArray(p.weeks)
        ? p.weeks.map((w, wIdx) => ({
            date: w.date || `W+${wIdx + 1}`,
            demand: Math.max(0, Math.round(Number(w.demand ?? w.predicted_demand ?? w.predicted ?? 0))),
            production: w.production != null
              ? Math.max(0, Math.round(Number(w.production)))
              : null,
            low: w.lower_bound != null ? Number(w.lower_bound) : Number(w.low ?? w.lower ?? 0),
            high: w.upper_bound != null ? Number(w.upper_bound) : Number(w.high ?? w.upper ?? 0),
            confidence: w.confidence != null ? Number(w.confidence) : null,
          }))
        : [],
    }));
  }

  return result;
};

const extractAnalysisPayload = (payload) => {
  if (!payload) return null;
  if (payload.analysis && typeof payload.analysis === 'object') return payload.analysis;
  if (payload.payload?.analysis && typeof payload.payload.analysis === 'object') return payload.payload.analysis;
  if (typeof payload === 'object') return payload;
  return null;
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const ForecastViewer = () => {
  const { analysis: liveAnalysis, selectedUploadId } = useAnalysis();
  const [auditData, setAuditData] = useState({ aggregate_accuracy: 0, stability: 'Analyzing...', recommendation: '' });
  const [forecasts, setForecasts] = useState([]);
  const [pastDailyData, setPastDailyData] = useState([]);
  const [pastWeeklyData, setPastWeeklyData] = useState([]);
  const [forecastRawData, setForecastRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forecastMode, setForecastMode] = useState('present');
  const [forecastHorizon, setForecastHorizon] = useState('month');
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [showDetail, setShowDetail] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showTrends, setShowTrends] = useState(false);
  const [showAllTrends, setShowAllTrends] = useState(false);

  const timeGrouping = useMemo(() => {
    if (forecastMode === 'past') return 'weekly';
    if (forecastHorizon === 'year') return 'weekly';
    return 'daily';
  }, [forecastMode, forecastHorizon]);

  const displayPastData = useMemo(() => {
    const sliceCount = forecastHorizon === 'week' ? 7 : forecastHorizon === 'month' ? 30 : 52;
    if (timeGrouping === 'daily') return pastDailyData.slice(-sliceCount);
    return pastWeeklyData.slice(-sliceCount);
  }, [timeGrouping, pastDailyData, pastWeeklyData, forecastHorizon]);

  const displayForecastData = useMemo(() => forecastRawData, [forecastRawData]);

  const allTrends = useMemo(() => {
    if (!forecasts.length) return [];
    return forecasts.map((item) => {
      const total = (item.weeks || []).reduce((sum, w) => sum + Number(w.demand || 0), 0);
      return { name: String(item.name || item.sku || 'Item'), value: total };
    }).sort((a, b) => b.value - a.value);
  }, [forecasts]);

  const trendData = useMemo(() => {
    const palette = ['#10b981', '#059669', '#34d399', '#6ee7b7', '#a7f3d0'];
    return allTrends.slice(0, 5).map((entry, index) => ({
      name: entry.name.length > 12 ? `${entry.name.slice(0, 11)}...` : entry.name,
      fullName: entry.name,
      value: entry.value,
      color: palette[index % palette.length],
    }));
  }, [allTrends]);

  const trendSummary = useMemo(() => {
    const totalUnits = allTrends.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const forecastWindows = forecasts
      .map((item) => (item.weeks || []).length)
      .filter((len) => Number.isFinite(len) && len > 0);
    const windowSize = forecastWindows.length ? Math.max(...forecastWindows) : 4;
    const avgUnitsPerWindow = totalUnits / Math.max(1, windowSize);
    return {
      totalUnits,
      avgUnitsPerWindow,
      windowSize,
      topProduct: allTrends[0]?.name || 'Not available',
    };
  }, [allTrends, forecasts]);

  const formatUnits = (value) => {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return '0';
    return new Intl.NumberFormat('en-US').format(Math.round(numeric));
  };

  const tabCounts = useMemo(() => {
    const counts = {};
    TABS.forEach((t) => { counts[t.id] = getTabCount(forecasts, t.id); });
    return counts;
  }, [forecasts]);

  const displayProducts = useMemo(() => {
    return getFilteredProducts(forecasts, activeFilter)
      .filter((p) => matchesProductSearch(p, searchTerm, searchField));
  }, [forecasts, activeFilter, searchTerm, searchField]);

  useEffect(() => { fetchInitialData(); }, [selectedUploadId, liveAnalysis]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      let analysisPayload = null;

      // 1) Highest authority: explicitly selected upload from backend DB
      if (selectedUploadId) {
        try {
          const { data } = await api.get(`/ingestion/upload-analysis/${selectedUploadId}/`);
          analysisPayload = extractAnalysisPayload(data);
        } catch {
          analysisPayload = null;
        }
      }

      // 2) If no selected upload payload available, use latest backend analysis
      if (!analysisPayload) {
        try {
          const { data } = await api.get('/ingestion/latest-analysis/');
          analysisPayload = extractAnalysisPayload(data);
        } catch {
          analysisPayload = null;
        }
      }

      // 3) In-memory context analysis as a final non-persistent fallback
      if (!analysisPayload) {
        analysisPayload = extractAnalysisPayload(liveAnalysis);
      }

      if (analysisPayload) {
        setPastDailyData(normalizeActualRows(analysisPayload.past_sales_daily || analysisPayload.past_sales || []));
        setPastWeeklyData(normalizeActualRows(analysisPayload.past_sales_weekly || []));
        setForecastRawData(normalizeForecastRows(analysisPayload.demand_forecast || []));
        setForecasts(buildForecastProductsFromAnalysis(analysisPayload));
        setAuditData({
          aggregate_accuracy: Number(analysisPayload.confidence_score || 0),
          stability: analysisPayload.confidence_label || analysisPayload.metadata?.confidence || 'Data not available',
          recommendation: Array.isArray(analysisPayload.recommendations) && analysisPayload.recommendations.length
            ? analysisPayload.recommendations[0]
            : 'Data not available',
        });
        return;
      }

      setPastDailyData([]);
      setPastWeeklyData([]);
      setForecastRawData([]);
      setForecasts([]);
      setAuditData({ aggregate_accuracy: 0, stability: 'Waiting for analysis', recommendation: '' });
    } catch (err) {
      console.error('Failed to fetch forecasts:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-32 gap-6 bg-[var(--bg-accent)] rounded-3xl">
        <div className="w-16 h-16 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin" />
        <p className="text-xs font-bold tracking-widest text-emerald-500 uppercase">Loading forecasts...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Sales Forecast
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
            Predicted sales for each product based on your real historical data.
          </p>
        </div>

        {/* Summary stats */}
        <div className="flex items-center gap-4">
          {[
            { label: 'High Demand', count: tabCounts['HIGH_DEMAND'], color: 'text-emerald-500' },
            { label: 'Moderate', count: tabCounts['MODERATE'], color: 'text-blue-500' },
            { label: 'Low Demand', count: tabCounts['LOW_DEMAND'], color: 'text-amber-500' },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className={`text-xl font-black ${s.color}`}>{s.count}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main Card ── */}
      <GlassCard className="!p-0 !border-slate-200/60 dark:!border-white/10 !bg-white dark:!bg-slate-900/40 overflow-visible shadow-xl">

        {/* ── Toolbar ── */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-white/10 space-y-4">

          {/* Status Tabs */}
          <div className="flex flex-wrap gap-2">
            {TABS.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveFilter(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-300
                    ${isActive
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'}`}
                >
                  <TabIcon size={13} />
                  {tab.label}
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black
                    ${isActive ? 'bg-white/25 text-white' : 'bg-white dark:bg-white/10 text-slate-500 dark:text-slate-400'}`}>
                    {tabCounts[tab.id]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Bar */}
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            field={searchField}
            onFieldChange={setSearchField}
            totalCount={tabCounts[activeFilter]}
            matchCount={displayProducts.length}
          />

          {/* Active search hint */}
          {searchTerm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
            >
              <Filter size={12} />
              Filtering by <strong className="text-emerald-500">{searchTerm}</strong> in{' '}
              <strong>{searchField === 'all' ? 'all fields' : searchField}</strong>
              {' '}— {displayProducts.length} match{displayProducts.length !== 1 ? 'es' : ''}
              <button
                onClick={() => { setSearchTerm(''); setSearchField('all'); }}
                className="ml-auto text-[11px] font-bold text-emerald-500 hover:underline"
              >
                Clear search
              </button>
            </motion.div>
          )}
        </div>

        {/* ── AI Engine status bar ── */}
        <div className="px-6 py-3 bg-emerald-50/60 dark:bg-emerald-500/5 border-b border-emerald-100/60 dark:border-emerald-500/10 flex items-center gap-3">
          <div className="w-7 h-7 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
            <Activity size={14} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1">
            <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              AI Forecast Engine — Active
            </span>
            <span className="text-[11px] text-emerald-500/70 ml-2">
              Analyzing product sales trends and generating demand forecasts
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-500 uppercase">Live</span>
          </div>
        </div>

        {/* ── Chart Section ── */}
        <div className="px-6 pt-6 pb-2">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-[16px] font-black text-slate-900 dark:text-white tracking-tight leading-none mb-1">
                Sales Performance Analysis
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-[0.25em]">
                Past Sales vs AI Forecast
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0 flex-wrap">
              <div className="inline-flex items-center rounded-full p-1.5 bg-slate-100/80 dark:bg-white/5 border border-slate-200/50 dark:border-white/10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]">
                <button
                  onClick={() => setForecastMode('past')}
                  className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${forecastMode === 'past' ? 'bg-white dark:bg-emerald-500 text-slate-900 dark:text-white shadow-lg' : 'text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-white/10'}`}
                >
                  Past
                </button>
                <button
                  onClick={() => setForecastMode('present')}
                  className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${forecastMode === 'present' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-500/20' : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-white/10'}`}
                >
                  Present
                </button>
              </div>
              {forecastMode === 'present' && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="inline-flex items-center rounded-full p-1.5 bg-slate-100 dark:bg-white/10 border border-slate-200/60 dark:border-white/10 shadow-sm ml-2"
                >
                  {['week', 'month', 'year'].map((h) => (
                    <button
                      key={h}
                      onClick={() => setForecastHorizon(h)}
                      className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all duration-200 ${forecastHorizon === h ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md' : 'text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-white/10'}`}
                    >
                      {h === 'year' ? 'Full Year' : h === 'month' ? 'Month' : 'Week'}
                    </button>
                  ))}
                </motion.div>
              )}
              <button
                onClick={() => {
                  setShowAllTrends(false);
                  setShowTrends(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border border-white/10 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-300 hover:text-emerald-500 hover:border-emerald-500/30 transition-all"
              >
                <TrendingUp size={14} />
                Trends
              </button>
            </div>
          </div>
          <div className="min-h-[300px]">
            <PredictionChart
              pastData={displayPastData}
              forecastData={displayForecastData}
              mode={forecastMode}
              horizon={forecastHorizon}
            />
          </div>
        </div>

        {/* ── Product Cards Grid ── */}
        <div className="p-6 border-t border-slate-100 dark:border-white/10 mt-2">
          <div className="flex items-center gap-2 mb-5">
            <Box size={16} className="text-slate-500" />
            <h4 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">Product Forecasts</h4>
          </div>
          {displayProducts.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-3xl bg-slate-50/50 dark:bg-white/[0.02]"
            >
              <div className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center mb-5 shadow-xl shadow-emerald-500/10">
                <ShieldCheck size={36} className="text-emerald-500" />
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">
                {searchTerm ? 'No products match your search' : 'No products in this category'}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-xs leading-relaxed">
                {searchTerm ? 'Try searching a different product name or SKU.' : 'No forecast data available for this filter.'}
              </p>
              {searchTerm && (
                <button
                  onClick={() => { setSearchTerm(''); setSearchField('all'); }}
                  className="mt-4 px-5 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-100 transition-colors"
                >
                  Clear search &amp; show all
                </button>
              )}
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <AnimatePresence mode="popLayout">
                {displayProducts.map((product, index) => (
                  <ForecastCard
                    key={`${product.sku || product.name}-${index}`}
                    product={product}
                    index={index}
                    onViewDetail={(p) => { setSelectedProduct(p); setShowDetail(true); }}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </GlassCard>

      {/* ── Detail Modal ── */}
      <AnimatePresence>
        {showDetail && selectedProduct && (
          <motion.div
            key="forecast-detail-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/55 backdrop-blur-sm"
            onClick={() => setShowDetail(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.24)] overflow-hidden relative w-full max-w-5xl"
              onClick={(e) => e.stopPropagation()}
            >
              {(() => {
                const weeks = selectedProduct.weeks || [];
                const totalDemand = weeks.reduce((sum, w) => sum + Number(w.demand || 0), 0);
                const totalProduction = weeks.reduce((sum, w) => sum + Number(w.production || 0), 0);
                const avgDemand = weeks.length ? totalDemand / weeks.length : 0;
                const peakDemand = Math.max(...weeks.map((w) => Number(w.demand || 0)), 0);
                const demandCoverage = totalDemand > 0
                  ? Math.round((totalProduction / totalDemand) * 100)
                  : 0;
                const weekConfidences = weeks
                  .map((w) => {
                    if (w.confidence != null && Number.isFinite(Number(w.confidence))) {
                      const explicit = Number(w.confidence);
                      return explicit <= 1 ? explicit * 100 : explicit;
                    }
                    const low = Number(w.low ?? 0);
                    const high = Number(w.high ?? 0);
                    const demand = Math.max(1, Number(w.demand || 0));
                    if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) return null;
                    return Math.max(0, Math.min(100, Math.round(100 - ((high - low) / demand) * 100)));
                  })
                  .filter((val) => Number.isFinite(val));
                const confidenceValue = weekConfidences.length
                  ? Math.round(weekConfidences.reduce((sum, val) => sum + val, 0) / weekConfidences.length)
                  : Math.max(0, Math.min(100, Math.round(Number(selectedProduct.confidence || 0))));
                const hasExplicitProduction = weeks.some((w) => w.production != null && Number(w.production) > 0);

                return (
                  <>
                    <div className="px-6 sm:px-8 py-6 border-b border-slate-200 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-200 flex items-center justify-center text-emerald-600">
                            <BarChart3 size={21} />
                          </div>
                          <div>
                            <h3 className="text-2xl font-black tracking-tight text-slate-900">{selectedProduct.name}</h3>
                            <p className="text-slate-500 text-xs font-semibold mt-1">
                              Analysis-backed weekly demand outlook with operational plan
                            </p>
                            <p className="text-[11px] text-slate-400 mt-2 font-semibold">
                              {selectedProduct.sku ? `SKU: ${selectedProduct.sku} • ` : ''}{weeks.length} forecast windows
                            </p>
                          </div>
                        </div>
                        <button
                          className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                          onClick={() => setShowDetail(false)}
                          aria-label="Close forecast detail"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Total Demand</p>
                          <p className="text-lg font-black text-slate-900 mt-1 tabular-nums">{formatUnits(totalDemand)} units</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Avg Weekly Demand</p>
                          <p className="text-lg font-black text-slate-900 mt-1 tabular-nums">{formatUnits(avgDemand)} units</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Peak Weekly Demand</p>
                          <p className="text-lg font-black text-slate-900 mt-1 tabular-nums">{formatUnits(peakDemand)} units</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Forecast Confidence</p>
                          <p className="text-lg font-black text-slate-900 mt-1 tabular-nums">{formatUnits(confidenceValue)}%</p>
                        </div>
                      </div>
                    </div>

                    <div className="px-6 sm:px-8 py-5 border-b border-slate-200 bg-white">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Weekly Execution Plan</p>
                        <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                          <ShieldCheck size={14} className="text-emerald-500" />
                          {hasExplicitProduction
                            ? `Demand coverage: ${formatUnits(demandCoverage)}% of forecast`
                            : 'Production recommendation not available in source analysis'}
                        </div>
                      </div>
                    </div>

                    {weeks.length === 0 ? (
                      <div className="px-8 py-14 text-center">
                        <p className="text-sm font-bold text-slate-700">No week-level forecast rows were found in the analysis payload.</p>
                        <p className="text-xs text-slate-500 mt-2">Upload with demand_forecast rows to view this detail table.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto max-h-[56vh]">
                        <table className="w-full text-left border-collapse min-w-[860px]">
                          <thead className="sticky top-0 z-10 bg-slate-50">
                            <tr>
                              <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-[0.14em]">Week</th>
                              <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-[0.14em]">Expected Sales</th>
                              <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-[0.14em]">Recommended Production</th>
                              <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-[0.14em]">Confidence</th>
                              <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-[0.14em]">Range (Low - High)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {weeks.map((w, i) => {
                              const demand = Math.max(0, Number(w.demand || 0));
                              const production = w.production != null && Number.isFinite(Number(w.production))
                                ? Math.max(0, Number(w.production))
                                : null;
                              const low = Number(w.low ?? 0);
                              const high = Number(w.high ?? 0);
                              const conf = (() => {
                                if (w.confidence != null && Number.isFinite(Number(w.confidence))) {
                                  const explicit = Number(w.confidence);
                                  const normalized = explicit <= 1 ? explicit * 100 : explicit;
                                  return Math.max(0, Math.min(100, Math.round(normalized)));
                                }
                                if (Number.isFinite(low) && Number.isFinite(high) && high > low) {
                                  return Math.max(0, Math.min(100, Math.round(100 - ((high - low) / Math.max(1, demand)) * 100)));
                                }
                                return null;
                              })();

                              return (
                                <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="px-6 py-5">
                                    <span className="text-sm font-black text-slate-800">{w.date || `W+${i + 1}`}</span>
                                  </td>
                                  <td className="px-6 py-5">
                                    <span className="text-base font-bold text-slate-800 tabular-nums">{formatUnits(demand)} units</span>
                                  </td>
                                  <td className="px-6 py-5">
                                    {production == null ? (
                                      <span className="text-sm font-semibold text-slate-400">Not available</span>
                                    ) : (
                                      <span className="text-base font-bold text-slate-800 tabular-nums">{formatUnits(production)} units</span>
                                    )}
                                  </td>
                                  <td className="px-6 py-5">
                                    {conf == null ? (
                                      <span className="text-sm font-semibold text-slate-400">Not available</span>
                                    ) : (
                                      <div className="flex items-center gap-3">
                                        <span className="text-sm font-bold text-slate-700 tabular-nums">{conf}%</span>
                                        <div className="w-20 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                          <div className="h-full bg-emerald-500" style={{ width: `${conf}%` }} />
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-6 py-5">
                                    {(Number.isFinite(low) && Number.isFinite(high) && (low > 0 || high > 0)) ? (
                                      <span className="text-sm font-semibold text-slate-700 tabular-nums">{formatUnits(low)} - {formatUnits(high)} units</span>
                                    ) : (
                                      <span className="text-sm font-semibold text-slate-400">Not available</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Trends Modal ── */}
      <AnimatePresence>
        {showTrends && (
          <motion.div
            key="trends-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm px-4 sm:px-6"
            onClick={() => setShowTrends(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="w-full max-w-4xl rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.24)] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 sm:px-8 py-6 border-b border-slate-200 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-200 flex items-center justify-center text-emerald-600">
                      <BarChart3 size={20} />
                    </div>
                    <div>
                      <h4 className="text-xl font-black tracking-tight text-slate-900">Top Trending Products</h4>
                      <p className="text-xs font-semibold tracking-wide text-slate-500 mt-1">
                        Demand projection for the next {trendSummary.windowSize} weeks
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="inline-flex items-center rounded-xl p-1 bg-white border border-slate-200 shadow-sm">
                      <button
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${!showAllTrends ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                        onClick={() => setShowAllTrends(false)}
                      >
                        <Eye size={13} />
                        Chart
                      </button>
                      <button
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${showAllTrends ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                        onClick={() => setShowAllTrends(true)}
                      >
                        <List size={13} />
                        Ranked Table
                      </button>
                    </div>
                    <button
                      className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                      onClick={() => setShowTrends(false)}
                      aria-label="Close trends"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Total Forecast Units</p>
                    <p className="text-lg font-black text-slate-900 mt-1 tabular-nums">{formatUnits(trendSummary.totalUnits)}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Avg Weekly Demand</p>
                    <p className="text-lg font-black text-slate-900 mt-1 tabular-nums">{formatUnits(trendSummary.avgUnitsPerWindow)}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Top Product</p>
                    <p className="text-sm font-extrabold text-slate-900 mt-1 truncate">{trendSummary.topProduct}</p>
                  </div>
                </div>
              </div>

              {!showAllTrends && (
                <div className="px-6 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-500 mb-3">Top 5 Demand Leaders</p>
                    <div className="h-[260px]">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <BarChart data={trendData} margin={{ top: 18, right: 8, left: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} />
                          <Tooltip
                            cursor={{ fill: 'rgba(15, 23, 42, 0.03)' }}
                            contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 30px rgba(15,23,42,0.08)', fontSize: '11px', color: '#0f172a' }}
                            labelStyle={{ color: '#334155', fontWeight: 700 }}
                            formatter={(value) => [`${formatUnits(value)} units`, 'Projected demand']}
                            labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                          />
                          <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={24}>
                            {trendData.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} fillOpacity={0.9} />
                            ))}
                            <LabelList
                              dataKey="value"
                              position="top"
                              formatter={(value) => formatUnits(value)}
                              style={{ fill: '#334155', fontSize: 10, fontWeight: 700 }}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-500 mb-3">Ranking Snapshot</p>
                    <div className="space-y-2.5">
                      {allTrends.slice(0, 5).map((item, index) => {
                        const share = trendSummary.totalUnits > 0
                          ? Math.round((Number(item.value || 0) / trendSummary.totalUnits) * 100)
                          : 0;
                        return (
                          <div key={`${item.name}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center ${index === 0 ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-700'}`}>{index + 1}</span>
                                  <p className="text-sm font-bold text-slate-800 truncate">{item.name}</p>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1">{share}% of total projected demand</p>
                              </div>
                              <p className="text-sm font-black text-slate-900 tabular-nums">{formatUnits(item.value)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {showAllTrends && (
                <div className="px-6 sm:px-8 py-5 max-h-[420px] overflow-auto">
                  <div className="grid grid-cols-[72px_1fr_160px_120px] gap-3 items-center text-[11px] font-black text-slate-500 uppercase tracking-[0.14em] pb-3 border-b border-slate-200">
                    <span>Rank</span>
                    <span>Product</span>
                    <span className="text-right">Forecast Units</span>
                    <span className="text-right">Share</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {allTrends.slice(0, 100).map((item, index) => (
                      <div key={`${item.name}-${index}`} className="grid grid-cols-[72px_1fr_160px_120px] gap-3 items-center py-3">
                        <span className="text-xs font-bold text-slate-600">#{index + 1}</span>
                        <span className="text-sm font-semibold text-slate-800 truncate">{item.name}</span>
                        <span className="text-sm font-bold text-slate-800 tabular-nums text-right">{formatUnits(item.value)} units</span>
                        <span className="text-xs font-semibold text-slate-500 tabular-nums text-right">
                          {trendSummary.totalUnits > 0 ? `${Math.round((Number(item.value || 0) / trendSummary.totalUnits) * 100)}%` : '0%'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ForecastViewer;
