import {
  FIELD_ALIASES,
  PARTY_ID_ALIASES,
  PARTY_NAME_ALIASES,
  isIdLikePartyValue,
  isPlaceholderText,
  normalizeText,
  parseDateValue,
  pickBestPartyName,
} from './inventoryRisksUtils';

export const normalizeRisk = (risk) => {
  if (risk === null || risk === undefined || risk === '') return 'UNKNOWN';
  if (risk === 'Out of Stock' || risk === 'OUT_OF_STOCK' || risk === 'OUT OF STOCK') return 'OUT_OF_STOCK';
  if (risk === 'Low Stock' || risk === 'UNDERSTOCK' || risk === 'Understock' || risk === 'LOW STOCK') return 'LOW_STOCK';
  if (risk === 'Not Selling' || risk === 'Deadstock' || risk === 'NOT_SELLING' || risk === 'DEADSTOCK') return 'DEADSTOCK';
  if (risk === 'Too Much Stock' || risk === 'TOO_MUCH' || risk === 'OVERSTOCK') return 'OVERSTOCK';
  if (risk === 'Healthy' || risk === 'Normal' || risk === 'OK') return 'HEALTHY';
  return risk || 'UNKNOWN';
};

export const deriveRiskFromSignals = ({ normalizedRisk, onHand, dailyDemand, resolvedDays }) => {
  if (onHand !== null && onHand <= 0) return 'OUT_OF_STOCK';

  if (['OUT_OF_STOCK', 'LOW_STOCK', 'DEADSTOCK', 'OVERSTOCK'].includes(normalizedRisk)) {
    return normalizedRisk;
  }

  if (dailyDemand !== null && dailyDemand === 0 && onHand !== null && onHand > 0) {
    return 'DEADSTOCK';
  }

  if (typeof resolvedDays === 'number') {
    if (resolvedDays <= 7) return 'LOW_STOCK';
    if (resolvedDays > 120) return 'OVERSTOCK';
    return 'HEALTHY';
  }

  if (normalizedRisk === 'HEALTHY') return 'HEALTHY';
  return 'UNKNOWN';
};

export const buildRiskStatsFromAnalysis = (analysisPayload, fallbackProducts = []) => {
  const stock = analysisPayload?.stock_analysis;
  if (stock && typeof stock === 'object') {
    const out = Number(stock.out_of_stock_items || 0);
    const low = Number(stock.low_stock_items || 0);
    const dead = Number(stock.deadstock_items || 0);
    const over = Number(stock.overstock_items || 0);
    const totalProducts = Number(
      analysisPayload?.inventory_summary?.total_products
      || analysisPayload?.summary?.processed
      || fallbackProducts.length
      || 0
    );
    const healthyFromStock = Number(stock.healthy_items);
    const healthy = Number.isFinite(healthyFromStock)
      ? healthyFromStock
      : Math.max(0, totalProducts - (out + low + dead + over));

    return {
      out_of_stock: out,
      low_stock: low,
      deadstock: dead,
      overstock: over,
      healthy,
    };
  }

  const summary = analysisPayload?.summary;
  if (summary && typeof summary === 'object') {
    return {
      out_of_stock: Number(summary.out_of_stock || 0),
      low_stock: Number(summary.low_stock || 0),
      deadstock: Number(summary.deadstock || 0),
      overstock: Number(summary.overstock || 0),
      healthy: Number(summary.healthy || 0),
    };
  }

  return fallbackProducts.reduce((acc, p) => {
    const r = normalizeRisk(p.risk);
    if (r === 'OUT_OF_STOCK') acc.out_of_stock += 1;
    else if (r === 'LOW_STOCK') acc.low_stock += 1;
    else if (r === 'DEADSTOCK') acc.deadstock += 1;
    else if (r === 'OVERSTOCK') acc.overstock += 1;
    else acc.healthy += 1;
    return acc;
  }, { out_of_stock: 0, low_stock: 0, deadstock: 0, overstock: 0, healthy: 0 });
};

export const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const normalized = typeof value === 'string' ? value.replace(/,/g, '').trim() : value;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

export const normalizeFieldName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const resolveBestField = (row, aliases) => {
  const source = row && typeof row === 'object' ? row : {};
  let best = { key: null, confidence: 0 };
  const aliasNorm = aliases.map(normalizeFieldName);

  Object.keys(source).forEach((key) => {
    const normKey = normalizeFieldName(key);
    let score = 0;

    if (aliasNorm.includes(normKey)) {
      score = 1;
    } else if (aliasNorm.some((a) => normKey.startsWith(a) || normKey.endsWith(a))) {
      score = 0.9;
    } else if (aliasNorm.some((a) => normKey.includes(a) || a.includes(normKey))) {
      score = 0.82;
    }

    if (score > best.confidence) {
      best = { key, confidence: score };
    }
  });

  return best;
};

export const getFieldByAliases = (row, aliases) => {
  const source = row && typeof row === 'object' ? row : {};
  const normalizedMap = Object.keys(source).reduce((acc, key) => {
    acc[normalizeFieldName(key)] = source[key];
    return acc;
  }, {});

  for (const alias of aliases) {
    const hit = normalizedMap[normalizeFieldName(alias)];
    if (hit !== null && hit !== undefined && hit !== '') {
      return hit;
    }
  }
  return null;
};

export const getPartyNameFromRow = (row) => {
  const candidates = PARTY_NAME_ALIASES.map((alias) => getFieldByAliases(row, [alias]));
  return pickBestPartyName(...candidates);
};

export const getPartyIdFromRow = (row) => {
  const direct = getFieldByAliases(row, PARTY_ID_ALIASES);
  if (!isPlaceholderText(direct)) return normalizeText(direct);
  const partyFallback = getFieldByAliases(row, ['party']);
  return isIdLikePartyValue(partyFallback) ? normalizeText(partyFallback) : null;
};

export const getNumberByAliases = (row, aliases) => toFiniteNumber(getFieldByAliases(row, aliases));

export const getStrictUnitPrice = (row) => {
  const directUnitPrice = getNumberByAliases(row, FIELD_ALIASES.UNIT_PRICE);
  if (directUnitPrice !== null && directUnitPrice >= 0) return directUnitPrice;

  const totalValue = getNumberByAliases(row, FIELD_ALIASES.TOTAL_VALUE);
  const quantity = getNumberByAliases(row, FIELD_ALIASES.PRICE_QTY);
  if (totalValue !== null && quantity !== null && quantity > 0) {
    return totalValue / quantity;
  }

  return null;
};

export const getStringByAliases = (row, aliases, fallback = null) => {
  const hit = getFieldByAliases(row, aliases);
  if (hit === null || hit === undefined || hit === '') return fallback;
  return String(hit);
};

export const getFieldByResolvedKey = (row, resolvedKey) => {
  if (!resolvedKey || !row || typeof row !== 'object') return null;
  const normalizedTarget = normalizeFieldName(resolvedKey);
  const hitKey = Object.keys(row).find((k) => normalizeFieldName(k) === normalizedTarget);
  return hitKey ? row[hitKey] : null;
};

export const resolveBestFieldAcrossRows = (rows, aliases, valueType = 'number') => {
  const keyStats = new Map();

  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (!keyStats.has(key)) {
        keyStats.set(key, { present: 0, valid: 0 });
      }
      const stat = keyStats.get(key);
      stat.present += 1;
      const raw = row[key];
      const parsed = valueType === 'date' ? parseDateValue(raw) : (valueType === 'string' ? String(raw || '').trim() : toFiniteNumber(raw));
      const isValid = valueType === 'date'
        ? parsed !== null
        : (valueType === 'string' ? parsed.length > 0 : parsed !== null);
      if (isValid) stat.valid += 1;
    });
  });

  let best = { key: null, confidence: 0 };
  const aliasNorm = aliases.map(normalizeFieldName);

  keyStats.forEach((stat, key) => {
    const normKey = normalizeFieldName(key);
    const semanticScore = aliasNorm.includes(normKey)
      ? 1
      : (aliasNorm.some((a) => normKey.includes(a) || a.includes(normKey)) ? 0.85 : 0);
    if (semanticScore === 0) return;
    const qualityScore = stat.present > 0 ? (stat.valid / stat.present) : 0;
    const score = semanticScore * 0.7 + qualityScore * 0.3;
    if (score > best.confidence) {
      best = { key, confidence: score };
    }
  });

  return best;
};

export const dateToDayKey = (dateObj) => {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return null;
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const getProductStatusForFilter = (prod) => {
  const normalizedRisk = normalizeRisk(prod?.risk);
  if (['OUT_OF_STOCK', 'LOW_STOCK', 'DEADSTOCK', 'OVERSTOCK', 'HEALTHY'].includes(normalizedRisk)) {
    return normalizedRisk;
  }

  const health = String(prod?.health_status || '').toUpperCase();
  if (health === 'CRITICAL') return 'OUT_OF_STOCK';
  if (health === 'LOW STOCK') return 'LOW_STOCK';
  if (health === 'DEADSTOCK') return 'DEADSTOCK';
  if (health === 'OVERSTOCK') return 'OVERSTOCK';
  if (health === 'HEALTHY') return 'HEALTHY';
  return 'UNKNOWN';
};

export const getProductPriceForFilter = (prod) => {
  const priceCandidates = [
    prod?.price,
    prod?.unit_price,
    prod?.selling_price,
    prod?.sale_price,
    prod?.mrp,
    prod?.rate,
    prod?.cost,
    prod?.cost_price,
    prod?.unit_cost,
  ];

  for (const value of priceCandidates) {
    const parsed = toFiniteNumber(value);
    if (parsed !== null) return parsed;
  }

  return null;
};
