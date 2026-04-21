import {
  getPartyIdFromRow,
  getPartyNameFromRow,
  normalizeFieldName,
  toFiniteNumber,
} from './inventoryRisksCalculations';
import {
  formatPartyLabel,
  isPlaceholderText,
  pickBestPartyName,
} from './inventoryRisksUtils';

const normalizeCustomerKey = (value) => normalizeFieldName(value);

const buildCustomerIdentityLookup = (analysisPayload) => {
  const analysis = analysisPayload?.analysis || analysisPayload || {};
  const byId = new Map();

  const register = (id, name) => {
    const normalizedId = normalizeCustomerKey(id);
    const normalizedName = String(name || '').trim();
    if (!normalizedId || !normalizedName) return;
    if (normalizedName.toUpperCase() === 'UNKNOWN') return;
    byId.set(normalizedId, normalizedName);
  };

  const customers = Array.isArray(analysis?.customers) ? analysis.customers : [];
  customers.forEach((cust) => {
    const name = pickBestPartyName(
      cust?.party_name,
      cust?.customer_name,
      cust?.name,
      cust?.company,
      cust?.party,
      cust?.buyer_name,
      cust?.customer
    );
    register(cust?.customer_id, name);
    register(cust?.party_id, name);
    register(cust?.party_code, name);
  });

  const customerAnalysis = Array.isArray(analysis?.customer_analysis)
    ? analysis.customer_analysis
    : (Array.isArray(analysis?.customer_analysis?.customers) ? analysis.customer_analysis.customers : []);
  customerAnalysis.forEach((cust) => {
    const name = pickBestPartyName(
      cust?.party_name,
      cust?.customer_name,
      cust?.name,
      cust?.company,
      cust?.party,
      cust?.buyer_name,
      cust?.customer
    );
    register(cust?.customer_id, name);
    register(cust?.party_id, name);
    register(cust?.party_code, name);
    register(cust?.customer, name);
  });

  const previews = Array.isArray(analysis?.metadata?.sheet_previews) ? analysis.metadata.sheet_previews : [];
  previews.forEach((sheet) => {
    const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
    rows.forEach((row) => {
      const rowName = getPartyNameFromRow(row);
      const rowId = getPartyIdFromRow(row);
      register(rowId, rowName);
    });
  });

  return { byId };
};

const resolveCustomerDisplayName = (customer = {}, lookup = null) => {
  const explicitName = pickBestPartyName(
    customer?.party_name,
    customer?.customer_name,
    customer?.name,
    customer?.company,
    customer?.party,
    customer?.buyer_name,
    customer?.customer
  );
  if (explicitName) return explicitName;

  const primaryIds = [
    customer?.base_customer_id,
    customer?.customer_id,
    customer?.party_id,
    customer?.party_code,
    customer?.customer_code,
  ].filter(Boolean);

  for (const id of primaryIds) {
    const normalizedId = normalizeCustomerKey(id);
    if (!normalizedId) continue;
    const found = lookup?.byId?.get(normalizedId);
    if (found) return found;

    const withoutSuffix = normalizedId.replace(/_[0-9]{8,}$/i, '');
    if (withoutSuffix && withoutSuffix !== normalizedId) {
      const foundBase = lookup?.byId?.get(withoutSuffix);
      if (foundBase) return foundBase;
    }
  }

  return formatPartyLabel(customer?.base_customer_id || customer?.customer_id || '');
};

const pickMaxNumber = (...values) => {
  const candidates = values
    .map((v) => toFiniteNumber(v))
    .filter((v) => v !== null);
  if (candidates.length === 0) return 0;
  return Math.max(...candidates);
};

const riskWeight = (risk) => {
  const raw = String(risk || '').toLowerCase();
  if (raw.includes('high')) return 3;
  if (raw.includes('medium')) return 2;
  return 1;
};

const parseDateSafe = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const pickLatestDate = (left, right) => {
  const l = parseDateSafe(left);
  const r = parseDateSafe(right);
  if (l && r) return l >= r ? left : right;
  return left || right || null;
};

const resolveMergedTrend = (left, right) => {
  const vals = [String(left || ''), String(right || '')].map((v) => v.toLowerCase());
  if (vals.some((v) => v.includes('drop'))) return 'Drop';
  if (vals.some((v) => v.includes('increas') || v.includes('grow'))) return 'Increasing';
  if (vals.some((v) => v.includes('mixed'))) return 'Mixed';
  return String(left || right || 'Stable');
};

const normalizeDateLabel = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.toLowerCase() === 'unknown' || raw.toLowerCase() === 'not scheduled') return '';
  return raw;
};

const sortDateLabelsDesc = (values = []) => {
  return [...values].sort((a, b) => {
    const da = parseDateSafe(a);
    const db = parseDateSafe(b);
    if (da && db) return db - da;
    if (da) return -1;
    if (db) return 1;
    return String(b).localeCompare(String(a));
  });
};

const mergeDateLists = (left = [], right = []) => {
  const normalized = [...left, ...right]
    .map(normalizeDateLabel)
    .filter(Boolean);
  return sortDateLabelsDesc(Array.from(new Set(normalized)));
};

export const toUnitsSafe = (value) => {
  const numeric = toFiniteNumber(value);
  return numeric === null ? 0 : Math.max(0, numeric);
};

const buildOrderEventsFromEntry = (entry) => {
  if (Array.isArray(entry?.order_events) && entry.order_events.length > 0) {
    return entry.order_events
      .map((evt) => ({
        order_date: normalizeDateLabel(evt?.order_date),
        delivery_date: normalizeDateLabel(evt?.delivery_date),
        units: toUnitsSafe(evt?.units),
      }))
      .filter((evt) => evt.order_date || evt.delivery_date);
  }

  const orderDate = normalizeDateLabel(entry?.last_order);
  const deliveryDate = normalizeDateLabel(entry?.next_expected);
  if (!orderDate && !deliveryDate) return [];

  return [{
    order_date: orderDate,
    delivery_date: deliveryDate,
    units: toUnitsSafe(entry?.total_purchased),
  }];
};

const mergeOrderEvents = (left = [], right = []) => {
  const combined = [...left, ...right].filter(Boolean);
  const byKey = new Map();

  combined.forEach((evt) => {
    const orderDate = normalizeDateLabel(evt?.order_date);
    const deliveryDate = normalizeDateLabel(evt?.delivery_date);
    const units = toUnitsSafe(evt?.units);
    const key = `${orderDate}|${deliveryDate}|${units}`;
    if (!orderDate && !deliveryDate) return;
    byKey.set(key, { order_date: orderDate, delivery_date: deliveryDate, units });
  });

  return Array.from(byKey.values()).sort((a, b) => {
    const ad = parseDateSafe(a.order_date) || parseDateSafe(a.delivery_date);
    const bd = parseDateSafe(b.order_date) || parseDateSafe(b.delivery_date);
    if (ad && bd) return bd - ad;
    if (ad) return -1;
    if (bd) return 1;
    return 0;
  });
};

export const consolidateCustomers = (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const byKey = new Map();

  rows.forEach((cust, idx) => {
    const key = normalizeCustomerKey(
      cust?.customer_id || cust?.name || cust?.company || `CUST-${idx + 1}`
    );
    if (!key) return;

    const existing = byKey.get(key);
    if (!existing) {
      const orderEvents = buildOrderEventsFromEntry(cust);
      byKey.set(key, {
        ...cust,
        customer_id: cust?.customer_id || cust?.name || `CUST-${idx + 1}`,
        name: cust?.name || 'Unknown Client',
        company: cust?.company || cust?.name || 'Direct Buyer Partner',
        risk_level: cust?.risk_level || 'Low',
        trend_tag: cust?.trend_tag || 'Stable',
        total_purchased: pickMaxNumber(cust?.total_purchased),
        last_order: cust?.last_order || null,
        next_expected: cust?.next_expected || null,
        order_events: orderEvents,
        order_dates: mergeDateLists([], [cust?.last_order]),
        delivery_dates: mergeDateLists([], [cust?.next_expected]),
      });
      return;
    }

    const mergedRisk = riskWeight(existing.risk_level) >= riskWeight(cust?.risk_level)
      ? existing.risk_level
      : (cust?.risk_level || existing.risk_level || 'Low');

    const mergedOrderEvents = mergeOrderEvents(existing.order_events, buildOrderEventsFromEntry(cust));
    byKey.set(key, {
      ...existing,
      customer_id: existing.customer_id || cust?.customer_id,
      name: existing.name || cust?.name,
      company: existing.company || cust?.company,
      total_purchased: pickMaxNumber(existing.total_purchased, cust?.total_purchased),
      last_order: pickLatestDate(existing.last_order, cust?.last_order),
      next_expected: pickLatestDate(existing.next_expected, cust?.next_expected),
      order_events: mergedOrderEvents,
      order_dates: mergeDateLists(existing.order_dates, [cust?.last_order]),
      delivery_dates: mergeDateLists(existing.delivery_dates, [cust?.next_expected]),
      risk_level: mergedRisk,
      trend_tag: resolveMergedTrend(existing.trend_tag, cust?.trend_tag),
      email: existing.email || cust?.email || null,
      phone: existing.phone || cust?.phone || null,
      address: existing.address || cust?.address || null,
    });
  });

  return Array.from(byKey.values())
    .sort((a, b) => pickMaxNumber(b?.total_purchased) - pickMaxNumber(a?.total_purchased));
};

export const buildCustomersFromTopCustomers = (product, analysisPayload) => {
  const lookup = buildCustomerIdentityLookup(analysisPayload);
  const topCustomers = Array.isArray(product?.top_customers)
    ? product.top_customers
    : (Array.isArray(product?.customer_breakdown)
      ? product.customer_breakdown
      : (Array.isArray(product?.buyers) ? product.buyers : []));

  return topCustomers.map((cust, idx) => {
    const trendTag = String(cust?.trend_tag || '').trim();
    const inferredRisk = trendTag.includes('Drop') ? 'High' : (trendTag.includes('Mixed') ? 'Medium' : 'Low');
    const resolvedName = resolveCustomerDisplayName(cust, lookup) || `Customer-${idx + 1}`;
    const resolvedCompany = !isPlaceholderText(cust?.company) ? cust.company : resolvedName || 'Direct Buyer Partner';
    return {
      customer_id: cust?.base_customer_id || cust?.customer_id || cust?.party_id || cust?.party_code || resolvedName || `CUST-${idx + 1}`,
      name: resolvedName,
      company: resolvedCompany,
      total_purchased: pickMaxNumber(cust?.total_purchased, cust?.total_purchase),
      last_order: cust?.last_order || cust?.last_order_date || null,
      next_expected: cust?.next_expected || null,
      risk_level: cust?.risk_level || inferredRisk,
      trend_tag: trendTag || (cust?.risk_level === 'High' ? 'Drop' : 'Stable'),
      email: cust?.email || null,
      phone: cust?.phone || null,
      address: cust?.address || null,
    };
  });
};

export const buildCustomersFromRemoteBuyers = (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows
    .map((cust, idx) => ({
      customer_id: cust?.customer_id || cust?.name || `REMOTE-${idx + 1}`,
      name: pickBestPartyName(cust?.party_name, cust?.customer_name, cust?.name, cust?.company, cust?.party, cust?.customer) || `Customer-${idx + 1}`,
      company: !isPlaceholderText(cust?.company) ? cust.company : (cust?.name || 'Direct Buyer Partner'),
      total_purchased: pickMaxNumber(cust?.total_purchased, cust?.total_purchase),
      last_order: cust?.last_order || cust?.last_order_date || null,
      next_expected: cust?.next_expected || null,
      risk_level: cust?.risk_level || 'Low',
      trend_tag: cust?.trend_tag || 'Derived From API',
      email: cust?.email || null,
      phone: cust?.phone || null,
      address: cust?.address || null,
    }))
    .filter((c) => String(c?.name || '').trim().length > 0);
};
