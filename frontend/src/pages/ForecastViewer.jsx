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
  CircleDollarSign,
  Users,
  Truck,
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
import { useAnalysis } from '../context/useAnalysis';

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

const toFiniteNum = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toIsoDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
});

const aggregateMonthly = (rows = [], { valueKeys = [], mode = 'sum' } = {}) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const groups = new Map();

  rows.forEach((row, idx) => {
    const date = parseLooseDate(row?.period || row?.name || row?.date) || new Date();
    if (!date) return;

    const monthDate = new Date(date.getFullYear(), date.getMonth(), 1);
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;

    if (!groups.has(key)) {
      groups.set(key, {
        totals: Object.fromEntries(valueKeys.map((item) => [item, 0])),
        count: 0,
        order: monthDate.getTime(),
        label: MONTH_LABEL_FORMATTER.format(monthDate),
      });
    }

    const group = groups.get(key);
    valueKeys.forEach((keyName) => {
      const value = Number(row?.[keyName] ?? 0);
      group.totals[keyName] += Number.isFinite(value) ? value : 0;
    });
    group.count += 1;
  });

  return Array.from(groups.values())
    .sort((a, b) => a.order - b.order)
    .map((group) => {
      const aggregated = {};
      valueKeys.forEach((keyName) => {
        aggregated[keyName] = group.count
          ? (mode === 'avg' ? group.totals[keyName] / group.count : group.totals[keyName])
          : 0;
      });

      return {
        period: group.label,
        ...aggregated,
      };
    });
};

const MIN_VALID_ANALYSIS_YEAR = 2020;
const MAX_VALID_ANALYSIS_YEAR = 2100;

const isReasonableAnalysisDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const year = date.getFullYear();
  return year >= MIN_VALID_ANALYSIS_YEAR && year <= MAX_VALID_ANALYSIS_YEAR;
};

const parseExcelSerialDate = (value) => {
  const serial = Number(value);
  if (!Number.isFinite(serial)) return null;
  if (serial < 30000 || serial > 90000) return null;
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const parsed = new Date(excelEpoch.getTime() + (serial * 86400000));
  return isReasonableAnalysisDate(parsed) ? parsed : null;
};

const parseLooseDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return isReasonableAnalysisDate(value) ? value : null;
  }

  const excelDate = parseExcelSerialDate(value);
  if (excelDate) return excelDate;

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [yyyy, mm, dd] = raw.split('-').map(Number);
    const parsed = new Date(yyyy, mm - 1, dd);
    return isReasonableAnalysisDate(parsed) ? parsed : null;
  }

  if (/^\d{4}-\d{2}$/.test(raw)) {
    const [yyyy, mm] = raw.split('-').map(Number);
    const parsed = new Date(yyyy, mm - 1, 1);
    return isReasonableAnalysisDate(parsed) ? parsed : null;
  }

  const dmyMatch = raw.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);
  if (dmyMatch) {
    const [, dd, mm, yyyy] = dmyMatch.map(Number);
    const parsed = new Date(yyyy, mm - 1, dd);
    return isReasonableAnalysisDate(parsed) ? parsed : null;
  }

  const dmyTimeMatch = raw.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (dmyTimeMatch) {
    const [, dd, mm, yyyy, hh, min, ss = '0'] = dmyTimeMatch;
    const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));
    return isReasonableAnalysisDate(parsed) ? parsed : null;
  }

  const direct = new Date(raw);
  if (isReasonableAnalysisDate(direct)) return direct;

  return null;
};

const SALES_DATE_KEYS = [
  'date', 'order_date', 'sales_date', 'transaction_date', 'invoice_date',
  'bill_date', 'created_at', 'timestamp', 'month',
];

const SALES_VALUE_KEYS = [
  'quantity_sold', 'quantity', 'qty', 'units', 'unit',
  'sale_qty', 'sales_qty', 'sold_qty', 'total_sales',
  'amount', 'value', 'net_amount', 'order_stock', 'order_qty',
];

const toInputDay = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toInputMonth = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const getRowDate = (row) => parseLooseDate(row?.period || row?.name || row?.date);

const filterRowsByGranularity = (rows = [], granularity, selectedDay, selectedMonth, selectedYear) => {
  return rows.filter((row) => {
    const date = getRowDate(row);
    if (!date) return false;

    if (granularity === 'day') {
      return toIsoDay(date) === selectedDay;
    }

    if (granularity === 'month') {
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return monthKey === selectedMonth;
    }

    return date.getFullYear() === Number(selectedYear);
  });
};

const getPreviousPeriodSelection = (granularity, selectedDay, selectedMonth, selectedYear) => {
  if (granularity === 'day') {
    const base = parseLooseDate(selectedDay) || new Date();
    const previous = new Date(base);
    previous.setDate(base.getDate() - 1);
    return { selectedDay: toIsoDay(previous), selectedMonth, selectedYear };
  }

  if (granularity === 'month') {
    const [yearPart, monthPart] = String(selectedMonth || '').split('-').map(Number);
    const base = new Date(
      Number.isFinite(yearPart) ? yearPart : new Date().getFullYear(),
      Number.isFinite(monthPart) ? Math.max(monthPart - 1, 0) : new Date().getMonth(),
      1
    );
    base.setMonth(base.getMonth() - 1);
    return {
      selectedDay,
      selectedMonth: toInputMonth(base),
      selectedYear: String(base.getFullYear()),
    };
  }

  return {
    selectedDay,
    selectedMonth,
    selectedYear: String(Number(selectedYear || new Date().getFullYear()) - 1),
  };
};

const sumField = (rows = [], field) => rows.reduce((sum, row) => sum + Number(row?.[field] || 0), 0);

const buildForecastSeriesFromAnalysis = (analysisPayload = {}, pastRows = []) => {
  const normalizedDemand = normalizeForecastRows(analysisPayload?.demand_forecast || []);
  if (normalizedDemand.length > 0) return normalizedDemand;

  const next365Days = Array.isArray(analysisPayload?.forecast?.next_365_days)
    ? analysisPayload.forecast.next_365_days
    : [];

  if (next365Days.length > 0) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return next365Days.map((value, idx) => {
      const date = new Date(start);
      date.setDate(start.getDate() + idx);
      const predicted = Math.max(0, Math.round(toFiniteNum(value, 0)));
      return {
        period: toIsoDay(date),
        predicted,
        lower: Math.max(0, predicted * 0.9),
        upper: Math.max(0, predicted * 1.1),
      };
    });
  }

  return [];
};

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

  return result.filter((item) => Array.isArray(item.weeks) && item.weeks.length > 0);
};

const pickFromRow = (row, keys = []) => {
  if (!row || typeof row !== 'object') return null;
  for (const key of keys) {
    const value = getFieldByAliases(row, [key]);
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }
  return null;
};

const derivePastSalesFromPreviewRows = (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const bucket = new Map();
  rows.forEach((row) => {
    const dateRaw = pickFromRow(row, SALES_DATE_KEYS);
    const dt = parseLooseDate(dateRaw);
    if (!dt) return;

    const qty = toSafeNumber(pickFromRow(row, SALES_VALUE_KEYS));
    if (!Number.isFinite(qty) || qty <= 0) return;

    const key = toIsoDay(dt);
    bucket.set(key, (bucket.get(key) || 0) + qty);
  });

  return Array.from(bucket.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, actual]) => ({ period, actual: Math.round(actual) }));
};

const normalizeLookupKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const getFieldByAliases = (row, aliases = []) => {
  if (!row || typeof row !== 'object') return null;
  const normalizedAliases = new Set(aliases.map(normalizeLookupKey));
  const key = Object.keys(row).find((entry) => normalizedAliases.has(normalizeLookupKey(entry)));
  if (!key) return null;
  const value = row[key];
  return value === '' || value === undefined ? null : value;
};

const TEXT_PLACEHOLDERS = new Set(['', 'na', 'n/a', 'null', 'none', '-', '--', 'unknown', 'notavailable']);

const cleanTextValue = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.replace(/\s+/g, ' ');
};

const isMeaningfulText = (value) => {
  const normalized = normalizeLookupKey(cleanTextValue(value));
  return Boolean(normalized && !TEXT_PLACEHOLDERS.has(normalized));
};

const toSmartTitle = (value) => {
  const text = cleanTextValue(value);
  if (!text) return '';
  if (/^[A-Z0-9\s\-_/]+$/.test(text)) {
    return text.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return text;
};

const toSafeNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
};

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return amount.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
};

const formatCompactCurrency = (value) => {
  const amount = Number(value || 0);
  return amount.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
  });
};

const formatFriendlyDate = (value) => {
  const date = parseLooseDate(value);
  if (!date) return '-';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatDeliveryDelta = (orderDate, deliveryDate) => {
  const order = parseLooseDate(orderDate);
  const delivery = parseLooseDate(deliveryDate);
  if (!order || !delivery) return 'Timeline unavailable';
  const diffMs = delivery.getTime() - order.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Delivered before order date';
  if (diffDays === 0) return 'Delivered same day';
  if (diffDays === 1) return 'Delivered in 1 day';
  return `Delivered in ${diffDays} days`;
};

const HISTORY_CUSTOMER_NAME_ALIASES = [
  'customer_name', 'customer', 'client_name', 'client', 'buyer_name', 'buyer',
  'party_name', 'party', 'account_name', 'company', 'company_name', 'name',
];
const HISTORY_CUSTOMER_ID_ALIASES = [
  'customer_id', 'customerid', 'party_id', 'partycode', 'party_code', 'account_id', 'customer_code',
];
const HISTORY_PRODUCT_ALIASES = [
  'product_name', 'product', 'item_name', 'item', 'material_name', 'sku', 'product_code', 'item_code', 'code',
];
const HISTORY_QTY_ALIASES = [
  'quantity', 'qty', 'units', 'sold_qty', 'sales_qty', 'sale_qty', 'order_qty', 'ordered_qty', 'quantity_sold',
];
const HISTORY_UNIT_PRICE_ALIASES = [
  'unit_price', 'price', 'rate', 'selling_price', 'sale_price', 'mrp', 'unitrate',
];
const HISTORY_TOTAL_ALIASES = [
  'line_total', 'total_amount', 'amount', 'order_value', 'invoice_amount', 'grand_total', 'net_amount', 'total',
];
const HISTORY_PAID_ALIASES = [
  'amount_paid', 'paid_amount', 'payment_received', 'received_amount', 'paid', 'payment', 'payment_done', 'received',
];
const HISTORY_BALANCE_ALIASES = [
  'balance', 'balance_amount', 'pending_amount', 'amount_due', 'due_amount', 'remaining_amount', 'outstanding', 'baki',
];
const HISTORY_PAYMENT_STATUS_ALIASES = [
  'payment_status', 'payment_state', 'status', 'paid_status', 'bill_status',
];
const HISTORY_ORDER_DATE_ALIASES = [
  'order_date', 'sales_date', 'transaction_date', 'invoice_date', 'date', 'record_date', 'posting_date',
];
const HISTORY_DELIVERY_DATE_ALIASES = [
  'delivery_date', 'delivered_date', 'delivery', 'dispatch_date', 'dispatched_date', 'ship_date',
];
const HISTORY_DIRECTION_ALIASES = [
  'type', 'transaction_type', 'txn_type', 'movement', 'movement_type', 'in_out', 'in/out',
];
const HISTORY_ORDER_ID_ALIASES = [
  'order_id', 'invoice_no', 'invoice_number', 'bill_no', 'bill_number', 'voucher_no', 'order_no',
];

const isSalesHistoryRow = (row) => {
  const direction = cleanTextValue(getFieldByAliases(row, HISTORY_DIRECTION_ALIASES)).toUpperCase();
  if (direction) {
    if (
      direction.includes('PURCHASE')
      || direction.includes('RECEIPT')
      || direction.includes('OPENING')
      || direction === 'IN'
    ) {
      return false;
    }
    if (
      direction.includes('SALE')
      || direction.includes('OUT')
      || direction.includes('DELIVERY')
      || direction.includes('DISPATCH')
      || direction.includes('INVOICE')
    ) {
      return true;
    }
  }

  const customerName = getFieldByAliases(row, HISTORY_CUSTOMER_NAME_ALIASES);
  const qty = toSafeNumber(getFieldByAliases(row, HISTORY_QTY_ALIASES));
  const product = getFieldByAliases(row, HISTORY_PRODUCT_ALIASES);
  return isMeaningfulText(customerName) && isMeaningfulText(product) && Number.isFinite(qty) && qty > 0;
};

const collectHistorySourceRows = (analysisPayload = {}) => {
  const nestedAnalysis = extractAnalysisPayload(analysisPayload) || {};
  const directRows = [
    ...(Array.isArray(analysisPayload?.raw_transactions) ? analysisPayload.raw_transactions : []),
    ...(Array.isArray(analysisPayload?.transactions) ? analysisPayload.transactions : []),
    ...(Array.isArray(analysisPayload?.preview_rows) ? analysisPayload.preview_rows : []),
    ...(Array.isArray(nestedAnalysis?.raw_transactions) ? nestedAnalysis.raw_transactions : []),
    ...(Array.isArray(nestedAnalysis?.transactions) ? nestedAnalysis.transactions : []),
    ...(Array.isArray(nestedAnalysis?.preview_rows) ? nestedAnalysis.preview_rows : []),
  ];

  const previewRows = [
    ...(Array.isArray(analysisPayload?.metadata?.sheet_previews) ? analysisPayload.metadata.sheet_previews : []),
    ...(Array.isArray(nestedAnalysis?.metadata?.sheet_previews) ? nestedAnalysis.metadata.sheet_previews : []),
  ].flatMap((sheet) => (Array.isArray(sheet?.rows) ? sheet.rows : []));

  const deduped = new Map();
  [...directRows, ...previewRows].forEach((row, index) => {
    if (!row || typeof row !== 'object') return;
    const key = JSON.stringify(row);
    if (!deduped.has(key)) {
      deduped.set(key, { ...row, __sourceIndex: index });
    }
  });

  return Array.from(deduped.values());
};

const buildHistoryRowsFromAnalysis = (analysisPayload = {}) => {
  const rows = collectHistorySourceRows(analysisPayload);

  return rows
    .filter(isSalesHistoryRow)
    .map((row, index) => {
      const quantity = Math.max(0, toSafeNumber(getFieldByAliases(row, HISTORY_QTY_ALIASES)) || 0);
      const unitPrice = toSafeNumber(getFieldByAliases(row, HISTORY_UNIT_PRICE_ALIASES));
      const explicitTotal = toSafeNumber(getFieldByAliases(row, HISTORY_TOTAL_ALIASES));
      const totalAmount = explicitTotal ?? (unitPrice != null ? quantity * unitPrice : null);
      const explicitPaid = toSafeNumber(getFieldByAliases(row, HISTORY_PAID_ALIASES));
      const explicitBalance = toSafeNumber(getFieldByAliases(row, HISTORY_BALANCE_ALIASES));
      const paymentStatusRaw = cleanTextValue(getFieldByAliases(row, HISTORY_PAYMENT_STATUS_ALIASES)).toLowerCase();

      const paidAmount = explicitPaid != null
        ? explicitPaid
        : (
          totalAmount != null && explicitBalance != null
            ? Math.max(totalAmount - explicitBalance, 0)
            : (
              totalAmount != null && /(paid|complete|settled|received full)/.test(paymentStatusRaw)
                ? totalAmount
                : null
            )
        );
      const pendingAmount = explicitBalance != null
        ? explicitBalance
        : (
          totalAmount != null && paidAmount != null
            ? Math.max(totalAmount - paidAmount, 0)
            : null
        );

      let paymentStatus = 'Pending';
      if (/(partial|part payment|advance)/.test(paymentStatusRaw)) {
        paymentStatus = 'Partial';
      } else if (/(paid|complete|settled|clear|closed)/.test(paymentStatusRaw)) {
        paymentStatus = 'Paid';
      } else if (paidAmount != null && totalAmount != null) {
        if (pendingAmount <= 0) paymentStatus = 'Paid';
        else if (paidAmount > 0) paymentStatus = 'Partial';
      }

      const customerName = toSmartTitle(
        getFieldByAliases(row, HISTORY_CUSTOMER_NAME_ALIASES)
        || getFieldByAliases(row, HISTORY_CUSTOMER_ID_ALIASES)
        || `Customer ${index + 1}`
      );
      const customerId = cleanTextValue(getFieldByAliases(row, HISTORY_CUSTOMER_ID_ALIASES)) || customerName;
      const stockName = toSmartTitle(getFieldByAliases(row, HISTORY_PRODUCT_ALIASES) || 'Unknown Stock');
      const orderDate = cleanTextValue(getFieldByAliases(row, HISTORY_ORDER_DATE_ALIASES));
      const deliveryDate = cleanTextValue(getFieldByAliases(row, HISTORY_DELIVERY_DATE_ALIASES));
      const effectiveDate = parseLooseDate(orderDate) || parseLooseDate(deliveryDate);

      return {
        id: `${customerId}-${stockName}-${orderDate || deliveryDate || index}`,
        customerId,
        customerName,
        stockName,
        quantity,
        unitPrice,
        totalAmount,
        paidAmount,
        pendingAmount,
        paymentStatus,
        orderDate,
        deliveryDate,
        effectiveDate,
        orderId: cleanTextValue(getFieldByAliases(row, HISTORY_ORDER_ID_ALIASES)),
      };
    })
    .filter((row) => row.effectiveDate && row.quantity > 0)
    .sort((a, b) => (b.effectiveDate?.getTime() || 0) - (a.effectiveDate?.getTime() || 0));
};

const filterHistoryRowsByGranularity = (rows = [], granularity, selectedDay, selectedMonth, selectedYear) => {
  return rows.filter((row) => {
    const date = row?.effectiveDate;
    if (!date) return false;
    if (granularity === 'day') return toIsoDay(date) === selectedDay;
    if (granularity === 'month') return toInputMonth(date) === selectedMonth;
    return String(date.getFullYear()) === String(selectedYear);
  });
};

const summarizeHistoryRows = (rows = []) => {
  const totals = rows.reduce((acc, row) => {
    acc.quantity += Number(row?.quantity || 0);
    acc.totalAmount += Number(row?.totalAmount || 0);
    acc.paidAmount += Number(row?.paidAmount || 0);
    acc.pendingAmount += Number(row?.pendingAmount || 0);
    if (row?.paymentStatus === 'Paid') acc.paidOrders += 1;
    if (row?.paymentStatus === 'Partial') acc.partialOrders += 1;
    if (row?.paymentStatus === 'Pending') acc.pendingOrders += 1;
    acc.customers.add(row?.customerId || row?.customerName || '');
    acc.stocks.add(row?.stockName || '');
    return acc;
  }, {
    quantity: 0,
    totalAmount: 0,
    paidAmount: 0,
    pendingAmount: 0,
    paidOrders: 0,
    partialOrders: 0,
    pendingOrders: 0,
    customers: new Set(),
    stocks: new Set(),
  });

  return {
    ...totals,
    customerCount: Array.from(totals.customers).filter(Boolean).length,
    stockCount: Array.from(totals.stocks).filter(Boolean).length,
  };
};

const DAY_TIMELINE_TIMESTAMP_ALIASES = [
  'timestamp', 'datetime', 'date_time', 'transaction_datetime', 'invoice_datetime', 'created_at', 'updated_at',
];
const DAY_TIMELINE_TIME_ALIASES = [
  'time', 'bill_time', 'transaction_time', 'invoice_time', 'order_time', 'created_time',
];
const DAY_TIMELINE_STOCK_ALIASES = [
  'current_stock', 'stock', 'on_hand', 'qty_on_hand', 'available_stock', 'stock_balance',
  'remaining_stock', 'closing_stock', 'balance_qty', 'available',
];

const parseDetailedDateTime = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const normalized = raw.replace(/\./g, '-').replace(/\//g, '-').replace('T', ' ');
  const dmyMatch = normalized.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmyMatch) {
    const [, dd, mm, yyyy, hh = '0', min = '0', ss = '0'] = dmyMatch;
    const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const ymdMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (ymdMatch) {
    const [, yyyy, mm, dd, hh = '0', min = '0', ss = '0'] = ymdMatch;
    const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
};

const getRowDateTime = (row) => {
  const timestampValue = getFieldByAliases(row, DAY_TIMELINE_TIMESTAMP_ALIASES);
  const parsedTimestamp = parseDetailedDateTime(timestampValue);
  if (parsedTimestamp) return parsedTimestamp;

  const dateValue = getFieldByAliases(row, HISTORY_ORDER_DATE_ALIASES) || getFieldByAliases(row, SALES_DATE_KEYS);
  const timeValue = getFieldByAliases(row, DAY_TIMELINE_TIME_ALIASES);
  if (dateValue && timeValue) {
    const combined = parseDetailedDateTime(`${dateValue} ${timeValue}`);
    if (combined) return combined;
  }

  return parseDetailedDateTime(dateValue);
};

const formatHourLabel = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const buildDayTimelineRowsFromAnalysis = (analysisPayload = {}, selectedDay) => {
  const rows = collectHistorySourceRows(analysisPayload);

  return rows
    .filter(isSalesHistoryRow)
    .map((row, index) => {
      const timestamp = getRowDateTime(row);
      if (!timestamp || toIsoDay(timestamp) !== selectedDay) return null;

      const quantity = Math.max(0, toSafeNumber(getFieldByAliases(row, HISTORY_QTY_ALIASES)) || 0);
      if (quantity <= 0) return null;

      const unitPrice = toSafeNumber(getFieldByAliases(row, HISTORY_UNIT_PRICE_ALIASES));
      const amount = toSafeNumber(getFieldByAliases(row, HISTORY_TOTAL_ALIASES)) ?? (unitPrice != null ? quantity * unitPrice : 0);
      const stockLeft = toSafeNumber(getFieldByAliases(row, DAY_TIMELINE_STOCK_ALIASES));

      return {
        id: `day-line-${index}-${timestamp.getTime()}`,
        timestamp,
        timeLabel: formatHourLabel(timestamp),
        hourKey: `${String(timestamp.getHours()).padStart(2, '0')}:00`,
        customerName: toSmartTitle(
          getFieldByAliases(row, HISTORY_CUSTOMER_NAME_ALIASES)
          || getFieldByAliases(row, HISTORY_CUSTOMER_ID_ALIASES)
          || 'Direct Customer'
        ),
        stockName: toSmartTitle(getFieldByAliases(row, HISTORY_PRODUCT_ALIASES) || 'Unknown Stock'),
        quantity,
        amount,
        stockLeft,
        orderId: cleanTextValue(getFieldByAliases(row, HISTORY_ORDER_ID_ALIASES)) || 'Auto-detected',
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0));
};

const buildHourlySalesBuckets = (rows = []) => {
  const byHour = new Map();

  rows.forEach((row) => {
    const key = row.hourKey || 'Unknown';
    if (!byHour.has(key)) {
      byHour.set(key, {
        hourKey: key,
        quantity: 0,
        amount: 0,
        stockLeft: null,
        orderCount: 0,
        items: new Set(),
      });
    }

    const bucket = byHour.get(key);
    bucket.quantity += Number(row.quantity || 0);
    bucket.amount += Number(row.amount || 0);
    bucket.orderCount += 1;
    if (row.stockName) bucket.items.add(row.stockName);
    if (row.stockLeft != null) bucket.stockLeft = row.stockLeft;
  });

  return Array.from(byHour.values())
    .sort((a, b) => a.hourKey.localeCompare(b.hourKey))
    .map((bucket) => ({
      ...bucket,
      itemCount: bucket.items.size,
    }));
};

const summarizeDayTimeline = (rows = []) => {
  const hours = new Set();
  let stockSnapshots = 0;

  const summary = rows.reduce((acc, row) => {
    acc.quantity += Number(row.quantity || 0);
    acc.amount += Number(row.amount || 0);
    acc.orders += 1;
    hours.add(row.hourKey);
    if (row.stockLeft != null) {
      acc.latestStockLeft = row.stockLeft;
      stockSnapshots += 1;
    }
    return acc;
  }, {
    quantity: 0,
    amount: 0,
    orders: 0,
    latestStockLeft: null,
  });

  return {
    ...summary,
    activeHours: hours.size,
    stockSnapshots,
  };
};

const extractAnalysisPayload = (payload) => {
  if (!payload) return null;
  if (payload.analysis && typeof payload.analysis === 'object') return payload.analysis;
  if (payload.payload?.analysis && typeof payload.payload.analysis === 'object') return payload.payload.analysis;
  if (typeof payload === 'object') return payload;
  return null;
};

const hasUsableForecastPayload = (payload) => {
  const analysisPayload = extractAnalysisPayload(payload);
  if (!analysisPayload || typeof analysisPayload !== 'object') return false;

  return Boolean(
    (Array.isArray(analysisPayload?.demand_forecast) && analysisPayload.demand_forecast.length)
    || (Array.isArray(analysisPayload?.past_sales_daily) && analysisPayload.past_sales_daily.length)
    || (Array.isArray(analysisPayload?.past_sales_weekly) && analysisPayload.past_sales_weekly.length)
    || (Array.isArray(analysisPayload?.past_sales) && analysisPayload.past_sales.length)
    || (Array.isArray(analysisPayload?.forecast?.next_365_days) && analysisPayload.forecast.next_365_days.length)
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const ForecastViewer = () => {
  const { analysis: liveAnalysis, selectedUploadId } = useAnalysis();
  const [auditData, setAuditData] = useState({ aggregate_accuracy: 0, stability: 'Analyzing...', recommendation: '' });
  const [forecasts, setForecasts] = useState([]);
  const [pastDailyData, setPastDailyData] = useState([]);
  const [pastWeeklyData, setPastWeeklyData] = useState([]);
  const [forecastRawData, setForecastRawData] = useState([]);
  const [historySourcePayload, setHistorySourcePayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forecastMode, setForecastMode] = useState('future');
  const [timeGranularity, setTimeGranularity] = useState('month');
  const [forecastViewMode, setForecastViewMode] = useState('chart');
  const [selectedDay, setSelectedDay] = useState(() => toInputDay(new Date()));
  const [selectedMonth, setSelectedMonth] = useState(() => toInputMonth(new Date()));
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getFullYear()));
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [detailViewMode, setDetailViewMode] = useState('cards');
  const [showTrends, setShowTrends] = useState(false);
  const [showAllTrends, setShowAllTrends] = useState(false);
  const [trendTimeGranularity, setTrendTimeGranularity] = useState('day');
  const [trendSelectedDay, setTrendSelectedDay] = useState(() => toInputDay(new Date()));
  const [trendSelectedMonth, setTrendSelectedMonth] = useState(() => toInputMonth(new Date()));
  const [trendSelectedYear, setTrendSelectedYear] = useState(() => String(new Date().getFullYear()));
  const analysisPayload = useMemo(() => extractAnalysisPayload(liveAnalysis), [liveAnalysis]);

  const applyAnalysisPayload = (analysisPayload, sourcePayload = null) => {
    const normalizedPastDaily = normalizeActualRows(analysisPayload?.past_sales_daily || analysisPayload?.past_sales || []);
    setPastDailyData(normalizedPastDaily);
    setPastWeeklyData(normalizeActualRows(analysisPayload?.past_sales_weekly || []));
    setForecastRawData(buildForecastSeriesFromAnalysis(analysisPayload, normalizedPastDaily));
    setForecasts(buildForecastProductsFromAnalysis(analysisPayload));
    setHistorySourcePayload(sourcePayload || analysisPayload || null);
    setAuditData({
      aggregate_accuracy: Number(analysisPayload?.confidence_score || 0),
      stability: analysisPayload?.confidence_label || analysisPayload?.metadata?.confidence || 'Data not available',
      recommendation: Array.isArray(analysisPayload?.recommendations) && analysisPayload.recommendations.length
        ? analysisPayload.recommendations[0]
        : 'Data not available',
    });
  };

  useEffect(() => {
    const payload = analysisPayload;
    if (!hasUsableForecastPayload(payload)) return;
    applyAnalysisPayload(payload, payload);
    setLoading(false);
  }, [analysisPayload]);

  const availableYears = useMemo(() => {
    const years = new Set();
    [...pastDailyData, ...pastWeeklyData, ...forecastRawData].forEach((row) => {
      const date = getRowDate(row);
      if (date) years.add(date.getFullYear());
    });
    if (!years.size) {
      const thisYear = new Date().getFullYear();
      return [thisYear - 1, thisYear, thisYear + 1];
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [pastDailyData, pastWeeklyData, forecastRawData]);

  const availableTrendYears = useMemo(() => {
    const years = new Set();
    pastDailyData.forEach((row) => {
      const date = getRowDate(row);
      if (date) years.add(date.getFullYear());
    });
    if (!years.size) {
      const thisYear = new Date().getFullYear();
      return [thisYear - 1, thisYear, thisYear + 1];
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [pastDailyData]);

  useEffect(() => {
    if (!availableYears.length) return;
    if (!availableYears.includes(Number(selectedYear))) {
      setSelectedYear(String(availableYears[0]));
    }
  }, [availableYears, selectedYear]);

  useEffect(() => {
    if (!availableTrendYears.length) return;
    if (!availableTrendYears.includes(Number(trendSelectedYear))) {
      setTrendSelectedYear(String(availableTrendYears[0]));
    }
  }, [availableTrendYears, trendSelectedYear]);

  const displayForecastData = useMemo(() => {
    const filteredRows = filterRowsByGranularity(
      forecastRawData,
      timeGranularity,
      selectedDay,
      selectedMonth,
      selectedYear
    );
    if (timeGranularity === 'year') {
      return aggregateMonthly(filteredRows, { valueKeys: ['predicted', 'lower', 'upper'], mode: 'sum' });
    }
    return filteredRows;
  }, [forecastRawData, timeGranularity, selectedDay, selectedMonth, selectedYear]);

  const previousSelection = useMemo(
    () => getPreviousPeriodSelection(timeGranularity, selectedDay, selectedMonth, selectedYear),
    [timeGranularity, selectedDay, selectedMonth, selectedYear]
  );

  const trendSalesRows = useMemo(() => {
    const filtered = filterRowsByGranularity(
      pastDailyData,
      trendTimeGranularity,
      trendSelectedDay,
      trendSelectedMonth,
      trendSelectedYear
    );

    if (trendTimeGranularity === 'year') {
      return aggregateMonthly(filtered, { valueKeys: ['actual'], mode: 'sum' });
    }

    return [...filtered].sort((a, b) => {
      const dateA = getRowDate(a)?.getTime() || 0;
      const dateB = getRowDate(b)?.getTime() || 0;
      return dateA - dateB;
    });
  }, [pastDailyData, trendTimeGranularity, trendSelectedDay, trendSelectedMonth, trendSelectedYear]);

  const trendSalesTotal = useMemo(
    () => trendSalesRows.reduce((sum, row) => sum + Number(row?.actual || 0), 0),
    [trendSalesRows]
  );

  const historyRows = useMemo(
    () => buildHistoryRowsFromAnalysis(historySourcePayload || analysisPayload || {}),
    [historySourcePayload, analysisPayload]
  );

  const dayTimelineRows = useMemo(
    () => buildDayTimelineRowsFromAnalysis(historySourcePayload || analysisPayload || {}, selectedDay),
    [historySourcePayload, analysisPayload, selectedDay]
  );

  const hourlySalesBuckets = useMemo(
    () => buildHourlySalesBuckets(dayTimelineRows),
    [dayTimelineRows]
  );

  const dayTimelineSummary = useMemo(
    () => summarizeDayTimeline(dayTimelineRows),
    [dayTimelineRows]
  );

  const displayPastData = useMemo(() => {
    if (timeGranularity === 'day' && hourlySalesBuckets.length > 0) {
      return hourlySalesBuckets.map((bucket) => ({
        period: bucket.hourKey,
        actual: Number(bucket.quantity || 0),
        amount: Number(bucket.amount || 0),
        stockLeft: bucket.stockLeft,
        orderCount: bucket.orderCount,
      }));
    }

    const sourceRows = pastDailyData.length ? pastDailyData : pastWeeklyData;
    const filteredRows = filterRowsByGranularity(
      sourceRows,
      timeGranularity,
      selectedDay,
      selectedMonth,
      selectedYear
    );

    if (timeGranularity === 'year') {
      return aggregateMonthly(filteredRows, { valueKeys: ['actual'], mode: 'sum' });
    }
    return filteredRows;
  }, [pastDailyData, pastWeeklyData, timeGranularity, selectedDay, selectedMonth, selectedYear, hourlySalesBuckets]);

  const comparisonMetrics = useMemo(() => {
    const sourcePast = pastDailyData.length ? pastDailyData : pastWeeklyData;
    const previousPast = filterRowsByGranularity(
      sourcePast,
      timeGranularity,
      previousSelection.selectedDay,
      previousSelection.selectedMonth,
      previousSelection.selectedYear
    );
    const previousFuture = filterRowsByGranularity(
      forecastRawData,
      timeGranularity,
      previousSelection.selectedDay,
      previousSelection.selectedMonth,
      previousSelection.selectedYear
    );

    const currentPastValue = sumField(displayPastData, 'actual');
    const currentFutureValue = sumField(displayForecastData, 'predicted');
    const previousPastValue = sumField(previousPast, 'actual');
    const previousFutureValue = sumField(previousFuture, 'predicted');

    const currentValue = forecastMode === 'past'
      ? currentPastValue
      : (forecastMode === 'future' ? currentFutureValue : currentPastValue + currentFutureValue);
    const previousValue = forecastMode === 'past'
      ? previousPastValue
      : (forecastMode === 'future' ? previousFutureValue : previousPastValue + previousFutureValue);

    const delta = currentValue - previousValue;
    const deltaPct = previousValue > 0 ? (delta / previousValue) * 100 : null;

    return {
      currentValue,
      previousValue,
      delta,
      deltaPct,
    };
  }, [
    pastDailyData,
    pastWeeklyData,
    forecastRawData,
    timeGranularity,
    previousSelection,
    displayPastData,
    displayForecastData,
    forecastMode,
  ]);

  const availableMonths = useMemo(() => {
    const months = new Set();
    [...pastDailyData, ...forecastRawData].forEach((row) => {
      const date = getRowDate(row);
      if (date) months.add(toInputMonth(date));
    });
    historyRows.forEach((row) => {
      if (row?.effectiveDate) months.add(toInputMonth(row.effectiveDate));
    });
    return Array.from(months).sort().reverse();
  }, [pastDailyData, forecastRawData, historyRows]);

  const availableDays = useMemo(() => {
    const days = new Set();
    [...pastDailyData, ...forecastRawData].forEach((row) => {
      const date = getRowDate(row);
      if (date) days.add(toIsoDay(date));
    });
    historyRows.forEach((row) => {
      if (row?.effectiveDate) days.add(toIsoDay(row.effectiveDate));
    });
    return Array.from(days).sort().reverse();
  }, [pastDailyData, forecastRawData, historyRows]);

  useEffect(() => {
    if (!availableMonths.length) return;
    if (!availableMonths.includes(selectedMonth)) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  useEffect(() => {
    if (!availableDays.length) return;
    if (!availableDays.includes(selectedDay)) {
      setSelectedDay(availableDays[0]);
    }
  }, [availableDays, selectedDay]);

  const filteredHistoryRows = useMemo(() => {
    const scopedRows = filterHistoryRowsByGranularity(
      historyRows,
      timeGranularity,
      selectedDay,
      selectedMonth,
      selectedYear
    );

    const query = cleanTextValue(historySearchTerm).toLowerCase();
    if (!query) return scopedRows;

    return scopedRows.filter((row) => (
      String(row?.customerName || '').toLowerCase().includes(query)
      || String(row?.stockName || '').toLowerCase().includes(query)
      || String(row?.orderId || '').toLowerCase().includes(query)
      || String(row?.paymentStatus || '').toLowerCase().includes(query)
    ));
  }, [historyRows, timeGranularity, selectedDay, selectedMonth, selectedYear, historySearchTerm]);

  const historySummary = useMemo(
    () => summarizeHistoryRows(filteredHistoryRows),
    [filteredHistoryRows]
  );

  const topHistoryCustomers = useMemo(() => {
    const byCustomer = new Map();
    filteredHistoryRows.forEach((row) => {
      const key = row.customerId || row.customerName;
      if (!key) return;
      if (!byCustomer.has(key)) {
        byCustomer.set(key, {
          customerName: row.customerName,
          customerId: row.customerId,
          orders: 0,
          quantity: 0,
          totalAmount: 0,
          pendingAmount: 0,
          latestOrderDate: row.orderDate || row.deliveryDate || null,
        });
      }
      const entry = byCustomer.get(key);
      entry.orders += 1;
      entry.quantity += Number(row.quantity || 0);
      entry.totalAmount += Number(row.totalAmount || 0);
      entry.pendingAmount += Number(row.pendingAmount || 0);
      entry.latestOrderDate = entry.latestOrderDate || row.orderDate || row.deliveryDate || null;
    });

    return Array.from(byCustomer.values())
      .sort((a, b) => (b.totalAmount - a.totalAmount) || (b.quantity - a.quantity))
      .slice(0, 3);
  }, [filteredHistoryRows]);

  const selectionLabel = useMemo(() => {
    if (timeGranularity === 'day') return selectedDay;
    if (timeGranularity === 'month') return selectedMonth;
    return selectedYear;
  }, [timeGranularity, selectedDay, selectedMonth, selectedYear]);

  const combinedWindowRows = useMemo(() => {
    const rowsMap = new Map();

    displayPastData.forEach((row) => {
      const key = String(row?.period || '');
      if (!key) return;
      rowsMap.set(key, {
        period: key,
        actual: Number(row?.actual || 0),
        predicted: null,
        lower: null,
        upper: null,
      });
    });

    displayForecastData.forEach((row) => {
      const key = String(row?.period || '');
      if (!key) return;
      const existing = rowsMap.get(key) || {
        period: key,
        actual: null,
        predicted: null,
        lower: null,
        upper: null,
      };
      rowsMap.set(key, {
        ...existing,
        predicted: Number(row?.predicted || 0),
        lower: row?.lower != null ? Number(row.lower) : null,
        upper: row?.upper != null ? Number(row.upper) : null,
      });
    });

    return Array.from(rowsMap.values());
  }, [displayPastData, displayForecastData]);

  const exportSelectedWindowCsv = () => {
    const rowsMap = new Map();

    displayPastData.forEach((row) => {
      const key = String(row?.period || '');
      if (!key) return;
      rowsMap.set(key, {
        period: key,
        actual: Number(row?.actual || 0),
        predicted: '',
        lower: '',
        upper: '',
      });
    });

    displayForecastData.forEach((row) => {
      const key = String(row?.period || '');
      if (!key) return;
      const existing = rowsMap.get(key) || {
        period: key,
        actual: '',
        predicted: '',
        lower: '',
        upper: '',
      };
      rowsMap.set(key, {
        ...existing,
        predicted: Number(row?.predicted || 0),
        lower: row?.lower != null ? Number(row.lower) : '',
        upper: row?.upper != null ? Number(row.upper) : '',
      });
    });

    const rows = Array.from(rowsMap.values());
    if (!rows.length) return;

    const header = ['period', 'actual', 'predicted', 'lower', 'upper'];
    const csv = [
      header.join(','),
      ...rows.map((row) => header.map((key) => row[key] ?? '').join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `forecast-window-${timeGranularity}-${selectionLabel}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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
      const contextPayload = extractAnalysisPayload(liveAnalysis);
      const hasContextData = hasUsableForecastPayload(contextPayload);
      if (!hasContextData) {
        setLoading(true);
      }

      let analysisPayload = null;
      let sourcePayload = null;

      if (hasContextData) {
        analysisPayload = contextPayload;
        sourcePayload = liveAnalysis;
        applyAnalysisPayload(analysisPayload, sourcePayload);
        setLoading(false);
      }

      // 1) Highest authority: explicitly selected upload from backend DB
      if (selectedUploadId) {
        try {
          const { data } = await api.get(`/ingestion/upload-analysis/${selectedUploadId}/`);
          sourcePayload = data;
          analysisPayload = extractAnalysisPayload(data);
        } catch {
          analysisPayload = null;
          sourcePayload = null;
        }
      }

      // 2) If no selected upload payload available, use latest backend analysis
      if (!analysisPayload) {
        try {
          const { data } = await api.get('/ingestion/latest-analysis/');
          sourcePayload = data;
          analysisPayload = extractAnalysisPayload(data);
        } catch {
          analysisPayload = null;
          sourcePayload = null;
        }
      }

      // 3) In-memory context analysis as a final non-persistent fallback
      if (!analysisPayload) {
        analysisPayload = contextPayload;
        sourcePayload = liveAnalysis;
      }

      if (analysisPayload) {
        applyAnalysisPayload(analysisPayload, sourcePayload || analysisPayload);
        return;
      }

      setPastDailyData([]);
      setPastWeeklyData([]);
      setForecastRawData([]);
      setForecasts([]);
      setHistorySourcePayload(sourcePayload || liveAnalysis || null);
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
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
          <div className="w-7 h-7 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
            <Activity size={14} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1">
            <span className="text-[12px] font-semibold text-slate-700">
              Forecast engine is active
            </span>
            <span className="text-[11px] text-slate-500 ml-2">
              Live analysis based on uploaded sales history
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-semibold text-emerald-600">Live</span>
          </div>
        </div>

        {/* ── Chart Section ── */}
        <div className="px-6 pt-6 pb-3">
          <div className="mb-4">
            <div>
              <h3 className="text-[20px] font-semibold text-slate-900 dark:text-white leading-none mb-1">
                Sales Forecast
              </h3>
              <p className="text-[13px] text-slate-500 dark:text-slate-400">
                Past and future demand view
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/60 p-2.5 mb-4">
              <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1">
                <button
                  onClick={() => setForecastMode('past')}
                  className={`px-3.5 py-2 rounded-lg text-[12px] font-medium transition-all duration-200 ${forecastMode === 'past' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  Past
                </button>
                <button
                  onClick={() => setForecastMode('future')}
                  className={`px-3.5 py-2 rounded-lg text-[12px] font-medium transition-all duration-200 ${forecastMode === 'future' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  Future
                </button>
                <button
                  onClick={() => setForecastMode('combined')}
                  className={`px-3.5 py-2 rounded-lg text-[12px] font-medium transition-all duration-200 ${forecastMode === 'combined' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  Combined
                </button>
              </div>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1"
              >
                {['day', 'month', 'year'].map((option) => (
                  <button
                    key={option}
                    onClick={() => setTimeGranularity(option)}
                    className={`px-3 py-2 rounded-lg text-[12px] font-medium transition-all duration-200 ${timeGranularity === option ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {option}
                  </button>
                ))}
              </motion.div>
              <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-2 py-1.5">
                {timeGranularity === 'day' && (
                  <input
                    type="date"
                    value={selectedDay}
                    onChange={(e) => setSelectedDay(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-700 focus:border-slate-400 focus:outline-none"
                  />
                )}
                {timeGranularity === 'month' && (
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-700 focus:border-slate-400 focus:outline-none"
                  />
                )}
                {timeGranularity === 'year' && (
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-700 focus:border-slate-400 focus:outline-none"
                  >
                    {availableYears.map((yearValue) => (
                      <option key={yearValue} value={String(yearValue)}>
                        {yearValue}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="ml-auto inline-flex items-center gap-2">
                <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    title="Chart view"
                    aria-label="Chart view"
                    onClick={() => setForecastViewMode('chart')}
                    className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors ${forecastViewMode === 'chart' ? 'border-slate-900 bg-slate-900 text-white' : 'border-transparent text-slate-600 hover:bg-slate-100'}`}
                  >
                    <BarChart3 size={14} />
                    <span>Chart</span>
                  </button>
                  <button
                    type="button"
                    title="Table view"
                    aria-label="Table view"
                    onClick={() => setForecastViewMode('table')}
                    className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors ${forecastViewMode === 'table' ? 'border-slate-900 bg-slate-900 text-white' : 'border-transparent text-slate-600 hover:bg-slate-100'}`}
                  >
                    <List size={14} />
                    <span>Table</span>
                  </button>
                </div>
                <button
                  onClick={() => {
                    setShowAllTrends(false);
                    setShowTrends(true);
                  }}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  <TrendingUp size={14} />
                  Trends
                </button>
              </div>
          </div>
          <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[12px] font-medium text-slate-500">Selected period</p>
              <p className="mt-1 text-[15px] font-semibold text-slate-900">{selectionLabel}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[12px] font-medium text-slate-500">Current total</p>
              <p className="mt-1 text-[15px] font-semibold text-slate-900">{formatUnits(comparisonMetrics.currentValue)} units</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[12px] font-medium text-slate-500">Change vs previous</p>
              <p className={`mt-1 text-[15px] font-semibold ${comparisonMetrics.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {comparisonMetrics.delta >= 0 ? '+' : ''}{formatUnits(comparisonMetrics.delta)} units
                {comparisonMetrics.deltaPct !== null ? ` (${comparisonMetrics.deltaPct >= 0 ? '+' : ''}${comparisonMetrics.deltaPct.toFixed(1)}%)` : ''}
              </p>
            </div>
          </div>
          {forecastViewMode === 'chart' ? (
            <div className="min-h-[300px]">
              <PredictionChart
                pastData={displayPastData}
                forecastData={displayForecastData}
                mode={forecastMode}
                horizon={timeGranularity}
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] table-fixed">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      {['Period', 'Actual Sales', 'Forecast', 'Range'].map((label) => (
                        <th key={label} className="px-4 py-3 text-[11px] font-semibold text-slate-600">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {combinedWindowRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                          No rows available for selected filters.
                        </td>
                      </tr>
                    ) : (
                      combinedWindowRows.map((row, idx) => (
                        <tr key={`${row.period}-${idx}`} className="border-t border-slate-100">
                          <td className="px-4 py-3 text-sm font-medium text-slate-800">{row.period}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            {row.actual != null ? `${formatUnits(row.actual)} units` : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            {row.predicted != null ? `${formatUnits(row.predicted)} units` : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            {row.lower != null && row.upper != null
                              ? `${formatUnits(row.lower)} - ${formatUnits(row.upper)}`
                              : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Product Cards Grid ── */}
        <div className="border-t border-slate-100 bg-gradient-to-b from-white to-slate-50/60 px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                <ShieldCheck size={12} />
                Past Results Intelligence
              </div>
              <h3 className="mt-3 text-[20px] font-semibold text-slate-900">
                Customer order, delivery, and payment history
              </h3>
              <p className="mt-1 text-[13px] text-slate-500">
                Selected {timeGranularity} ka complete customer stock ledger yahan clear breakdown mein dikh raha hai.
              </p>
            </div>

            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3">
                <Search size={15} className="text-slate-400" />
                <input
                  value={historySearchTerm}
                  onChange={(e) => setHistorySearchTerm(e.target.value)}
                  placeholder="Search customer, stock, order id, payment..."
                  className="w-full bg-transparent text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  {filteredHistoryRows.length} rows
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              {
                label: 'Customers',
                value: historySummary.customerCount,
                hint: `${historySummary.stockCount} stocks in selected window`,
                icon: Users,
                tone: 'text-sky-600 bg-sky-50 border-sky-200',
              },
              {
                label: 'Units Ordered',
                value: formatUnits(historySummary.quantity),
                hint: `${filteredHistoryRows.length} order rows`,
                icon: Box,
                tone: 'text-violet-600 bg-violet-50 border-violet-200',
              },
              {
                label: 'Order Value',
                value: formatCompactCurrency(historySummary.totalAmount),
                hint: 'Total billed amount',
                icon: CircleDollarSign,
                tone: 'text-emerald-600 bg-emerald-50 border-emerald-200',
              },
              {
                label: 'Payment Received',
                value: formatCompactCurrency(historySummary.paidAmount),
                hint: `${historySummary.paidOrders} fully paid orders`,
                icon: CheckCircle2,
                tone: 'text-teal-600 bg-teal-50 border-teal-200',
              },
              {
                label: 'Pending Balance',
                value: formatCompactCurrency(historySummary.pendingAmount),
                hint: `${historySummary.partialOrders + historySummary.pendingOrders} orders need follow-up`,
                icon: Activity,
                tone: 'text-amber-700 bg-amber-50 border-amber-200',
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{card.label}</p>
                      <p className="mt-2 text-[20px] font-black tracking-tight text-slate-900">{card.value}</p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">{card.hint}</p>
                    </div>
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${card.tone}`}>
                      <Icon size={18} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {timeGranularity === 'day' && (
            <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_1.85fr]">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Daily Operations</p>
                    <h4 className="mt-2 text-lg font-black text-slate-900">Time-wise sales and stock movement</h4>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2 text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Selected day</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">{formatFriendlyDate(selectedDay)}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Total sold</p>
                    <p className="mt-1 text-xl font-black text-slate-900">{formatUnits(dayTimelineSummary.quantity)} units</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Sales value</p>
                    <p className="mt-1 text-xl font-black text-slate-900">{formatCompactCurrency(dayTimelineSummary.amount)}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Active hours</p>
                    <p className="mt-1 text-xl font-black text-slate-900">{dayTimelineSummary.activeHours}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Latest stock left</p>
                    <p className="mt-1 text-xl font-black text-slate-900">
                      {dayTimelineSummary.latestStockLeft != null ? `${formatUnits(dayTimelineSummary.latestStockLeft)} units` : 'Not available'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Intraday Summary</p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">Har hour ka sale aur stock snapshot</p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600">
                      <Clock size={13} className="text-sky-500" />
                      {hourlySalesBuckets.length} hourly blocks
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {hourlySalesBuckets.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
                        <p className="text-sm font-semibold text-slate-500">Selected day ke liye time-stamped sales rows nahi mile.</p>
                        <p className="mt-2 text-[12px] text-slate-400">Agar upload me `timestamp`, `created_at`, `time`, `transaction_time` ya datetime column hoga to yeh automatically fill hoga.</p>
                      </div>
                    ) : (
                      hourlySalesBuckets.map((bucket) => {
                        const maxQty = Math.max(...hourlySalesBuckets.map((item) => Number(item.quantity || 0)), 1);
                        const width = `${Math.max(8, Math.round((Number(bucket.quantity || 0) / maxQty) * 100))}%`;
                        return (
                          <div key={bucket.hourKey} className="rounded-2xl border border-white bg-white px-4 py-3 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-[12px] font-black uppercase tracking-[0.12em] text-slate-900">{bucket.hourKey}</p>
                                <p className="mt-1 text-[11px] font-semibold text-slate-500">
                                  {bucket.orderCount} rows • {bucket.itemCount} items
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-black text-slate-900">{formatUnits(bucket.quantity)} units</p>
                                <p className="mt-1 text-[11px] font-semibold text-slate-500">{formatCompactCurrency(bucket.amount)}</p>
                              </div>
                            </div>

                            <div className="mt-3 h-2 rounded-full bg-slate-100">
                              <div className="h-2 rounded-full bg-gradient-to-r from-sky-500 via-emerald-500 to-violet-500" style={{ width }} />
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-3 text-[11px] font-semibold">
                              <span className="text-slate-500">Stock left</span>
                              <span className="text-slate-800">
                                {bucket.stockLeft != null ? `${formatUnits(bucket.stockLeft)} units` : 'No snapshot'}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Intraday Ledger</p>
                    <h4 className="mt-1 text-lg font-black text-slate-900">Exact time, item sold, customer, and stock left</h4>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600">
                    <Clock size={14} className="text-sky-500" />
                    Day timeline view
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1020px]">
                    <thead className="bg-white">
                      <tr className="text-left">
                        {['Time', 'Stock', 'Customer', 'Sold Qty', 'Sale Value', 'Stock Left', 'Reference'].map((label) => (
                          <th key={label} className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dayTimelineRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center">
                            <div className="mx-auto max-w-md">
                              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-600">
                                <Clock size={24} />
                              </div>
                              <p className="mt-4 text-base font-black text-slate-900">No time-wise day rows found</p>
                              <p className="mt-2 text-sm text-slate-500">
                                Selected day ke liye time-stamped transactional data nahi mila. Date ke saath time/timestamp column hoga to yahan full intraday flow dikhega.
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        dayTimelineRows.map((row) => (
                          <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                            <td className="px-4 py-4 text-sm font-black text-slate-900">{row.timeLabel}</td>
                            <td className="px-4 py-4 text-sm font-bold text-slate-800">{row.stockName}</td>
                            <td className="px-4 py-4 text-sm font-semibold text-slate-700">{row.customerName}</td>
                            <td className="px-4 py-4 text-sm font-black text-slate-900">{formatUnits(row.quantity)} units</td>
                            <td className="px-4 py-4 text-sm font-bold text-emerald-700">{formatCurrency(row.amount || 0)}</td>
                            <td className="px-4 py-4 text-sm font-bold text-slate-800">
                              {row.stockLeft != null ? `${formatUnits(row.stockLeft)} units` : 'Not available'}
                            </td>
                            <td className="px-4 py-4 text-[11px] font-semibold text-slate-500">{row.orderId}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_2.2fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Key Accounts</p>
                  <h4 className="mt-2 text-lg font-black text-slate-900">Top customers in this period</h4>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2 text-right">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Window</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">{selectionLabel}</p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {topHistoryCustomers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                    <p className="text-sm font-semibold text-slate-500">Selected filter ke liye customer-level order history abhi available nahi hai.</p>
                  </div>
                ) : (
                  topHistoryCustomers.map((customer, index) => (
                    <div key={`${customer.customerId}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-black uppercase tracking-tight text-slate-900">{customer.customerName}</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            {customer.orders} orders • {formatUnits(customer.quantity)} units
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 shadow-sm">
                          #{index + 1}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-white bg-white px-3 py-2">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Billed</p>
                          <p className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(customer.totalAmount)}</p>
                        </div>
                        <div className="rounded-xl border border-white bg-white px-3 py-2">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Pending</p>
                          <p className={`mt-1 text-sm font-bold ${customer.pendingAmount > 0 ? 'text-amber-700' : 'text-emerald-600'}`}>
                            {formatCurrency(customer.pendingAmount)}
                          </p>
                        </div>
                      </div>

                      <p className="mt-3 text-[11px] font-medium text-slate-500">
                        Latest order: <span className="font-bold text-slate-700">{formatFriendlyDate(customer.latestOrderDate)}</span>
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Detailed Ledger</p>
                  <h4 className="mt-1 text-lg font-black text-slate-900">Who bought what, when, and payment status</h4>
                </div>
                <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600">
                  <Truck size={14} className="text-emerald-500" />
                  Delivery + payment timeline
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px]">
                  <thead className="bg-white">
                    <tr className="text-left">
                      {['Customer', 'Stock', 'Qty', 'Order Value', 'Paid', 'Pending', 'Order Date', 'Delivery', 'Payment', 'Reference'].map((label) => (
                        <th key={label} className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistoryRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-12 text-center">
                          <div className="mx-auto max-w-md">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600">
                              <ShieldCheck size={26} />
                            </div>
                            <p className="mt-4 text-base font-black text-slate-900">No past result rows for selected filter</p>
                            <p className="mt-2 text-sm text-slate-500">
                              Agar uploaded sheet mein customer, product, quantity, order/delivery ya payment columns honge to yeh section automatically populate ho jayega.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredHistoryRows.map((row) => {
                        const paymentTone = row.paymentStatus === 'Paid'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : (row.paymentStatus === 'Partial'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200');

                        return (
                          <tr key={row.id} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
                            <td className="px-4 py-4">
                              <p className="text-sm font-black text-slate-900">{row.customerName}</p>
                              <p className="mt-1 text-[11px] font-semibold text-slate-500">{row.customerId}</p>
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-sm font-bold text-slate-800">{row.stockName}</p>
                            </td>
                            <td className="px-4 py-4 text-sm font-bold text-slate-800">{formatUnits(row.quantity)}</td>
                            <td className="px-4 py-4 text-sm font-bold text-slate-800">{formatCurrency(row.totalAmount || 0)}</td>
                            <td className="px-4 py-4 text-sm font-bold text-emerald-700">{formatCurrency(row.paidAmount || 0)}</td>
                            <td className="px-4 py-4 text-sm font-bold text-amber-700">{formatCurrency(row.pendingAmount || 0)}</td>
                            <td className="px-4 py-4">
                              <p className="text-sm font-semibold text-slate-800">{formatFriendlyDate(row.orderDate)}</p>
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-sm font-semibold text-slate-800">{formatFriendlyDate(row.deliveryDate)}</p>
                              <p className="mt-1 text-[11px] text-slate-500">{formatDeliveryDelta(row.orderDate, row.deliveryDate)}</p>
                            </td>
                            <td className="px-4 py-4">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${paymentTone}`}>
                                {row.paymentStatus}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-[11px] font-semibold text-slate-500">
                              {row.orderId || 'Auto-detected'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

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
                    onViewDetail={(p) => { setSelectedProduct(p); setDetailViewMode('cards'); setShowDetail(true); }}
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
            className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 lg:p-6 bg-slate-950/55 backdrop-blur-sm"
            onClick={() => setShowDetail(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="relative h-[94vh] w-[min(97vw,1560px)] max-h-[94vh] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.24)]"
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
                    <div className="px-5 py-5 sm:px-8 sm:py-6 border-b border-slate-200 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-200 flex items-center justify-center text-emerald-600">
                            <BarChart3 size={21} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-2xl font-black tracking-tight text-slate-900">{selectedProduct.name}</h3>
                            <p className="text-slate-500 text-xs font-semibold mt-1">
                              Analysis-backed weekly demand outlook with operational plan
                            </p>
                            <p className="text-[11px] text-slate-400 mt-2 font-semibold">
                              {selectedProduct.sku ? `SKU: ${selectedProduct.sku} • ` : ''}{weeks.length} forecast windows
                            </p>
                          </div>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                            <button
                              type="button"
                              onClick={() => setDetailViewMode('cards')}
                              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition-colors ${detailViewMode === 'cards' ? 'bg-emerald-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                            >
                              <Eye size={13} />
                              Card View
                            </button>
                            <button
                              type="button"
                              onClick={() => setDetailViewMode('table')}
                              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition-colors ${detailViewMode === 'table' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                            >
                              <List size={13} />
                              Table View
                            </button>
                          </div>
                          <button
                            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                            onClick={() => setShowDetail(false)}
                            aria-label="Close forecast detail"
                          >
                            <X size={16} />
                          </button>
                        </div>
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
                    ) : detailViewMode === 'cards' ? (
                      <div className="max-h-[calc(94vh-265px)] overflow-y-auto px-5 py-5 sm:px-8">
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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
                              <div key={`week-card-${i}`} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Forecast Window</p>
                                    <h4 className="mt-1 text-xl font-black text-slate-900">{w.date || `W+${i + 1}`}</h4>
                                  </div>
                                  <div className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-600">
                                    {conf == null ? 'Pending' : `${conf}% Confidence`}
                                  </div>
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-3">
                                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Expected Sales</p>
                                    <p className="mt-1 text-lg font-black text-slate-900">{formatUnits(demand)} units</p>
                                  </div>
                                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Recommended Production</p>
                                    <p className="mt-1 text-lg font-black text-slate-900">{production == null ? 'Not available' : `${formatUnits(production)} units`}</p>
                                  </div>
                                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Low Range</p>
                                    <p className="mt-1 text-lg font-black text-slate-900">{(Number.isFinite(low) && low > 0) ? `${formatUnits(low)} units` : 'Not available'}</p>
                                  </div>
                                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">High Range</p>
                                    <p className="mt-1 text-lg font-black text-slate-900">{(Number.isFinite(high) && high > 0) ? `${formatUnits(high)} units` : 'Not available'}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="overflow-x-auto max-h-[calc(94vh-265px)]">
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm px-2 sm:px-4 lg:px-6"
            onClick={() => setShowTrends(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative h-[94vh] w-[min(97vw,1520px)] max-h-[94vh] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.24)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-slate-200 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 px-5 py-5 sm:px-8 sm:py-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-200 flex items-center justify-center text-emerald-600">
                      <BarChart3 size={20} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xl font-black tracking-tight text-slate-900">Top Trending Products</h4>
                      <p className="text-xs font-semibold tracking-wide text-slate-500 mt-1">
                        Demand projection for the next {trendSummary.windowSize} weeks
                      </p>
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
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

                <div className="grid grid-cols-1 gap-3 mt-5 sm:grid-cols-3">
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

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Sales by date</p>
                      <p className="text-xs text-slate-500 mt-1">Check exact sold units by day, month, or year.</p>
                    </div>
                    <div className="inline-flex items-center gap-2">
                      <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                        {['day', 'month', 'year'].map((option) => (
                          <button
                            key={option}
                            onClick={() => setTrendTimeGranularity(option)}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${trendTimeGranularity === option ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white'}`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                      <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-2 py-1.5">
                        {trendTimeGranularity === 'day' && (
                          <input
                            type="date"
                            value={trendSelectedDay}
                            onChange={(e) => setTrendSelectedDay(e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-slate-700 focus:border-slate-400 focus:outline-none"
                          />
                        )}
                        {trendTimeGranularity === 'month' && (
                          <input
                            type="month"
                            value={trendSelectedMonth}
                            onChange={(e) => setTrendSelectedMonth(e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-slate-700 focus:border-slate-400 focus:outline-none"
                          />
                        )}
                        {trendTimeGranularity === 'year' && (
                          <select
                            value={trendSelectedYear}
                            onChange={(e) => setTrendSelectedYear(e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-slate-700 focus:border-slate-400 focus:outline-none"
                          >
                            {availableTrendYears.map((yearValue) => (
                              <option key={yearValue} value={String(yearValue)}>
                                {yearValue}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center justify-between bg-slate-50 px-3 py-2 border-b border-slate-200">
                      <p className="text-[11px] font-semibold text-slate-600">Selected sales rows</p>
                      <p className="text-[11px] font-semibold text-slate-700">
                        Total sold: {formatUnits(trendSalesTotal)} units
                      </p>
                    </div>
                    <div className="max-h-44 overflow-y-auto">
                      {trendSalesRows.length === 0 ? (
                        <p className="px-3 py-4 text-sm text-slate-500">No sales data available for selected date filter.</p>
                      ) : (
                        <table className="w-full">
                          <thead className="bg-white sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500">Date</th>
                              <th className="px-3 py-2 text-right text-[11px] font-semibold text-slate-500">Units sold</th>
                            </tr>
                          </thead>
                          <tbody>
                            {trendSalesRows.map((row, idx) => (
                              <tr key={`${row.period}-${idx}`} className="border-t border-slate-100">
                                <td className="px-3 py-2 text-sm text-slate-700">{row.period}</td>
                                <td className="px-3 py-2 text-sm font-semibold text-slate-800 text-right">
                                  {formatUnits(row.actual || 0)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {!showAllTrends && (
                <div className="max-h-[calc(94vh-300px)] overflow-y-auto px-5 py-6 sm:px-8">
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
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
                </div>
              )}

              {showAllTrends && (
                <div className="max-h-[calc(94vh-300px)] overflow-auto px-5 py-5 sm:px-8">
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
