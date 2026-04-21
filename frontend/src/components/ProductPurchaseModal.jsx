import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, TrendingUp, TrendingDown, Minus, Package, ArrowRight,
  UserCircle2, Mail, Phone, MapPin, ShieldAlert, CheckCircle2,
  Clock, AlertTriangle, Star, SlidersHorizontal, Loader2
} from 'lucide-react';
import api from '../api/client';
import { useAnalysis } from '../context/analysisContext';
import { resolveCustomerBehavior, getCustomerBehaviorMeta, CUSTOMER_BEHAVIOR } from '../utils/customerBehaviorContract';

// ─── Plain-English status labels ─────────────────────────────────────────────
const STATUS_MAP = {
  NOT_PURCHASED: { label: 'Stopped Purchasing',  color: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',             dot: 'bg-red-500' },
  MAJOR_DROP:    { label: 'Significant Drop',    color: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400', dot: 'bg-orange-500' },
  MINOR_DROP:    { label: 'Reduced Buying Pattern', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300', dot: 'bg-yellow-500' },
  UPCOMING:      { label: 'Likely Buying Soon',  color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',       dot: 'bg-blue-500' },
  STABLE:        { label: 'Stable Buying Pattern', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400', dot: 'bg-emerald-500' },
  GROWING:       { label: 'Buying More',         color: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',           dot: 'bg-sky-500' },
  NEW_ITEM:      { label: 'New Product Added',   color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400', dot: 'bg-purple-500' },
};
const getStatusLabel = (s) =>
  STATUS_MAP[s] || { label: (s || 'Unknown').replace(/_/g, ' '), color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };

const RISK_ICON_BY_BEHAVIOR = {
  [CUSTOMER_BEHAVIOR.NOT_BUYING]: ShieldAlert,
  [CUSTOMER_BEHAVIOR.BIG_DROP]: TrendingDown,
  [CUSTOMER_BEHAVIOR.BUYING_LESS]: AlertTriangle,
  [CUSTOMER_BEHAVIOR.NEW_CUSTOMER]: Star,
  [CUSTOMER_BEHAVIOR.BUYING_MORE]: TrendingUp,
  [CUSTOMER_BEHAVIOR.NORMAL]: CheckCircle2,
  [CUSTOMER_BEHAVIOR.MIXED]: SlidersHorizontal,
};

const getRisk = (client = {}) => {
  const hasMixedBehavior = String(client?.intensity_level || '').toUpperCase().includes('MIXED');
  const behavior = resolveCustomerBehavior(client, { hasMixedBehavior });
  const meta = getCustomerBehaviorMeta(behavior);
  const Icon = RISK_ICON_BY_BEHAVIOR[behavior] || Clock;
  return {
    label: meta.label,
    color: meta.badgeClass,
    icon: Icon,
  };
};

const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const formatUnits = (value) => {
  const n = toNum(value, 0);
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

const normalizeIdentity = (value) => String(value || '').trim().toUpperCase();

const extractUploadIdFromAnalysis = (analysisSource = {}) => {
  const direct = [
    analysisSource?.upload_id,
    analysisSource?.metadata?.upload_id,
    analysisSource?.analysis_isolation?.upload_id,
  ];

  for (const value of direct) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }

  const sessionId = String(analysisSource?.analysis_isolation?.session_id || '').trim();
  const match = sessionId.match(/^upload-(\d+)/i);
  if (match?.[1]) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
};

const normalizeProductRows = (rows = []) => {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => {
      const status = String(row?.status || row?.intensity_level || 'STABLE').toUpperCase();
      const previous = toNum(row?.previous_month ?? row?.prev_qty, 0);
      const current = toNum(row?.current_month ?? row?.current_qty, 0);

      let trend = String(row?.trend || '').toLowerCase();
      if (!trend) {
        if (status === 'NOT_PURCHASED' || current < previous) trend = 'down';
        else if (current > previous) trend = 'up';
        else trend = 'flat';
      }

      const change = previous > 0
        ? Number((((current - previous) / previous) * 100).toFixed(1))
        : (current > 0 ? 100 : 0);

      return {
        product_name: row?.product_name || row?.name || row?.product || 'Product',
        status,
        previous_month: previous,
        current_month: current,
        trend,
        change,
      };
    })
    .filter((row) => row.product_name);
};

const mergeSummaryIntoRows = (rows = [], summaryRows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) return Array.isArray(summaryRows) ? summaryRows : [];
  if (!Array.isArray(summaryRows) || summaryRows.length === 0) return rows;

  const summary = summaryRows[0];
  if (!summary || !summary.product_name) return rows;

  const out = [...rows];
  const idx = out.findIndex((r) => String(r?.product_name || '').trim().toUpperCase() === 'OVERALL CUSTOMER BASKET');

  if (idx >= 0) {
    out[idx] = {
      ...out[idx],
      previous_month: toNum(summary.previous_month, toNum(out[idx]?.previous_month, 0)),
      current_month: toNum(summary.current_month, toNum(out[idx]?.current_month, 0)),
      change: toNum(summary.change, toNum(out[idx]?.change, 0)),
      trend: summary.trend || out[idx]?.trend || 'flat',
      status: summary.status || out[idx]?.status || 'STABLE',
    };
    return out;
  }

  return [summary, ...out];
};

const reconcileOverallBasketFromRows = (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const normalized = [...rows];
  const overallIdx = normalized.findIndex(
    (r) => String(r?.product_name || '').trim().toUpperCase() === 'OVERALL CUSTOMER BASKET'
  );

  const itemRows = normalized.filter(
    (r) => String(r?.product_name || '').trim().toUpperCase() !== 'OVERALL CUSTOMER BASKET'
  );
  if (itemRows.length === 0) return normalized;

  const totalPrevious = itemRows.reduce((sum, r) => sum + toNum(r?.previous_month, 0), 0);
  const totalCurrent = itemRows.reduce((sum, r) => sum + toNum(r?.current_month, 0), 0);
  const change = totalPrevious > 0
    ? Number((((totalCurrent - totalPrevious) / totalPrevious) * 100).toFixed(1))
    : (totalCurrent > 0 ? 100 : 0);
  const trend = totalCurrent > totalPrevious ? 'up' : (totalCurrent < totalPrevious ? 'down' : 'flat');

  const baseStatus = totalCurrent <= 0
    ? 'NOT_PURCHASED'
    : (totalCurrent < totalPrevious ? 'MAJOR_DROP' : (totalCurrent > totalPrevious ? 'GROWING' : 'STABLE'));

  const overallRow = {
    product_name: 'Overall Customer Basket',
    status: baseStatus,
    previous_month: Number(totalPrevious.toFixed(2)),
    current_month: Number(totalCurrent.toFixed(2)),
    change,
    trend,
  };

  if (overallIdx >= 0) {
    normalized[overallIdx] = {
      ...normalized[overallIdx],
      ...overallRow,
    };
    return normalized;
  }

  return [overallRow, ...normalized];
};

const deriveMonthPairFromStockIn = (stockInAnalysis = {}) => {
  const monthly = Array.isArray(stockInAnalysis?.monthly_stock_in) ? stockInAnalysis.monthly_stock_in : [];
  const parsed = monthly
    .map((r) => ({ month: String(r?.month || '').trim(), value: toNum(r?.stock_in_units, NaN) }))
    .filter((r) => /^\d{4}-\d{2}$/.test(r.month) && Number.isFinite(r.value))
    .sort((a, b) => a.month.localeCompare(b.month));

  if (parsed.length === 0) {
    return { previous: null, current: null };
  }

  const currentKey = new Date().toISOString().slice(0, 7);
  const idx = parsed.findIndex((r) => r.month === currentKey);
  if (idx >= 0) {
    return {
      previous: idx > 0 ? toNum(parsed[idx - 1].value, 0) : 0,
      current: toNum(parsed[idx].value, 0),
    };
  }

  const latest = parsed[parsed.length - 1];
  const previous = parsed.length > 1 ? parsed[parsed.length - 2] : null;
  return {
    previous: previous ? toNum(previous.value, 0) : 0,
    current: toNum(latest.value, 0),
  };
};

const applyStockInMonthFallback = (rows = [], stockInAnalysis = {}) => {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const idx = rows.findIndex((r) => String(r?.product_name || '').trim().toUpperCase() === 'OVERALL CUSTOMER BASKET');
  if (idx < 0) return rows;

  const monthPair = deriveMonthPairFromStockIn(stockInAnalysis);
  if (!Number.isFinite(monthPair.previous) || !Number.isFinite(monthPair.current)) return rows;

  const currentRow = rows[idx] || {};
  const currentPrevious = toNum(currentRow.previous_month, 0);
  const shouldOverride = currentPrevious <= 0 && monthPair.previous > 0;
  if (!shouldOverride) return rows;

  const previous = toNum(monthPair.previous, 0);
  const current = toNum(monthPair.current, toNum(currentRow.current_month, 0));
  const change = previous > 0 ? Number((((current - previous) / previous) * 100).toFixed(1)) : (current > 0 ? 100 : 0);
  const trend = current > previous ? 'up' : (current < previous ? 'down' : 'flat');

  const out = [...rows];
  out[idx] = {
    ...currentRow,
    previous_month: previous,
    current_month: current,
    change,
    trend,
  };
  return out;
};

const buildRowsFromProducts = (products = [], client = {}) => {
  if (!Array.isArray(products) || !client) return [];

  const clientId = String(client.customer_id || '').trim().toUpperCase();
  const clientName = String(client.customer_name || client.name || client.company || '').trim().toUpperCase();

  const rows = [];
  products.forEach((p) => {
    const topCustomers = Array.isArray(p?.top_customers) ? p.top_customers : [];
    const match = topCustomers.find((c) => {
      const id = String(c?.customer_id || '').trim().toUpperCase();
      const name = String(c?.name || c?.company || '').trim().toUpperCase();
      return (clientId && id === clientId) || (clientName && (name === clientName || id === clientName));
    });

    if (!match) return;

    const trendTag = String(match?.trend_tag || '').toUpperCase();
    const riskTag = String(match?.risk_level || '').toUpperCase();
    let status = 'STABLE';
    if (trendTag.includes('DROP') || riskTag.includes('HIGH')) status = 'MAJOR_DROP';
    else if (trendTag.includes('MIXED') || riskTag.includes('MEDIUM')) status = 'MINOR_DROP';
    else if (trendTag.includes('UP')) status = 'GROWING';

    rows.push({
      product_name: p?.name || p?.product || p?.sku || 'Product',
      status,
      previous_month: 0,
      current_month: toNum(match?.total_purchased ?? match?.total_purchase, 0),
      trend: status === 'GROWING' ? 'up' : (status === 'STABLE' ? 'flat' : 'down'),
      change: status === 'GROWING' ? 100 : (status === 'STABLE' ? 0 : -30),
    });
  });

  return rows;
};

const buildRowsFromCustomerSummary = (client = {}, analysisSource = {}) => {
  if (!client || typeof client !== 'object') return [];

  const customerAnalysis = Array.isArray(analysisSource?.customer_analysis) ? analysisSource.customer_analysis : [];
  const candidates = new Set([
    normalizeIdentity(client.customer_id),
    normalizeIdentity(client.customer_name),
    normalizeIdentity(client.name),
    normalizeIdentity(client.company),
  ].filter(Boolean));
  const matchedCustomerSummary = customerAnalysis.find((row) => {
    const rowKey = normalizeIdentity(row?.customer || row?.customer_id || row?.name || row?.company);
    return rowKey && candidates.has(rowKey);
  }) || null;

  const monthlyBreakdown = Array.isArray(client.monthly_breakdown) && client.monthly_breakdown.length > 0
    ? client.monthly_breakdown
    : (Array.isArray(matchedCustomerSummary?.monthly_breakdown) ? matchedCustomerSummary.monthly_breakdown : []);
  const monthSeries = monthlyBreakdown
    .map((m) => {
      const month = String(m?.month || '').trim();
      const value = toNum(m?.amount, NaN);
      const unitsValue = toNum(m?.units, NaN);
      const metric = Number.isFinite(value) ? value : (Number.isFinite(unitsValue) ? unitsValue : NaN);
      return { month, metric };
    })
    .filter((m) => /^\d{4}-\d{2}$/.test(m.month) && Number.isFinite(m.metric))
    .sort((a, b) => a.month.localeCompare(b.month));

  let derivedPrevious = null;
  let derivedCurrent = null;
  if (monthSeries.length > 0) {
    const byMonth = new Map(monthSeries.map((m) => [m.month, m.metric]));
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const latestKey = monthSeries[monthSeries.length - 1]?.month;
    const latestValue = toNum(byMonth.get(latestKey), 0);

    if (byMonth.has(currentMonthKey)) {
      derivedCurrent = toNum(byMonth.get(currentMonthKey), 0);
      const currentIdx = monthSeries.findIndex((m) => m.month === currentMonthKey);
      if (currentIdx > 0) {
        derivedPrevious = toNum(monthSeries[currentIdx - 1]?.metric, 0);
      }
    } else {
      derivedCurrent = latestValue;
      if (monthSeries.length > 1) {
        derivedPrevious = toNum(monthSeries[monthSeries.length - 2]?.metric, 0);
      }
    }
  }

  const status = String(client.intensity_level || '').toUpperCase();
  const fallbackCurrent = toNum(matchedCustomerSummary?.total_purchase, toNum(client.total_purchase, 0));
  const current = toNum(client.current_month_qty, Number.isFinite(derivedCurrent) ? derivedCurrent : fallbackCurrent);
  const previous = toNum(client.prev_month_qty, Number.isFinite(derivedPrevious) ? derivedPrevious : 0);

  let normalizedStatus = 'STABLE';
  if (status.includes('NOT_PURCHASED') || status.includes('LIYA_HI_NAHI')) normalizedStatus = 'NOT_PURCHASED';
  else if (status.includes('MAJOR_DROP') || status.includes('BAHUT_KAM')) normalizedStatus = 'MAJOR_DROP';
  else if (status.includes('MINOR_DROP') || status.includes('THODA_KAM') || status.includes('WATCH')) normalizedStatus = 'MINOR_DROP';
  else if (status.includes('GROW') || status.includes('NEW')) normalizedStatus = 'GROWING';

  const trend = normalizedStatus === 'GROWING' ? 'up' : (normalizedStatus === 'STABLE' ? 'flat' : 'down');
  const change = previous > 0 ? Number((((current - previous) / previous) * 100).toFixed(1)) : (current > 0 ? 100 : 0);

  return [{
    product_name: 'Overall Customer Basket',
    status: normalizedStatus,
    previous_month: previous,
    current_month: current,
    trend,
    change,
  }];
};

// ─── Component ────────────────────────────────────────────────────────────────
const ProductPurchaseModal = ({ isOpen, onClose, client, analysisData = null }) => {
  const { analysis } = useAnalysis();
  const analysisSource = analysisData || analysis || {};
  const [purchaseData, setPurchaseData] = useState([]);
  const [customerStockInOverride, setCustomerStockInOverride] = useState(null);
  const [stockInOverride, setStockInOverride] = useState(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);

  useEffect(() => {
    if (isOpen && client) {
      setCustomerStockInOverride(null);
      const localRows = normalizeProductRows(client.product_breakdown || client.products || []);
      const productRows = normalizeProductRows(buildRowsFromProducts(analysisSource?.products || [], client));
      const summaryRows = normalizeProductRows(buildRowsFromCustomerSummary(client, analysisSource));
      const bootstrapBaseRows = localRows.length ? localRows : (productRows.length ? productRows : summaryRows);
      const bootstrapRows = reconcileOverallBasketFromRows(mergeSummaryIntoRows(bootstrapBaseRows, summaryRows));
      if (bootstrapRows.length > 0) {
        setPurchaseData(bootstrapRows);
        setError(null);
        fetchPurchaseData(true);
      } else {
        fetchPurchaseData();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, client, analysisSource]);

  useEffect(() => {
    if (!isOpen) {
      setCustomerStockInOverride(null);
      setStockInOverride(null);
      return;
    }

    const currentStock = analysisSource?.stock_in_analysis || {};
    const hasMonthly = Array.isArray(currentStock?.monthly_stock_in) && currentStock.monthly_stock_in.length > 0;
    const hasByDate = Array.isArray(currentStock?.stock_in_by_date) && currentStock.stock_in_by_date.length > 0;
    if (hasMonthly || hasByDate) {
      setStockInOverride(null);
      return;
    }

    const uploadId = extractUploadIdFromAnalysis(analysisSource);
    if (!uploadId) {
      setStockInOverride(null);
      return;
    }

    let cancelled = false;
    const hydrateStockIn = async () => {
      try {
        const res = await api.get(`/ingestion/upload-analysis/${uploadId}/`);
        if (cancelled) return;
        const payload = res?.data;
        const uploadAnalysis = payload?.analysis ?? payload?.payload?.analysis ?? payload ?? {};
        const latestStock = uploadAnalysis?.stock_in_analysis || {};
        const latestMonthly = Array.isArray(latestStock?.monthly_stock_in) ? latestStock.monthly_stock_in : [];
        const latestByDate = Array.isArray(latestStock?.stock_in_by_date) ? latestStock.stock_in_by_date : [];
        if (latestMonthly.length > 0 || latestByDate.length > 0) {
          setStockInOverride(latestStock);
        } else {
          setStockInOverride(null);
        }
      } catch {
        setStockInOverride(null);
      }
    };

    hydrateStockIn();
    return () => {
      cancelled = true;
    };
  }, [isOpen, analysisSource]);

  const fetchPurchaseData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    const localRows = normalizeProductRows(client?.product_breakdown || client?.products || []);
    const productRows = normalizeProductRows(buildRowsFromProducts(analysisSource?.products || [], client));
    const summaryRows = normalizeProductRows(buildRowsFromCustomerSummary(client, analysisSource));
    const fallbackBaseRows = localRows.length ? localRows : (productRows.length ? productRows : summaryRows);
    const fallbackRows = reconcileOverallBasketFromRows(mergeSummaryIntoRows(fallbackBaseRows, summaryRows));
    const hasCustomerIdentifier = Boolean(
      String(client?.customer_id || '').trim()
      || String(client?.customer_name || client?.name || client?.company || '').trim()
    );

    if (!hasCustomerIdentifier) {
      setPurchaseData(fallbackRows);
      setError(null);
      if (!silent) setLoading(false);
      return;
    }
    try {
      const response = await api.get('/ingestion/customer-analysis/', {
        params: {
          customer_id:   client.customer_id,
          customer_name: client.customer_name || client.name || client.company || '',
        },
      });
      const apiStock = response?.data?.stock_in_analysis;
      const apiMonthly = Array.isArray(apiStock?.monthly_stock_in) ? apiStock.monthly_stock_in : [];
      const apiByDate = Array.isArray(apiStock?.stock_in_by_date) ? apiStock.stock_in_by_date : [];
      if (apiMonthly.length > 0 || apiByDate.length > 0 || toNum(apiStock?.previous_months_total_stock_in_units, 0) > 0) {
        setCustomerStockInOverride(apiStock);
      } else {
        setCustomerStockInOverride(null);
      }
      const apiRows = normalizeProductRows(response?.data?.products || []);
      if (apiRows.length > 0) {
        setPurchaseData(reconcileOverallBasketFromRows(mergeSummaryIntoRows(apiRows, summaryRows)));
      } else if (fallbackRows.length > 0) {
        setPurchaseData(fallbackRows);
      } else {
        setPurchaseData([]);
      }
    } catch (err) {
      setCustomerStockInOverride(null);
      if (fallbackRows.length > 0) {
        setPurchaseData(fallbackRows);
        setError(null);
      } else {
        setError(err.response?.data?.error || err.message);
        setPurchaseData([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  if (!isOpen || !client) return null;

  const displayName =
    client.company && client.company !== '-' && client.company !== 'Individual'
      ? client.company
      : client.customer_name || client.customer_id || 'Key Account';

  const risk    = getRisk(client);
  const RiskIcon = risk.icon;
  const baseStockInAnalysis = customerStockInOverride || stockInOverride || analysisSource?.stock_in_analysis || {};
  const baseMonthly = Array.isArray(baseStockInAnalysis?.monthly_stock_in) ? baseStockInAnalysis.monthly_stock_in : [];
  const baseByDate = Array.isArray(baseStockInAnalysis?.stock_in_by_date) ? baseStockInAnalysis.stock_in_by_date : [];
  const stockInAnalysis = baseStockInAnalysis;
  const stockInMonthly = Array.isArray(stockInAnalysis?.previous_months_breakdown)
    ? stockInAnalysis.previous_months_breakdown
    : [];
  const allMonthlyStockIn = Array.isArray(stockInAnalysis?.monthly_stock_in)
    ? stockInAnalysis.monthly_stock_in
    : [];
  const stockInByDate = Array.isArray(stockInAnalysis?.stock_in_by_date)
    ? stockInAnalysis.stock_in_by_date
    : [];
  const visibleMonthlyRows = stockInMonthly.length > 0 ? stockInMonthly : allMonthlyStockIn;
  const isPreviousMonthsOnly = stockInMonthly.length > 0;
  const monthlyVisibleTotal = visibleMonthlyRows.reduce((sum, row) => sum + toNum(row?.stock_in_units, 0), 0);
  const previousMonthsTotalStockIn = isPreviousMonthsOnly
    ? toNum(stockInAnalysis?.previous_months_total_stock_in_units, monthlyVisibleTotal)
    : monthlyVisibleTotal;
  const displayPurchaseData = applyStockInMonthFallback(purchaseData, stockInAnalysis);
  const stockInSourceLabel = (() => {
    if (customerStockInOverride) return 'Source: Customer Analysis';
    if (stockInOverride) return 'Source: Upload Snapshot';

    const tag = String(stockInAnalysis?.source || '').trim();
    if (!tag) return 'Source: Analysis Snapshot';

    return `Source: ${tag.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())}`;
  })();

  // Summary counts
  const counts = {
    stopped:    displayPurchaseData.filter(p => p.status === 'NOT_PURCHASED').length,
    lessBuying: displayPurchaseData.filter(p => ['MAJOR_DROP', 'MINOR_DROP'].includes(p.status)).length,
    normal:     displayPurchaseData.filter(p => ['STABLE', 'GROWING', 'NEW_ITEM', 'UPCOMING'].includes(p.status)).length,
  };

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      >
        {/* Modal */}
        <motion.div
          key="modal"
          initial={{ opacity: 0, scale: 0.95, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 24 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          onClick={e => e.stopPropagation()}
          className="relative bg-white dark:bg-slate-900 rounded-3xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden"
        >

          {/* ── Header ── */}
          <div className="flex-shrink-0 px-6 py-5 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center shrink-0">
                  <UserCircle2 size={22} className="text-indigo-600 dark:text-indigo-400" strokeWidth={1.5} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white truncate">
                      {displayName}
                    </h3>
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide ${risk.color}`}>
                      <RiskIcon size={11} /> {risk.label}
                    </span>
                  </div>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">
                    Comparing last month vs this month for every product
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Contact row */}
            <div className="mt-4 flex flex-wrap gap-4">
              {[
                { icon: Mail,   val: client.email || client['e mail'] || client['eamil'] },
                { icon: Phone,  val: client.phone },
                { icon: MapPin, val: client.address },
              ].map(({ icon: Icon, val }) =>
                val ? (
                  <div key={val} className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-400 font-medium">
                    <Icon size={12} className="text-slate-400" />
                    {val}
                  </div>
                ) : null
              )}
            </div>
          </div>

          {/* ── Summary strip ── */}
          <div className="flex-shrink-0 grid grid-cols-3 divide-x divide-slate-100 dark:divide-white/10 border-b border-slate-100 dark:border-white/10">
            {[
              { label: 'Stopped Buying',  count: counts.stopped,    color: 'text-red-500',     bg: 'bg-red-50 dark:bg-red-500/5' },
              { label: 'Buying Less',     count: counts.lessBuying, color: 'text-orange-500',  bg: 'bg-orange-50 dark:bg-orange-500/5' },
              { label: 'Buying Normally', count: counts.normal,     color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/5' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} px-4 py-3 text-center`}>
                <p className={`text-2xl font-black ${s.color}`}>{s.count}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 size={36} className="text-indigo-500 animate-spin" />
                <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">
                  Loading product history…
                </p>
              </div>

            ) : error ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-14 h-14 rounded-full bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center">
                  <X size={24} className="text-rose-500" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-slate-800 dark:text-slate-200">Could not load data</p>
                  <p className="text-sm text-slate-400 mt-1">{error}</p>
                </div>
                <button
                  onClick={fetchPurchaseData}
                  className="px-5 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-bold hover:bg-indigo-600 transition-colors"
                >
                  Try again
                </button>
              </div>

            ) : purchaseData.length === 0 ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-indigo-100 dark:border-indigo-400/20 bg-indigo-50 dark:bg-slate-800 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-300">
                        Previous Months Stock In
                      </p>
                      <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">
                        Total stock purchased before current month
                      </p>
                      <p className="mt-2 inline-flex items-center rounded-md border border-indigo-200/70 dark:border-indigo-400/30 bg-white/80 dark:bg-slate-900/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                        {stockInSourceLabel}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{isPreviousMonthsOnly ? 'Total Units' : 'Shown Units'}</p>
                      <p className="text-2xl font-black text-indigo-700 dark:text-indigo-300">
                        {formatUnits(previousMonthsTotalStockIn)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-white/10">
                      Month-wise Stock In
                    </div>
                    <div className="max-h-36 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/60 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 font-black text-slate-500 uppercase tracking-wide">Month</th>
                            <th className="text-left px-3 py-2 font-black text-slate-500 uppercase tracking-wide">Product</th>
                            <th className="text-right px-3 py-2 font-black text-slate-500 uppercase tracking-wide">Units</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleMonthlyRows.length > 0 ? (
                            visibleMonthlyRows.map((row, idx) => (
                              <tr key={`${row.month}-${idx}`} className="border-t border-slate-100 dark:border-white/10">
                                <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-semibold">{row.month || '-'}</td>
                                <td className="px-3 py-2 text-slate-600 dark:text-slate-300 font-bold">{row.top_product || row.product_name || '-'}</td>
                                <td className="px-3 py-2 text-right text-slate-900 dark:text-white font-black">{formatUnits(row.stock_in_units)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr className="border-t border-slate-100 dark:border-white/10">
                              <td colSpan={3} className="px-3 py-3 text-center text-slate-500 dark:text-slate-400 font-semibold">No stock-in records found in analysis</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-white/10">
                      Date-wise Stock In
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/60 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 font-black text-slate-500 uppercase tracking-wide">Date</th>
                            <th className="text-left px-3 py-2 font-black text-slate-500 uppercase tracking-wide">Product</th>
                            <th className="text-right px-3 py-2 font-black text-slate-500 uppercase tracking-wide">Units</th>
                            <th className="text-right px-3 py-2 font-black text-slate-500 uppercase tracking-wide">Txns</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockInByDate.length > 0 ? (
                            stockInByDate.map((row, idx) => (
                              <tr key={`${row.date}-${idx}`} className="border-t border-slate-100 dark:border-white/10">
                                <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-semibold">{row.date || '-'}</td>
                                <td className="px-3 py-2 text-slate-600 dark:text-slate-300 font-bold">{row.top_product || row.product_name || '-'}</td>
                                <td className="px-3 py-2 text-right text-slate-900 dark:text-white font-black">{formatUnits(row.stock_in_units)}</td>
                                <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300 font-bold">{toNum(row.transaction_count, 0)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr className="border-t border-slate-100 dark:border-white/10">
                              <td colSpan={4} className="px-3 py-3 text-center text-slate-500 dark:text-slate-400 font-semibold">No date-wise stock-in records found in analysis</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Package size={24} className="text-slate-400" />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-slate-700 dark:text-slate-300">No product history found</p>
                    <p className="text-sm text-slate-400 mt-1">
                      Product-level history is not present for this customer in current analysis snapshot.
                    </p>
                  </div>
                </div>
              </div>

            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl border border-indigo-100 dark:border-indigo-400/20 bg-indigo-50 dark:bg-slate-800 p-4 mb-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-300">
                        Previous Months Stock In
                      </p>
                      <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">
                        Total stock purchased before current month
                      </p>
                      <p className="mt-2 inline-flex items-center rounded-md border border-indigo-200/70 dark:border-indigo-400/30 bg-white/80 dark:bg-slate-900/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                        {stockInSourceLabel}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{isPreviousMonthsOnly ? 'Total Units' : 'Shown Units'}</p>
                      <p className="text-2xl font-black text-indigo-700 dark:text-indigo-300">
                        {formatUnits(previousMonthsTotalStockIn)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-white/10 flex items-center justify-between gap-2">
                      <span>{isPreviousMonthsOnly ? 'Month-wise Stock In (Previous Months)' : 'Month-wise Stock In (All Available Months)'}</span>
                      {!isPreviousMonthsOnly && (
                        <span className="text-[9px] font-bold text-amber-500">No previous-month entries found, showing available months</span>
                      )}
                    </div>
                    <div className="max-h-36 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/60 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 font-black text-slate-500 uppercase tracking-wide">Month</th>
                            <th className="text-left px-3 py-2 font-black text-slate-500 uppercase tracking-wide">Product</th>
                            <th className="text-right px-3 py-2 font-black text-slate-500 uppercase tracking-wide">Units</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleMonthlyRows.length > 0 ? (
                            visibleMonthlyRows.map((row, idx) => (
                              <tr key={`${row.month}-${idx}`} className="border-t border-slate-100 dark:border-white/10">
                                <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-semibold">{row.month || '-'}</td>
                                <td className="px-3 py-2 text-slate-600 dark:text-slate-300 font-bold">{row.top_product || row.product_name || '-'}</td>
                                <td className="px-3 py-2 text-right text-slate-900 dark:text-white font-black">{formatUnits(row.stock_in_units)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr className="border-t border-slate-100 dark:border-white/10">
                              <td colSpan={3} className="px-3 py-3 text-center text-slate-500 dark:text-slate-400 font-semibold">No stock-in records found</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-white/10">
                      Date-wise Stock In
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/60 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 font-black text-slate-500 uppercase tracking-wide">Date</th>
                            <th className="text-left px-3 py-2 font-black text-slate-500 uppercase tracking-wide">Product</th>
                            <th className="text-right px-3 py-2 font-black text-slate-500 uppercase tracking-wide">Units</th>
                            <th className="text-right px-3 py-2 font-black text-slate-500 uppercase tracking-wide">Txns</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockInByDate.length > 0 ? (
                            stockInByDate.map((row, idx) => (
                              <tr key={`${row.date}-${idx}`} className="border-t border-slate-100 dark:border-white/10">
                                <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-semibold">{row.date || '-'}</td>
                                <td className="px-3 py-2 text-slate-600 dark:text-slate-300 font-bold">{row.top_product || row.product_name || '-'}</td>
                                <td className="px-3 py-2 text-right text-slate-900 dark:text-white font-black">{formatUnits(row.stock_in_units)}</td>
                                <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300 font-bold">{toNum(row.transaction_count, 0)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr className="border-t border-slate-100 dark:border-white/10">
                              <td colSpan={4} className="px-3 py-3 text-center text-slate-500 dark:text-slate-400 font-semibold">No date-wise stock-in records found</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">
                  Product-by-Product Breakdown
                </p>
                {displayPurchaseData.map((product, index) => {
                  const st    = getStatusLabel(product.status);
                  const isDown = product.trend === 'down';
                  const isUp   = product.trend === 'up';

                  return (
                    <motion.div
                      key={product.product_name || index}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl px-5 py-4 border border-slate-100 dark:border-white/8 hover:border-slate-200 dark:hover:border-white/15 transition-colors"
                    >
                      {/* Product icon */}
                      <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-white/10 flex items-center justify-center shrink-0">
                        <Package size={16} className="text-slate-500 dark:text-slate-400" />
                      </div>

                      {/* Name + badge */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {product.product_name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${st.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                            {st.label}
                          </span>
                          {product.change !== undefined && product.change !== 0 && (
                            <span className={`text-[11px] font-bold ${isUp ? 'text-emerald-500' : isDown ? 'text-rose-500' : 'text-slate-400'}`}>
                              {isUp ? '+' : ''}{product.change}%
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Numbers comparison */}
                      <div className="flex items-center gap-5 shrink-0">
                        <div className="text-center min-w-[60px]">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide">Last Month</p>
                          <p className="text-lg font-black text-slate-600 dark:text-slate-300">
                            {product.previous_month ?? '—'}
                          </p>
                        </div>

                        <div className="flex items-center">
                          {isDown ? (
                            <TrendingDown size={18} className="text-rose-400" />
                          ) : isUp ? (
                            <TrendingUp size={18} className="text-emerald-400" />
                          ) : (
                            <ArrowRight size={16} className="text-slate-300" />
                          )}
                        </div>

                        <div className="text-center min-w-[60px]">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide">This Month</p>
                          <p className={`text-lg font-black ${isDown ? 'text-rose-600 dark:text-rose-400' : isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                            {product.current_month ?? '—'}
                          </p>
                        </div>
                      </div>

                      {/* Trend indicator */}
                      <div className="shrink-0">
                        {isUp   && <CheckCircle2 size={18} className="text-emerald-400" />}
                        {isDown && <AlertTriangle size={18} className="text-rose-400" />}
                        {!isUp && !isDown && <Minus size={18} className="text-slate-300" />}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="flex-shrink-0 px-6 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-slate-900 flex items-center justify-between gap-4">
            <p className="text-[11px] text-slate-400 font-medium">
              {displayPurchaseData.length > 0
                ? `${displayPurchaseData.length} product${displayPurchaseData.length !== 1 ? 's' : ''} analysed`
                : 'No product data available'}
            </p>
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black uppercase tracking-widest hover:opacity-80 transition-opacity"
            >
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ProductPurchaseModal;
