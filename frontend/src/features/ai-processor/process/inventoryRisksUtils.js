import { AlertCircle, CheckCircle2, Package, TrendingDown } from 'lucide-react';

export const LAST_ANALYSIS_STORAGE_KEY = 'ai-ops-last-analysis-snapshot';

export const RISK_CONFIG = {
  OUT_OF_STOCK: { label: 'Out of Stock', className: 'badge-critical', icon: AlertCircle, color: '#ef4444', desc: 'Zero units remaining. Immediate revenue loss.' },
  LOW_STOCK: { label: 'Low Stock', className: 'badge-amber', icon: TrendingDown, color: '#f59e0b', desc: 'Running out soon (< 7 days left). Reorder now.' },
  DEADSTOCK: { label: 'Deadstock', className: 'badge-purple', icon: Package, color: '#6366f1', desc: 'Stock exists but zero sales. Stuck capital.' },
  OVERSTOCK: { label: 'Overstock', className: 'badge-purple', icon: Package, color: '#a855f7', desc: 'Excess inventory (> 30 days). Storage risk.' },
  HEALTHY: { label: 'Healthy', className: 'badge-emerald', icon: CheckCircle2, color: '#10b981', desc: 'Stock levels are optimal and safe.' },
};

export const RISK_THEME = {
  OUT_OF_STOCK: {
    card: 'white-premium-card border-rose-500/40 border-l-[6px]',
    planWrap: 'border-rose-500/20 bg-rose-50/60',
    label: 'text-rose-900/70',
    valuePrimary: 'text-rose-900',
    valueSecondary: 'text-rose-900',
    valueTertiary: 'text-rose-900',
    tile: 'border-rose-500/10 bg-white shadow-sm',
  },
  LOW_STOCK: {
    card: 'white-premium-card border-amber-500/40 border-l-[6px]',
    planWrap: 'border-amber-500/20 bg-amber-50/60',
    label: 'text-amber-900/70',
    valuePrimary: 'text-amber-900',
    valueSecondary: 'text-amber-900',
    valueTertiary: 'text-amber-900',
    tile: 'border-amber-500/10 bg-white shadow-sm',
  },
  OVERSTOCK: {
    card: 'white-premium-card border-violet-500/40 border-l-[6px]',
    planWrap: 'border-violet-500/20 bg-violet-50/60',
    label: 'text-violet-900/70',
    valuePrimary: 'text-violet-900',
    valueSecondary: 'text-violet-900',
    valueTertiary: 'text-violet-900',
    tile: 'border-violet-500/10 bg-white shadow-sm',
  },
  DEADSTOCK: {
    card: 'white-premium-card border-indigo-500/40 border-l-[6px]',
    planWrap: 'border-indigo-500/20 bg-indigo-50/60',
    label: 'text-indigo-900/70',
    valuePrimary: 'text-indigo-900',
    valueSecondary: 'text-indigo-900',
    valueTertiary: 'text-indigo-900',
    tile: 'border-indigo-500/10 bg-white shadow-sm',
  },
  HEALTHY: {
    card: 'white-premium-card border-emerald-500/40 border-l-[6px]',
    planWrap: 'border-emerald-500/20 bg-emerald-50/60',
    label: 'text-emerald-900/70',
    valuePrimary: 'text-emerald-900',
    valueSecondary: 'text-emerald-900',
    valueTertiary: 'text-emerald-900',
    tile: 'border-emerald-500/10 bg-white shadow-sm',
  },
};

export const FIELD_ALIASES = {
  ON_HAND: ['on_hand', 'onhand', 'stock', 'qty', 'quantity', 'available', 'inventory', 'balance', 'remaining', 'current_stock', 'current_quantity', 'qty_on_hand'],
  SALES: ['sales', 'sold', 'demand', 'usage', 'purchased', 'purchase', 'consumption', 'units_sold', 'quantity_sold', 'sales_qty', 'sold_qty', 'order_qty', 'ordered_qty', 'order_stock', 'order stock'],
  DATE: ['date', 'day', 'timestamp', 'order_date', 'sales_date', 'transaction_date', 'created_at'],
  PRODUCT: ['product', 'item', 'sku', 'product_name', 'product name', 'item_name', 'product_code', 'item_code'],
  UNIT_PRICE: ['unit_price', 'price', 'cost_price', 'purchase_price', 'buy_price', 'rate', 'mrp', 'selling_price', 'sale_price', 'avg_price', 'average_price', 'unit_cost'],
  TOTAL_VALUE: ['stock_value', 'inventory_value', 'value', 'amount', 'total_amount', 'line_total', 'total_value', 'stock_amount'],
  PRICE_QTY: ['quantity', 'qty', 'units', 'purchased_qty', 'purchase_qty', 'order_qty', 'ordered_qty', 'qty_on_hand', 'current_quantity'],
};

export const PARTY_NAME_ALIASES = [
  'party_name', 'party name', 'customer_name', 'customer name', 'buyer_name', 'buyer name',
  'purchaser_name', 'purchaser name', 'sold_to_name', 'sold to name', 'account_name',
  'account name', 'client_name', 'client name', 'company', 'company_name', 'customer',
  'client', 'buyer', 'purchaser', 'sold_to', 'sold to', 'party', 'name'
];

export const PARTY_ID_ALIASES = [
  'party_id', 'party id', 'party_code', 'party code', 'customer_id', 'customer id',
  'customer_code', 'customer code', 'account_id', 'account id', 'account_code',
  'account code', 'ledger_code', 'ledger code', 'customerid', 'partycode'
];

export const parseDateValue = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatDateTime = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return 'INSUFFICIENT DATA';
  return value.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

export const formatSqlDateTime = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return 'INSUFFICIENT DATA';
  const pad = (n) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
};

export const formatCurrencyINR = (value, { maxDecimals = 2 } = {}) => {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(n);
};

export const normalizeText = (value) => String(value ?? '').trim();

export const isMissingLikeValue = (value) => {
  if (value === null || value === undefined || value === '') return true;
  const text = String(value).trim().toUpperCase();
  return ['INSUFFICIENT DATA', 'NOT DEFINED', 'UNKNOWN', 'N/A', 'NA', '-', 'NULL', 'UNDEFINED'].includes(text);
};

export const isPlaceholderText = (value) => {
  const text = normalizeText(value).toUpperCase();
  return !text || ['UNKNOWN', 'N/A', 'NA', '-', 'NONE', 'NULL', 'UNDEFINED'].includes(text);
};

export const isIdLikePartyValue = (value) => {
  const text = normalizeText(value);
  if (!text) return false;
  if (/^\d+$/.test(text)) return true;
  return /^party\s*[-#:]*\s*\d+$/i.test(text);
};

export const isMeaningfulPartyName = (value) => {
  const text = normalizeText(value);
  if (!text) return false;
  if (isPlaceholderText(text)) return false;
  if (isIdLikePartyValue(text)) return false;
  return true;
};

export const pickBestPartyName = (...values) => {
  const best = values.find(isMeaningfulPartyName);
  if (best) return normalizeText(best);
  const fallback = values.map(normalizeText).find((text) => text && !isPlaceholderText(text));
  return fallback || null;
};

export const formatPartyLabel = (value) => {
  const text = normalizeText(value);
  if (!text || isPlaceholderText(text)) return '';
  const match = text.match(/^party\s*[-#:]*\s*(\d+)$/i);
  if (match?.[1]) return `Party ${match[1]}`;
  if (/^\d+$/.test(text)) return `Party ${text}`;
  return text;
};

export const cleanCategoryLabel = (categoryValue, productName, sku) => {
  const category = normalizeText(categoryValue);
  if (isPlaceholderText(category)) return null;
  const normalizedCategory = category.toUpperCase();
  const normalizedName = normalizeText(productName).toUpperCase();
  const normalizedSku = normalizeText(sku).toUpperCase();
  if (normalizedCategory === normalizedName || normalizedCategory === normalizedSku) return null;
  return category;
};

export const normalizeIdentityField = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const buildProductIdentityKey = (product = {}) => {
  const rawSku = normalizeText(product?.sku);
  const rawName = normalizeText(product?.name);
  const normalizedSku = normalizeIdentityField(rawSku);
  const normalizedName = normalizeIdentityField(rawName);

  if (normalizedSku && !isPlaceholderText(rawSku)) {
    return `sku:${normalizedSku}`;
  }
  if (normalizedName) {
    return `name:${normalizedName}`;
  }
  return '';
};

export const mergeProductCards = (existing, incoming) => {
  const existingDate = parseDateValue(existing?.record_date);
  const incomingDate = parseDateValue(incoming?.record_date);
  const incomingIsPrimary = incomingDate && (!existingDate || incomingDate > existingDate);
  const primary = incomingIsPrimary ? incoming : existing;
  const secondary = incomingIsPrimary ? existing : incoming;

  const merged = {
    ...primary,
    top_customers: [
      ...(Array.isArray(primary?.top_customers) ? primary.top_customers : []),
      ...(Array.isArray(secondary?.top_customers) ? secondary.top_customers : []),
    ],
  };

  const fallbackFields = [
    'name', 'sku', 'category', 'on_hand', 'reorder', 'daily_demand', 'predicted_7_day_demand',
    'customer_purchased', 'sales_total', 'days_window', 'record_date', 'risk', 'days_to_stock',
    'stockout_datetime', 'order_quantity', 'health_status', 'confidence_score', 'status',
    'metrics_intel', 'reason', 'recommended_action', 'action_plan', 'unit_price', 'stock_value'
  ];

  fallbackFields.forEach((field) => {
    if (isMissingLikeValue(merged[field]) && !isMissingLikeValue(secondary?.[field])) {
      merged[field] = secondary[field];
    }
  });

  return merged;
};

export const dedupeProductsByIdentity = (rows = []) => {
  const grouped = new Map();

  rows.forEach((row) => {
    const key = buildProductIdentityKey(row);
    if (!key) {
      grouped.set(`id:${row?.id ?? Math.random()}`, row);
      return;
    }

    if (!grouped.has(key)) {
      grouped.set(key, row);
      return;
    }

    grouped.set(key, mergeProductCards(grouped.get(key), row));
  });

  return Array.from(grouped.values()).map((row, idx) => ({
    ...row,
    id: idx + 1,
  }));
};

export const formatUnitsValue = (value, { maxDecimals = 2 } = {}) => {
  if (value === null || value === undefined || value === '') return '-';
  const normalized = typeof value === 'string' ? value.replace(/,/g, '').trim() : value;
  const n = Number(normalized);
  if (n === null) return '-';
  if (!Number.isFinite(n)) return '-';
  if (Number.isInteger(n)) return String(n);
  return Number(n.toFixed(maxDecimals)).toString();
};
