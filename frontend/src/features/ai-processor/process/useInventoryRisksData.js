import { useEffect, useState } from 'react';
import api from '../../../api/client';
import { cleanCategoryLabel } from './inventoryRisksUtils';
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

const mapProductForCards = (product, idx) => {
  const source = product?.source || product || {};
  const netStock = toNumber(product?.net_stock ?? product?.on_hand ?? product?.current_stock) ?? 0;
  const threshold = toNumber(product?.threshold) ?? DEFAULT_LOW_STOCK_THRESHOLD;
  const transactionInQtyRaw = toNumber(product?.total_in);
  const transactionReturnQtyRaw = toNumber(product?.total_return);
  const hasTransactionOrderFlow = transactionInQtyRaw !== null || transactionReturnQtyRaw !== null;
  const netOrderStockFromTransactions = Math.max(
    0,
    Math.ceil((transactionInQtyRaw ?? 0) - (transactionReturnQtyRaw ?? 0)),
  );
  const explicitOrderQuantity = toNumber(product?.order_quantity ?? product?.recommended_reorder_quantity);
  const shortageToArrange = toNumber(product?.arrange_required)
    ?? explicitOrderQuantity
    ?? (netStock < 0 ? Math.abs(netStock) : 0);
  const orderQuantity = NO_STORAGE_FULFILLMENT_MODE
    ? (hasTransactionOrderFlow ? netOrderStockFromTransactions : Math.ceil(shortageToArrange))
    : (
      shortageToArrange > 0
        ? Math.ceil(shortageToArrange)
        : Math.max(Math.ceil(threshold - netStock), 0)
    );

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
    unit_price: toNumber(source?.unit_price ?? source?.price),
    stock_value: null,
    confidence_score: toNumber(source?.confidence_score),
    status: 'SUCCESS',
    top_customers: Array.isArray(product?.top_customers) ? product.top_customers : [],
    metrics_intel: source?.metrics_intel || null,
    reason: product?.reason || null,
    recommended_action: product?.recommended_action || null,
    action_plan: product?.action_plan || null,
  };
};

export const useInventoryRisksData = ({ liveAnalysis: _liveAnalysis, selectedUploadId, selectedProduct }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
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

        setAnalysisSnapshot(analysisPayload || null);

        const precomputedRows = Array.isArray(analysisPayload?.products) && analysisPayload.products.length > 0
          ? analysisPayload.products
          : (Array.isArray(analysisPayload?.products_analysis) ? analysisPayload.products_analysis : []);

        const hasPrecomputedProductRows = precomputedRows.length > 0
          && precomputedRows.some((row) => row && typeof row === 'object' && (row.on_hand !== undefined || row.current_stock !== undefined))
          && precomputedRows.some((row) => row && typeof row === 'object' && (row.risk || row.health_status || row.status));

        if (hasPrecomputedProductRows) {
          const cardProducts = precomputedRows.map(mapProductForCards);
          setProducts(cardProducts);

          if (analysisPayload?.stock_analysis && typeof analysisPayload.stock_analysis === 'object') {
            setRiskStats(toRiskStats(analysisPayload.stock_analysis));
          } else if (analysisPayload?.summary && typeof analysisPayload.summary === 'object') {
            setRiskStats(toRiskStatsFromSummary(analysisPayload.summary));
          } else {
            const computed = cardProducts.reduce((acc, p) => {
              const r = normalizeRiskKey(p.risk);
              if (r === 'OUT_OF_STOCK') acc.out_of_stock += 1;
              else if (r === 'LOW_STOCK') acc.low_stock += 1;
              else if (r === 'DEADSTOCK') acc.deadstock += 1;
              else if (r === 'OVERSTOCK') acc.overstock += 1;
              else acc.healthy += 1;
              return acc;
            }, { out_of_stock: 0, low_stock: 0, deadstock: 0, overstock: 0, healthy: 0 });
            setRiskStats(computed);
          }

          setAnalysisReady(cardProducts.length > 0);
          setMappingError(cardProducts.length === 0 ? 'ANALYSIS READY BUT NO PRODUCTS FOUND' : null);
        } else {
          const rows = extractInventoryRows(analysisPayload || {});
          const inventoryModel = buildInventoryFromTransactions(rows, {
            lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
          });

          const cardProducts = inventoryModel.products.map(mapProductForCards);
          setProducts(cardProducts);
          setRiskStats(toRiskStats(inventoryModel.stock_analysis));
          setAnalysisReady(cardProducts.length > 0);

          if (!inventoryModel.validation?.is_balanced) {
            setMappingError('INVENTORY VALIDATION ERROR: IN + RETURN - OUT does not match net stock sum');
          } else if (cardProducts.length === 0) {
            setMappingError('ANALYSIS READY BUT NO TRANSACTION PRODUCTS FOUND');
          } else {
            setMappingError(null);
          }
        }
      } catch (err) {
        console.error('Failed to fetch inventory:', err);
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
      } finally {
        setLoading(false);
      }
    };

    fetchInventory();
  }, [_liveAnalysis, selectedUploadId]);

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
