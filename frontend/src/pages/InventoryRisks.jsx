import React, { useState } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Package,
  TrendingDown,
  Loader2,
  ArrowRight,
  ShieldAlert,
  Zap,
  TrendingUp,
  Search,
  Filter,
  History,
  MoreVertical,
  BrainCircuit,
  Circle,
  Truck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnalysis } from '../context/analysisContext';
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
  formatDateTime,
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
  deriveRiskFromSignals,
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
  const { analysis: liveAnalysis, selectedUploadId } = useAnalysis();
  const [filter, setFilter] = useState('ALL');
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
  } = useInventoryRisksData({ liveAnalysis, selectedUploadId, selectedProduct });

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
    if (prod.status === 'FIELD MAPPING ERROR') {
      return {
        daysToStockout: 'INSUFFICIENT DATA',
        healthStatus: 'INSUFFICIENT DATA',
        orderQuantity: 'NOT DEFINED',
        recommendation: 'INSUFFICIENT DATA',
        stockoutDateTime: 'INSUFFICIENT DATA',
        predicted7DayDemand: 'INSUFFICIENT DATA',
      };
    }

    if (prod.status === 'SUCCESS' && prod.health_status) {
      const hs = prod.health_status;
      const normalizedRisk = normalizeRisk(prod.risk);

      if (normalizedRisk === 'OVERSTOCK' || hs === 'OVERSTOCK') {
        return {
          daysToStockout: 'NOT APPLICABLE',
          healthStatus: 'OVERSTOCK',
          orderQuantity: 0,
          recommendation: 'Pause procurement and clear excess inventory',
          stockoutDateTime: 'NOT APPLICABLE',
          predicted7DayDemand: prod.predicted_7_day_demand ?? 'INSUFFICIENT DATA',
        };
      }

      if (normalizedRisk === 'DEADSTOCK' || hs === 'DEADSTOCK') {
        return {
          daysToStockout: 'NOT APPLICABLE',
          healthStatus: 'DEADSTOCK',
          orderQuantity: 0,
          recommendation: 'Stop buying and run liquidation campaign',
          stockoutDateTime: 'NOT APPLICABLE',
          predicted7DayDemand: prod.predicted_7_day_demand ?? 'INSUFFICIENT DATA',
        };
      }

      const recommendation = hs === 'CRITICAL'
        ? 'Reorder immediately'
        : (hs === 'LOW STOCK' ? 'Plan replenishment this week' : 'No immediate action needed');

      const numericOrder = toFiniteNumber(prod.order_quantity);
      return {
        daysToStockout: prod.days_to_stock,
        healthStatus: hs,
        orderQuantity: numericOrder !== null ? Math.max(Math.ceil(numericOrder), 0) : 'INSUFFICIENT DATA',
        recommendation,
        stockoutDateTime: prod.stockout_datetime ?? 'INSUFFICIENT DATA',
        predicted7DayDemand: prod.predicted_7_day_demand ?? 'INSUFFICIENT DATA',
      };
    }

    const onHand = toFiniteNumber(prod.on_hand);
    const dailyDemand = toFiniteNumber(prod.daily_demand);
    const predicted7 = toFiniteNumber(prod.predicted_7_day_demand);

    if (onHand === null) {
      return {
        daysToStockout: 'INSUFFICIENT DATA',
        healthStatus: 'INSUFFICIENT DATA',
        orderQuantity: 'INSUFFICIENT DATA',
        recommendation: 'INSUFFICIENT DATA',
        stockoutDateTime: 'INSUFFICIENT DATA',
        predicted7DayDemand: 'INSUFFICIENT DATA',
      };
    }

    if (dailyDemand === null) {
      return {
        daysToStockout: 'INSUFFICIENT DATA',
        healthStatus: 'INSUFFICIENT DATA',
        orderQuantity: 'INSUFFICIENT DATA',
        recommendation: 'INSUFFICIENT DATA',
        stockoutDateTime: 'INSUFFICIENT DATA',
        predicted7DayDemand: 'INSUFFICIENT DATA',
      };
    }

    if (dailyDemand === 0) {
      return {
        daysToStockout: 'NO DEMAND',
        healthStatus: 'HEALTHY',
        orderQuantity: 0,
        recommendation: 'No action needed',
        stockoutDateTime: 'NO DEMAND',
        predicted7DayDemand: 0,
      };
    }

    const daysToStockout = onHand / dailyDemand;
    const healthStatus = daysToStockout > 7 ? 'HEALTHY' : (daysToStockout >= 3 ? 'LOW STOCK' : 'CRITICAL');
    const predicted7DayDemand = predicted7 !== null ? predicted7 : (dailyDemand * 7);
    const orderQuantity = Math.max(Math.ceil(predicted7DayDemand - onHand), 0);

    const stockoutDate = new Date(Date.now() + (daysToStockout * 24 * 60 * 60 * 1000));

    const recommendation = healthStatus === 'CRITICAL'
      ? 'Reorder immediately'
      : (healthStatus === 'LOW STOCK'
        ? 'Monitor weekly'
        : 'No action needed');

    return {
      daysToStockout,
      healthStatus,
      orderQuantity,
      recommendation,
      stockoutDateTime: formatDateTime(stockoutDate),
      predicted7DayDemand,
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

  const renderProductCard = (prod, keyPrefix = 'prod', idx = 0) => {
    const productKey = `${keyPrefix}-${prod?.id ?? idx}-${String(prod?.sku || prod?.name || idx)}`;
    return (
      <InventoryRiskProductCard
        key={productKey}
        prod={prod}
        keyPrefix={keyPrefix}
        setSelectedProduct={setSelectedProduct}
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-32 gap-6 bg-[var(--bg-accent)] rounded-[3rem] border border-[var(--border-subtle)]">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin" />
          <BrainCircuit className="absolute inset-0 m-auto text-emerald-500 animate-pulse" size={24} />
        </div>
        <p className="text-xs font-semibold tracking-wide text-emerald-500">Processing Data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {mappingError && (
        <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300">
          {mappingError}
        </div>
      )}
      <div className="flex items-center justify-between mb-12">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-xl shadow-emerald-500/10">
            <ShieldAlert className="text-emerald-500" size={32} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-black tracking-tighter text-white">Stock Alerts</h1>
              <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Live</span>
              </div>
            </div>
            <p className="text-slate-500 text-sm font-medium mt-1">We are checking your stock risks.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Out of Stock', count: riskStats.out_of_stock, icon: AlertCircle, color: '#ef4444', gradient: 'from-rose-500/20 to-transparent' },
          { label: 'Low Stock', count: riskStats.low_stock, icon: TrendingDown, color: '#f59e0b', gradient: 'from-amber-500/20 to-transparent' },
          { label: 'Deadstock', count: riskStats.deadstock, icon: Package, color: '#6366f1', gradient: 'from-indigo-500/20 to-transparent' },
          { label: 'Overstock', count: riskStats.overstock, icon: Package, color: '#a855f7', gradient: 'from-purple-500/20 to-transparent' },
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
          <div className="flex flex-col gap-3 pb-2">
            <div className="flex items-center gap-2 p-1.5 bg-[var(--bg-sidebar)] rounded-2xl border border-[var(--border-subtle)] w-fit">
              {['ALL', 'OUT_OF_STOCK', 'LOW_STOCK', 'DEADSTOCK', 'OVERSTOCK', 'HEALTHY'].map(f => (
                <button
                  key={f}
                  className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${filter === f
                    ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                    : 'text-[var(--text-muted)] hover:text-emerald-500 hover:bg-emerald-500/5'
                    }`}
                  onClick={() => setFilter(f)}
                >
                  {f.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
              <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="relative group flex-1 min-w-[260px]">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-emerald-500 transition-colors" size={15} />
                  <input
                    type="text"
                    placeholder="Search product, SKU, category, status..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[var(--text-main)] focus:outline-none focus:border-emerald-500/30 transition-all w-full"
                  />
                </div>

                <div className="flex items-center gap-2 min-w-[180px]">
                  <Filter size={15} className="text-[var(--text-muted)]" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-xs font-semibold text-[var(--text-main)] focus:outline-none focus:border-emerald-500/30"
                  >
                    <option value="ALL">All Status</option>
                    <option value="OUT_OF_STOCK">Out of Stock</option>
                    <option value="LOW_STOCK">Low Stock</option>
                    <option value="DEADSTOCK">Deadstock</option>
                    <option value="OVERSTOCK">Overstock</option>
                    <option value="HEALTHY">Healthy</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 min-w-[250px]">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Min price"
                    value={priceMin}
                    onChange={(e) => setPriceMin(e.target.value)}
                    className="w-full bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-xs text-[var(--text-main)] focus:outline-none focus:border-emerald-500/30"
                  />
                  <span className="text-[var(--text-muted)] text-xs font-bold">to</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Max price"
                    value={priceMax}
                    onChange={(e) => setPriceMax(e.target.value)}
                    className="w-full bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-xs text-[var(--text-main)] focus:outline-none focus:border-emerald-500/30"
                  />
                </div>

                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('ALL');
                    setPriceMin('');
                    setPriceMax('');
                    setFilter('ALL');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[var(--bg-accent)] border border-[var(--border-subtle)] text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-emerald-500/30 transition-all"
                >
                  Clear
                </button>

                <button className="p-2.5 rounded-xl bg-[var(--bg-accent)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
                  <History size={18} />
                </button>
              </div>
            </div>
          </div>

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
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Variant Group</p>
                        <h3 className="text-2xl font-black tracking-tight text-slate-900">{group.familyLabel}</h3>
                      </div>
                      <div className="px-3 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-[10px] font-black uppercase tracking-widest text-emerald-700 w-fit">
                        {group.items.length} Types Together
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                      {Array.isArray(group.typeSignatures) && group.typeSignatures.length > 0 && (
                        <div className="w-full flex flex-wrap gap-2 mb-1">
                          {group.typeSignatures.map((sig) => (
                            <span
                              key={`type-sig-${group.familyKey}-${sig}`}
                              className="px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-[10px] font-black uppercase tracking-wider text-emerald-700"
                            >
                              Type: {sig}
                            </span>
                          ))}
                        </div>
                      )}
                      {group.items.map((item) => (
                        <span
                          key={`chip-${group.familyKey}-${item.id}`}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600"
                        >
                          {item.name}
                        </span>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
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
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                      {singleVariantProducts.map((prod, idx) => renderProductCard(prod, 'single', idx))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
              <AnimatePresence mode="popLayout">
                {filtered.map((prod, idx) => renderProductCard(prod, 'default', idx))}
              </AnimatePresence>
            </div>
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
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
              className="w-full max-w-lg rounded-[2rem] overflow-hidden relative"
            >
              {/* Removed background gradient for simplicity */}

              <div className="p-5 border-b border-emerald-100 flex items-center justify-between" style={{ background: '#f0fdf4' }}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'white', border: '1px solid #10b981' }}>
                    <History size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 leading-tight">Customer Delivery Schedule</h2>
                    <p className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mt-1">
                      {selectedProduct.prod.name} ({selectedProduct.prod.sku})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-400 transition-all" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  ✕
                </button>
              </div>

              <div className="p-5 grid grid-cols-1 gap-4 max-h-[60vh] overflow-y-auto" style={{ background: 'transparent' }}>
                <div className="mb-2">
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
                  return displayCustomers.map((cust, i) => (
                    <div key={cust.customer_id || i} className="flex flex-col p-4 rounded-xl gap-4 group transition-all" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      {(() => {
                        const orderEvents = Array.isArray(cust.order_events)
                          ? cust.order_events.filter((evt) => evt?.order_date || evt?.delivery_date)
                          : [];
                        let deliveryDates = orderEvents
                          .filter(evt => evt.delivery_date)
                          .map(evt => evt.delivery_date);
                        // If no deliveryDates but OUT event exists, use OUT's order_date as delivery
                        if (deliveryDates.length === 0) {
                          const outEvent = orderEvents.find(evt => evt.order_date && (!evt.delivery_date || evt.delivery_date === evt.order_date));
                          if (outEvent) {
                            deliveryDates = [outEvent.order_date];
                          }
                        }
                        const orderDates = orderEvents
                          .filter(evt => evt.order_date && (!evt.delivery_date || evt.delivery_date === ''))
                          .map(evt => evt.order_date);
                        const latestOrderDate = orderDates[0] || 'Unknown';
                        const latestDeliveryDate = deliveryDates[0] || 'Not Scheduled';
                        return (
                          <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'white', border: '1px solid #10b981' }}>
                            <span className="text-lg font-bold text-emerald-600">{cust.name?.charAt(0) || 'C'}</span>
                          </div>
                          <div>
                            <h4 className="text-base font-bold text-slate-900 leading-tight uppercase tracking-tight">{cust.name || 'Unknown Client'}</h4>
                            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mt-1 flex items-center gap-2">
                              <span className="w-1 h-3 bg-emerald-500 rounded-full"></span>
                              {cust.company || 'Direct Buyer Partner'}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <div className={`px-2 py-1 rounded text-[9px] font-bold tracking-widest uppercase border ${cust.risk_level === 'Low' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            (cust.risk_level === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200')
                            }`}>
                            {cust.risk_level} PROFILE
                          </div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">AI AGENT VERIFIED</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-3xl -mr-12 -mt-12 rounded-full"></div>

                        <div className="border-r border-slate-100 pr-4">
                          <span className="block text-[11px] font-bold text-slate-500 mb-1">Total Unit</span>
                          <span className="text-lg font-bold text-slate-900 leading-none">{cust.total_purchased || 0} <span className="text-[10px] text-slate-400 font-bold">U</span></span>
                        </div>

                        <div className="border-r border-slate-100 pr-4">
                          <span className="block text-[11px] font-bold text-slate-500 mb-1">Orders</span>
                          <span className="text-sm font-bold text-slate-700">{orderEvents.length || orderDates.length} total</span>
                          <p className="text-[11px] font-semibold text-slate-500 mt-1">Latest: {latestOrderDate}</p>
                        </div>

                        <div className="pl-2">
                          <span className="block text-[11px] font-bold text-emerald-700 mb-1">Delivery Date</span>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                            <span className="text-sm font-bold text-slate-900">{latestDeliveryDate}</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl bg-white border border-slate-100 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Order & Delivery Timeline</span>
                          <span className="text-[10px] font-bold text-slate-400">{orderEvents.length || orderDates.length} records</span>
                        </div>

                        {orderEvents.length === 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-600">
                            {orderDates.map((dateValue, idx2) => (
                              <div key={`timeline-fallback-${idx2}`} className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
                                <p className="font-bold text-slate-700">Order: {dateValue}</p>
                                <p className="text-slate-500">Delivery: {deliveryDates[idx2] || latestDeliveryDate}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="max-h-36 overflow-y-auto pr-1 space-y-2">
                            {orderEvents.map((evt, idx2) => (
                              <div key={`timeline-${idx2}`} className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[11px] font-bold text-slate-700">Order: {evt.order_date || 'Unknown'}</p>
                                  <p className="text-[11px] font-bold text-slate-900">{toUnitsSafe(evt.units)} U</p>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">Delivery: {evt.delivery_date || 'Not Scheduled'}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-3">
                          <div className="px-3 py-1 rounded-full bg-slate-50 border border-slate-200 flex items-center gap-2">
                            <BrainCircuit size={10} className="text-slate-400" />
                            <span className={`text-[10px] font-bold ${cust.trend_tag?.includes('Drop') ? 'text-rose-500' : (cust.trend_tag?.includes('Increasing') ? 'text-emerald-600' : 'text-slate-500')
                              }`}>
                              Trend: {cust.trend_tag}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] px-3 py-1.5 rounded-lg border border-slate-100 bg-slate-50">
                          <Truck size={12} />
                          Auto-Schedule
                        </div>
                      </div>
                          </>
                        );
                      })()}
                    </div>
                  ));
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
