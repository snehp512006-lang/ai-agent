import { useEffect, useState } from 'react';
import api from '../../../api/client';
import {
  FIELD_ALIASES,
  parseDateValue,
  formatSqlDateTime,
  cleanCategoryLabel,
  dedupeProductsByIdentity,
} from './inventoryRisksUtils';
import {
  normalizeRisk,
  toFiniteNumber,
  normalizeFieldName,
  getFieldByAliases,
  getNumberByAliases,
  getStrictUnitPrice,
  getStringByAliases,
  getFieldByResolvedKey,
  resolveBestFieldAcrossRows,
  dateToDayKey,
} from './inventoryRisksCalculations';

const STRICT_ANALYSIS_ONLY = true;

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

  const buildRiskStatsFromProducts = (rows = []) => rows.reduce((acc, p) => {
    const r = normalizeRisk(p?.risk);
    if (r === 'OUT_OF_STOCK') acc.out_of_stock += 1;
    else if (r === 'LOW_STOCK') acc.low_stock += 1;
    else if (r === 'DEADSTOCK') acc.deadstock += 1;
    else if (r === 'OVERSTOCK') acc.overstock += 1;
    else acc.healthy += 1;
    return acc;
  }, { out_of_stock: 0, low_stock: 0, deadstock: 0, overstock: 0, healthy: 0 });

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        setLoading(true);
        setMappingError(null);

        // Always prefer server analysis for Stock Alerts to avoid stale cached context.
        let analysisPayload = null;

        if (!analysisPayload && selectedUploadId) {
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

        const authoritativeStats = buildRiskStatsFromAnalysis(analysisPayload, []);
        const authoritativeSignal = Object.values(authoritativeStats || {}).reduce((sum, value) => sum + Number(value || 0), 0) > 0;
        if (authoritativeSignal) {
          setRiskStats(authoritativeStats);
          setMappingError(null);
        }

        const analysisProducts = Array.isArray(analysisPayload?.products_analysis) && analysisPayload.products_analysis.length
          ? analysisPayload.products_analysis
          : (Array.isArray(analysisPayload?.products) ? analysisPayload.products : []);

        if (analysisProducts.length) {
          if (STRICT_ANALYSIS_ONLY) {
            const strictCards = analysisProducts.map((row, idx) => {
              const onHand = getNumberByAliases(row, [...FIELD_ALIASES.ON_HAND, 'current_quantity', 'qty_on_hand']);
              const salesQuantity = getNumberByAliases(row, [...FIELD_ALIASES.SALES, 'order_stock', 'order stock', 'sales_qty', 'sold_qty']);
              const dailyDemand = getNumberByAliases(row, ['daily_demand', 'demand_rate', 'sales_velocity', 'avg_daily_sales', 'average_daily_sales', 'avg_sales']);
              const resolvedRisk = normalizeRisk(getStringByAliases(row, ['risk', 'stock_risk', 'health_status', 'prediction', 'ai_status_label'], null));
              const healthStatus = resolvedRisk === 'OUT_OF_STOCK'
                ? 'CRITICAL'
                : (resolvedRisk === 'LOW_STOCK'
                  ? 'LOW STOCK'
                  : (resolvedRisk === 'DEADSTOCK'
                    ? 'DEADSTOCK'
                    : (resolvedRisk === 'OVERSTOCK' ? 'OVERSTOCK' : 'HEALTHY')));
              const unitPrice = getStrictUnitPrice(row);
              const stockValue = (onHand !== null && unitPrice !== null) ? (onHand * unitPrice) : null;

              return {
                id: idx + 1,
                sku: getStringByAliases(row, ['sku', 'product_sku', 'item_code', 'product_code', 'code'], null)
                  || getStringByAliases(row, ['product_name', 'product name', 'name', 'item_name', 'product'], null)
                  || `P-${idx + 1}`,
                name: getStringByAliases(row, ['product_name', 'product name', 'name', 'item_name', 'product'], null)
                  || getStringByAliases(row, ['sku', 'product_sku', 'item_code', 'product_code', 'code'], null)
                  || `Product-${idx + 1}`,
                category: cleanCategoryLabel(
                  getStringByAliases(row, ['category', 'product_category', 'group', 'segment', 'product_group', 'classification'], null),
                  getStringByAliases(row, ['product_name', 'product name', 'name', 'item_name', 'product'], null),
                  getStringByAliases(row, ['sku', 'product_sku', 'item_code', 'product_code', 'code'], null),
                ),
                on_hand: onHand,
                reorder: getNumberByAliases(row, ['reorder_point', 'reorder', 'reorder_level', 'min_stock', 'minimum_stock']),
                daily_demand: dailyDemand,
                predicted_7_day_demand: getNumberByAliases(row, ['predicted_7_day_demand', 'predicted_demand_7d', 'predicted_demand']),
                customer_purchased: dailyDemand ?? salesQuantity,
                customer_purchased_basis: dailyDemand !== null ? 'DAILY_DEMAND' : (salesQuantity !== null ? 'SALES_PER_RECORD' : 'INSUFFICIENT_DATA'),
                sales_total: getNumberByAliases(row, ['sales_total', 'total_sales']),
                days_window: getNumberByAliases(row, ['days_window', 'window_days']),
                record_date: parseDateValue(getFieldByAliases(row, FIELD_ALIASES.DATE)),
                sales_missing: dailyDemand === null && salesQuantity === null,
                max: 0,
                risk: resolvedRisk,
                days_to_stock: getNumberByAliases(row, ['days_to_stockout', 'days_of_inventory', 'days_to_stock', 'doi', 'stockout_days']),
                stockout_datetime: getStringByAliases(row, ['stockout_datetime', 'stockout_date_time'], null),
                order_quantity: getNumberByAliases(row, ['order_quantity', 'recommended_reorder_quantity']),
                health_status: healthStatus,
                unit_price: unitPrice,
                stock_value: stockValue,
                confidence_score: getNumberByAliases(row, ['confidence_score']) ?? null,
                status: 'SUCCESS',
                top_customers: row.top_customers || [],
                metrics_intel: row.metrics_intel || null,
                reason: row.reason || null,
                recommended_action: row.recommended_action || null,
                action_plan: row.action_plan || null,
              };
            });

            const dedupedStrictCards = dedupeProductsByIdentity(strictCards);
            setProducts(dedupedStrictCards);
            setRiskStats(buildRiskStatsFromProducts(dedupedStrictCards));
            setAnalysisReady(dedupedStrictCards.length > 0);
            setMappingError(dedupedStrictCards.length > 0 ? null : 'ANALYSIS READY BUT NO PRODUCT ROWS FOUND');
            return;
          }

          const onHandField = resolveBestFieldAcrossRows(analysisProducts, FIELD_ALIASES.ON_HAND, 'number');
          const salesField = resolveBestFieldAcrossRows(analysisProducts, FIELD_ALIASES.SALES, 'number');
          const dateField = resolveBestFieldAcrossRows(analysisProducts, FIELD_ALIASES.DATE, 'date');
          const productField = resolveBestFieldAcrossRows(analysisProducts, FIELD_ALIASES.PRODUCT, 'string');

          const mappingScore = (onHandField.key ? 40 : 0) + (salesField.key ? 40 : 0) + (dateField.key ? 20 : 0);

          const hasAnalysisModeData = analysisProducts.some((row) => {
            const riskVal = getStringByAliases(row, ['risk', 'stock_risk', 'health_status', 'prediction', 'ai_status_label'], null);
            const daysVal = getNumberByAliases(row, ['days_to_stockout', 'days_of_inventory', 'days_to_stock', 'doi', 'stockout_days']);
            const demandVal = getNumberByAliases(row, ['daily_demand', 'demand_rate', 'sales_velocity', 'avg_daily_sales', 'avg_sales']);
            const salesVal = getNumberByAliases(row, [...FIELD_ALIASES.SALES, 'order_stock', 'order stock', 'sales_qty', 'sold_qty']);
            return Boolean(riskVal) || daysVal !== null || demandVal !== null || salesVal !== null;
          });

          if (!onHandField.key) {
            if (authoritativeSignal) {
              setProducts([]);
              setAnalysisReady(true);
              setMappingError(null);
              return;
            }
            setProducts([]);
            setAnalysisReady(false);
            setMappingError('FIELD MAPPING ERROR: ON_HAND field not found');
            return;
          }

          if (mappingScore < 60 && !hasAnalysisModeData && !authoritativeSignal) {
            setProducts([]);
            setAnalysisReady(false);
            setMappingError(`FIELD MAPPING ERROR: confidence score ${mappingScore} (< 60)`);
            return;
          }

          if (hasAnalysisModeData) {
            const mappedAnalysisCards = analysisProducts.map((row, idx) => {
              const onHand = getNumberByAliases(row, [...FIELD_ALIASES.ON_HAND, 'current_quantity', 'qty_on_hand']);
              const explicitDemand = getNumberByAliases(row, ['daily_demand', 'demand_rate', 'sales_velocity', 'avg_daily_sales', 'average_daily_sales', 'avg_sales']);
              const salesQuantity = getNumberByAliases(row, [...FIELD_ALIASES.SALES, 'order_stock', 'order stock', 'sales_qty', 'sold_qty']);
              const dailyDemand = explicitDemand ?? salesQuantity;
              const directDays = getNumberByAliases(row, ['days_to_stockout', 'days_of_inventory', 'days_to_stock', 'doi', 'stockout_days']);
              const computedDays = (onHand !== null && dailyDemand !== null && dailyDemand > 0)
                ? (onHand / dailyDemand)
                : null;
              const resolvedDays = computedDays ?? directDays;
              const normalizedRisk = normalizeRisk(getStringByAliases(row, ['risk', 'stock_risk', 'health_status', 'prediction', 'ai_status_label'], null));
              const derivedRisk = deriveRiskFromSignals({ normalizedRisk, onHand, dailyDemand, resolvedDays });
              const productName = getStringByAliases(row, ['product_name', 'product name', 'name', 'item_name', 'product'], null)
                || getStringByAliases(row, ['sku', 'product_sku', 'item_code', 'product_code', 'code'], null)
                || `Product-${idx + 1}`;

              let healthStatus = 'UNKNOWN';
              if (derivedRisk && derivedRisk !== 'UNKNOWN') {
                healthStatus = derivedRisk === 'OUT_OF_STOCK' ? 'CRITICAL'
                  : (derivedRisk === 'LOW_STOCK' ? 'LOW STOCK'
                    : (derivedRisk === 'DEADSTOCK' ? 'DEADSTOCK'
                      : (derivedRisk === 'OVERSTOCK' ? 'OVERSTOCK' : 'HEALTHY')));
              } else if (typeof resolvedDays === 'number') {
                healthStatus = resolvedDays > 7 ? 'HEALTHY' : (resolvedDays >= 3 ? 'LOW STOCK' : 'CRITICAL');
              }

              const predicted7 = dailyDemand !== null ? (dailyDemand * 7) : null;
              const reorderPoint = getNumberByAliases(row, ['reorder_point', 'reorder', 'reorder_level', 'min_stock', 'minimum_stock']);
              let orderQty = 0;
              if (reorderPoint !== null && onHand !== null && onHand <= reorderPoint) {
                const targetStock = reorderPoint + (predicted7 || 0);
                orderQty = Math.max(targetStock - onHand, predicted7 || 0);
              } else if (predicted7 !== null && onHand !== null) {
                orderQty = Math.max(predicted7 - onHand, 0);
              }

              const backendOrderQty = getNumberByAliases(row, ['order_quantity', 'recommended_reorder_quantity']);
              if (backendOrderQty !== null) {
                orderQty = backendOrderQty;
              }

              const stockoutDT = typeof resolvedDays === 'number'
                ? formatSqlDateTime(new Date(Date.now() + (resolvedDays * 24 * 60 * 60 * 1000)))
                : null;
              const unitPrice = getStrictUnitPrice(row);
              const stockValue = (onHand !== null && unitPrice !== null) ? (onHand * unitPrice) : null;

              return {
                id: idx + 1,
                sku: getStringByAliases(row, ['sku', 'product_sku', 'item_code', 'product_code', 'code'], null) || productName,
                name: productName,
                category: cleanCategoryLabel(
                  getStringByAliases(row, ['category', 'product_category', 'group', 'segment', 'product_group', 'classification'], null),
                  productName,
                  getStringByAliases(row, ['sku', 'product_sku', 'item_code', 'product_code', 'code'], null) || productName,
                ),
                on_hand: onHand,
                reorder: getNumberByAliases(row, ['reorder_point', 'reorder', 'reorder_level', 'min_stock', 'minimum_stock']),
                daily_demand: dailyDemand,
                predicted_7_day_demand: predicted7,
                customer_purchased: dailyDemand,
                customer_purchased_basis: explicitDemand !== null ? 'DAILY_DEMAND' : (salesQuantity !== null ? 'SALES_PER_RECORD' : 'INSUFFICIENT_DATA'),
                sales_total: null,
                days_window: null,
                record_date: parseDateValue(getFieldByAliases(row, FIELD_ALIASES.DATE)),
                sales_missing: dailyDemand === null,
                max: 0,
                risk: derivedRisk,
                days_to_stock: resolvedDays,
                stockout_datetime: stockoutDT,
                order_quantity: orderQty,
                health_status: healthStatus,
                unit_price: unitPrice,
                stock_value: stockValue,
                confidence_score: row.confidence_score ?? mappingScore,
                status: onHand === null ? 'INSUFFICIENT DATA' : 'SUCCESS',
                top_customers: row.top_customers || [],
                metrics_intel: row.metrics_intel || null,
                reason: row.reason || null,
                recommended_action: row.recommended_action || null,
                action_plan: row.action_plan || null,
              };
            }).filter((item) => item.on_hand !== null);

            if (mappedAnalysisCards.length === 0) {
              setProducts([]);
              setAnalysisReady(false);
              setMappingError('INSUFFICIENT DATA: No valid analysis rows for cards');
              return;
            }

            const dedupedAnalysisCards = dedupeProductsByIdentity(mappedAnalysisCards);
            setProducts(dedupedAnalysisCards);
            setRiskStats(buildRiskStatsFromProducts(dedupedAnalysisCards));
            setAnalysisReady(true);
            return;
          }

          const normalizedRows = analysisProducts.map((row, idx) => {
            const productRaw = getFieldByResolvedKey(row, productField.key);
            const productName = String(productRaw || '').trim() || `Product-${idx + 1}`;
            const sku = getStringByAliases(row, ['sku', 'product_sku', 'item_code', 'product_code', 'code'], null) || productName;
            const unitPrice = getStrictUnitPrice(row);
            const valueAmount = getNumberByAliases(row, FIELD_ALIASES.TOTAL_VALUE);
            const valueQty = getNumberByAliases(row, FIELD_ALIASES.PRICE_QTY);
            return {
              idx,
              productKey: normalizeFieldName(productName),
              name: productName,
              sku,
              category: cleanCategoryLabel(
                getStringByAliases(row, ['category', 'product_category', 'group', 'segment', 'product_group', 'classification'], null),
                productName,
                sku,
              ),
              onHand: toFiniteNumber(getFieldByResolvedKey(row, onHandField.key)),
              sales: salesField.key ? toFiniteNumber(getFieldByResolvedKey(row, salesField.key)) : null,
              date: dateField.key ? parseDateValue(getFieldByResolvedKey(row, dateField.key)) : null,
              normalizedRisk: normalizeRisk(getStringByAliases(row, ['risk', 'stock_risk', 'health_status', 'prediction', 'ai_status_label'], null)),
              reorder: getNumberByAliases(row, ['reorder_point', 'reorder', 'reorder_level', 'min_stock', 'minimum_stock']),
              unitPrice,
              valueAmount,
              valueQty,
              top_customers: row.top_customers || [],
              metrics_intel: row.metrics_intel || null,
              reason: row.reason || null,
              recommended_action: row.recommended_action || null,
              action_plan: row.action_plan || null,
            };
          });

          const grouped = normalizedRows.reduce((acc, row) => {
            if (!acc[row.productKey]) acc[row.productKey] = [];
            acc[row.productKey].push(row);
            return acc;
          }, {});

          const mappedFromAnalysis = Object.values(grouped).map((groupRows, idx) => {
            const validRows = groupRows.filter((r) => r.onHand !== null || r.sales !== null || r.date !== null);
            const salesRows = validRows.filter((r) => r.sales !== null && r.date !== null);
            const sortedRows = [...validRows].sort((a, b) => {
              if (a.date && b.date) return a.date - b.date;
              if (a.date) return -1;
              if (b.date) return 1;
              return a.idx - b.idx;
            });
            const latestRow = [...sortedRows].reverse().find((r) => r.onHand !== null) || sortedRows[sortedRows.length - 1] || groupRows[0];
            const rowWithTopCustomers = [...sortedRows].reverse().find((r) => Array.isArray(r.top_customers) && r.top_customers.length > 0) || latestRow;
            const rowWithMetricsIntel = [...sortedRows].reverse().find((r) => r.metrics_intel && typeof r.metrics_intel === 'object') || latestRow;

            const totalSales = salesRows.reduce((sum, r) => sum + (r.sales || 0), 0);
            const distinctDays = new Set(salesRows.map((r) => dateToDayKey(r.date)).filter(Boolean));
            const totalDays = distinctDays.size;
            const directDailyDemandRows = validRows
              .map((r) => toFiniteNumber(getFieldByAliases(analysisProducts[r.idx], ['daily_demand', 'demand_rate', 'sales_velocity', 'avg_daily_sales', 'average_daily_sales', 'avg_sales'])))
              .filter((v) => v !== null);
            const directDailyDemand = directDailyDemandRows.length > 0
              ? (directDailyDemandRows.reduce((s, v) => s + v, 0) / directDailyDemandRows.length)
              : null;
            const dailyDemand = totalDays > 0 ? (totalSales / totalDays) : directDailyDemand;

            const dailyMap = new Map();
            salesRows.forEach((r) => {
              const dayKey = dateToDayKey(r.date);
              if (!dayKey) return;
              dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + (r.sales || 0));
            });
            const last7DayTotals = [...dailyMap.entries()]
              .sort((a, b) => new Date(a[0]) - new Date(b[0]))
              .slice(-7)
              .map(([, v]) => v);
            const movingAvg = last7DayTotals.length > 0
              ? (last7DayTotals.reduce((s, v) => s + v, 0) / last7DayTotals.length)
              : null;
            const predicted7DayDemand = movingAvg !== null ? (movingAvg * 7) : null;

            const priceRows = validRows.filter((r) => r.unitPrice !== null && r.unitPrice >= 0);
            const weightedPriceNumerator = priceRows.reduce((sum, r) => {
              const qtyBasis = r.valueQty !== null && r.valueQty > 0
                ? r.valueQty
                : (r.onHand !== null && r.onHand > 0 ? r.onHand : 0);
              return sum + ((r.unitPrice || 0) * qtyBasis);
            }, 0);
            const weightedPriceDenominator = priceRows.reduce((sum, r) => {
              const qtyBasis = r.valueQty !== null && r.valueQty > 0
                ? r.valueQty
                : (r.onHand !== null && r.onHand > 0 ? r.onHand : 0);
              return sum + qtyBasis;
            }, 0);
            const unitPrice = weightedPriceDenominator > 0
              ? (weightedPriceNumerator / weightedPriceDenominator)
              : (latestRow?.unitPrice ?? null);

            const onHand = latestRow?.onHand ?? null;
            const stockValue = (onHand !== null && unitPrice !== null) ? (onHand * unitPrice) : null;
            const daysToStock = onHand !== null && dailyDemand !== null
              ? (dailyDemand === 0 ? 'NO DEMAND' : (onHand / dailyDemand))
              : null;
            const derivedRisk = deriveRiskFromSignals({
              normalizedRisk: latestRow?.normalizedRisk,
              onHand,
              dailyDemand,
              resolvedDays: typeof daysToStock === 'number' ? daysToStock : null,
            });
            const healthStatus = derivedRisk === 'OUT_OF_STOCK'
              ? 'CRITICAL'
              : (derivedRisk === 'LOW_STOCK'
                ? 'LOW STOCK'
                : (derivedRisk === 'DEADSTOCK'
                  ? 'DEADSTOCK'
                  : (derivedRisk === 'OVERSTOCK'
                    ? 'OVERSTOCK'
                    : (dailyDemand === 0 ? 'HEALTHY' : 'INSUFFICIENT DATA'))));
            let orderQuantity = (onHand !== null && predicted7DayDemand !== null)
              ? Math.max(predicted7DayDemand - onHand, 0)
              : 'NOT DEFINED';

            const backendOrderQty = getNumberByAliases(analysisProducts[latestRow?.idx ?? 0], ['order_quantity', 'recommended_reorder_quantity']);
            if (backendOrderQty !== null) {
              orderQuantity = backendOrderQty;
            }
            const stockoutDateTime = typeof daysToStock === 'number'
              ? formatSqlDateTime(new Date(Date.now() + (daysToStock * 24 * 60 * 60 * 1000)))
              : (daysToStock === 'NO DEMAND' ? 'NO DEMAND' : 'INSUFFICIENT DATA');
            const productStatus = (onHand === null || dailyDemand === null)
              ? 'INSUFFICIENT DATA'
              : 'SUCCESS';

            return {
              id: idx + 1,
              sku: latestRow?.sku || `P-${idx + 1}`,
              name: latestRow?.name || 'Data not available',
              category: cleanCategoryLabel(latestRow?.category, latestRow?.name, latestRow?.sku),
              on_hand: onHand,
              reorder: latestRow?.reorder ?? null,
              daily_demand: dailyDemand,
              predicted_7_day_demand: predicted7DayDemand ?? 'INSUFFICIENT DATA',
              customer_purchased: dailyDemand,
              customer_purchased_basis: dailyDemand !== null ? 'DAILY_DEMAND' : 'INSUFFICIENT_DATA',
              sales_total: totalSales,
              days_window: totalDays || null,
              record_date: latestRow?.date || null,
              sales_missing: salesField.key ? (dailyDemand === null) : true,
              max: 0,
              risk: derivedRisk,
              days_to_stock: daysToStock,
              stockout_datetime: stockoutDateTime,
              order_quantity: orderQuantity,
              health_status: healthStatus,
              unit_price: unitPrice,
              stock_value: stockValue,
              confidence_score: latestRow?.confidence_score ?? mappingScore,
              status: productStatus,
              top_customers: rowWithTopCustomers?.top_customers || [],
              metrics_intel: rowWithMetricsIntel?.metrics_intel || null,
              reason: latestRow?.reason || null,
              recommended_action: latestRow?.recommended_action || null,
              action_plan: latestRow?.action_plan || null,
            };
          });

          const cleanedProducts = mappedFromAnalysis.filter((item) => item.on_hand !== null);

          if (cleanedProducts.length === 0) {
            setProducts([]);
            setAnalysisReady(false);
            setMappingError('INSUFFICIENT DATA: No valid rows after cleaning');
            return;
          }

          const dedupedProducts = dedupeProductsByIdentity(cleanedProducts);
          setProducts(dedupedProducts);
          setRiskStats(buildRiskStatsFromProducts(dedupedProducts));
          setAnalysisReady(true);
          return;
        }

        setProducts([]);
        setRiskStats({
          out_of_stock: 0,
          low_stock: 0,
          deadstock: 0,
          overstock: 0,
          healthy: 0,
        });
        setAnalysisReady(false);
        setMappingError(null);
      } catch (err) {
        console.error('Failed to fetch inventory:', err);
        setProducts([]);
        setAnalysisReady(false);
        setMappingError(null);
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
