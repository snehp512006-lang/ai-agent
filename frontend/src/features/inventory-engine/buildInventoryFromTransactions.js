const DEFAULT_LOW_STOCK_THRESHOLD = 10;

const PRODUCT_NAME_ALIASES = [
  'product_name', 'product', 'name', 'item_name', 'item', 'material_name',
];
const PRODUCT_SKU_ALIASES = [
  'sku', 'product_sku', 'item_code', 'product_code', 'code', 'material_code',
];
const DATE_ALIASES = [
  'date', 'txn_date', 'transaction_date', 'posting_date', 'invoice_date', 'record_date',
];
const DIRECTION_ALIASES = [
  'in_out', 'in/out', 'type', 'transaction_type', 'txn_type', 'movement', 'movement_type', 'entry_type', 'dr_cr',
];
const QTY_ALIASES = [
  'quantity', 'qty', 'units', 'movement_qty', 'transaction_qty',
];
const RAW_QUANTITY_ALIASES = ['quantity', 'qty', 'units', 'movement_qty', 'transaction_qty'];
const IN_QTY_ALIASES = ['in_qty', 'purchase_qty', 'purchased_qty', 'receipt_qty', 'received_qty'];
const RETURN_QTY_ALIASES = ['return_qty', 'returned_qty'];
const OUT_QTY_ALIASES = ['out_qty', 'sales_qty', 'sold_qty', 'issue_qty', 'consumption_qty'];
const ON_HAND_ALIASES = ['on_hand', 'current_stock', 'stock', 'qty_on_hand', 'available'];
const CHECK_QTY_ALIASES = ['check_quantity', 'check quantity', 'check_qty', 'check'];
const SR_NO_ALIASES = ['sr_no', 'sr no', 'srno', 'serial_no', 'serial no'];

const normalizeKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const getFieldByAliases = (row, aliases = []) => {
  if (!row || typeof row !== 'object') return null;
  const aliasSet = new Set(aliases.map(normalizeKey));
  for (const key of Object.keys(row)) {
    if (aliasSet.has(normalizeKey(key))) {
      const value = row[key];
      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
    }
  }
  return null;
};

const normalizeTransactionDirection = (row) => {
  const raw = getFieldByAliases(row, DIRECTION_ALIASES);
  const text = String(raw || '').trim().toUpperCase();
  if (!text) return null;
  if (text.includes('RETURN') || text === 'RET') return 'RETURN';
  if (text.includes('OUT') || text.includes('SALE') || text.includes('ISSUE') || text.includes('DEBIT') || text.includes('CONSUM')) return 'OUT';
  if (text.includes('IN') || text.includes('PURCHASE') || text.includes('RECEIPT') || text.includes('CREDIT') || text.includes('ADD')) return 'IN';
  return null;
};

const toIdentityKey = (sku, name, idx) => {
  const raw = String(sku || name || `row-${idx + 1}`).trim();
  return normalizeKey(raw);
};

const classifyRisk = (netStock, threshold) => {
  if (netStock <= 0) return 'OUT_OF_STOCK';
  if (netStock < threshold) return 'LOW_STOCK';
  return 'HEALTHY';
};

const deriveStockFromCheckQuantity = (checkQuantity) => {
  if (checkQuantity === null) {
    return { availableStock: null, arrangeRequired: null };
  }

  // Business sign convention:
  // - check < 0 => stock available
  // - check = 0 => no stock
  // - check > 0 => stock to arrange
  if (checkQuantity < 0) {
    return { availableStock: Math.abs(checkQuantity), arrangeRequired: 0 };
  }
  if (checkQuantity > 0) {
    return { availableStock: 0, arrangeRequired: checkQuantity };
  }
  return { availableStock: 0, arrangeRequired: 0 };
};

const toComparableTime = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
};

const summarizeRisk = (products = []) => {
  return products.reduce(
    (acc, product) => {
      if (product.risk === 'OUT_OF_STOCK') acc.out_of_stock += 1;
      else if (product.risk === 'LOW_STOCK') acc.low_stock += 1;
      else acc.healthy += 1;
      return acc;
    },
    { out_of_stock: 0, low_stock: 0, healthy: 0 },
  );
};

const extractSignedMovement = (row) => {
  const qty = toFiniteNumber(getFieldByAliases(row, QTY_ALIASES));
  const direction = normalizeTransactionDirection(row);
  if (qty !== null && direction) {
    const absQty = Math.abs(qty);
    if (direction === 'OUT') return { inQty: 0, returnQty: 0, outQty: absQty };
    if (direction === 'RETURN') return { inQty: 0, returnQty: absQty, outQty: 0 };
    return { inQty: absQty, returnQty: 0, outQty: 0 };
  }

  const inQty = Math.abs(toFiniteNumber(getFieldByAliases(row, IN_QTY_ALIASES)) || 0);
  const returnQty = Math.abs(toFiniteNumber(getFieldByAliases(row, RETURN_QTY_ALIASES)) || 0);
  const outQty = Math.abs(toFiniteNumber(getFieldByAliases(row, OUT_QTY_ALIASES)) || 0);
  if (inQty > 0 || returnQty > 0 || outQty > 0) {
    return { inQty, returnQty, outQty };
  }

  return null;
};

export const extractInventoryRows = (payload = {}) => {
  const candidates = [
    payload?.raw_transactions,
    payload?.transactions,
    payload?.products_analysis,
    payload?.products,
    payload?.rows,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate.filter((row) => row && typeof row === 'object');
    }
  }
  return [];
};

export const buildInventoryFromTransactions = (rows = [], options = {}) => {
  const thresholdRaw = Number(options.lowStockThreshold);
  const lowStockThreshold = Number.isFinite(thresholdRaw) && thresholdRaw > 0
    ? thresholdRaw
    : DEFAULT_LOW_STOCK_THRESHOLD;
  const strictValidation = options.strictValidation !== false;

  const grouped = new Map();

  rows.forEach((row, idx) => {
    const sku = String(getFieldByAliases(row, PRODUCT_SKU_ALIASES) || '').trim();
    const name = String(getFieldByAliases(row, PRODUCT_NAME_ALIASES) || sku || `Product-${idx + 1}`).trim();
    const key = toIdentityKey(sku, name, idx);
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        sku,
        name,
        total_in: 0,
        total_out: 0,
        total_return: 0,
        has_transactions: false,
        pending_party_pickup_qty: 0,
        delivered_to_party_qty: 0,
        latest_row: null,
        latest_time: null,
        latest_sr_no: null,
        latest_index: -1,
      });
    }

    const bucket = grouped.get(key);
    const movement = extractSignedMovement(row);
    if (movement) {
      bucket.has_transactions = true;
      bucket.total_in += movement.inQty;
      bucket.total_return += movement.returnQty;
      bucket.total_out += movement.outQty;
    }
    const rawQuantity = toFiniteNumber(getFieldByAliases(row, RAW_QUANTITY_ALIASES));
    if (rawQuantity !== null) {
      if (rawQuantity < 0) {
        bucket.pending_party_pickup_qty += Math.abs(rawQuantity);
      } else if (rawQuantity > 0) {
        bucket.delivered_to_party_qty += rawQuantity;
      }
    }

    const candidateTime = toComparableTime(getFieldByAliases(row, DATE_ALIASES));
    const candidateSrNo = toFiniteNumber(getFieldByAliases(row, SR_NO_ALIASES));
    const shouldReplaceLatest = (
      bucket.latest_row === null
      || (
        candidateTime !== null
        && (
          bucket.latest_time === null
          || candidateTime > bucket.latest_time
          || (
            candidateTime === bucket.latest_time
            && (
              (candidateSrNo !== null && (bucket.latest_sr_no === null || candidateSrNo > bucket.latest_sr_no))
              || (candidateSrNo === null && bucket.latest_sr_no === null && idx > bucket.latest_index)
            )
          )
        )
      )
      || (
        candidateTime === null
        && bucket.latest_time === null
        && (
          (candidateSrNo !== null && (bucket.latest_sr_no === null || candidateSrNo > bucket.latest_sr_no))
          || (candidateSrNo === null && bucket.latest_sr_no === null && idx > bucket.latest_index)
        )
      )
    );
    if (shouldReplaceLatest) {
      bucket.latest_row = row;
      bucket.latest_time = candidateTime;
      bucket.latest_sr_no = candidateSrNo;
      bucket.latest_index = idx;
      if (!bucket.sku) {
        bucket.sku = String(getFieldByAliases(row, PRODUCT_SKU_ALIASES) || '').trim();
      }
      if (!bucket.name) {
        bucket.name = String(getFieldByAliases(row, PRODUCT_NAME_ALIASES) || `Product-${idx + 1}`).trim();
      }
    }
  });

  const products = Array.from(grouped.values()).map((bucket, idx) => {
    const netFromTransactions = bucket.total_in + bucket.total_return - bucket.total_out;
    const fallbackOnHand = toFiniteNumber(getFieldByAliases(bucket.latest_row, ON_HAND_ALIASES));
    const checkQuantity = toFiniteNumber(getFieldByAliases(bucket.latest_row, CHECK_QTY_ALIASES));
    const checkDerived = deriveStockFromCheckQuantity(checkQuantity);
    const rawNetStock = bucket.has_transactions ? netFromTransactions : (fallbackOnHand ?? 0);
    const net_stock = checkDerived.availableStock !== null ? checkDerived.availableStock : rawNetStock;
    const risk = classifyRisk(net_stock, lowStockThreshold);
    const arrangeRequired = checkDerived.arrangeRequired !== null
      ? checkDerived.arrangeRequired
      : (rawNetStock < 0 ? Math.abs(rawNetStock) : 0);

    return {
      id: idx + 1,
      sku: bucket.sku || bucket.name || `SKU-${idx + 1}`,
      name: bucket.name || bucket.sku || `Product-${idx + 1}`,
      product: bucket.name || bucket.sku || `Product-${idx + 1}`,
      net_stock,
      on_hand: net_stock,
      current_stock: net_stock,
      total_in: bucket.total_in,
      total_return: bucket.total_return,
      total_out: bucket.total_out,
      pending_party_pickup_qty: bucket.pending_party_pickup_qty,
      delivered_to_party_qty: bucket.delivered_to_party_qty,
      raw_net_stock: rawNetStock,
      check_quantity: checkQuantity,
      arrange_required: arrangeRequired,
      risk,
      health_status: risk === 'OUT_OF_STOCK' ? 'CRITICAL' : (risk === 'LOW_STOCK' ? 'LOW STOCK' : 'HEALTHY'),
      threshold: lowStockThreshold,
      source: bucket.latest_row || {},
      top_customers: Array.isArray(bucket.latest_row?.top_customers) ? bucket.latest_row.top_customers : [],
      reason: bucket.latest_row?.reason || null,
      recommended_action: bucket.latest_row?.recommended_action || null,
      action_plan: bucket.latest_row?.action_plan || null,
    };
  });

  const riskSummary = summarizeRisk(products);
  const totals = products.reduce(
    (acc, product) => {
      acc.total_in += product.total_in;
      acc.total_return += product.total_return;
      acc.total_out += product.total_out;
      acc.sum_net_stock += product.net_stock;
      if ((product.total_in + product.total_return + product.total_out) > 0) {
        acc.sum_net_stock_from_transactions += product.net_stock;
        acc.transaction_products += 1;
      }
      return acc;
    },
    {
      total_in: 0,
      total_return: 0,
      total_out: 0,
      sum_net_stock: 0,
      sum_net_stock_from_transactions: 0,
      transaction_products: 0,
    },
  );

  const expectedNet = totals.total_in + totals.total_return - totals.total_out;
  const hasTransactionMovements = totals.transaction_products > 0;
  const computedNetForValidation = hasTransactionMovements
    ? totals.sum_net_stock_from_transactions
    : expectedNet;
  const isBalanced = Math.abs(expectedNet - computedNetForValidation) < 0.000001;
  if (!isBalanced && strictValidation && hasTransactionMovements) {
    const mismatch = {
      expectedNet,
      sumNetStock: computedNetForValidation,
      totalIn: totals.total_in,
      totalReturn: totals.total_return,
      totalOut: totals.total_out,
      transactionProducts: totals.transaction_products,
    };
    throw new Error(`[InventoryEngine] Validation mismatch: ${JSON.stringify(mismatch)}`);
  }

  return {
    products,
    stock_analysis: {
      out_of_stock_items: riskSummary.out_of_stock,
      low_stock_items: riskSummary.low_stock,
      deadstock_items: 0,
      overstock_items: 0,
      healthy_items: riskSummary.healthy,
    },
    summary: {
      out_of_stock: riskSummary.out_of_stock,
      low_stock: riskSummary.low_stock,
      deadstock: 0,
      overstock: 0,
      healthy: riskSummary.healthy,
    },
    inventory_summary: {
      total_products: products.length,
      total_stock: totals.sum_net_stock,
      total_in: totals.total_in,
      total_return: totals.total_return,
      total_out: totals.total_out,
    },
    validation: {
      expected_net_stock: expectedNet,
      computed_net_stock: computedNetForValidation,
      is_balanced: isBalanced,
      has_transaction_movements: hasTransactionMovements,
      transaction_products: totals.transaction_products,
    },
    low_stock_threshold: lowStockThreshold,
  };
};

export { DEFAULT_LOW_STOCK_THRESHOLD };
