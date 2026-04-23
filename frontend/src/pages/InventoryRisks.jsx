import React, { useState } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Package,
  LayoutGrid,
  TrendingDown,
  Loader2,
  ArrowRight,
  Zap,
  TrendingUp,
  Rows3,
  Search,
  Filter,
  History,
  MoreVertical,
  BrainCircuit,
  Circle,
  Truck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnalysis } from '../context/useAnalysis';
import InventoryRiskProductCard from '../features/ai-processor/components/InventoryRiskProductCard';
import { useInventoryRisksData } from '../features/ai-processor/process/useInventoryRisksData';
import {
  LAST_ANALYSIS_STORAGE_KEY,
  RISK_CONFIG,
  RISK_THEME,
  FIELD_ALIASES,
  PARTY_NAME_ALIASES,
  PARTY_ID_ALIASES,
  parseDateValue,
  formatSqlDateTime,
  formatCurrencyINR,
  normalizeText,
  isMissingLikeValue,
  isPlaceholderText,
  isIdLikePartyValue,
  pickBestPartyName,
  formatPartyLabel,
  cleanCategoryLabel,
  dedupeProductsByIdentity,
  formatUnitsValue,
} from '../features/ai-processor/process/inventoryRisksUtils';
import {
  normalizeRisk,
  buildRiskStatsFromAnalysis,
  toFiniteNumber,
  normalizeFieldName,
  getFieldByAliases,
  getPartyNameFromRow,
  getPartyIdFromRow,
  getNumberByAliases,
  getStrictUnitPrice,
  getStringByAliases,
  getFieldByResolvedKey,
  resolveBestFieldAcrossRows,
  dateToDayKey,
  getProductStatusForFilter,
  getProductPriceForFilter,
} from '../features/ai-processor/process/inventoryRisksCalculations';
import { getGroupedFilteredProducts } from '../features/ai-processor/process/inventoryRisksVariants';
import {
  buildCustomersFromTopCustomers,
  buildCustomersFromRemoteBuyers,
  consolidateCustomers,
  toUnitsSafe,
} from '../features/ai-processor/process/inventoryRisksCustomers';

const InventoryRisks = () => {
  const { analysis: liveAnalysis, selectedUploadId, latestMeta } = useAnalysis();
  const [filter, setFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState('cards');
  const [popupViewMode, setPopupViewMode] = useState('cards');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const {
    products,
    loading,
    analysisReady,
    analysisSnapshot,
    riskStats,
    mappingError,
    remoteProductBuyers,
    remoteProductBuyersLoading,
    remoteBuyerSource,
  } = useInventoryRisksData({
    liveAnalysis,
    selectedUploadId,
    selectedProduct,
    latestUploadId: latestMeta?.uploadId,
  });

  const filtered = products.filter((r) => {
    const quickRisk = filter === 'ALL' || r.risk === filter;

    const statusKey = getProductStatusForFilter(r);
    const matchesStatus = statusFilter === 'ALL' || statusKey === statusFilter;

    const minPrice = toFiniteNumber(priceMin);
    const maxPrice = toFiniteNumber(priceMax);
    const productPrice = getProductPriceForFilter(r);
    const hasPriceRangeFilter = minPrice !== null || maxPrice !== null;
    const matchesPrice = !hasPriceRangeFilter
      || (productPrice !== null
        && (minPrice === null || productPrice >= minPrice)
        && (maxPrice === null || productPrice <= maxPrice));

    const q = searchQuery.trim().toLowerCase();
    const searchPool = [
      r?.name,
      r?.sku,
      r?.category,
      r?.health_status,
      r?.risk,
      statusKey,
      productPrice !== null ? String(productPrice) : '',
    ]
      .filter((val) => val !== null && val !== undefined)
      .map((val) => String(val).toLowerCase());

    const matchesSearch = !q || searchPool.some((val) => val.includes(q));
    return quickRisk && matchesStatus && matchesPrice && matchesSearch;
  });

  const groupedFilteredProducts = getGroupedFilteredProducts(filtered);

  const variantGroups = groupedFilteredProducts.filter((group) => group.items.length > 1);
  const singleVariantProducts = groupedFilteredProducts
    .filter((group) => group.items.length === 1)
    .map((group) => group.items[0]);

  const getProductMetrics = (prod) => {
    const normalizedRisk = normalizeRisk(prod?.risk);
    const healthStatus = normalizedRisk === 'OUT_OF_STOCK'
      ? 'CRITICAL'
      : (normalizedRisk === 'LOW_STOCK' ? 'LOW STOCK' : 'HEALTHY');
    const recommendation = normalizedRisk === 'OUT_OF_STOCK'
      ? 'Reorder immediately'
      : (normalizedRisk === 'LOW_STOCK' ? 'Plan replenishment this week' : 'No immediate action needed');
    const numericOrder = toFiniteNumber(prod?.order_quantity);

    return {
      daysToStockout: prod?.days_to_stock ?? 'INSUFFICIENT DATA',
      healthStatus,
      orderQuantity: numericOrder !== null ? Math.max(Math.ceil(numericOrder), 0) : 'INSUFFICIENT DATA',
      recommendation,
      stockoutDateTime: prod?.stockout_datetime ?? 'INSUFFICIENT DATA',
      predicted7DayDemand: prod?.predicted_7_day_demand ?? 'INSUFFICIENT DATA',
    };
  };

  const getActionPlan = (prod) => {
    const metrics = getProductMetrics(prod);
    const daysText = typeof metrics.daysToStockout === 'number'
      ? metrics.daysToStockout.toFixed(2)
      : metrics.daysToStockout;
    const orderText = typeof metrics.orderQuantity === 'number'
      ? `${formatUnitsValue(metrics.orderQuantity, { maxDecimals: 0 })} units`
      : metrics.orderQuantity;

    const line2Label = (metrics.healthStatus === 'OVERSTOCK' || metrics.healthStatus === 'DEADSTOCK')
      ? 'Procurement Quantity'
      : 'Order Quantity';

    const demandText = toFiniteNumber(prod.daily_demand) !== null
      ? `${formatUnitsValue(prod.daily_demand)} units/day`
      : 'INSUFFICIENT DATA';

    return {
      summary: `Current status: ${metrics.healthStatus}. Daily demand: ${demandText}. Days to stockout: ${daysText}. Recommendation: ${metrics.recommendation}.`,
      line1Label: 'Health Status',
      line1Value: metrics.healthStatus,
      line2Label,
      line2Value: orderText,
      line3Label: 'Stockout Date & Time',
      line3Value: metrics.stockoutDateTime,
    };
  };

  const compactDisplay = (value) => {
    const text = String(value ?? '').trim().toUpperCase();
    return text === 'INSUFFICIENT DATA' ? '-' : value;
  };

  const getRiskPresentation = (prod) => {
    const metrics = getProductMetrics(prod);
    const riskKey = metrics.healthStatus === 'CRITICAL'
      ? 'OUT_OF_STOCK'
      : (metrics.healthStatus === 'LOW STOCK' ? 'LOW_STOCK' : (metrics.healthStatus === 'HEALTHY' ? 'HEALTHY' : normalizeRisk(prod?.risk)));

    return {
      riskKey,
      config: RISK_CONFIG[riskKey] || RISK_CONFIG.HEALTHY,
      tone: RISK_THEME[riskKey] || RISK_THEME.HEALTHY,
      metrics,
    };
  };

  const renderStatusBadge = (prod) => {
    const { config } = getRiskPresentation(prod);
    return (
      <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 ${config.className}`}>
        <config.icon size={13} />
        <span className="text-[10px] font-black uppercase tracking-[0.18em]">{config.label}</span>
      </div>
    );
  };

  const openProductDetails = (prod, preferredMode = 'cards') => {
    setPopupViewMode(preferredMode);
    setSelectedProduct({ prod, actionPlan: getActionPlan(prod) });
  };

  const getCustomerTrendMeta = (cust) => {
    const trendRaw = String(cust?.trend_tag || cust?.trend || cust?.monthly_trend || '').trim();
    const riskRaw = String(cust?.risk_level || '').trim();
    const trendKey = trendRaw.toLowerCase();
    const riskKey = riskRaw.toLowerCase();

    let trendLabel = 'Stable';
    let riskLabel = 'Low';

    if (
      trendKey.includes('drop')
      || trendKey.includes('down')
      || trendKey.includes('declin')
      || trendKey.includes('less')
      || riskKey.includes('high')
    ) {
      trendLabel = 'Drop';
      riskLabel = 'High';
    } else if (
      trendKey.includes('mixed')
      || trendKey.includes('flat')
      || riskKey.includes('medium')
    ) {
      trendLabel = trendRaw || 'Mixed';
      riskLabel = 'Medium';
    } else if (
      trendKey.includes('increas')
      || trendKey.includes('grow')
      || trendKey.includes('up')
    ) {
      trendLabel = 'Increasing';
      riskLabel = 'Low';
    }

    const riskTone = riskLabel === 'Low'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : (riskLabel === 'Medium'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-rose-50 text-rose-700 border-rose-200');

    const trendTone = trendLabel === 'Drop'
      ? 'text-rose-500'
      : (trendLabel === 'Increasing' ? 'text-emerald-600' : 'text-slate-500');

    return {
      trendLabel,
      riskLabel,
      riskTone,
      trendTone,
    };
  };

  const getCustomerPresentation = (cust) => {
    const orderEvents = Array.isArray(cust?.order_events)
      ? cust.order_events.filter((evt) => evt?.order_date || evt?.delivery_date)
      : [];

    let deliveryDates = orderEvents
      .filter((evt) => evt.delivery_date)
      .map((evt) => evt.delivery_date);

    if (deliveryDates.length === 0) {
      const outEvent = orderEvents.find((evt) => evt.order_date && (!evt.delivery_date || evt.delivery_date === evt.order_date));
      if (outEvent) {
        deliveryDates = [outEvent.order_date];
      }
    }

    const orderDates = orderEvents
      .filter((evt) => evt.order_date && (!evt.delivery_date || evt.delivery_date === ''))
      .map((evt) => evt.order_date);

    return {
      orderEvents,
      orderDates,
      deliveryDates,
      latestOrderDate: orderDates[0] || 'Unknown',
      latestDeliveryDate: deliveryDates[0] || 'Not Scheduled',
    };
  };

  const renderCustomerTableView = (customers) => (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed">
          <thead>
            <tr className="bg-slate-100 text-left">
              {['Customer', 'Risk', 'Units', 'Orders', 'Last Order', 'Delivery', 'Trend'].map((label) => (
                <th key={label} className="px-3 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-700">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {customers.map((cust, i) => {
              const { orderEvents, orderDates, latestOrderDate, latestDeliveryDate } = getCustomerPresentation(cust);
              const { riskLabel, trendLabel, riskTone, trendTone } = getCustomerTrendMeta(cust);

              return (
                <tr key={`popup-table-${cust.customer_id || i}`} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="px-3 py-3 align-top">
                    <p className="text-[12px] font-black text-slate-900 break-words">{cust.name || 'Unknown Client'}</p>
                    <p className="mt-1 text-[10px] font-semibold text-slate-500 break-words">{cust.company || 'Direct Buyer Partner'}</p>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${riskTone}`}>
                      {riskLabel} Risk
                    </span>
                  </td>
                  <td className="px-3 py-3 align-top text-[12px] font-black text-slate-900">{toUnitsSafe(cust.total_purchased)} U</td>
                  <td className="px-3 py-3 align-top text-[12px] font-bold text-slate-700">{orderEvents.length || orderDates.length}</td>
                  <td className="px-3 py-3 align-top text-[11px] font-semibold text-slate-600 break-words">{latestOrderDate}</td>
                  <td className="px-3 py-3 align-top text-[11px] font-semibold text-emerald-700 break-words">{latestDeliveryDate}</td>
                  <td className={`px-3 py-3 align-top text-[10px] font-bold break-words ${trendTone}`}>{trendLabel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderProductCard = (prod, keyPrefix = 'prod', idx = 0) => {
    const productKey = `${keyPrefix}-${prod?.id ?? idx}-${String(prod?.sku || prod?.name || idx)}`;
    return (
      <InventoryRiskProductCard
        key={productKey}
        prod={prod}
        keyPrefix={keyPrefix}
        setSelectedProduct={(payload) => openProductDetails(payload.prod, 'cards')}
        getProductMetrics={getProductMetrics}
        getActionPlan={getActionPlan}
        compactDisplay={compactDisplay}
        toFiniteNumber={toFiniteNumber}
        isPlaceholderText={isPlaceholderText}
        normalizeText={normalizeText}
        cleanCategoryLabel={cleanCategoryLabel}
        formatUnitsValue={formatUnitsValue}
        formatCurrencyINR={formatCurrencyINR}
      />
    );
  };

  const renderTableView = (items) => (
    <div className="overflow-hidden rounded-[1.8rem] border border-[var(--border-subtle)] bg-white shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-2 border-b border-slate-200 bg-gradient-to-r from-white via-emerald-50/40 to-slate-50 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700">Inventory Table View</p>
        </div>
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
          {items.length} items visible
        </div>
      </div>

      <div className="overflow-x-hidden">
        <table className="w-full table-fixed">
          <thead>
            <tr className="bg-slate-100 text-left">
              {['Product Name', 'Stock Status', 'Available Qty', 'Order Qty', 'Need to Arrange', 'Stock Value', 'Days Left', 'Action'].map((label) => (
                <th key={label} className="px-3 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-700 border-b border-slate-200">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((prod, idx) => {
              const { metrics, tone } = getRiskPresentation(prod);
              const unitPrice = toFiniteNumber(prod.unit_price);
              const stockValue = toFiniteNumber(prod.stock_value);
              const onHand = toFiniteNumber(prod.on_hand);
              const orderStock = toFiniteNumber(prod.order_quantity);
              const stockRequired = onHand !== null && orderStock !== null
                ? Math.max(0, orderStock - onHand)
                : null;
              const displaySku = !isPlaceholderText(prod.sku) ? normalizeText(prod.sku) : 'No SKU';
              const displayCategory = cleanCategoryLabel(prod.category, prod.name, prod.sku) || 'Uncategorized';
              const daysLeft = typeof metrics.daysToStockout === 'number'
                ? `${metrics.daysToStockout.toFixed(2)} days`
                : compactDisplay(metrics.daysToStockout);

              return (
                <tr
                  key={`table-row-${prod?.id ?? idx}-${displaySku}`}
                  className="border-t border-slate-200 bg-white transition-colors hover:bg-emerald-50/40"
                >
                  <td className="px-3 py-4 align-top border-r border-slate-100 w-[17%]">
                    <div className="flex items-start gap-2.5">
                      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-sm ${tone.tile}`}>
                        <Package size={15} className="text-slate-700" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-black leading-5 text-slate-900 break-words">{prod.name}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 break-all">{displaySku}</p>
                        <p className="mt-2 inline-flex max-w-full rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 truncate">{displayCategory}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 align-top border-r border-slate-100 w-[12%]">
                    {renderStatusBadge(prod)}
                  </td>
                  <td className="px-3 py-4 align-top border-r border-slate-100 w-[12%]">
                    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                      <p className="text-2xl font-black leading-none text-slate-900">{onHand !== null ? formatUnitsValue(onHand) : '-'}</p>
                      <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">In Stock</p>
                    </div>
                  </td>
                  <td className="px-3 py-4 align-top border-r border-slate-100 w-[12%]">
                    <div className="rounded-xl bg-blue-50 px-3 py-2.5">
                      <p className="text-2xl font-black leading-none text-blue-700">{orderStock !== null ? formatUnitsValue(orderStock) : '-'}</p>
                      <p className="mt-1.5 text-[10px] font-semibold text-blue-900/70">Order Qty</p>
                    </div>
                  </td>
                  <td className="px-3 py-4 align-top border-r border-slate-100 w-[14%]">
                    <div className={`rounded-xl px-3 py-2.5 ${stockRequired > 0 ? 'bg-rose-50' : 'bg-emerald-50'}`}>
                      <p className={`text-2xl font-black leading-none ${stockRequired > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {stockRequired !== null ? formatUnitsValue(stockRequired) : '-'}
                      </p>
                      <p className={`mt-1.5 text-[10px] font-semibold leading-4 ${stockRequired > 0 ? 'text-rose-900/70' : 'text-emerald-900/70'}`}>
                        {stockRequired > 0 ? 'Arrange now' : 'No extra stock'}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-4 align-top border-r border-slate-100 w-[14%]">
                    <div className="rounded-xl bg-amber-50 px-3 py-2.5">
                      <p className="text-[13px] font-black leading-5 text-slate-900 break-words">
                        {unitPrice !== null && stockValue !== null ? formatCurrencyINR(stockValue) : 'Price Missing'}
                      </p>
                      <p className="mt-1.5 text-[10px] font-semibold leading-4 text-amber-900/70 break-words">
                        {unitPrice !== null ? `${formatCurrencyINR(unitPrice, { maxDecimals: 2 })}/unit` : 'Price unavailable'}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-4 align-top border-r border-slate-100 w-[9%]">
                    <div className="rounded-xl bg-violet-50 px-3 py-2.5">
                      <p className="text-[13px] font-black leading-5 text-slate-900 break-words">{daysLeft}</p>
                      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-900/70 break-words">{compactDisplay(metrics.healthStatus)}</p>
                    </div>
                  </td>
                  <td className="px-3 py-4 align-top w-[10%]">
                    <button
                      onClick={() => openProductDetails(prod, 'table')}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-white transition-all hover:bg-emerald-600"
                    >
                      Details
                      <ArrowRight size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1460px] flex-col gap-7 pb-16 pt-1 xl:gap-8">
      {loading && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-emerald-600 flex items-center gap-2 w-fit">
          <Loader2 size={13} className="animate-spin" />
          Syncing latest analysis in background
        </div>
      )}
      {mappingError && (
        <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300">
          {mappingError}
        </div>
      )}

      {analysisReady ? (
        <div className="sticky top-0 z-40 -mx-2 px-2 pb-3 pt-0 md:-mx-3 md:px-3 relative isolate">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 top-[-120vh] z-0 bg-[var(--bg-base)]" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 top-[-120vh] z-0 backdrop-blur-sm" />
          <div className="relative z-10 rounded-[1.7rem] border border-[var(--border-subtle)] bg-gradient-to-r from-white via-[var(--bg-card)] to-[var(--bg-accent)] p-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-600">Search Workspace</p>
              </div>
              <div className="inline-flex w-fit items-center gap-1 rounded-[1.1rem] border border-slate-200 bg-white/90 p-1 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`inline-flex items-center gap-2 rounded-[0.9rem] px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] transition-all ${
                    viewMode === 'cards'
                      ? 'bg-emerald-500 text-white shadow-[0_10px_24px_rgba(16,185,129,0.24)]'
                      : 'text-slate-500 hover:text-emerald-700'
                  }`}
                >
                  <LayoutGrid size={14} />
                  Card View
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`inline-flex items-center gap-2 rounded-[0.9rem] px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] transition-all ${
                    viewMode === 'table'
                      ? 'bg-slate-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)]'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Rows3 size={14} />
                  Table View
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center">
              <div className="relative min-w-0 xl:basis-[48%] xl:max-w-[50%]">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition-colors" size={17} />
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-emerald-500/8 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-600">
                  Search
                </div>
                <input
                  type="text"
                  placeholder="Search product, SKU, category, status..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-12 w-full rounded-[1.1rem] border border-slate-200 bg-white pl-11 pr-20 text-[14px] font-medium text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition-all placeholder:text-slate-400 focus:outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10"
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2.5 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 flex-col gap-2.5 md:flex-row md:items-center">
                  <div className="relative min-w-[190px] flex-1">
                    <Filter className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={16} />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="h-12 w-full appearance-none rounded-[1.1rem] border border-slate-200 bg-white pl-11 pr-10 text-[14px] font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] focus:outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10"
                    >
                      <option value="ALL">All Status</option>
                      <option value="OUT_OF_STOCK">Out of Stock</option>
                      <option value="LOW_STOCK">Low Stock</option>
                      <option value="DEADSTOCK">Deadstock</option>
                      <option value="OVERSTOCK">Overstock</option>
                      <option value="HEALTHY">Healthy</option>
                    </select>
                  </div>

                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Min price"
                      value={priceMin}
                      onChange={(e) => setPriceMin(e.target.value)}
                      className="h-12 min-w-0 flex-1 rounded-[1.1rem] border border-slate-200 bg-white px-4 text-[14px] font-medium text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] focus:outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10"
                    />
                    <span className="shrink-0 text-[12px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">to</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Max price"
                      value={priceMax}
                      onChange={(e) => setPriceMax(e.target.value)}
                      className="h-12 min-w-0 flex-1 rounded-[1.1rem] border border-slate-200 bg-white px-4 text-[14px] font-medium text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] focus:outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2.5 lg:justify-end">
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('ALL');
                      setPriceMin('');
                      setPriceMax('');
                      setFilter('ALL');
                    }}
                    className="h-12 rounded-[1.1rem] border border-emerald-100 bg-emerald-50 px-5 text-[13px] font-black uppercase tracking-[0.16em] text-emerald-700 transition-all hover:border-emerald-300 hover:bg-emerald-100"
                  >
                    Clear
                  </button>

                  <button className="flex h-12 w-12 items-center justify-center rounded-[1.1rem] border border-slate-200 bg-white text-[var(--text-muted)] transition-colors hover:border-emerald-300 hover:text-emerald-600">
                    <History size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3 xl:grid-cols-5">
        {[
          { label: 'Out of Stock', count: riskStats.out_of_stock, icon: AlertCircle, color: '#ef4444', gradient: 'from-rose-500/20 to-transparent' },
          { label: 'Low Stock', count: riskStats.low_stock, icon: TrendingDown, color: '#f59e0b', gradient: 'from-amber-500/20 to-transparent' },
          { label: 'Deadstock', count: riskStats.deadstock, icon: Package, color: '#6366f1', gradient: 'from-indigo-500/20 to-transparent' },
          { label: 'Overstock', count: riskStats.overstock, icon: Package, color: '#a855f7', gradient: 'from-purple-500/20 to-transparent' },
          { label: 'Healthy', count: riskStats.healthy, icon: CheckCircle2, color: '#10b981', gradient: 'from-emerald-500/20 to-transparent' },
        ].map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="relative overflow-hidden bg-white border border-emerald-500/10 p-8 rounded-[2.5rem] group hover:border-emerald-500/30 transition-all shadow-xl"
          >
            <div className={`absolute -right-12 -bottom-12 w-48 h-48 bg-gradient-to-br ${s.gradient} blur-3xl opacity-30 group-hover:opacity-50 transition-opacity`} />
            <div className="relative z-10 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{s.label}</p>
                <h3 className="text-5xl font-bold text-slate-900 leading-none">{s.count}</h3>
              </div>
              <s.icon size={32} style={{ color: s.color }} strokeWidth={2.5} />
            </div>
          </motion.div>
        ))}
      </div>

      {analysisReady ? (
        <>
          {viewMode === 'table' ? (
            renderTableView(filtered)
          ) : (
            <>
              {variantGroups.length > 0 ? (
                <div className="space-y-4">
                  <AnimatePresence mode="popLayout">
                    {variantGroups.map((group, groupIndex) => (
                      <motion.div
                        key={`variant-group-${group.familyKey}`}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ delay: groupIndex * 0.03 }}
                        className="rounded-[1.6rem] border border-emerald-500/20 bg-white/70 p-4"
                      >
                        <div className="flex flex-col gap-3 mb-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Variant Group</p>
                            <h3 className="text-2xl font-black tracking-tight text-slate-900">{group.familyLabel}</h3>
                          </div>
                          <div className="w-fit rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                            {group.items.length} Types Together
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
                          {group.items.map((prod, idx) => renderProductCard(prod, `group-${group.familyKey}`, idx))}
                        </div>
                      </motion.div>
                    ))}

                    {singleVariantProducts.length > 0 && (
                      <motion.div
                        key="single-products"
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="space-y-3"
                      >
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Other Products</p>
                        <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
                          {singleVariantProducts.map((prod, idx) => renderProductCard(prod, 'single', idx))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
                  <AnimatePresence mode="popLayout">
                    {filtered.map((prod, idx) => renderProductCard(prod, 'default', idx))}
                  </AnimatePresence>
                </div>
              )}
            </>
          )}

          {filtered.length === 0 && (
            <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-8 text-center text-sm text-[var(--text-muted)]">
              No products match the selected criteria. Try changing status or price range.
            </div>
          )}
        </>
      ) : (
        <div className="rounded-[2.5rem] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-8 text-center text-sm text-[var(--text-muted)]">
          Product cards will appear after analysis is completed.
        </div>
      )}
      <AnimatePresence>
        {selectedProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-2 sm:p-4 md:p-6"
            onClick={() => setSelectedProduct(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#ffffff',
                border: '1px solid #10b981',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 15px rgba(16, 185, 129, 0.05)'
              }}
              className="relative h-[94vh] w-[min(96vw,1440px)] max-h-[94vh] rounded-[2rem] overflow-hidden"
            >
              {/* Removed background gradient for simplicity */}

              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-emerald-100 p-4 md:p-6" style={{ background: '#f0fdf4' }}>
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: 'white', border: '1px solid #10b981' }}>
                    <History size={22} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold leading-tight text-slate-900 md:text-2xl">Customer Delivery Schedule</h2>
                    <p className="mt-1 truncate text-xs font-semibold uppercase tracking-widest text-emerald-600 md:text-sm">
                      {selectedProduct.prod.name} ({selectedProduct.prod.sku})
                    </p>
                  </div>
                </div>
                <div className="ml-auto inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setPopupViewMode('cards')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition-all md:px-4 ${
                      popupViewMode === 'cards' ? 'bg-emerald-500 text-white' : 'text-slate-500'
                    }`}
                  >
                    <LayoutGrid size={12} />
                    Card
                  </button>
                  <button
                    type="button"
                    onClick={() => setPopupViewMode('table')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition-all md:px-4 ${
                      popupViewMode === 'table' ? 'bg-slate-900 text-white' : 'text-slate-500'
                    }`}
                  >
                    <Rows3 size={12} />
                    Table
                  </button>
                </div>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-all hover:border-rose-200 hover:text-rose-500"
                >
                  ✕
                </button>
              </div>

              <div className="grid h-[calc(94vh-104px)] grid-cols-1 gap-5 overflow-y-auto p-4 md:h-[calc(94vh-112px)] md:p-6" style={{ background: 'transparent' }}>
                <div className="mb-1">
                </div>

                {(() => {
                  const remoteScoped = buildCustomersFromRemoteBuyers(remoteProductBuyers);
                  const productScopedAnalysisFallback = buildCustomersFromTopCustomers(selectedProduct?.prod, analysisSnapshot);

                  const displayCustomersRaw = remoteScoped.length > 0
                    ? remoteScoped
                    : productScopedAnalysisFallback;

                  const displayCustomers = consolidateCustomers(displayCustomersRaw);

                  if (remoteProductBuyersLoading && displayCustomers.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center p-8 rounded-xl text-center opacity-80 mt-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(52,211,153,0.12)' }}>
                          <Loader2 className="text-emerald-400 animate-spin" size={20} />
                        </div>
                        <h4 className="text-sm font-bold text-white mb-1">Loading Buyer Mapping</h4>
                        <p className="text-xs text-slate-400 max-w-[300px]">
                          Fetching product-to-party mapping from uploaded sheet data.
                        </p>
                      </div>
                    );
                  }

                  if (displayCustomers.length === 0) {
                    const strictNoMatch = remoteBuyerSource === 'strict_no_match';
                    return (
                      <div className="flex flex-col items-center justify-center p-8 rounded-xl text-center opacity-80 mt-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(52,211,153,0.12)' }}>
                          <CheckCircle2 className="text-emerald-400" size={20} />
                        </div>
                        <h4 className="text-sm font-bold text-white mb-1">{strictNoMatch ? 'No Verified Buyers Found' : 'AI Intelligence Pending Run'}</h4>
                        <p className="text-xs text-slate-400 max-w-[300px]">
                          {strictNoMatch
                            ? <>No row-verified buyer transactions were found for <b>{selectedProduct?.prod?.name}</b> in the selected upload. This popup now shows only real verified buyers and never inferred/fake entries.</>
                            : <>Please run the <b>AI Pipeline Sync</b> to execute absolute matrix computation. Then this view will strictly map the specific buyers for {selectedProduct?.prod?.name}.</>}
                        </p>
                      </div>
                    );
                  }

                  if (popupViewMode === 'table') {
                    return renderCustomerTableView(displayCustomers);
                  }

                  return (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                      {displayCustomers.map((cust, i) => (
                        <div key={cust.customer_id || i} className="flex min-h-full flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition-all group">
                          {(() => {
                            const { orderEvents, orderDates, deliveryDates, latestOrderDate, latestDeliveryDate } = getCustomerPresentation(cust);
                            const { riskLabel, trendLabel, riskTone, trendTone } = getCustomerTrendMeta(cust);
                            return (
                              <>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex min-w-0 items-center gap-4">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: 'white', border: '1px solid #10b981' }}>
                                      <span className="text-lg font-bold text-emerald-600">{cust.name?.charAt(0) || 'C'}</span>
                                    </div>
                                    <div className="min-w-0">
                                      <h4 className="truncate text-base font-bold leading-tight uppercase tracking-tight text-slate-900">{cust.name || 'Unknown Client'}</h4>
                                      <p className="mt-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                                        <span className="h-3 w-1 rounded-full bg-emerald-500"></span>
                                        <span className="truncate">{cust.company || 'Direct Buyer Partner'}</span>
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 flex-col items-end gap-1">
                                    <div className={`rounded border px-2 py-1 text-[9px] font-bold uppercase tracking-widest ${riskTone}`}>
                                      {riskLabel} PROFILE
                                    </div>
                                    <span className="text-[9px] font-bold uppercase tracking-tighter text-slate-400">AI AGENT VERIFIED</span>
                                  </div>
                                </div>

                                <div className="relative grid grid-cols-1 gap-3 overflow-hidden rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:grid-cols-3">
                                  <div className="absolute -right-12 -top-12 h-24 w-24 rounded-full bg-emerald-500/5 blur-3xl"></div>

                                  <div className="md:border-r md:border-slate-100 md:pr-4">
                                    <span className="mb-1 block text-[11px] font-bold text-slate-500">Total Unit</span>
                                    <span className="text-lg font-bold leading-none text-slate-900">{cust.total_purchased || 0} <span className="text-[10px] font-bold text-slate-400">U</span></span>
                                  </div>

                                  <div className="md:border-r md:border-slate-100 md:pr-4">
                                    <span className="mb-1 block text-[11px] font-bold text-slate-500">Orders</span>
                                    <span className="text-sm font-bold text-slate-700">{orderEvents.length || orderDates.length} total</span>
                                    <p className="mt-1 text-[11px] font-semibold text-slate-500">Latest: {latestOrderDate}</p>
                                  </div>

                                  <div>
                                    <span className="mb-1 block text-[11px] font-bold text-emerald-700">Delivery Date</span>
                                    <div className="flex items-center gap-2">
                                      <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                                      <span className="text-sm font-bold text-slate-900">{latestDeliveryDate}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="rounded-xl border border-slate-100 bg-white p-3">
                                  <div className="mb-2 flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Order & Delivery Timeline</span>
                                    <span className="text-[10px] font-bold text-slate-400">{orderEvents.length || orderDates.length} records</span>
                                  </div>

                                  {orderEvents.length === 0 ? (
                                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                      {orderDates.map((dateValue, idx2) => (
                                        <div key={`timeline-fallback-${idx2}`} className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
                                          <p className="font-bold text-slate-700">Order: {dateValue}</p>
                                          <p className="text-slate-500">Delivery: {deliveryDates[idx2] || latestDeliveryDate}</p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
                                      {orderEvents.map((evt, idx2) => (
                                        <div key={`timeline-${idx2}`} className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
                                          <div className="flex items-center justify-between gap-2">
                                            <p className="text-[11px] font-bold text-slate-700">Order: {evt.order_date || 'Unknown'}</p>
                                            <p className="text-[11px] font-bold text-slate-900">{toUnitsSafe(evt.units)} U</p>
                                          </div>
                                          <p className="mt-0.5 text-[11px] text-slate-500">Delivery: {evt.delivery_date || 'Not Scheduled'}</p>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center justify-between gap-3 pt-1">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                                      <BrainCircuit size={10} className="text-slate-400" />
                                      <span className={`text-[10px] font-bold ${trendTone}`}>
                                        Trend: {trendLabel}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-bold text-slate-400">
                                    <Truck size={12} />
                                    Auto-Schedule
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default InventoryRisks;
