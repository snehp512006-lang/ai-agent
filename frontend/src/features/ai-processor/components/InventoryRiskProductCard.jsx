import { ArrowRight, Package } from 'lucide-react';
import { motion } from 'framer-motion';
import { RISK_CONFIG, RISK_THEME } from '../process/inventoryRisksUtils';

const InventoryRiskProductCard = ({
  prod,
  keyPrefix = 'prod',
  setSelectedProduct,
  getProductMetrics,
  getActionPlan,
  compactDisplay,
  toFiniteNumber,
  isPlaceholderText,
  normalizeText,
  cleanCategoryLabel,
  formatUnitsValue,
  formatCurrencyINR,
}) => {
  const metrics = getProductMetrics(prod);
  const riskFromStatus = metrics.healthStatus === 'CRITICAL'
    ? 'OUT_OF_STOCK'
    : (metrics.healthStatus === 'LOW STOCK' ? 'LOW_STOCK' : (metrics.healthStatus === 'HEALTHY' ? 'HEALTHY' : prod.risk));
  const config = RISK_CONFIG[riskFromStatus] || RISK_CONFIG.HEALTHY;
  const tone = RISK_THEME[riskFromStatus] || RISK_THEME.HEALTHY;
  const actionPlan = getActionPlan(prod);
  const hasSafetyPoint = Number(prod.reorder || 0) > 0;
  const metricGrid = hasSafetyPoint ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3';

  const totalOrderStock = toFiniteNumber(prod.order_quantity);
  const hasOrderStock = totalOrderStock !== null;

  let stockRequired = null;
  if (toFiniteNumber(prod.on_hand) === 0 && hasOrderStock) {
    stockRequired = totalOrderStock;
  } else if (hasOrderStock && toFiniteNumber(prod.on_hand) !== null && toFiniteNumber(prod.reorder) !== null) {
    const diff = toFiniteNumber(prod.reorder) - toFiniteNumber(prod.on_hand);
    stockRequired = diff > 0 ? diff : 0;
  }

  const unitPrice = toFiniteNumber(prod.unit_price);
  const stockValue = toFiniteNumber(prod.stock_value);
  const hasExactValuation = unitPrice !== null && stockValue !== null;
  const displaySku = !isPlaceholderText(prod.sku) ? normalizeText(prod.sku) : null;
  const displayCategory = cleanCategoryLabel(prod.category, prod.name, prod.sku);
  const productMeta = displaySku && displayCategory
    ? `${displaySku} • ${displayCategory}`
    : (displaySku || displayCategory || 'Product metadata not available');

  return (
    <motion.div
      key={`${keyPrefix}-${prod.id}`}
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className={`border rounded-[1.25rem] p-4 transition-all group overflow-hidden relative shadow-sm ${tone.card}`}
    >
      <div className="absolute top-0 right-0 w-[400px] h-full bg-gradient-to-l from-white/[0.02] to-transparent pointer-events-none" />
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[var(--bg-accent)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] group-hover:border-emerald-500/20 group-hover:text-emerald-500 transition-all duration-500 shadow-inner">
              <Package size={20} strokeWidth={1.5} />
            </div>
            <div>
              <h4 className="text-3xl font-bold text-slate-900 leading-none mb-1">{prod.name}</h4>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{productMeta}</span>
            </div>
          </div>
          <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 ${config.className}`}>
            <config.icon size={14} />
            <span className="text-[9px] font-bold uppercase tracking-widest">{config.label}</span>
          </div>
        </div>

        <div className={`grid ${metricGrid} gap-4 mb-4`}>
          <div>
            <span className="block text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-1">On Hand</span>
            {toFiniteNumber(prod.on_hand) === null ? (
              <span className="text-sm font-bold text-slate-400">-</span>
            ) : (
              <span className="text-lg font-bold text-slate-900">{formatUnitsValue(prod.on_hand)} <span className="text-[10px] text-slate-500">UNITS</span></span>
            )}
          </div>
          <div>
            <span className="block text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-1">Stock Value</span>
            {hasExactValuation ? (
              <>
                <span className="text-lg font-bold text-slate-900">{formatCurrencyINR(stockValue)}</span>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">{formatUnitsValue(prod.on_hand)} x {formatCurrencyINR(unitPrice, { maxDecimals: 2 })}</p>
              </>
            ) : (
              <>
                <span className="text-sm font-bold text-slate-400">Price Data Missing</span>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">Exact valuation needs unit price in sheet.</p>
              </>
            )}
          </div>
          {hasSafetyPoint && (
            <div>
              <span className="block text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-1">Safety Point</span>
              <span className="text-lg font-bold text-[var(--text-main)]">{prod.reorder}</span>
              <p className="text-[10px] text-[var(--text-muted)] mt-1">Minimum buffer to prevent stockout.</p>
            </div>
          )}
          <div>
            <span className="block text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-1">Total Order Stock</span>
            {hasOrderStock ? (
              <span className="text-lg font-bold text-blue-700">{formatUnitsValue(totalOrderStock)} <span className="text-[10px] text-slate-500">UNITS</span></span>
            ) : (
              <span className="text-sm font-bold text-slate-400">-</span>
            )}
            <p className="text-[10px] text-[var(--text-muted)] mt-1">Total units ordered for this product.</p>
          </div>
        </div>

        <div className={`mb-3 rounded-xl border p-2.5 ${tone.planWrap}`}>
          <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${tone.label}`}>What To Do Next</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className={`rounded-xl border p-2.5 ${tone.tile}`}>
              <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${tone.label}`}>{actionPlan.line1Label}</p>
              <p className={`text-sm font-bold ${tone.valuePrimary}`}>{compactDisplay(actionPlan.line1Value)}</p>
            </div>
            <div className={`rounded-xl border p-2.5 ${tone.tile}`}>
              <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${tone.label}`}>Stock Required</p>
              <p className="text-sm font-bold text-rose-700">{stockRequired !== null ? `${formatUnitsValue(stockRequired)} units` : '-'}</p>
            </div>
            <div className={`rounded-xl border p-2.5 ${tone.tile}`}>
              <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${tone.label}`}>{actionPlan.line3Label}</p>
              <p className={`text-sm font-bold ${tone.valueTertiary}`}>{compactDisplay(actionPlan.line3Value)}</p>
            </div>
          </div>
        </div>

        <div className="mt-auto space-y-2 pt-3.5 border-t border-white/5">
          <div className="flex items-center justify-between gap-1">
            <button
              onClick={() => setSelectedProduct({ prod, actionPlan })}
              className="flex-1 py-2 rounded-lg bg-slate-50 border border-slate-100 text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-100 transition-all flex items-center justify-center gap-2"
            >
              View Details
            </button>
            <button className={`flex-[1.5] py-2 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest ${riskFromStatus === 'OUT_OF_STOCK' || riskFromStatus === 'LOW_STOCK'
              ? 'bg-rose-500 text-slate-950 shadow-rose-500/10'
              : 'bg-emerald-500 text-slate-950 shadow-emerald-500/10'
              }`}>
              {riskFromStatus === 'OUT_OF_STOCK' ? 'Order Now' : (riskFromStatus === 'LOW_STOCK' ? 'Restock Now' : 'Adjust Supply')}
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default InventoryRiskProductCard;
