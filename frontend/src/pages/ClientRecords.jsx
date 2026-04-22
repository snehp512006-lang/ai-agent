import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, MapPin, Search, ShieldCheck, TrendingDown, TrendingUp, Minus, Users, ArrowUpRight } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import ProductPurchaseModal from '../components/ProductPurchaseModal';
import { useAnalysis } from '../context/useAnalysis';
import api from '../api/client';
import { resolveCustomerBehavior, getCustomerBehaviorMeta, toWatchCategory } from '../utils/customerBehaviorContract';

const LAST_ANALYSIS_STORAGE_KEY = 'ai-ops-last-analysis-snapshot';

const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const formatCompact = (value) => {
  const n = toNum(value, 0);
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
};

const formatDateShort = (value) => {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const toProfessionalPartyText = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';

  const compact = text.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const partyNumber = compact.match(/^party\s*(\d+)$/i);
  if (partyNumber) return `Party ${partyNumber[1]}`;
  if (/^\d+$/.test(compact)) return `Party ${compact}`;

  return compact
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
};

const isPlaceholderPartyName = (value) => {
  const text = String(value || '').trim().replace(/[_-]+/g, ' ');
  if (!text) return true;
  if (/\bunknown\b/i.test(text)) return true;
  if (/\bnot\s*available\b/i.test(text)) return true;
  if (/^party\s*$/i.test(text)) return true;
  if (/^party\s*unknown$/i.test(text)) return true;
  if (/^unknown\s*party$/i.test(text)) return true;
  return false;
};

const isMeaningfulIdentifier = (value) => {
  const text = String(value || '').trim();
  if (!text) return false;
  const upper = text.toUpperCase();
  if (['UNKNOWN', 'N/A', 'NA', '-', 'NONE', 'NULL', 'PARTYUNKNOWN'].includes(upper)) return false;
  return true;
};

const formatPartyFromIdentifier = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const cleaned = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const justDigits = cleaned.replace(/\D/g, '');
  if (justDigits) return `Party ${justDigits}`;
  return `Party ${cleaned.replace(/^party\s*/i, '').trim()}`.trim();
};

const isMeaningfulClientName = (value) => {
  const text = String(value || '').trim();
  if (!text) return false;
  const upper = text.toUpperCase();
  if (['UNKNOWN', 'N/A', 'NA', '-', 'NONE', 'NULL', 'INDIVIDUAL', 'DIRECT CLIENT', 'PARTYUNKNOWN'].includes(upper)) return false;
  if (isPlaceholderPartyName(text)) return false;
  if (/^\d+$/.test(text)) return false;
  return true;
};

const isIdLikePartyName = (value) => {
  const text = String(value || '').trim();
  if (!text) return false;
  const normalized = text.replace(/\s+/g, ' ');
  const match = normalized.match(/^party\s*[-#:]*\s*([a-z0-9_-]+)$/i);
  return Boolean(match && /\d/.test(match[1]));
};

const pickBestClientName = (...candidates) => {
  const meaningful = candidates.filter(isMeaningfulClientName);
  if (!meaningful.length) return null;
  const nonIdLike = meaningful.find((name) => !isIdLikePartyName(name));
  return nonIdLike || meaningful[0];
};

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const getMonthlyAmountPair = (client = {}) => {
  const rows = Array.isArray(client.monthly_breakdown) ? client.monthly_breakdown : [];
  const series = rows
    .map((m) => ({
      month: String(m?.month || '').trim(),
      amount: toNum(m?.amount, NaN),
      units: toNum(m?.units, NaN),
    }))
    .map((m) => ({
      month: m.month,
      value: Number.isFinite(m.amount) ? m.amount : (Number.isFinite(m.units) ? m.units : NaN),
    }))
    .filter((m) => /^\d{4}-\d{2}$/.test(m.month) && Number.isFinite(m.value))
    .sort((a, b) => a.month.localeCompare(b.month));

  if (series.length === 0) {
    return {
      previous: toNum(client.prev_month_qty, 0),
      current: toNum(client.current_month_qty, toNum(client.total_purchase, 0)),
      isNewCustomer: true,
    };
  }

  const latest = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;

  return {
    previous: prev ? toNum(prev.value, 0) : 0,
    current: toNum(latest.value, 0),
    isNewCustomer: !prev,
  };
};

const getStatusSplit = (client = {}, peerCurrents = []) => {
  const { previous, current, isNewCustomer } = getMonthlyAmountPair(client);

  const sortedPeers = [...peerCurrents].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const idx = sortedPeers.findIndex((v) => v >= current);
  const rankIdx = idx >= 0 ? idx : Math.max(0, sortedPeers.length - 1);
  const percentile = sortedPeers.length > 1 ? (rankIdx / (sortedPeers.length - 1)) * 100 : 50;

  let highPct = 0;
  let lowPct = 0;
  let normalPct = 0;

  if (previous > 0) {
    const dropPct = clamp(((previous - current) / previous) * 100, 0, 100);
    const growthPct = clamp(((current - previous) / previous) * 100, 0, 100);
    highPct = Math.round(clamp(dropPct));
    lowPct = Math.round(clamp((100 - highPct) * 0.35));
    normalPct = Math.round(clamp(100 - highPct - lowPct + (growthPct * 0.2)));
  } else {
    if (isNewCustomer) {
      if (percentile >= 70) {
        normalPct = 85;
        lowPct = 10;
        highPct = 5;
      } else if (percentile >= 40) {
        normalPct = 55;
        lowPct = 35;
        highPct = 10;
      } else {
        normalPct = 25;
        lowPct = 35;
        highPct = 40;
      }
    } else {
      normalPct = 60;
      lowPct = 30;
      highPct = 10;
    }
  }

  const sum = Math.max(1, highPct + lowPct + normalPct);
  return {
    highPct: Math.round((highPct / sum) * 100),
    lowPct: Math.round((lowPct / sum) * 100),
    normalPct: Math.round((normalPct / sum) * 100),
    currentPurchase: current,
    previousPurchase: previous,
    isNewCustomer,
    peerPercentile: Math.round(percentile),
  };
};

const getPrimaryStatusMetric = (category, statusSplit) => {
  if (category === 'STOPPED') {
    return { label: 'High %', value: statusSplit.highPct, text: 'text-rose-600 dark:text-rose-400', labelText: 'text-rose-500' };
  }
  if (category === 'LESS') {
    return { label: 'Low %', value: statusSplit.lowPct, text: 'text-amber-600 dark:text-amber-400', labelText: 'text-amber-500' };
  }
  return { label: 'Normal %', value: statusSplit.normalPct, text: 'text-emerald-600 dark:text-emerald-400', labelText: 'text-emerald-500' };
};

const getProductBehaviorSignals = (client = {}) => {
  const rows = Array.isArray(client?.product_breakdown) ? client.product_breakdown : [];
  if (!rows.length) {
    return { hasNegative: false, hasPositive: false, hasRows: false };
  }

  let hasNegative = false;
  let hasPositive = false;

  rows.forEach((row) => {
    const statusRaw = String(row?.status || row?.intensity_level || row?.trend || '').trim();
    const status = statusRaw.toUpperCase().replace(/[^A-Z0-9]+/g, '_');

    const isNegative = [
      'NOT_PURCHASED', 'MAJOR_DROP', 'MINOR_DROP', 'BAHUT_KAM', 'THODA_KAM',
    ].includes(status)
      || status.includes('STOP')
      || status.includes('DROP')
      || status.includes('LESS')
      || status.includes('DOWN');

    const isPositive = [
      'GROWING', 'NEW_CUSTOMER', 'NEW_ITEM', 'UPCOMING',
    ].includes(status)
      || status.includes('GROW')
      || status.includes('NEW')
      || status.includes('UP');

    if (isNegative) hasNegative = true;
    if (isPositive) hasPositive = true;
  });

  return { hasNegative, hasPositive, hasRows: true };
};

const isMixedBehaviorClient = (client = {}, statusSplit = null) => {
  const level = String(client?.intensity_level || '').toUpperCase();
  if (level === 'MIXED_PERFORMANCE') return true;

  const behaviorSignals = getProductBehaviorSignals(client);
  if (behaviorSignals.hasRows && behaviorSignals.hasNegative && behaviorSignals.hasPositive) {
    return true;
  }

  // Do not infer mixed from coarse percentage splits alone. It causes false positives
  // for new/early customers where synthetic split values can look "mixed".
  return false;
};

const normalizeKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const getRowValue = (row, key) => {
  if (!row || typeof row !== 'object') return null;
  const needle = normalizeKey(key);
  const matchKey = Object.keys(row).find((k) => normalizeKey(k) === needle);
  return matchKey ? row[matchKey] : null;
};

const pickFromRow = (row, keys = []) => {
  if (!row || typeof row !== 'object') return null;
  const normalized = Object.keys(row).reduce((acc, key) => {
    acc[normalizeKey(key)] = key;
    return acc;
  }, {});

  for (const key of keys) {
    const normalizedKey = normalizeKey(key);
    const originalKey = normalized[normalizedKey];
    if (originalKey && row[originalKey] !== null && row[originalKey] !== undefined && row[originalKey] !== '') {
      return row[originalKey];
    }
  }
  return null;
};

const pickPreferredNameFromRow = (row) => pickBestClientName(
  getRowValue(row, 'party_name'),
  getRowValue(row, 'party name'),
  getRowValue(row, 'customer_name'),
  getRowValue(row, 'buyer_name'),
  getRowValue(row, 'purchaser_name'),
  getRowValue(row, 'sold_to_name'),
  getRowValue(row, 'account_name'),
  pickFromRow(row, CUSTOMER_NAME_KEYS),
  getRowValue(row, 'party'),
  getRowValue(row, 'customer'),
  getRowValue(row, 'client'),
  getRowValue(row, 'company'),
);

const EMAIL_KEYS = [
  'email', 'email_id', 'emailid', 'emailaddress', 'customer_email', 'client_email', 'mail_id', 'mail', 'e-mail'
];

const PHONE_KEYS = [
  'phone', 'phone_no', 'phone_number', 'mobile', 'mobile_no', 'contact', 'contact_number', 'contactno', 'whatsapp'
];

const ADDRESS_KEYS = [
  'address', 'billing_address', 'shipping_address', 'company_address', 'location', 'city', 'area', 'region'
];

const CUSTOMER_NAME_KEYS = [
  'customer_name', 'customer', 'client', 'client_name', 'company', 'company_name',
  'party', 'party_name', 'buyer', 'buyer_name', 'purchaser', 'purchaser_name',
  'sold_to', 'sold_to_name', 'account_name', 'ledger_name'
];

const CUSTOMER_ID_KEYS = [
  'customer_id', 'customerid', 'party_id', 'party_code', 'partycode', 'account_id', 'accountid', 'code', 'ledger_code'
];

const hasCustomerPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return false;
  const analysis = payload.analysis || payload?.payload?.analysis || payload;
  if (Array.isArray(analysis.customers) && analysis.customers.length) return true;
  if (Array.isArray(analysis.customer_analysis) && analysis.customer_analysis.length) return true;
  if (Array.isArray(analysis.products) && analysis.products.length) return true;
  if (Array.isArray(analysis.products_analysis) && analysis.products_analysis.length) return true;
  if (Array.isArray(analysis?.metadata?.sheet_previews) && analysis.metadata.sheet_previews.length) return true;
  if (Array.isArray(payload.preview_rows) && payload.preview_rows.length) return true;
  return false;
};

const hasPopulatedStockIn = (payload) => {
  if (!payload || typeof payload !== 'object') return false;
  const analysis = payload.analysis || payload?.payload?.analysis || payload;
  const stock = analysis?.stock_in_analysis;
  if (!stock || typeof stock !== 'object') return false;
  const monthly = Array.isArray(stock.monthly_stock_in) ? stock.monthly_stock_in : [];
  const byDate = Array.isArray(stock.stock_in_by_date) ? stock.stock_in_by_date : [];
  return monthly.length > 0 || byDate.length > 0;
};

const buildCustomersFromCustomerAnalysis = (customerAnalysis = []) => {
  return customerAnalysis.map((c, idx) => {
    const resolvedName = pickBestClientName(
      c?.party_name,
      c?.party,
      c?.customer_name,
      c?.company_name,
      c?.company,
      c?.client_name,
      c?.customer,
      c?.name,
    );

    const freq = toNum(c.frequency, 0);
    let intensityLevel = 'HEALTHY';
    let intensityLabel = 'ACTIVE';
    let risk = 'ACTIVE';
    if (freq <= 0 || c.low_activity) {
      intensityLevel = 'LIYA_HI_NAHI';
      intensityLabel = 'NO PURCHASE';
      risk = 'CHURN_RISK';
    } else if (freq <= 1) {
      intensityLevel = 'BAHUT_KAM';
      intensityLabel = 'VERY LOW';
      risk = 'CHURN_RISK';
    } else if (freq <= 2) {
      intensityLevel = 'THODA_KAM';
      intensityLabel = 'LOW';
      risk = 'WATCH';
    }

    const monthlyBreakdown = Array.isArray(c.monthly_breakdown) ? c.monthly_breakdown : [];
    const latestMonth = monthlyBreakdown
      .map((m) => String(m?.month || '').trim())
      .filter((m) => /^\d{4}-\d{2}$/.test(m))
      .sort()
      .pop() || null;

    return {
      id: idx + 1,
      customer_id: c.customer_id || c.customer || `CUST-${idx + 1}`,
      customer_name: toProfessionalPartyText(resolvedName || c.customer || `Customer-${idx + 1}`),
      company: toProfessionalPartyText(resolvedName || c.customer || 'Individual'),
      total_purchase: toNum(c.total_purchase, 0),
      frequency: freq,
      intensity_level: intensityLevel,
      intensity_label: intensityLabel,
      risk,
      reason: c.low_activity ? 'Low purchase activity based on frequency analysis' : 'Active account',
      email: c.email || c.customer_email || c.mail_id || null,
      phone: c.phone || c.mobile || c.contact_number || null,
      address: c.address || c.location || c.city || null,
      last_order_date: c.last_order_date || c.last_purchase_date || (latestMonth ? `${latestMonth}-01` : null),
      monthly_trend: c.monthly_trend || (risk === 'CHURN_RISK' ? 'down' : (risk === 'WATCH' ? 'flat' : 'up')),
    };
  });
};

const buildCustomersFromProducts = (products = []) => {
  const byCustomer = new Map();

  products.forEach((p) => {
    const topCustomers = Array.isArray(p?.top_customers) ? p.top_customers : [];
    topCustomers.forEach((c) => {
      const resolvedName = pickBestClientName(
        c?.party_name,
        c?.party,
        c?.customer_name,
        c?.company_name,
        c?.company,
        c?.name,
        c?.client_name,
      );

      const key = String(c?.customer_id || resolvedName || c?.name || c?.company || '').trim();
      if (!key) return;

      const totalPurchased = toNum(c?.total_purchased ?? c?.total_purchase, 0);
      const trendTag = String(c?.trend_tag || '').toUpperCase();
      const riskTag = String(c?.risk_level || '').toUpperCase();

      let intensityLevel = 'HEALTHY';
      let intensityLabel = 'ACTIVE';
      let risk = 'ACTIVE';

      if (riskTag.includes('HIGH') || trendTag.includes('DROP')) {
        intensityLevel = 'BAHUT_KAM';
        intensityLabel = 'VERY LOW';
        risk = 'CHURN_RISK';
      } else if (riskTag.includes('MEDIUM') || trendTag.includes('MIXED')) {
        intensityLevel = 'THODA_KAM';
        intensityLabel = 'LOW';
        risk = 'WATCH';
      }

      const existing = byCustomer.get(key);
      if (!existing || totalPurchased > toNum(existing.total_purchase, 0)) {
        byCustomer.set(key, {
          id: byCustomer.size + 1,
          customer_id: c?.customer_id || key,
          customer_name: toProfessionalPartyText(resolvedName || c?.name || key),
          company: toProfessionalPartyText(resolvedName || c?.company || c?.name || key),
          total_purchase: totalPurchased,
          intensity_level: intensityLevel,
          intensity_label: intensityLabel,
          risk,
          reason: c?.trend_tag || (risk === 'CHURN_RISK' ? 'Low purchase activity detected' : 'Customer is active'),
          email: c?.email || c?.customer_email || c?.mail_id || null,
          phone: c?.phone || c?.mobile || c?.contact_number || null,
          address: c?.address || c?.location || c?.city || null,
          last_order_date: c?.last_order || c?.last_order_date || null,
          monthly_trend: trendTag.includes('UP')
            ? 'up'
            : (trendTag.includes('DROP') || risk === 'CHURN_RISK' ? 'down' : (risk === 'WATCH' ? 'flat' : 'up')),
        });
      }
    });
  });

  return Array.from(byCustomer.values());
};

const buildCustomersFromSheetPreviews = (previews = []) => {
  const byCustomer = new Map();

  previews.forEach((preview) => {
    const rows = Array.isArray(preview?.rows) ? preview.rows : [];
    rows.forEach((row) => {
      const name = pickPreferredNameFromRow(row);
      const email = pickFromRow(row, EMAIL_KEYS);
      const phone = pickFromRow(row, PHONE_KEYS);
      const address = pickFromRow(row, ADDRESS_KEYS);

      const key = String(name || email || phone || '').trim();
      if (!key) return;

      if (!byCustomer.has(key)) {
        byCustomer.set(key, {
          id: byCustomer.size + 1,
          customer_id: key,
          customer_name: toProfessionalPartyText(name || key),
          company: toProfessionalPartyText(name || key),
          total_purchase: 0,
          intensity_level: 'HEALTHY',
          intensity_label: 'ACTIVE',
          risk: 'ACTIVE',
          reason: 'Customer profile from sheet preview',
          email: email || null,
          phone: phone || null,
          address: address || null,
          last_order_date: null,
          monthly_trend: 'up',
        });
      } else {
        const existing = byCustomer.get(key);
        existing.email = existing.email || email || null;
        existing.phone = existing.phone || phone || null;
        existing.address = existing.address || address || null;
      }
    });
  });

  return Array.from(byCustomer.values());
};

const buildCustomersFromPreviewRows = (rows = []) => {
  const byCustomer = new Map();

  rows.forEach((row) => {
    const name = pickPreferredNameFromRow(row);
    const email = pickFromRow(row, EMAIL_KEYS);
    const phone = pickFromRow(row, PHONE_KEYS);
    const address = pickFromRow(row, ADDRESS_KEYS);

    const key = String(name || email || phone || '').trim();
    if (!key) return;

    if (!byCustomer.has(key)) {
      byCustomer.set(key, {
        id: byCustomer.size + 1,
        customer_id: key,
        customer_name: toProfessionalPartyText(name || key),
        company: toProfessionalPartyText(name || key),
        total_purchase: 0,
        intensity_level: 'HEALTHY',
        intensity_label: 'ACTIVE',
        risk: 'ACTIVE',
        reason: 'Customer profile from sheet preview',
        email: email || null,
        phone: phone || null,
        address: address || null,
        last_order_date: null,
        monthly_trend: 'up',
      });
    } else {
      const existing = byCustomer.get(key);
      existing.email = existing.email || email || null;
      existing.phone = existing.phone || phone || null;
      existing.address = existing.address || address || null;
    }
  });

  return Array.from(byCustomer.values());
};

const deriveWatchCategory = (client = {}) => {
  return toWatchCategory(resolveCustomerBehavior(client));
};

const cleanClientIdentifier = (value) => String(value || '')
  .trim()
  .replace(/^party\s*[-#:]*\s*/i, '')
  .replace(/[^a-zA-Z0-9_-]/g, '')
  .trim();

const extractIdentifierCandidate = (client = {}) => {
  const directId = [
    client.party_id,
    client.party_code,
    client.customer_id,
    client.account_id,
    client.account_code,
    client.ledger_code,
    client.customer_code,
    client.customerid,
    client.partycode,
    pickFromRow(client, CUSTOMER_ID_KEYS),
  ].map(cleanClientIdentifier).find(isMeaningfulIdentifier);

  if (directId) return directId;

  const candidateName = [
    client.party_name,
    client.customer_name,
    client.company_name,
    client.company,
    client.client_name,
    client.account_name,
    client.name,
    client.customer,
    client.buyer,
    client.buyer_name,
    client.purchaser,
    client.purchaser_name,
    client.sold_to,
    client.sold_to_name,
    pickFromRow(client, CUSTOMER_NAME_KEYS),
  ].find(Boolean);

  const partyMatch = String(candidateName || '').match(/party\s*[-#:]*\s*([a-z0-9_-]{3,})/i);
  if (partyMatch?.[1]) {
    const normalized = cleanClientIdentifier(partyMatch[1]);
    if (isMeaningfulIdentifier(normalized)) return normalized;
  }

  return '';
};

const getClientName = (client = {}) => (
  (() => {
    const preferred = extractMeaningfulClientName(client);

    if (preferred) return toProfessionalPartyText(preferred);

    const idFallback = extractIdentifierCandidate(client);

    if (isMeaningfulIdentifier(idFallback)) return formatPartyFromIdentifier(idFallback);

    return 'Key Account';
  })()
);

const extractMeaningfulClientName = (client = {}) => (
  pickBestClientName(
    client.party_name,
    client.party,
    client.customer_name,
    client.company_name,
    client.company,
    client.client_name,
    client.account_name,
    client.name,
    client.customer,
    client.buyer,
    client.buyer_name,
    client.purchaser,
    client.purchaser_name,
    client.sold_to,
    client.sold_to_name,
    pickFromRow(client, CUSTOMER_NAME_KEYS),
  )
);

const normalizePhoneKey = (value) => String(value || '').replace(/\D/g, '').trim();

const resolveClientIdentity = (client = {}, lookup = null) => {
  const localName = extractMeaningfulClientName(client);

  const idRaw = String(
    client.party_id
    || client.party_code
    || client.customer_id
    || client.account_id
    || pickFromRow(client, CUSTOMER_ID_KEYS)
    || ''
  ).trim();
  const idCandidate = isMeaningfulIdentifier(idRaw) ? idRaw : '';

  const emailCandidate = String(client.email || pickFromRow(client, EMAIL_KEYS) || '').trim();
  const phoneCandidate = String(client.phone || pickFromRow(client, PHONE_KEYS) || '').trim();

  const idKey = idCandidate ? idCandidate.toLowerCase() : '';
  const emailKey = emailCandidate ? emailCandidate.toLowerCase() : '';
  const phoneKey = normalizePhoneKey(phoneCandidate);

  const localNameKey = localName
    ? toProfessionalPartyText(localName).toLowerCase().replace(/[^a-z0-9]/g, '')
    : '';

  const lookupRecord = lookup
    ? (idKey ? lookup.byId.get(idKey) : null)
      || (emailKey ? lookup.byEmail.get(emailKey) : null)
      || (phoneKey ? lookup.byPhone.get(phoneKey) : null)
      || (localNameKey ? lookup.byName.get(localNameKey) : null)
      || null
    : null;

  const lookupName = lookupRecord?.formattedName || null;

  const resolvedName = pickBestClientName(localName, lookupName)
    || (idCandidate ? formatPartyFromIdentifier(idCandidate) : null)
    || 'Key Account';

  return {
    resolvedName: toProfessionalPartyText(resolvedName),
    idCandidate,
    emailCandidate: emailCandidate || lookupRecord?.email || null,
    phoneCandidate: phoneCandidate || lookupRecord?.phone || null,
    addressCandidate: lookupRecord?.address || null,
  };
};

const mergeClientRecord = (current = {}, incoming = {}) => {
  const currentPurchase = toNum(current.total_purchase, 0);
  const incomingPurchase = toNum(incoming.total_purchase, 0);

  const mergedCustomerName = pickBestClientName(incoming.customer_name, current.customer_name);
  const mergedCompany = pickBestClientName(incoming.company, current.company);

  return {
    ...current,
    ...incoming,
    customer_id: incoming.customer_id || current.customer_id,
    customer_name: mergedCustomerName ? toProfessionalPartyText(mergedCustomerName) : toProfessionalPartyText(current.customer_name || incoming.customer_name),
    company: mergedCompany ? toProfessionalPartyText(mergedCompany) : toProfessionalPartyText(current.company || incoming.company),
    email: incoming.email || current.email || null,
    phone: incoming.phone || current.phone || null,
    address: incoming.address || current.address || null,
    last_order_date: incoming.last_order_date || current.last_order_date || null,
    total_purchase: Math.max(currentPurchase, incomingPurchase),
    frequency: Math.max(toNum(current.frequency, 0), toNum(incoming.frequency, 0)),
    risk: incoming.risk || incoming.risk_level || current.risk || 'ACTIVE',
    intensity_level: incoming.intensity_level || current.intensity_level || 'HEALTHY',
    intensity_label: incoming.intensity_label || current.intensity_label || 'ACTIVE',
    reason: incoming.reason || current.reason || 'Customer profile from analysis',
    monthly_trend: incoming.monthly_trend || current.monthly_trend || 'up',
    monthly_breakdown: Array.isArray(current.monthly_breakdown)
      ? current.monthly_breakdown
      : (Array.isArray(incoming.monthly_breakdown) ? incoming.monthly_breakdown : []),
  };
};

const normalizeNameIdentityKey = (value) => {
  const normalized = toProfessionalPartyText(value || '');
  if (!isMeaningfulClientName(normalized)) return '';
  return normalized.toLowerCase().replace(/[^a-z0-9]/g, '');
};

const getCustomerIdentitySignals = (client = {}) => {
  const idRaw = String(
    client.party_id
    || client.party_code
    || client.customer_id
    || client.account_id
    || ''
  ).trim();
  const id = isMeaningfulIdentifier(idRaw) ? idRaw.toLowerCase() : '';
  const email = String(client.email || '').trim().toLowerCase();
  const phone = normalizePhoneKey(client.phone);

  return {
    id,
    email: email || '',
    phone: phone || '',
    name: normalizeNameIdentityKey(client.customer_name || client.company || ''),
  };
};

const isStableIdentityId = (id = '', nameKey = '') => {
  const raw = String(id || '').trim();
  if (!raw) return false;

  const compact = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!compact) return false;

  // IDs that are effectively the same as the name are weak (not a separate identity proof).
  if (nameKey && compact === nameKey) return false;

   // Name-prefixed IDs with long numeric suffix are usually generated refs, not customer master IDs.
  if (nameKey && compact.startsWith(nameKey)) {
    const suffix = compact.slice(nameKey.length);
    if (!suffix) return false;
    if (/^\d{6,}$/.test(suffix)) return false;
    if (/^20\d{4,}$/.test(suffix)) return false;
  }

  // IDs embedding date-like chunks are weak identity in this domain.
  if (/20\d{2}(0[1-9]|1[0-2])([0-2][0-9]|3[01])/.test(compact)) return false;

  // Long numeric/date-like IDs are often transaction refs, not stable customer identity.
  if (/^\d{8,}$/.test(compact)) return false;
  if (/^20\d{6,}$/.test(compact)) return false;

  return true;
};

const hasStrongIdentitySignal = (signals = {}) => Boolean(
  isStableIdentityId(signals.id, signals.name) || signals.email || signals.phone
);

const hasIdentityOverlap = (left = {}, right = {}) => {
  if (
    isStableIdentityId(left.id, left.name)
    && isStableIdentityId(right.id, right.name)
    && left.id === right.id
  ) return true;
  if (left.email && right.email && left.email === right.email) return true;
  if (left.phone && right.phone && left.phone === right.phone) return true;
  return false;
};

const shouldMergeCustomerCards = (leftClient = {}, rightClient = {}) => {
  const left = getCustomerIdentitySignals(leftClient);
  const right = getCustomerIdentitySignals(rightClient);

  if (hasIdentityOverlap(left, right)) return true;

  if (!left.name || !right.name || left.name !== right.name) return false;
  if (left.name === 'keyaccount' || right.name === 'keyaccount') return false;

  const leftStrong = hasStrongIdentitySignal(left);
  const rightStrong = hasStrongIdentitySignal(right);

  // If both rows have different strong identities, keep them separate even with same name.
  if (leftStrong && rightStrong) return false;

  // Same normalized name and one side missing strong identity is likely duplicate projection of same customer.
  return true;
};

const dedupeCustomerCards = (rows = []) => {
  const out = [];

  rows.forEach((row) => {
    const idx = out.findIndex((existing) => shouldMergeCustomerCards(existing, row));
    if (idx >= 0) {
      out[idx] = mergeClientRecord(out[idx], row);
    } else {
      out.push(row);
    }
  });

  return out;
};

const getClientBuyerIdentity = (client = {}) => {
  const displayName = getClientName(client);
  const idCandidate = String(
    client.party_id
    || client.party_code
    || client.customer_id
    || client.account_id
    || ''
  ).trim();

  if (isMeaningfulIdentifier(idCandidate) && !/^party\s+/i.test(displayName)) {
    return `${displayName} (${toProfessionalPartyText(idCandidate)})`;
  }

  return displayName;
};

const buildCustomerLookupFromRows = (rows = []) => {
  const byId = new Map();
  const byEmail = new Map();
  const byPhone = new Map();
  const byName = new Map();

  rows.forEach((row) => {
    const name = pickPreferredNameFromRow(row);
    const id = pickFromRow(row, CUSTOMER_ID_KEYS);
    const email = pickFromRow(row, EMAIL_KEYS);
    const phone = pickFromRow(row, PHONE_KEYS);
    const address = pickFromRow(row, ADDRESS_KEYS);
    const partyRaw = getRowValue(row, 'party');
    const partyIdFallback = (isIdLikePartyName(partyRaw) || /^\d+$/.test(String(partyRaw || '').trim()))
      ? cleanClientIdentifier(partyRaw)
      : '';
    const idCandidate = id || partyIdFallback;

    if (isMeaningfulClientName(name)) {
      const formattedName = toProfessionalPartyText(String(name).trim());

      const record = {
        formattedName,
        email: email ? String(email).trim() : null,
        phone: phone ? String(phone).trim() : null,
        address: address ? String(address).trim() : null,
      };

      const nameKey = formattedName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (nameKey) {
        const existingByName = byName.get(nameKey);
        byName.set(nameKey, {
          ...existingByName,
          formattedName,
          email: existingByName?.email || record.email || null,
          phone: existingByName?.phone || record.phone || null,
          address: existingByName?.address || record.address || null,
        });
      }

      if (idCandidate) byId.set(String(idCandidate).trim().toLowerCase(), record);
      if (email) byEmail.set(String(email).trim().toLowerCase(), record);
      if (phone) byPhone.set(String(phone).replace(/\D/g, ''), record);
    }
  });

  return { byId, byEmail, byPhone, byName };
};

const pickBestSnapshot = (...sources) => {
  const ranked = sources
    .filter(Boolean)
    .map((source) => {
      let score = 0;
      if (hasCustomerPayload(source)) score += 10;
      if (hasPopulatedStockIn(source)) score += 20;
      const analysis = source.analysis || source?.payload?.analysis || source;
      if (analysis?.analysis_isolation?.session_id) score += 2;
      return { source, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked.length > 0 ? ranked[0].source : null;
};

const ClientRecords = () => {
  const { analysis } = useAnalysis();
  const [cachedAnalysis, setCachedAnalysis] = useState(null);
  const [remoteAnalysis, setRemoteAnalysis] = useState(null);
  const [remoteChecked, setRemoteChecked] = useState(false);
  const [selectedClientForModal, setSelectedClientForModal] = useState(null);

  useEffect(() => {
    if (!analysis || typeof analysis !== 'object') return;
    const hasPayload = Boolean(
      (Array.isArray(analysis.customers) && analysis.customers.length)
      || (Array.isArray(analysis.customer_analysis) && analysis.customer_analysis.length)
      || (Array.isArray(analysis.products) && analysis.products.length)
      || (Array.isArray(analysis.products_analysis) && analysis.products_analysis.length)
    );
    if (hasPayload) {
      setCachedAnalysis(analysis);
    }
  }, [analysis]);

  const analysisSnapshot = useMemo(() => {
    let localSnapshot = null;
    try {
      const raw = localStorage.getItem(LAST_ANALYSIS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        localSnapshot = parsed?.analysis ?? parsed?.payload?.analysis ?? parsed;
      }
    } catch {
      localSnapshot = null;
    }

    return pickBestSnapshot(analysis, cachedAnalysis, remoteAnalysis, localSnapshot);
  }, [analysis, cachedAnalysis, remoteAnalysis]);

  const resolvedAnalysis = useMemo(() => {
    return analysisSnapshot?.analysis ?? analysisSnapshot?.payload?.analysis ?? analysisSnapshot ?? {};
  }, [analysisSnapshot]);

  useEffect(() => {
    if (remoteChecked) return;
    if (analysisSnapshot && hasCustomerPayload(analysisSnapshot)) {
      setRemoteChecked(true);
      return;
    }
    let cancelled = false;
    const fetchRemote = async () => {
      try {
        const res = await api.get('/ingestion/latest-analysis/');
        if (cancelled) return;
        const payload = res?.data;
        if (payload && hasCustomerPayload(payload)) {
          setRemoteAnalysis(payload);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setRemoteChecked(true);
      }
    };
    fetchRemote();
    return () => {
      cancelled = true;
    };
  }, [analysisSnapshot, remoteChecked]);

  const customers = useMemo(() => {
    const base = resolvedAnalysis;
    const directCustomers = Array.isArray(base?.customers) ? base.customers : [];
    let rawCustomers = [];
    if (directCustomers.length) rawCustomers = [...directCustomers];

    const customerAnalysis = Array.isArray(base?.customer_analysis)
      ? base.customer_analysis
      : Array.isArray(base?.customer_analysis?.customers)
        ? base.customer_analysis.customers
        : [];
    if (customerAnalysis.length) {
      rawCustomers = [...rawCustomers, ...buildCustomersFromCustomerAnalysis(customerAnalysis)];
    }

    const products = Array.isArray(base?.products)
      ? base.products
      : Array.isArray(base?.products_analysis)
        ? base.products_analysis
        : [];
    if (products.length) {
      rawCustomers = [...rawCustomers, ...buildCustomersFromProducts(products)];
    }

    const previews = Array.isArray(base?.metadata?.sheet_previews)
      ? base.metadata.sheet_previews
      : [];
    if (previews.length) {
      const previewCustomers = buildCustomersFromSheetPreviews(previews);
      if (previewCustomers.length) rawCustomers = [...rawCustomers, ...previewCustomers];
    }

    const previewRows = Array.isArray(analysisSnapshot?.preview_rows)
      ? analysisSnapshot.preview_rows
      : [];
    if (previewRows.length) {
      const previewCustomers = buildCustomersFromPreviewRows(previewRows);
      if (previewCustomers.length) rawCustomers = [...rawCustomers, ...previewCustomers];
    }

    const previewRowsFromSheets = previews.flatMap((p) => (Array.isArray(p?.rows) ? p.rows : []));
    const lookup = buildCustomerLookupFromRows([...previewRowsFromSheets, ...previewRows]);

    const mergedMap = new Map();
    rawCustomers.forEach((client, idx) => {
      const identity = resolveClientIdentity(client, lookup);

      const identityKey = [
        identity.idCandidate ? `id:${identity.idCandidate.toLowerCase()}` : '',
        identity.emailCandidate ? `mail:${identity.emailCandidate.toLowerCase()}` : '',
        identity.phoneCandidate ? `phone:${normalizePhoneKey(identity.phoneCandidate)}` : '',
        identity.resolvedName && identity.resolvedName !== 'Key Account' ? `name:${identity.resolvedName.toLowerCase()}` : '',
      ].find(Boolean) || `fallback:${idx}`;

      const normalized = {
        ...client,
        id: client.id || idx + 1,
        customer_id: identity.idCandidate || client.customer_id || '',
        customer_name: identity.resolvedName,
        company: isMeaningfulClientName(client.company) ? client.company : identity.resolvedName,
        email: identity.emailCandidate || client.email || null,
        phone: identity.phoneCandidate || client.phone || null,
        address: client.address || pickFromRow(client, ADDRESS_KEYS) || identity.addressCandidate || null,
      };

      const existing = mergedMap.get(identityKey);
      mergedMap.set(identityKey, mergeClientRecord(existing, normalized));
    });

    const mergedCustomers = dedupeCustomerCards(Array.from(mergedMap.values()))
      .filter((c) => c && (isMeaningfulClientName(c.customer_name) || c.customer_id || c.email || c.phone));

    const peerCurrents = mergedCustomers.map((c) => getMonthlyAmountPair(c).current);
    return mergedCustomers
      .map((c) => ({
        ...c,
        status_split: getStatusSplit(c, peerCurrents),
      }))
      .sort((a, b) => toNum(b.total_purchase, 0) - toNum(a.total_purchase, 0));
  }, [resolvedAnalysis, analysisSnapshot]);
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const tabCounts = useMemo(() => {
    return customers.reduce((acc, client) => {
      const category = deriveWatchCategory(client);
      acc.ALL += 1;
      acc[category] += 1;
      return acc;
    }, { ALL: 0, STOPPED: 0, LESS: 0, GOOD: 0 });
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return customers.filter((client) => {
      const category = deriveWatchCategory(client);
      if (activeTab !== 'ALL' && category !== activeTab) return false;
      if (!term) return true;
      const haystack = [
        getClientName(client),
        client.customer_id,
        client.customer_name,
        client.email,
        client.phone,
        client.address,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [customers, activeTab, searchTerm]);

  const tabs = [
    { id: 'ALL', label: 'All Customers' },
    { id: 'STOPPED', label: 'Stopped Buying' },
    { id: 'LESS', label: 'Buying Less' },
    { id: 'GOOD', label: 'Good / New' },
  ];

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Customer Watch List</h1>
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] mt-1.5">
            Customers who may need your attention based on buying patterns
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Stopped Buying', count: tabCounts.STOPPED, icon: TrendingDown, color: 'text-rose-500' },
            { label: 'Buying Less', count: tabCounts.LESS, icon: Minus, color: 'text-amber-500' },
            { label: 'Good / New', count: tabCounts.GOOD, icon: TrendingUp, color: 'text-emerald-500' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-slate-200/60 dark:border-white/10 bg-white dark:bg-slate-900/40 px-4 py-3 text-center shadow-sm">
              <stat.icon size={16} className={`${stat.color} mx-auto mb-1`} />
              <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{stat.count}</p>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      <GlassCard className="!p-0 !border-slate-200/60 dark:!border-white/10 !bg-white dark:!bg-slate-900/40 overflow-hidden shadow-2xl">
        <div className="px-6 py-5 border-b border-slate-200/40 dark:border-white/10 bg-gradient-to-r from-rose-50/50 dark:from-rose-500/5 to-transparent">
          <div className="flex flex-wrap gap-3">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.18em] border transition-all ${activeTab === tab.id
                  ? 'bg-rose-500 text-white border-rose-500 shadow-lg'
                  : 'bg-white/70 dark:bg-white/5 text-slate-500 border-slate-200/60 dark:border-white/10 hover:border-rose-200'}
                `}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 border-b border-slate-200/40 dark:border-white/10 bg-white/60 dark:bg-slate-900/30">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white dark:bg-slate-900 px-4 py-3 shadow-sm">
            <Search size={16} className="text-slate-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, email, phone, or address..."
              className="flex-1 bg-transparent text-sm font-semibold text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none"
            />
            <span className="text-[10px] font-bold text-slate-400">{filteredCustomers.length} total</span>
          </div>
        </div>

        <div className="p-8">
          {filteredCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-slate-200/60 dark:border-white/10 rounded-[32px] bg-slate-50/50 dark:bg-white/5">
              <div className="p-5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-5 shadow-lg shadow-emerald-500/10">
                <ShieldCheck size={40} className="text-emerald-500" />
              </div>
              <p className="text-[12px] font-black uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300">
                {searchTerm ? 'No customers match your search' : 'No customers in this category'}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">All customers in this group are doing well right now.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCustomers.map((client, index) => {
                const level = String(client.intensity_level || '').toUpperCase();
                const statusSplit = client.status_split || getStatusSplit(client, customers.map((c) => toNum(c?.status_split?.currentPurchase, 0)));
                const hasMixedBehavior = isMixedBehaviorClient(client, statusSplit);
                const behavior = resolveCustomerBehavior(client, { hasMixedBehavior });
                const behaviorMeta = getCustomerBehaviorMeta(behavior);
                const category = toWatchCategory(behavior);
                const primaryMetric = getPrimaryStatusMetric(category, statusSplit);
                const displayIntensityLabel = behaviorMeta.label;
                const theme = behaviorMeta.theme;

                return (
                  <motion.div
                    key={`${client.customer_id || client.name || 'client'}-${index}`}
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className={`p-5 rounded-3xl ${theme.bg} border ${theme.border} hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 group relative overflow-hidden backdrop-blur-sm`}
                  >
                    <div className={`absolute top-0 left-0 bottom-0 w-1.5 bg-gradient-to-b ${theme.accent} opacity-70`} />
                    <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-white/50 to-transparent dark:from-white/10 pointer-events-none" />
                    <div className="absolute -right-12 -top-12 w-32 h-32 rounded-full bg-white/40 dark:bg-white/5 blur-2xl pointer-events-none" />

                    <div className="flex justify-between items-start gap-3 mb-4 relative z-10">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={`w-11 h-11 rounded-xl bg-white/80 dark:bg-slate-900/60 border ${theme.border} flex items-center justify-center shadow-sm`}>
                          <Users size={18} className={theme.text} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-[14px] font-black text-slate-900 dark:text-white truncate uppercase tracking-tight leading-none group-hover:text-blue-500 transition-colors">
                            {getClientName(client)}
                          </h3>
                          <div className="flex items-center gap-2 mt-2">
                            <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${theme.accent} animate-pulse`} />
                            <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest truncate">
                              Buyer: {getClientBuyerIdentity(client)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className={`shrink-0 bg-white/80 dark:bg-slate-900/60 ${theme.text} px-3 py-1 rounded-lg text-[8px] font-black uppercase border ${theme.border} shadow-sm group-hover:scale-105 transition-transform`}>
                          {displayIntensityLabel}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <div className="rounded-xl bg-white/85 dark:bg-slate-900/55 border border-slate-200/60 dark:border-white/10 px-3 py-2 text-center">
                        <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">Purchase</p>
                        <p className="text-[13px] font-black text-slate-900 dark:text-white mt-0.5">{formatCompact(client.total_purchase)}</p>
                      </div>
                      <div className="rounded-xl bg-white/85 dark:bg-slate-900/55 border border-slate-200/60 dark:border-white/10 px-3 py-2 text-center">
                        <p className={`text-[9px] font-black uppercase tracking-wide ${primaryMetric.labelText}`}>{primaryMetric.label}</p>
                        <p className={`text-[13px] font-black mt-0.5 ${primaryMetric.text}`}>{primaryMetric.value}%</p>
                      </div>
                    </div>

                    <div className="mb-4 rounded-xl bg-white/90 dark:bg-slate-900 border border-slate-200/60 dark:border-white/10 px-3 py-2 shadow-sm">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Who Purchased</p>
                      <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate mt-1">{getClientBuyerIdentity(client)}</p>
                      <p className="text-[10px] text-slate-500 mt-1">Last Purchase: {formatDateShort(client.last_order_date)}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-5 px-1">
                      <div className={`flex flex-col p-3 rounded-xl bg-white/90 dark:bg-slate-900 border border-slate-200/60 dark:border-white/10 ${theme.panelHover} transition-colors shadow-sm min-h-[74px]`}>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><Mail size={12} className="text-blue-500" /> Email</span>
                        <span className="text-[11px] text-slate-700 dark:text-slate-300 font-bold truncate group-hover:text-blue-600 transition-colors">{client.email || '-'}</span>
                      </div>
                      <div className={`flex flex-col p-3 rounded-xl bg-white/90 dark:bg-slate-900 border border-slate-200/60 dark:border-white/10 ${theme.panelHover} transition-colors shadow-sm min-h-[74px]`}>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><Phone size={12} className="text-emerald-500" /> Phone</span>
                        <span className="text-[11px] text-slate-700 dark:text-slate-300 font-bold truncate group-hover:text-emerald-600 transition-colors">{client.phone || '-'}</span>
                      </div>
                      <div className={`col-span-2 flex flex-col p-3 rounded-xl bg-white/90 dark:bg-slate-900 border border-slate-200/60 dark:border-white/10 ${theme.panelHover} transition-colors shadow-sm min-h-[74px]`}>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><MapPin size={12} className="text-amber-500" /> Address</span>
                        <span className="text-[11px] text-slate-700 dark:text-slate-300 font-bold truncate group-hover:text-amber-600 transition-colors">{client.address || '-'}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedClientForModal(client)}
                      className={`w-full py-3 rounded-2xl bg-gradient-to-r ${theme.action} text-white text-[10px] font-black uppercase tracking-[0.18em] flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-slate-900/10`}
                    >
                      Open Client Intelligence
                      <ArrowUpRight size={14} />
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </GlassCard>

      <ProductPurchaseModal
        isOpen={!!selectedClientForModal}
        onClose={() => setSelectedClientForModal(null)}
        client={selectedClientForModal}
        analysisData={resolvedAnalysis}
      />
    </div>
  );
};

export default ClientRecords;

