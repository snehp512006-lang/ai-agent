import { useEffect, useRef, useState } from 'react';
import api from '../../../api/client';
import { cleanCategoryLabel } from './inventoryRisksUtils';
import { deriveUnifiedRiskCounts } from '../utils/analysisHelpers';
import {
  buildInventoryFromTransactions,
  extractInventoryRows,
  DEFAULT_LOW_STOCK_THRESHOLD,
} from '../../inventory-engine/buildInventoryFromTransactions';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeRiskKey = (value) => {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return 'HEALTHY';
  if (text === 'CRITICAL' || text === 'OUT OF STOCK' || text === 'OUT_OF_STOCK') return 'OUT_OF_STOCK';
  if (text === 'LOW STOCK' || text === 'LOW_STOCK' || text === 'UNDERSTOCK') return 'LOW_STOCK';
  if (text === 'DEADSTOCK' || text === 'NOT_SELLING' || text === 'NOT SELLING') return 'DEADSTOCK';
  if (text === 'OVERSTOCK' || text === 'TOO MUCH STOCK' || text === 'TOO_MUCH') return 'OVERSTOCK';
  if (text === 'HEALTHY' || text === 'NORMAL' || text === 'OK') return 'HEALTHY';
  return 'HEALTHY';
};

const toRiskStats = (stockAnalysis = {}) => ({
  out_of_stock: Number(stockAnalysis.out_of_stock_items || 0),
  low_stock: Number(stockAnalysis.low_stock_items || 0),
  deadstock: Number(stockAnalysis.deadstock_items || 0),
  overstock: Number(stockAnalysis.overstock_items || 0),
  healthy: Number(stockAnalysis.healthy_items || 0),
});

const toRiskStatsFromSummary = (summary = {}) => ({
  out_of_stock: Number(summary.out_of_stock || 0),
  low_stock: Number(summary.low_stock || 0),
  deadstock: Number(summary.deadstock || 0),
  overstock: Number(summary.overstock || 0),
  healthy: Number(summary.healthy || 0),
});

const NO_STORAGE_FULFILLMENT_MODE = true;
const LEDGER_LOW_STOCK_THRESHOLD = DEFAULT_LOW_STOCK_THRESHOLD;
const LAST_ANALYSIS_STORAGE_KEY = 'ai-ops-last-analysis-snapshot';
const PRODUCT_NAME_ALIASES = ['product_name', 'product', 'name', 'item_name', 'item', 'material_name'];
const DIRECTION_ALIASES = ['in_out', 'in/out', 'type', 'transaction_type', 'txn_type', 'movement', 'movement_type', 'entry_type', 'dr_cr'];
const QTY_ALIASES = ['quantity', 'qty', 'units', 'movement_qty', 'transaction_qty'];
const IN_QTY_ALIASES = ['in_qty', 'purchase_qty', 'purchased_qty', 'receipt_qty', 'received_qty'];
const RETURN_QTY_ALIASES = ['return_qty', 'returned_qty'];
const OUT_QTY_ALIASES = ['out_qty', 'sales_qty', 'sold_qty', 'issue_qty', 'consumption_qty'];
const DATE_ALIASES = ['date', 'txn_date', 'transaction_date', 'posting_date', 'invoice_date', 'record_date', 'created_at', 'updated_at'];
const PRICE_ALIASES = ['price', 'unit_price', 'rate', 'unit_rate', 'selling_price', 'buying_price', 'mrp'];

const normalizeFieldName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const getFieldByAliases = (row, aliases = []) => {
  if (!row || typeof row !== 'object') return null;
  const aliasSet = new Set(aliases.map(normalizeFieldName));
  for (const key of Object.keys(row)) {
    if (aliasSet.has(normalizeFieldName(key))) {
      const value = row[key];
      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
    }
  }
  return null;
};

const normalizeDirection = (row) => {
  const raw = String(getFieldByAliases(row, DIRECTION_ALIASES) || '').trim().toUpperCase();
  if (!raw) return null;
  if (raw.includes('RETURN') || raw === 'RET') return 'RETURN';
  if (raw.includes('OUT') || raw.includes('SALE') || raw.includes('ISSUE') || raw.includes('DEBIT') || raw.includes('CONSUM')) return 'OUT';
  if (raw.includes('IN') || raw.includes('PURCHASE') || raw.includes('RECEIPT') || raw.includes('CREDIT') || raw.includes('ADD')) return 'IN';
  return null;
};

const extractMovementFromRow = (row) => {
  const qty = toNumber(getFieldByAliases(row, QTY_ALIASES));
  const direction = normalizeDirection(row);
  if (qty !== null && direction) {
    const absQty = Math.abs(qty);
    if (direction === 'OUT') return { inQty: 0, returnQty: 0, outQty: absQty };
    if (direction === 'RETURN') return { inQty: 0, returnQty: absQty, outQty: 0 };
    return { inQty: absQty, returnQty: 0, outQty: 0 };
  }

  const inQty = Math.abs(toNumber(getFieldByAliases(row, IN_QTY_ALIASES)) || 0);
  const returnQty = Math.abs(toNumber(getFieldByAliases(row, RETURN_QTY_ALIASES)) || 0);
  const outQty = Math.abs(toNumber(getFieldByAliases(row, OUT_QTY_ALIASES)) || 0);
  if (inQty > 0 || returnQty > 0 || outQty > 0) {
    return { inQty, returnQty, outQty };
  }
  return null;
};

const deriveLedgerRiskStats = (products = []) => products.reduce((acc, product) => {
  const stockValue = toNumber(product?.net_stock ?? product?.on_hand ?? product?.current_stock) ?? 0;
  if (stockValue <= 0) {
    acc.out_of_stock += 1;
  } else if (stockValue < LEDGER_LOW_STOCK_THRESHOLD) {
    acc.low_stock += 1;
  } else {
    acc.healthy += 1;
  }
  return acc;
}, { out_of_stock: 0, low_stock: 0, deadstock: 0, overstock: 0, healthy: 0 });

const toSnakeRiskStats = (counts = {}) => ({
  out_of_stock: Number(counts.outOfStock || 0),
  low_stock: Number(counts.lowStock || 0),
  deadstock: Number(counts.deadstockCount || 0),
  overstock: Number(counts.overStock || 0),
  healthy: Number(counts.healthy || 0),
});

const deriveLedgerRiskStatsFromRows = (rows = []) => {
  const grouped = new Map();
  let movementRowsCount = 0;
  rows.forEach((row, idx) => {
    const movement = extractMovementFromRow(row);
    if (!movement) return;

    movementRowsCount += 1;
    const productName = String(getFieldByAliases(row, PRODUCT_NAME_ALIASES) || `Product-${idx + 1}`).trim();
    const key = normalizeFieldName(productName || `Product-${idx + 1}`);
    if (!grouped.has(key)) {
      grouped.set(key, { inQty: 0, returnQty: 0, outQty: 0 });
    }
    const bucket = grouped.get(key);
    bucket.inQty += movement.inQty;
    bucket.returnQty += movement.returnQty;
    bucket.outQty += movement.outQty;
  });

  if (movementRowsCount === 0 || grouped.size === 0) {
    return null;
  }

  const stats = { out_of_stock: 0, low_stock: 0, deadstock: 0, overstock: 0, healthy: 0 };
  grouped.forEach((bucket) => {
    const netStock = bucket.inQty + bucket.returnQty - bucket.outQty;
    if (netStock <= 0) stats.out_of_stock += 1;
    else if (netStock < LEDGER_LOW_STOCK_THRESHOLD) stats.low_stock += 1;
    else stats.healthy += 1;
  });
  return stats;
};

const toComparableTime = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
};

const deriveLatestUnitPriceByProductFromRows = (rows = []) => {
  const grouped = new Map(); // key -> { price, time, idx }
  rows.forEach((row, idx) => {
    const rawPrice = toNumber(getFieldByAliases(row, PRICE_ALIASES));
    if (rawPrice === null || rawPrice <= 0) return;
    const productName = String(getFieldByAliases(row, PRODUCT_NAME_ALIASES) || '').trim();
    if (!productName) return;
    const key = normalizeFieldName(productName);
    const t = toComparableTime(getFieldByAliases(row, DATE_ALIASES)) ?? idx;
    const current = grouped.get(key);
    if (!current || t > current.time) {
      grouped.set(key, { price: rawPrice, time: t, idx });
    }
  });
  return grouped;
};

// Strict demand breakdown for cards (matches UI meaning):
// Total Order Stock = SUM(OUT) - SUM(RETURN). IN is ignored.
const deriveOutReturnDemandByProductFromRows = (rows = []) => {
  const grouped = new Map(); // key -> { outQty, returnQty, orderNeed }
  rows.forEach((row, idx) => {
    const movement = extractMovementFromRow(row);
    if (!movement) return;
    const productName = String(getFieldByAliases(row, PRODUCT_NAME_ALIASES) || `Product-${idx + 1}`).trim();
    const key = normalizeFieldName(productName || `Product-${idx + 1}`);
    if (!grouped.has(key)) {
      grouped.set(key, { outQty: 0, returnQty: 0, orderNeed: 0 });
    }
    const bucket = grouped.get(key);
    bucket.outQty += Number(movement.outQty || 0);
    bucket.returnQty += Number(movement.returnQty || 0);
    bucket.orderNeed = Math.max(0, Math.ceil(bucket.outQty - bucket.returnQty));
  });
  return grouped;
};

const resolveTransactionSheetName = (analysisPayload = {}) => {
  const diagnostics = Array.isArray(analysisPayload?.metadata?.sheet_diagnostics)
    ? analysisPayload.metadata.sheet_diagnostics
    : [];
  const diagHit = diagnostics.find((sheet) => String(sheet?.classification || '').toUpperCase().includes('TRANSACTION'));
  if (diagHit?.sheet_name) return diagHit.sheet_name;

  const matrix = Array.isArray(analysisPayload?.metadata?.sheet_analysis_summary)
    ? analysisPayload.metadata.sheet_analysis_summary
    : [];
  const matrixHit = matrix.find((sheet) => {
    const typeText = String(sheet?.sheet_type || '').toUpperCase();
    const classText = String(sheet?.classification || '').toUpperCase();
    return typeText.includes('TRANSACTION') || classText.includes('TRANSACTION');
  });
  if (matrixHit?.sheet_name) return matrixHit.sheet_name;
  return undefined;
};

const fetchLedgerStatsForUpload = async (uploadId, analysisPayload) => {
  const parsedUploadId = Number(uploadId);
  if (!Number.isFinite(parsedUploadId) || parsedUploadId <= 0) return null;

  const sheetName = resolveTransactionSheetName(analysisPayload) || 'Sheet1';
  const res = await api.get(`/ingestion/upload-ledger-risk-summary/${parsedUploadId}/`, {
    params: {
      sheet_name: sheetName,
    },
  });
  const payload = res?.data || {};
  if (!payload) return null;
  return {
    out_of_stock: Number(payload.out_of_stock || 0),
    low_stock: Number(payload.low_stock || 0),
    deadstock: Number(payload.deadstock || 0),
    overstock: Number(payload.overstock || 0),
    healthy: Number(payload.healthy || 0),
  };
};

const extractUploadId = (analysisPayload = {}) => {
  const direct = Number(
    analysisPayload?.analysis_isolation?.upload_id
    || analysisPayload?.analysis_isolation?.sheet_id
    || analysisPayload?.metadata?.upload_id
    || 0
  );
  if (Number.isFinite(direct) && direct > 0) return direct;
  const sessionId = String(analysisPayload?.analysis_isolation?.session_id || '');
  const match = sessionId.match(/upload-(\d+)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const hasMeaningfulAnalysisPayload = (payload) => Boolean(
  payload
  && typeof payload === 'object'
  && (
    (Array.isArray(payload?.products) && payload.products.length > 0)
    || (Array.isArray(payload?.products_analysis) && payload.products_analysis.length > 0)
    || (Array.isArray(payload?.transactions) && payload.transactions.length > 0)
    || (Array.isArray(payload?.raw_transactions) && payload.raw_transactions.length > 0)
  )
);

const readStoredAnalysisSnapshot = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_ANALYSIS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const mapProductForCards = (product, idx, latestPriceByProductKey = null, demandByProductKey = null) => {
  const source = product?.source || product || {};
  const netStock = toNumber(product?.net_stock ?? product?.on_hand ?? product?.current_stock) ?? 0;
  const threshold = toNumber(product?.threshold) ?? DEFAULT_LOW_STOCK_THRESHOLD;
  const demandKeys = [
    product?.name,
    product?.product_name,
    product?.product,
    product?.item_name,
    product?.sku,
  ]
    .filter((v) => v !== null && v !== undefined && String(v).trim())
    .map((v) => normalizeFieldName(String(v)));
  let strictDemand = null;
  for (const k of demandKeys) {
    const hit = demandByProductKey?.get(k);
    if (hit) {
      strictDemand = hit;
      break;
    }
  }
  const totalOrderStockFromTransactions = strictDemand?.orderNeed ?? null;

  const transactionReturnQtyRaw = toNumber(product?.total_return);
  const transactionOutQtyRaw = toNumber(product?.total_out);
  const hasDirectTotals = transactionReturnQtyRaw !== null || transactionOutQtyRaw !== null;
  const directOrderNeed = hasDirectTotals
    ? Math.max(0, Math.ceil((transactionOutQtyRaw ?? 0) - (transactionReturnQtyRaw ?? 0)))
    : null;
  const explicitOrderQuantity = toNumber(
    product?.order_quantity
    ?? product?.recommended_reorder_quantity
    ?? product?.arrange_required
  );
  const shortageToArrange = toNumber(product?.arrange_required)
    ?? explicitOrderQuantity
    ?? (netStock < 0 ? Math.abs(netStock) : 0);
  const stockDeficitToThreshold = Math.max(Math.ceil(threshold - netStock), 0);
  const orderQuantity = NO_STORAGE_FULFILLMENT_MODE
    ? Math.max(
      0,
      Math.ceil(
        totalOrderStockFromTransactions
          ?? directOrderNeed
          ?? (explicitOrderQuantity ?? shortageToArrange ?? stockDeficitToThreshold)
      )
    )
    : (
      shortageToArrange > 0
        ? Math.ceil(shortageToArrange)
        : stockDeficitToThreshold
    );

  const priceKeys = [
    product?.name,
    product?.product_name,
    product?.product,
    product?.sku,
  ]
    .filter((v) => v !== null && v !== undefined && String(v).trim())
    .map((v) => normalizeFieldName(String(v)));
  let latestPrice = null;
  for (const k of priceKeys) {
    const hit = latestPriceByProductKey?.get(k)?.price;
    if (hit) {
      latestPrice = hit;
      break;
    }
  }
  const unitPrice = toNumber(source?.unit_price ?? source?.price) ?? (latestPrice !== null ? Number(latestPrice) : null);
  const stockValue = unitPrice !== null ? (Number(netStock) * Number(unitPrice)) : null;

  return {
    id: product?.id ?? idx + 1,
    sku: product?.sku || `P-${idx + 1}`,
    name: product?.name || `Product-${idx + 1}`,
    category: cleanCategoryLabel(
      source?.category || source?.product_category || source?.group || source?.segment || null,
      product?.name,
      product?.sku,
    ),
    on_hand: netStock,
    current_stock: netStock,
    net_stock: netStock,
    raw_net_stock: toNumber(product?.raw_net_stock),
    check_quantity: toNumber(product?.check_quantity),
    arrange_required: shortageToArrange,
    pending_party_pickup_qty: toNumber(product?.pending_party_pickup_qty) ?? 0,
    delivered_to_party_qty: toNumber(product?.delivered_to_party_qty) ?? 0,
    total_in: toNumber(product?.total_in) ?? 0,
    total_out: toNumber(product?.total_out) ?? 0,
    total_return: toNumber(product?.total_return) ?? 0,
    total_in_order_need: 0,
    total_out_order_need: strictDemand ? Number(strictDemand.outQty || 0) : null,
    total_return_order_need: strictDemand ? Number(strictDemand.returnQty || 0) : null,
    reorder: NO_STORAGE_FULFILLMENT_MODE ? 0 : threshold,
    daily_demand: null,
    predicted_7_day_demand: null,
    customer_purchased: null,
    customer_purchased_basis: 'TRANSACTION_LEDGER',
    sales_total: null,
    days_window: null,
    record_date: null,
    sales_missing: true,
    max: 0,
    risk: normalizeRiskKey(product?.risk || product?.health_status || product?.status),
    days_to_stock: null,
    stockout_datetime: null,
    order_quantity: orderQuantity,
    health_status: product?.health_status || product?.status || (normalizeRiskKey(product?.risk) === 'OUT_OF_STOCK' ? 'CRITICAL' : (normalizeRiskKey(product?.risk) === 'LOW_STOCK' ? 'LOW STOCK' : 'HEALTHY')),
    unit_price: unitPrice,
    stock_value: stockValue,
    confidence_score: toNumber(source?.confidence_score),
    status: 'SUCCESS',
    top_customers: Array.isArray(product?.top_customers) ? product.top_customers : [],
    metrics_intel: source?.metrics_intel || null,
    reason: product?.reason || null,
    recommended_action: product?.recommended_action || null,
    action_plan: product?.action_plan || null,
  };
};

const buildUiStateFromPayload = (analysisPayload) => {
  const hasCanonicalStock = analysisPayload?.stock_analysis && typeof analysisPayload.stock_analysis === 'object';
  const hasCanonicalSummary = analysisPayload?.summary && typeof analysisPayload.summary === 'object';
  const precomputedRows = Array.isArray(analysisPayload?.products) && analysisPayload.products.length > 0
    ? analysisPayload.products
    : (Array.isArray(analysisPayload?.products_analysis) ? analysisPayload.products_analysis : []);
  const transactionRows = extractInventoryRows(analysisPayload || {});
  const latestPriceByProductKey = transactionRows.length > 0 ? deriveLatestUnitPriceByProductFromRows(transactionRows) : null;
  const demandByProductKey = transactionRows.length > 0 ? deriveOutReturnDemandByProductFromRows(transactionRows) : null;

  const hasPrecomputedProductRows = precomputedRows.length > 0
    && precomputedRows.some((row) => row && typeof row === 'object' && (row.risk || row.health_status || row.status));

  if (hasPrecomputedProductRows) {
    const cardProducts = precomputedRows.map((product, idx) => mapProductForCards(product, idx, latestPriceByProductKey, demandByProductKey));
    const ledgerStatsFromRows = transactionRows.length > 0 ? deriveLedgerRiskStatsFromRows(transactionRows) : null;
    const unifiedCounts = deriveUnifiedRiskCounts({ ...analysisPayload, products: cardProducts }, LEDGER_LOW_STOCK_THRESHOLD);
    const resolvedRiskStats = NO_STORAGE_FULFILLMENT_MODE
      ? (
        // Always prefer deterministic ledger (IN/OUT/RETURN) counts when raw transaction rows exist.
        ledgerStatsFromRows || toSnakeRiskStats(unifiedCounts)
      )
      : (
        analysisPayload?.stock_analysis && typeof analysisPayload.stock_analysis === 'object'
          ? toRiskStats(analysisPayload.stock_analysis)
          : (analysisPayload?.summary && typeof analysisPayload.summary === 'object')
            ? toRiskStatsFromSummary(analysisPayload.summary)
            : cardProducts.reduce((acc, p) => {
              const r = normalizeRiskKey(p.risk);
              if (r === 'OUT_OF_STOCK') acc.out_of_stock += 1;
              else if (r === 'LOW_STOCK') acc.low_stock += 1;
              else if (r === 'DEADSTOCK') acc.deadstock += 1;
              else if (r === 'OVERSTOCK') acc.overstock += 1;
              else acc.healthy += 1;
              return acc;
            }, { out_of_stock: 0, low_stock: 0, deadstock: 0, overstock: 0, healthy: 0 })
      );

    return {
      products: cardProducts,
      riskStats: resolvedRiskStats,
      analysisReady: cardProducts.length > 0,
      mappingError: cardProducts.length === 0 ? 'ANALYSIS READY BUT NO PRODUCTS FOUND' : null,
    };
  }

  const inventoryModel = buildInventoryFromTransactions(transactionRows, {
    lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
  });
  const cardProducts = inventoryModel.products.map((product, idx) => mapProductForCards(product, idx, latestPriceByProductKey, demandByProductKey));
  const ledgerStatsFromRows = transactionRows.length > 0 ? deriveLedgerRiskStatsFromRows(transactionRows) : null;
  const unifiedCounts = deriveUnifiedRiskCounts({ ...analysisPayload, products: cardProducts }, LEDGER_LOW_STOCK_THRESHOLD);
  return {
    products: cardProducts,
    riskStats: NO_STORAGE_FULFILLMENT_MODE
      ? (
        ledgerStatsFromRows || toSnakeRiskStats(unifiedCounts)
      )
      : (
        hasCanonicalStock
          ? toRiskStats(analysisPayload.stock_analysis)
          : (hasCanonicalSummary ? toRiskStatsFromSummary(analysisPayload.summary) : toRiskStats(inventoryModel.stock_analysis))
      ),
    analysisReady: cardProducts.length > 0,
    mappingError: !inventoryModel.validation?.is_balanced
      ? 'INVENTORY VALIDATION ERROR: IN + RETURN - OUT does not match net stock sum'
      : (cardProducts.length === 0 ? 'ANALYSIS READY BUT NO TRANSACTION PRODUCTS FOUND' : null),
  };
};

export const useInventoryRisksData = ({ liveAnalysis: _liveAnalysis, selectedUploadId, selectedProduct, latestUploadId }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [analysisSnapshot, setAnalysisSnapshot] = useState(null);
  const [riskStats, setRiskStats] = useState({
    out_of_stock: 0,
    low_stock: 0,
    deadstock: 0,
    overstock: 0,
    healthy: 0,
  });
  const [mappingError, setMappingError] = useState(null);
  const [remoteProductBuyers, setRemoteProductBuyers] = useState([]);
  const [remoteProductBuyersLoading, setRemoteProductBuyersLoading] = useState(false);
  const [remoteBuyerSource, setRemoteBuyerSource] = useState(null);
  const lockedUploadIdRef = useRef(null);
  const lockedRiskStatsRef = useRef(null);
  const ledgerFetchCacheRef = useRef(new Map()); // key -> stats
  const ledgerFetchInFlightRef = useRef(new Map()); // key -> Promise<stats|null>
  const lastSuccessfulLedgerFetchKeyRef = useRef(null);
  const ledgerFetchAttemptsRef = useRef(new Map()); // key -> attempts
  const hasResolvedCorrectPayloadRef = useRef(false);
  const hasMeaningfulLocalAnalysis = hasMeaningfulAnalysisPayload(_liveAnalysis);

  // If user explicitly pins a different upload, unlock and re-lock to the new one.
  useEffect(() => {
    if (selectedUploadId) {
      lockedUploadIdRef.current = Number(selectedUploadId) || null;
      lockedRiskStatsRef.current = null;
      // Prevent flashing stale results when user switches uploads.
      setProducts([]);
      setAnalysisReady(false);
      setAnalysisSnapshot(null);
      setMappingError(null);
      hasResolvedCorrectPayloadRef.current = false;
    }
  }, [selectedUploadId]);

  useEffect(() => {
    const parsedLatestUploadId = Number(latestUploadId);
    if (selectedUploadId || !Number.isFinite(parsedLatestUploadId) || parsedLatestUploadId <= 0) {
      return;
    }

    if (lockedUploadIdRef.current && lockedUploadIdRef.current !== parsedLatestUploadId) {
      lockedUploadIdRef.current = null;
      lockedRiskStatsRef.current = null;
      lastSuccessfulLedgerFetchKeyRef.current = null;
      hasResolvedCorrectPayloadRef.current = false;
      setRiskStats({
        out_of_stock: 0,
        low_stock: 0,
        deadstock: 0,
        overstock: 0,
        healthy: 0,
      });
    }
  }, [latestUploadId, selectedUploadId]);

  useEffect(() => {
    let cancelled = false;
    const storedAnalysis = readStoredAnalysisSnapshot();
    const hasMeaningfulStoredAnalysis = hasMeaningfulAnalysisPayload(storedAnalysis);
    const localFallbackAnalysis = hasMeaningfulLocalAnalysis
      ? _liveAnalysis
      : (hasMeaningfulStoredAnalysis ? storedAnalysis : null);
    const liveUploadId = extractUploadId(_liveAnalysis || {}) || (Number(latestUploadId) > 0 ? Number(latestUploadId) : null);
    const needsRemoteRefresh = Boolean(selectedUploadId) && String(selectedUploadId) !== String(liveUploadId || '');
    const livePayloadUploadId = extractUploadId(_liveAnalysis || {}) || null;
    const desiredUploadId = Number(selectedUploadId) > 0
      ? Number(selectedUploadId)
      : (Number(latestUploadId) > 0 ? Number(latestUploadId) : null);
    const canUseLivePayload = Boolean(
      _liveAnalysis
      && typeof _liveAnalysis === 'object'
      && (
        // If user pinned an upload, only use live payload when it matches that upload.
        (Number(selectedUploadId) > 0 && String(livePayloadUploadId || '') === String(selectedUploadId))
        // If not pinned but we know latestUploadId, only show payload matching latest (avoid localStorage stale flash).
        || (!selectedUploadId && desiredUploadId && String(livePayloadUploadId || '') === String(desiredUploadId))
        // If we don't even know desiredUploadId yet, only use live payload after we already resolved once
        // (prevents first paint from stale localStorage snapshot).
        || (!selectedUploadId && !desiredUploadId && hasResolvedCorrectPayloadRef.current)
        // Offline/degraded fallback: if we have a meaningful local snapshot but no upload ids,
        // render it instead of showing an empty page forever.
        || (!selectedUploadId && !desiredUploadId && !livePayloadUploadId && hasMeaningfulLocalAnalysis)
      )
    );

    const resolveLockedUploadId = (analysisPayload) => {
      if (lockedUploadIdRef.current) return lockedUploadIdRef.current;
      const preferred = Number(selectedUploadId) > 0
        ? Number(selectedUploadId)
        : (extractUploadId(analysisPayload || {}) || (Number(latestUploadId) > 0 ? Number(latestUploadId) : null));
      if (preferred) {
        lockedUploadIdRef.current = preferred;
      }
      return lockedUploadIdRef.current;
    };

    // Render immediately from in-memory analysis so page never blocks on network.
    // But NEVER warm-start from a mismatched upload (causes "wrong then right" flash).
    if (canUseLivePayload && typeof _liveAnalysis === 'object') {
      try {
        const instantState = buildUiStateFromPayload(_liveAnalysis);
        if (!cancelled) {
          setProducts(instantState.products);
          // In ledger-first mode we intentionally avoid showing derived/approx riskStats first,
          // because they can differ from the stable backend ledger summary and cause a "wrong then right" flash.
          // We only show riskStats immediately if we're NOT in ledger-first mode, or we already have locked stable stats.
          if (!NO_STORAGE_FULFILLMENT_MODE) {
            if (!lockedRiskStatsRef.current) {
              setRiskStats(instantState.riskStats);
            }
          } else if (lockedRiskStatsRef.current) {
            setRiskStats(lockedRiskStatsRef.current);
          }
          setAnalysisReady(instantState.analysisReady);
          setMappingError(instantState.mappingError);
          setAnalysisSnapshot(_liveAnalysis);
          hasResolvedCorrectPayloadRef.current = true;
        }
      } catch {
        // Ignore warm-start errors and continue with remote fetch fallback.
      }
    } else if (!needsRemoteRefresh && localFallbackAnalysis) {
      try {
        const fallbackState = buildUiStateFromPayload(localFallbackAnalysis);
        if (!cancelled) {
          setProducts(fallbackState.products);
          setRiskStats(fallbackState.riskStats);
          setAnalysisReady(fallbackState.analysisReady);
          setMappingError(fallbackState.mappingError || 'SHOWING LAST AVAILABLE ANALYSIS SNAPSHOT');
          setAnalysisSnapshot(localFallbackAnalysis);
          hasResolvedCorrectPayloadRef.current = true;
        }
      } catch {
        // Ignore and continue to remote fetch.
      }
    } else if (needsRemoteRefresh) {
      // Force clear while remote payload loads (avoid showing stale cached snapshot).
      setProducts([]);
      setAnalysisReady(false);
      setMappingError(null);
      setRiskStats({
        out_of_stock: 0,
        low_stock: 0,
        deadstock: 0,
        overstock: 0,
        healthy: 0,
      });
      setAnalysisSnapshot(null);
    }

    const applyStableLedgerStats = async (analysisPayload) => {
      const resolvedUploadId = resolveLockedUploadId(analysisPayload);
      if (!NO_STORAGE_FULFILLMENT_MODE || !resolvedUploadId) return;
      // If already locked, don't refetch on every poll/render.
      if (lockedRiskStatsRef.current) return;

      const sheetName = resolveTransactionSheetName(analysisPayload) || 'Sheet1';
      const fetchKey = `${resolvedUploadId}:${sheetName}`;
      // If we already completed a full ledger fetch for this key, don't repeat it.
      if (lastSuccessfulLedgerFetchKeyRef.current === fetchKey) return;

      const cached = ledgerFetchCacheRef.current.get(fetchKey);
      if (cached) {
        lockedRiskStatsRef.current = cached;
        setRiskStats(cached);
        lastSuccessfulLedgerFetchKeyRef.current = fetchKey;
        return;
      }

      const inflight = ledgerFetchInFlightRef.current.get(fetchKey);
      if (inflight) {
        try {
          const stats = await inflight;
          if (!cancelled && stats) {
            ledgerFetchCacheRef.current.set(fetchKey, stats);
            lockedRiskStatsRef.current = stats;
            setRiskStats(stats);
            lastSuccessfulLedgerFetchKeyRef.current = fetchKey;
          }
        } catch {
          // ignore
        }
        return;
      }

      try {
        const attempts = (ledgerFetchAttemptsRef.current.get(fetchKey) || 0) + 1;
        ledgerFetchAttemptsRef.current.set(fetchKey, attempts);
        // Avoid infinite hammering in case backend rejects/returns partial data.
        if (attempts > 3) {
          return;
        }

        const promise = fetchLedgerStatsForUpload(resolvedUploadId, analysisPayload || {});
        ledgerFetchInFlightRef.current.set(fetchKey, promise);
        const stats = await promise;
        ledgerFetchInFlightRef.current.delete(fetchKey);
        if (cancelled || !stats) {
          // Allow future retries (do not mark as successful).
          return;
        }
        ledgerFetchCacheRef.current.set(fetchKey, stats);
        lockedRiskStatsRef.current = stats;
        setRiskStats(stats);
        lastSuccessfulLedgerFetchKeyRef.current = fetchKey;
      } catch {
        ledgerFetchInFlightRef.current.delete(fetchKey);
        // Ignore ledger-fetch failures and keep current UI state.
      }
    };

    // Single-source behavior: if live analysis already matches current selection,
    // do not fetch a different payload and cause cross-page mismatches.
    if (canUseLivePayload && !needsRemoteRefresh) {
      applyStableLedgerStats(_liveAnalysis);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const fetchInventory = async () => {
      try {
        setLoading(true);
        setMappingError(null);

        let analysisPayload = null;

        if (selectedUploadId) {
          try {
            const res = await api.get(`/ingestion/upload-analysis/${selectedUploadId}/`);
            analysisPayload = res?.data?.analysis || null;
          } catch {
            analysisPayload = null;
          }
        }

        if (!analysisPayload) {
          try {
            const res = await api.get('/ingestion/latest-analysis/');
            analysisPayload = res?.data?.analysis || null;
          } catch {
            analysisPayload = null;
          }
        }

        const resolvedPayload = analysisPayload || localFallbackAnalysis || null;
        const nextState = buildUiStateFromPayload(resolvedPayload || {});
        const resolvedUploadId = resolveLockedUploadId(resolvedPayload);
        let stableLedgerStats = null;
        if (NO_STORAGE_FULFILLMENT_MODE) {
          try {
            stableLedgerStats = await fetchLedgerStatsForUpload(resolvedUploadId, resolvedPayload || {});
          } catch {
            stableLedgerStats = null;
          }
        }
        if (!cancelled) {
          setAnalysisSnapshot(resolvedPayload);
          setProducts(nextState.products);
          if (stableLedgerStats) {
            lockedRiskStatsRef.current = stableLedgerStats;
          }
          setRiskStats(lockedRiskStatsRef.current || stableLedgerStats || nextState.riskStats);
          setAnalysisReady(nextState.analysisReady);
          setMappingError(nextState.mappingError);
          // From this point onward, we can safely warm-start even if desiredUploadId is unknown.
          hasResolvedCorrectPayloadRef.current = true;
        }
      } catch (err) {
        console.error('Failed to fetch inventory:', err);
        if (!cancelled) {
          if (localFallbackAnalysis) {
            try {
              const fallbackState = buildUiStateFromPayload(localFallbackAnalysis || {});
              setProducts(fallbackState.products);
              setRiskStats(fallbackState.riskStats);
              setAnalysisReady(fallbackState.analysisReady);
              setAnalysisSnapshot(localFallbackAnalysis || null);
              setMappingError(fallbackState.mappingError || 'SHOWING LAST AVAILABLE ANALYSIS SNAPSHOT');
              hasResolvedCorrectPayloadRef.current = true;
            } catch {
              setProducts([]);
              setRiskStats({
                out_of_stock: 0,
                low_stock: 0,
                deadstock: 0,
                overstock: 0,
                healthy: 0,
              });
              setAnalysisReady(false);
              setMappingError('FAILED TO BUILD INVENTORY FROM TRANSACTIONS');
            }
          } else {
            setProducts([]);
            setRiskStats({
              out_of_stock: 0,
              low_stock: 0,
              deadstock: 0,
              overstock: 0,
              healthy: 0,
            });
            setAnalysisReady(false);
            setMappingError('FAILED TO BUILD INVENTORY FROM TRANSACTIONS');
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchInventory();
    return () => {
      cancelled = true;
    };
  }, [_liveAnalysis, selectedUploadId, latestUploadId]);

  useEffect(() => {
    if (!selectedProduct?.prod) {
      setRemoteProductBuyers([]);
      setRemoteProductBuyersLoading(false);
      setRemoteBuyerSource(null);
      return;
    }

    const resolvedUploadId = selectedUploadId
      || analysisSnapshot?.analysis_isolation?.sheet_id
      || analysisSnapshot?.analysis_isolation?.upload_id
      || null;

    let cancelled = false;
    const fetchBuyers = async () => {
      setRemoteProductBuyersLoading(true);
      try {
        const res = await api.get('/ingestion/product-buyers/', {
          params: {
            product_name: selectedProduct?.prod?.name || '',
            product_sku: selectedProduct?.prod?.sku || '',
            upload_id: resolvedUploadId || '',
            strict: true,
          },
        });
        if (cancelled) return;
        const buyers = Array.isArray(res?.data?.buyers) ? res.data.buyers : [];
        setRemoteProductBuyers(buyers);
        setRemoteBuyerSource(res?.data?.source || null);
      } catch {
        if (!cancelled) {
          setRemoteProductBuyers([]);
          setRemoteBuyerSource(null);
        }
      } finally {
        if (!cancelled) setRemoteProductBuyersLoading(false);
      }
    };

    fetchBuyers();
    return () => {
      cancelled = true;
    };
  }, [selectedProduct, analysisSnapshot, selectedUploadId]);

  return {
    products,
    loading,
    analysisReady,
    analysisSnapshot,
    riskStats,
    mappingError,
    remoteProductBuyers,
    remoteProductBuyersLoading,
    remoteBuyerSource,
  };
};
