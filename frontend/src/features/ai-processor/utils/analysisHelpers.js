import { buildInventoryFromTransactions } from '../../inventory-engine/buildInventoryFromTransactions';

export const normalizeRiskLabel = (value) => {
  const raw = String(value || '').toUpperCase().replace(/[_-]+/g, ' ').trim();
  if (!raw) return 'UNKNOWN';

  if (raw.includes('OUT') && raw.includes('STOCK')) return 'OUT OF STOCK';
  if (raw.includes('LOW') && raw.includes('STOCK')) return 'LOW STOCK';
  if (raw.includes('OVER') && raw.includes('STOCK')) return 'OVERSTOCK';
  if (raw.includes('DEAD')) return 'DEADSTOCK';
  if (raw.includes('HEALTHY') || raw.includes('NORMAL')) return 'HEALTHY';

  return raw;
};

export const deriveCountsFromRows = (rows) => {
  const result = {
    lowStock: 0,
    outOfStock: 0,
    overStock: 0,
    healthy: 0,
    deadstockCount: 0,
    needsReview: 0,
  };

  (rows || []).forEach((row) => {
    let label = normalizeRiskLabel(row?.risk || row?.prediction || row?.ai_classification || '');
    if (!['LOW STOCK', 'OUT OF STOCK', 'OVERSTOCK', 'DEADSTOCK', 'HEALTHY'].includes(label)) {
      // Some pipelines emit severity levels (CRITICAL/HIGH/MEDIUM/LOW).
      // Fall back to textual AI findings to recover stock bucket labels.
      label = normalizeRiskLabel(row?.ai_result || row?.ai_reason || row?.reason || '');
    }
    if (label === 'LOW STOCK') result.lowStock += 1;
    else if (label === 'OUT OF STOCK') result.outOfStock += 1;
    else if (label === 'OVERSTOCK') result.overStock += 1;
    else if (label === 'DEADSTOCK') result.deadstockCount += 1;
    else if (label === 'HEALTHY') result.healthy += 1;
    else result.needsReview += 1;
  });

  return result;
};

export const deriveCanonicalRiskCountsFromRows = (rows = []) => {
  const inventoryModel = buildInventoryFromTransactions(rows);
  return {
    lowStock: Number(inventoryModel.stock_analysis?.low_stock_items || 0),
    outOfStock: Number(inventoryModel.stock_analysis?.out_of_stock_items || 0),
    overStock: 0,
    healthy: Number(inventoryModel.stock_analysis?.healthy_items || 0),
    deadstockCount: 0,
    needsReview: 0,
  };
};

export const buildAnalysisFromSummary = (summary = {}, rows = []) => {
  const inventoryModel = buildInventoryFromTransactions(rows, { strictValidation: false });
  if (inventoryModel.products.length > 0) {
    return {
      confidence_score: Number(summary?.confidence_score || 0),
      confidence_label: summary?.confidence_label || 'Streaming',
      stock_analysis: {
        ...inventoryModel.stock_analysis,
        needs_review_items: 0,
      },
      alerts: inventoryModel.products
        .filter((product) => product.risk !== 'HEALTHY')
        .map((product) => ({
          type: String(product.risk).replace(/_/g, ' '),
          product: product.name || product.sku || 'Inventory requires review',
          severity: product.risk === 'OUT_OF_STOCK' ? 'CRITICAL' : 'HIGH',
        })),
      inventory_summary: {
        ...inventoryModel.inventory_summary,
        total_sales: Number(summary?.total_sales || 0),
      },
      summary: {
        ...inventoryModel.summary,
      },
      products: inventoryModel.products,
      products_analysis: rows,
      _inventory_validation: inventoryModel.validation,
    };
  }

  const lowStock = Number(summary?.low_stock || 0);
  const outOfStock = Number(summary?.out_of_stock || 0);
  const overstock = Number(summary?.overstock || 0);
  const deadstock = Number(summary?.deadstock || 0);
  const healthy = Number(summary?.healthy_items || summary?.healthy || 0);

  return {
    confidence_score: Number(summary?.confidence_score || 0),
    confidence_label: summary?.confidence_label || 'Streaming',
    stock_analysis: {
      low_stock_items: lowStock,
      out_of_stock_items: outOfStock,
      overstock_items: overstock,
      deadstock_items: deadstock,
      healthy_items: healthy,
      needs_review_items: Number(summary?.needs_review || 0),
    },
    alerts: [
      ...Array(outOfStock).fill({ type: 'OUT OF STOCK' }),
      ...Array(lowStock).fill({ type: 'LOW STOCK' }),
      ...Array(deadstock).fill({ type: 'DEADSTOCK' }),
      ...Array(overstock).fill({ type: 'OVERSTOCK' }),
    ],
    inventory_summary: {
      total_products: Number(summary?.processed || summary?.total_records || 0),
      total_sales: Number(summary?.total_sales || 0),
    },
  };
};

export const buildLocalAnalysisFromRows = (rows = [], summary = {}) => {
  const inventoryModel = buildInventoryFromTransactions(rows);
  const alerts = [];
  inventoryModel.products.forEach((product) => {
    if (product.risk !== 'HEALTHY') {
      alerts.push({
        type: String(product.risk).replace(/_/g, ' '),
        product: product.name || product.sku || 'Inventory requires review',
        severity: product.risk === 'OUT_OF_STOCK' ? 'CRITICAL' : 'HIGH',
      });
    }
  });

  return {
    confidence_score: Number(summary?.confidence_score || 0),
    confidence_label: summary?.confidence_label || 'Computed',
    stock_analysis: {
      ...inventoryModel.stock_analysis,
      needs_review_items: 0,
    },
    alerts,
    inventory_summary: {
      ...inventoryModel.inventory_summary,
      total_sales: Number(summary?.total_sales || 0),
    },
    summary: {
      ...inventoryModel.summary,
    },
    products_analysis: rows,
    products: inventoryModel.products,
    _inventory_validation: inventoryModel.validation,
  };
};

export const deriveStatsFromAnalysis = (analysis = {}, summary = {}) => {
  const alerts = Array.isArray(analysis?.alerts) ? analysis.alerts : [];
  const stock = analysis?.stock_analysis || {};
  const totalProducts = Number(
    analysis?.inventory_summary?.total_products || summary?.processed || summary?.total_records || 0
  );

  const risky =
    Number(stock?.out_of_stock_items || summary?.out_of_stock || 0) +
    Number(stock?.low_stock_items || summary?.low_stock || 0) +
    Number(stock?.deadstock_items || summary?.deadstock || 0) +
    Number(stock?.overstock_items || summary?.overstock || 0);

  return {
    anomalies: Math.max(alerts.length, risky),
    cleaned: totalProducts,
    predictions: Number(analysis?.inventory_summary?.total_sales || summary?.total_sales || totalProducts),
    verified: totalProducts,
  };
};

export const tagAnalysisWithSession = (analysis = {}, uploadId) => ({
  ...analysis,
  metadata: {
    ...(analysis?.metadata || {}),
    upload_id: uploadId || analysis?.metadata?.upload_id || null,
  },
});

export const getPhaseFromProgress = (progress) => {
  const pct = Number(progress || 0);
  if (pct < 15) return 'Data Cleaning';
  if (pct < 45) return 'Validation';
  if (pct < 75) return 'AI Analysis';
  if (pct < 95) return 'Forecasting';
  return 'Finalizing';
};
