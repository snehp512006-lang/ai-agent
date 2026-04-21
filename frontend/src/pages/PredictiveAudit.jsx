import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
   History,
   Search,
   TrendingUp,
   AlertCircle,
   AlertTriangle,
   Package,
   Zap,
   ArrowRight,
   Calendar,
   CheckCircle2,
   Download,
   Share2,
   TrendingDown,
   ChevronDown,
   ChevronUp,
   FileSpreadsheet,
   Wrench,
   X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../api/client';
import GlassCard from '../components/GlassCard';
import PredictionChart from '../components/PredictionChart';
import { useAnalysis } from '../context/analysisContext';
import { useTheme } from '../context/ThemeContext';

const statusClassMap = {
   'PENDING': 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
   'IN_PROGRESS': 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
   'COMPLETED': 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
};

const priorityClassMap = {
   'HIGH': 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
   'MEDIUM': 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
   'LOW': 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
};

const timeframeClassMap = {
   'IMMEDIATE': 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
   'SHORT_TERM': 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
   'LONG_TERM': 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
};

const typeConfig = {
   'ALERT': { icon: AlertTriangle, color: 'text-rose-400' },
   'RISK': { icon: AlertCircle, color: 'text-amber-400' },
   'FORECAST': { icon: TrendingUp, color: 'text-blue-400' },
   'OPTIMIZATION': { icon: Wrench, color: 'text-emerald-400' },
   'INGESTION': { icon: FileSpreadsheet, color: 'text-cyan-400' },
};

const STOCK_RISK_CONFIG = {
   OUT_OF_STOCK: { label: 'Out of Stock', className: 'badge-critical', icon: AlertCircle, color: '#ef4444' },
   LOW_STOCK: { label: 'Low Stock', className: 'badge-amber', icon: TrendingDown, color: '#f59e0b' },
   DEADSTOCK: { label: 'Deadstock', className: 'badge-purple', icon: Package, color: '#6366f1' },
   OVERSTOCK: { label: 'Overstock', className: 'badge-purple', icon: Package, color: '#a855f7' },
   HEALTHY: { label: 'Healthy', className: 'badge-emerald', icon: CheckCircle2, color: '#10b981' },
};

const STOCK_RISK_THEME_DARK = {
   OUT_OF_STOCK: {
      card: 'border-rose-500/25 bg-gradient-to-br from-rose-500/10 via-[var(--bg-card)] to-[var(--bg-card)]',
      planWrap: 'border-rose-500/25 bg-rose-500/10',
      label: 'text-rose-300',
      valuePrimary: 'text-rose-100',
      valueSecondary: 'text-rose-200',
      valueTertiary: 'text-rose-200',
      tile: 'border-rose-400/30 bg-rose-950/35',
   },
   LOW_STOCK: {
      card: 'border-amber-500/25 bg-gradient-to-br from-amber-500/10 via-[var(--bg-card)] to-[var(--bg-card)]',
      planWrap: 'border-amber-500/25 bg-amber-500/10',
      label: 'text-amber-300',
      valuePrimary: 'text-amber-100',
      valueSecondary: 'text-amber-200',
      valueTertiary: 'text-amber-200',
      tile: 'border-amber-400/30 bg-amber-950/35',
   },
   OVERSTOCK: {
      card: 'border-violet-500/25 bg-gradient-to-br from-violet-500/10 via-[var(--bg-card)] to-[var(--bg-card)]',
      planWrap: 'border-violet-500/25 bg-violet-500/10',
      label: 'text-violet-300',
      valuePrimary: 'text-violet-100',
      valueSecondary: 'text-violet-200',
      valueTertiary: 'text-violet-200',
      tile: 'border-violet-400/30 bg-violet-950/35',
   },
   DEADSTOCK: {
      card: 'border-indigo-500/25 bg-gradient-to-br from-indigo-500/10 via-[var(--bg-card)] to-[var(--bg-card)]',
      planWrap: 'border-indigo-500/25 bg-indigo-500/10',
      label: 'text-indigo-300',
      valuePrimary: 'text-indigo-100',
      valueSecondary: 'text-indigo-200',
      valueTertiary: 'text-indigo-200',
      tile: 'border-indigo-400/30 bg-indigo-950/35',
   },
   HEALTHY: {
      card: 'border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-[var(--bg-card)] to-[var(--bg-card)]',
      planWrap: 'border-emerald-500/25 bg-emerald-500/10',
      label: 'text-emerald-300',
      valuePrimary: 'text-emerald-100',
      valueSecondary: 'text-emerald-200',
      valueTertiary: 'text-emerald-200',
      tile: 'border-emerald-400/30 bg-emerald-950/35',
   },
};

const STOCK_RISK_THEME_LIGHT = {
   OUT_OF_STOCK: {
      card: 'border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-white',
      planWrap: 'border-rose-200 bg-rose-50',
      label: 'text-rose-600',
      valuePrimary: 'text-rose-700',
      valueSecondary: 'text-rose-600',
      valueTertiary: 'text-rose-600',
      tile: 'border-rose-200 bg-rose-100/70',
   },
   LOW_STOCK: {
      card: 'border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-white',
      planWrap: 'border-amber-200 bg-amber-50',
      label: 'text-amber-600',
      valuePrimary: 'text-amber-700',
      valueSecondary: 'text-amber-600',
      valueTertiary: 'text-amber-600',
      tile: 'border-amber-200 bg-amber-100/70',
   },
   OVERSTOCK: {
      card: 'border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-white',
      planWrap: 'border-violet-200 bg-violet-50',
      label: 'text-violet-600',
      valuePrimary: 'text-violet-700',
      valueSecondary: 'text-violet-600',
      valueTertiary: 'text-violet-600',
      tile: 'border-violet-200 bg-violet-100/70',
   },
   DEADSTOCK: {
      card: 'border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-white',
      planWrap: 'border-indigo-200 bg-indigo-50',
      label: 'text-indigo-600',
      valuePrimary: 'text-indigo-700',
      valueSecondary: 'text-indigo-600',
      valueTertiary: 'text-indigo-600',
      tile: 'border-indigo-200 bg-indigo-100/70',
   },
   HEALTHY: {
      card: 'border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-white',
      planWrap: 'border-emerald-200 bg-emerald-50',
      label: 'text-emerald-600',
      valuePrimary: 'text-emerald-700',
      valueSecondary: 'text-emerald-600',
      valueTertiary: 'text-emerald-600',
      tile: 'border-emerald-200 bg-emerald-100/70',
   },
};

const toTitle = (raw) => String(raw || '').replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (s) => s.toUpperCase());

const normalizeRiskLabel = (value) => {
   const raw = String(value || '').toUpperCase();
   if (raw.includes('OUT')) return 'OUT OF STOCK';
   if (raw.includes('LOW')) return 'LOW STOCK';
   if (raw.includes('OVER')) return 'OVERSTOCK';
   if (raw.includes('DEAD') || raw.includes('NOT SELLING')) return 'DEADSTOCK';
   if (raw.includes('HEALTHY')) return 'HEALTHY';
   return raw;
};

const normalizeStockRisk = (risk) => {
   const raw = String(risk || '').toUpperCase();
   if (raw.includes('OUT')) return 'OUT_OF_STOCK';
   if (raw.includes('LOW') || raw.includes('UNDER')) return 'LOW_STOCK';
   if (raw.includes('DEAD') || raw.includes('NOT SELLING')) return 'DEADSTOCK';
   if (raw.includes('OVER') || raw.includes('TOO MUCH')) return 'OVERSTOCK';
   if (raw.includes('HEALTHY') || raw.includes('NORMAL') || raw.includes('OK')) return 'HEALTHY';
   return 'HEALTHY';
};

const mapStockProducts = (analysis) => {
   const items = Array.isArray(analysis?.products) ? analysis.products : [];
   return items.map((p, idx) => ({
      id: p?.id ?? idx + 1,
      sku: String(p?.sku || p?.code || p?.product_id || p?.id || p?.name || `P-${idx + 1}`),
      name: p?.name || 'Data not available',
      category: p?.category || 'General',
      on_hand: Number(p?.stock ?? p?.current_stock ?? 0),
      reorder: Number(p?.reorder_point ?? p?.safety_stock ?? p?.reorder ?? 0),
      max: Number(p?.max_stock ?? 0),
      risk: normalizeStockRisk(p?.risk),
      days_to_stock: Number.isFinite(Number(p?.days_to_stockout)) ? Number(p?.days_to_stockout) : null,
   }));
};

const getStockActionPlan = (prod) => {
   const onHand = Number(prod.on_hand || 0);
   const reorderPoint = Number(prod.reorder || 0);
   const configuredMax = Number(prod.max || 0);
   const effectiveMax = configuredMax > 0 ? configuredMax : Math.max(reorderPoint * 2, reorderPoint + 20, 40);
   const daysToStockout = Number.isFinite(Number(prod.days_to_stock)) ? Number(prod.days_to_stock) : null;

   if (prod.risk === 'OUT_OF_STOCK' || prod.risk === 'LOW_STOCK') {
      const deficit = Math.max(reorderPoint - onHand, 0);
      const safetyBuffer = Math.max(Math.ceil(reorderPoint * 0.25), 5);
      const requiredQty = Math.max(deficit + safetyBuffer, 5);
      const actionWindow = prod.risk === 'OUT_OF_STOCK'
         ? 'Within 24 hours'
         : (daysToStockout === null
            ? 'Within 3 to 5 days'
            : (daysToStockout <= 3 ? 'Within 48 hours' : `Within ${Math.max(2, Math.ceil(daysToStockout - 1))} days`));

      return {
         summary: prod.risk === 'OUT_OF_STOCK'
            ? 'Critical shortage detected. Immediate replenishment is required to protect sales continuity.'
            : 'Inventory is trending low. Replenish now to avoid entering stockout state.',
         line1Label: 'Required Restock',
         line1Value: `${requiredQty} units`,
         line2Label: 'Recommended Timeline',
         line2Value: actionWindow,
         line3Label: 'Pricing Action',
         line3Value: 'No discount required',
      };
   }

   if (prod.risk === 'OVERSTOCK') {
      const excessUnits = Math.max(onHand - effectiveMax, 0);
      const excessRatio = effectiveMax > 0 ? excessUnits / effectiveMax : 0;
      const discountPct = excessRatio >= 0.5 ? 18 : excessRatio >= 0.25 ? 12 : 8;

      return {
         summary: 'Excess inventory is increasing holding cost. Controlled sell-through is recommended.',
         line1Label: 'Excess Inventory',
         line1Value: `${excessUnits} units`,
         line2Label: 'Clearance Timeline',
         line2Value: 'Within 10 to 14 days',
         line3Label: 'Suggested Price Decrease',
         line3Value: `${discountPct}% discount`,
      };
   }

   if (prod.risk === 'DEADSTOCK') {
      const liquidationUnits = Math.max(Math.ceil(onHand * 0.4), 1);
      return {
         summary: 'This SKU has stalled movement. Promote aggressively or bundle to release blocked capital.',
         line1Label: 'Target Units to Liquidate',
         line1Value: `${liquidationUnits} units`,
         line2Label: 'Promotion Timeline',
         line2Value: 'Within 14 days',
         line3Label: 'Suggested Price Decrease',
         line3Value: '20% discount',
      };
   }

   return {
      summary: 'Stock position is healthy. Maintain current replenishment rhythm and monitor demand variance weekly.',
      line1Label: 'Required Action',
      line1Value: 'No immediate action',
      line2Label: 'Review Cadence',
      line2Value: 'Weekly monitoring',
      line3Label: 'Pricing Action',
      line3Value: 'Keep current pricing',
   };
};

const formatUnits = (n) => {
   const v = Number(n || 0);
   return Number.isFinite(v) ? Math.round(v) : 0;
};

const buildProductAction = (product, risk) => {
   const name = String(product?.name || 'Unknown SKU');
   const sku = String(product?.sku || product?.code || product?.product_id || product?.id || '').trim();
   const label = sku ? `${name} (${sku})` : name;
   const sales = formatUnits(product?.sales_velocity);
   const stock = formatUnits(product?.current_stock);

   if (risk === 'OUT OF STOCK') {
      return `${label}: Increase procurement immediately (target +30%) and prioritize supplier dispatch; current stock ${stock}, sales velocity ${sales}.`;
   }
   if (risk === 'LOW STOCK') {
      return `${label}: Increase reorder quantity by 15-20% this cycle; current stock ${stock}, sales velocity ${sales}.`;
   }
   if (risk === 'OVERSTOCK') {
      return `${label}: Do not increase purchase next cycle; apply 10-20% markdown to improve sell-through (stock ${stock}, velocity ${sales}).`;
   }
   if (risk === 'DEADSTOCK') {
      return `${label}: Stop new procurement and run aggressive liquidation (25-40% discount / bundle clearance).`;
   }
   return `${label}: Monitor weekly and keep procurement aligned to demand.`;
};

const buildTasksFromAnalysis = (analysis) => {
   if (!analysis) return [];

   const stock = analysis.stock_analysis || {};
   const products = Array.isArray(analysis.products) ? analysis.products : [];
   const recommendations = Array.isArray(analysis.recommendations) ? analysis.recommendations : [];
   const alerts = Array.isArray(analysis.alerts) ? analysis.alerts : [];
   const forecast = Array.isArray(analysis.demand_forecast) ? analysis.demand_forecast : [];
   const confidenceBase = Math.max(50, Math.min(99, Number(analysis.confidence_score || 80)));

   const productsByRisk = products.reduce((acc, p) => {
      const label = normalizeRiskLabel(p?.risk);
      if (!acc[label]) acc[label] = [];
      acc[label].push(p);
      return acc;
   }, {});

   const topRiskProducts = (riskLabel, limit = 8) => {
      const arr = Array.isArray(productsByRisk[riskLabel]) ? productsByRisk[riskLabel] : [];
      return arr
         .slice()
         .sort((a, b) => Number(b?.sales_velocity || 0) - Number(a?.sales_velocity || 0))
         .slice(0, limit)
         .map((p) => buildProductAction(p, riskLabel));
   };

   const candidates = [];
   const pushTask = (task) => {
      if (!task?.title) return;
      candidates.push({
         ...task,
         id: `${task.type}-${task.title}`,
         confidence: Math.max(45, Math.min(99, Number(task.confidence || confidenceBase))),
      });
   };

   const outOfStock = Number(stock.out_of_stock_items || 0);
   const lowStock = Number(stock.low_stock_items || 0);
   const deadstock = Number(stock.deadstock_items || 0);
   const overstock = Number(stock.overstock_items || 0);
   const healthy = Number(stock.healthy_items || 0);

   if (outOfStock > 0) {
      pushTask({
         title: `Low Stock Risk Detected in ${outOfStock} SKU${outOfStock > 1 ? 's' : ''}`,
         type: 'RISK',
         priority: 'HIGH',
         status: 'PENDING',
         timeframe: 'IMMEDIATE',
         description: `${outOfStock} products are already out of stock and may impact fulfillment.`,
         action: 'Reorder critical SKUs today and rebalance existing inventory.',
         actionOptions: [
            'Raise emergency purchase orders for top-selling SKUs.',
            'Transfer available stock from low-demand locations.',
            'Enable substitute products to avoid lost sales while replenishing.'
         ],
         productActions: topRiskProducts('OUT OF STOCK'),
         confidence: confidenceBase,
      });
   }

   if (lowStock > 0) {
      pushTask({
         title: `Replenishment Needed for ${lowStock} Low-Stock Item${lowStock > 1 ? 's' : ''}`,
         type: 'ALERT',
         priority: lowStock > 10 ? 'HIGH' : 'MEDIUM',
         status: 'IN_PROGRESS',
         timeframe: 'SHORT_TERM',
         description: `${lowStock} items are approaching risk threshold based on current demand velocity.`,
         action: 'Raise purchase orders for the next 7 days and validate supplier lead times.',
         actionOptions: [
            'Create a 7-day replenishment plan using current run-rate.',
            'Increase reorder point for fast-moving SKUs by 10-15%.',
            'Lock supplier delivery slots for priority categories.'
         ],
         productActions: topRiskProducts('LOW STOCK'),
         confidence: confidenceBase - 2,
      });
   }

   if (deadstock > 0 || overstock > 0) {
      const total = deadstock + overstock;
      pushTask({
         title: `Overstock Identified in ${total} Product Line${total > 1 ? 's' : ''}`,
         type: 'OPTIMIZATION',
         priority: total > 8 ? 'MEDIUM' : 'LOW',
         status: 'PENDING',
         timeframe: 'SHORT_TERM',
         description: `${deadstock} deadstock and ${overstock} overstock items are tying up working capital.`,
         action: 'Run discount and bundling campaigns to clear excess inventory this week.',
         actionOptions: [
            'Pause new purchase orders for overstocked SKUs until sell-through improves.',
            'Run tiered markdowns (10-25%) based on ageing bucket.',
            'Bundle slow movers with fast sellers to improve liquidation.',
            'Push inventory through secondary channels or B2B clearance.',
            'Reduce next cycle procurement quantity using adjusted demand baseline.'
         ],
         productActions: [
            ...topRiskProducts('OVERSTOCK', 5),
            ...topRiskProducts('DEADSTOCK', 5),
         ],
         confidence: confidenceBase - 3,
      });
   }

   if (forecast.length > 0) {
      const predictedTotal = forecast.reduce((sum, item) => sum + Number(item?.predicted_demand || 0), 0);
      const avgForecast = predictedTotal / Math.max(1, forecast.length);
      pushTask({
         title: 'Demand Spike Predicted for Upcoming Cycle',
         type: 'FORECAST',
         priority: avgForecast > 0 ? 'MEDIUM' : 'LOW',
         status: 'PENDING',
         timeframe: 'LONG_TERM',
         description: `Forecast engine projects average demand near ${Math.round(avgForecast)} units over the next cycle.`,
         action: 'Increase production allocation by 15-20% for high-velocity SKUs.',
         actionOptions: [
            'Increase production plan by 15-20% for top demand SKUs.',
            'Secure raw material buffers before expected demand spike.',
            'Pre-position inventory in high-conversion regions.'
         ],
         productActions: forecast
            .slice(0, 5)
            .map((f) => `Forecast ${String(f?.date || f?.day || 'upcoming')}: plan capacity for predicted demand ${formatUnits(f?.predicted_demand)} units.`),
         confidence: confidenceBase - 1,
      });
   }

   alerts.slice(0, 5).forEach((alert, idx) => {
      pushTask({
         title: `${toTitle(alert.type || 'Risk')} Signal: ${alert.product || `Item ${idx + 1}`}`,
         type: 'RISK',
         priority: String(alert.type || '').toUpperCase() === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
         status: 'PENDING',
         timeframe: 'IMMEDIATE',
         description: alert.message || 'AI detected a business-critical exception in uploaded data.',
         action: 'Open SKU details, validate root cause, and apply corrective action immediately.',
         actionOptions: [
            'Validate root cause against latest stock, sales, and lead-time data.',
            'Assign owner and deadline for this alert within the current shift.',
            'Escalate critical items to operations manager for same-day closure.'
         ],
         confidence: confidenceBase - 2,
      });
   });

   recommendations.slice(0, 6).forEach((rec, idx) => {
      pushTask({
         title: `Optimization Insight ${idx + 1}`,
         type: idx % 2 === 0 ? 'OPTIMIZATION' : 'FORECAST',
         priority: 'LOW',
         status: 'PENDING',
         timeframe: idx < 2 ? 'SHORT_TERM' : 'LONG_TERM',
         description: rec,
         action: 'Review with operations manager and schedule execution in next planning cycle.',
         actionOptions: [
            'Validate impact with category-wise baseline metrics.',
            'Run a small pilot before full rollout.',
            'Track KPI lift for 7 days and promote if outcome is positive.'
         ],
         confidence: confidenceBase - 5,
      });
   });

   if (healthy > 0 && candidates.length === 0) {
      pushTask({
         title: 'System Optimized',
         type: 'OPTIMIZATION',
         priority: 'LOW',
         status: 'COMPLETED',
         timeframe: 'IMMEDIATE',
         description: `No active risks detected across ${healthy} healthy inventory records.`,
         action: 'Maintain current strategy and continue periodic monitoring.',
         actionOptions: [
            'Keep procurement and pricing policy unchanged this cycle.',
            'Continue weekly monitoring to catch early deviations.',
            'Document current strategy as benchmark playbook.'
         ],
         confidence: confidenceBase,
      });
   }

   const unique = new Map();
   candidates.forEach((task) => {
      if (!unique.has(task.id)) unique.set(task.id, task);
   });
   return Array.from(unique.values());
};

const toNumberSafe = (value, fallback = 0) => {
   if (value === null || value === undefined || value === '') return fallback;
   if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
   const normalized = String(value).replace(/,/g, '').trim();
   if (!normalized) return fallback;
   const parsed = Number(normalized);
   return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeHistoryRows = (rows = []) => {
   if (!Array.isArray(rows)) return [];

   return rows
      .map((row, idx) => {
         const id = Number(row?.upload_id ?? row?.id ?? row?.sheet_id ?? 0);
         const predicted = toNumberSafe(
            row?.predicted
            ?? row?.predicted_sales
            ?? row?.forecast_total
            ?? row?.processing_summary?.total_records
            ?? row?.processed_rows
            ?? row?.analysis?.forecast_summary?.total_predicted_demand
            ?? 0
         );
         const actual = toNumberSafe(
            row?.actual
            ?? row?.actual_sales
            ?? row?.sales_total
            ?? row?.analysis?.sales_summary?.sales_total
            ?? row?.analysis?.sales_summary?.total_sales
            ?? 0
         );
         const accuracy = toNumberSafe(
            row?.accuracy
            ?? row?.aggregate_accuracy
            ?? row?.analysis?.metadata?.confidence_score
            ?? row?.analysis?.confidence_score
            ?? 0
         );

         return {
            upload_id: Number.isFinite(id) && id > 0 ? id : idx + 1,
            id: Number.isFinite(id) && id > 0 ? id : idx + 1,
            sheet_name: row?.sheet_name || row?.file_name || row?.uploaded_sheet_name || `Sheet ${idx + 1}`,
            analysis_status: row?.analysis_status || row?.status || 'PENDING',
            status: row?.status || row?.analysis_status || 'Review Needed',
            timestamp: row?.timestamp || row?.completed_at || row?.updated_at || row?.created_at || null,
            completed_at: row?.completed_at || null,
            predicted: Number.isFinite(predicted) ? Math.round(predicted) : 0,
            actual: Number.isFinite(actual) ? Math.round(actual) : 0,
            accuracy: Number.isFinite(accuracy) ? accuracy : 0,
            insight: row?.insight || row?.recommendation || row?.summary || 'Tap to review detailed analysis for this upload.',
            analysis: row?.analysis || null,
         };
      })
      .sort((a, b) => {
         const aTime = new Date(a.timestamp || 0).getTime();
         const bTime = new Date(b.timestamp || 0).getTime();
         return bTime - aTime;
      });
};

const getHistoryId = (row) => {
   const id = Number(row?.upload_id ?? row?.id ?? row?.sheet_id ?? 0);
   return Number.isFinite(id) ? id : 0;
};

const getHistoryItemKey = (item) => {
   return item?.id ?? item?.upload_id ?? `${item?.sheet_name || 'sheet'}-${item?.timestamp || ''}`;
};

const pickValue = (primary, fallback) => {
   if (primary === null || primary === undefined || primary === '') return fallback;
   if (typeof primary === 'number' && Number.isFinite(primary) && primary === 0) {
      if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback !== 0) return fallback;
   }
   return primary;
};

const normalizeStatusLabel = (value) => String(value || '').toUpperCase();

const isInProgressStatus = (value) => {
   const status = normalizeStatusLabel(value);
   return ['PENDING', 'PROCESSING', 'MAPPED', 'REANALYSIS'].includes(status);
};

const sortHistoryRows = (rows = []) => {
   return rows
      .slice()
      .sort((a, b) => {
         const aTime = new Date(a.timestamp || 0).getTime();
         const bTime = new Date(b.timestamp || 0).getTime();
         return bTime - aTime;
      });
};

const buildSheetRowsFromAnalysis = (row) => {
   const summary = row?.analysis?.metadata?.sheet_analysis_summary || row?.analysis?.sheet_analysis || [];
   if (!Array.isArray(summary) || summary.length === 0) return [row];

   return summary.map((sheet, idx) => {
      const rawRows = Number(sheet?.raw_rows ?? 0);
      const normalizedRows = Number(sheet?.normalized_rows ?? 0);
      const ratio = rawRows > 0 ? (normalizedRows / rawRows) * 100 : 0;
      const sheetType = String(sheet?.sheet_type || sheet?.classification || 'SHEET').toUpperCase();
      const contributed = Boolean(sheet?.contributed_to_final_analysis);
      const statusLabel = contributed ? 'CONTRIBUTED' : sheetType;

      return {
         ...row,
         id: `${row.upload_id || row.id || idx}-${sheet?.sheet_name || idx}`,
         parent_sheet_name: row.sheet_name || row.file_name || row.uploaded_sheet_name || `Upload ${row.upload_id || row.id || idx}`,
         sheet_name: sheet?.sheet_name || row.sheet_name || `Sheet ${idx + 1}`,
         analysis_status: contributed ? 'COMPLETED' : 'PENDING',
         status: statusLabel,
         predicted: Number.isFinite(normalizedRows) ? Math.round(normalizedRows) : 0,
         actual: Number.isFinite(rawRows) ? Math.round(rawRows) : 0,
         accuracy: Number.isFinite(ratio) ? ratio : 0,
         insight: `Sheet type: ${sheetType}. Rows ${Math.round(rawRows)} raw, ${Math.round(normalizedRows)} normalized.`,
         card_type: 'SHEET',
         sheet_type: sheetType,
      };
   });
};

const mergeHistoryEntry = (current, next) => {
   if (!current) return next;
   if (!next) return current;
   return {
      ...current,
      ...next,
      sheet_name: pickValue(next.sheet_name, current.sheet_name),
      analysis_status: pickValue(next.analysis_status, current.analysis_status),
      status: pickValue(next.status, current.status),
      predicted: pickValue(next.predicted, current.predicted),
      actual: pickValue(next.actual, current.actual),
      accuracy: pickValue(next.accuracy, current.accuracy),
      insight: pickValue(next.insight, current.insight),
      timestamp: current.timestamp || next.timestamp,
      completed_at: current.completed_at || next.completed_at,
   };
};

const mergeHistoryLists = (prev = [], next = []) => {
   const map = new Map();
   prev.forEach((item) => {
      const key = getHistoryItemKey(item);
      map.set(key, item);
   });
   next.forEach((item) => {
      const key = getHistoryItemKey(item);
      map.set(key, item);
   });
   return sortHistoryRows(Array.from(map.values()));
};

const getHistoryItemDate = (item) => {
   const raw = item?.timestamp || item?.completed_at || item?.created_at || item?.updated_at || item?.date;
   if (!raw) return null;
   const parsed = new Date(raw);
   return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toDateKey = (date) => {
   if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
   const year = date.getFullYear();
   const month = String(date.getMonth() + 1).padStart(2, '0');
   const day = String(date.getDate()).padStart(2, '0');
   return `${year}-${month}-${day}`;
};

const PredictiveAudit = () => {
   const { selectedUploadId, pinUploadAnalysis, clearPinnedUploadAnalysis } = useAnalysis();
   const { theme } = useTheme();
   const isLight = theme === 'light';
  const [history, setHistory] = useState([]);
   const [summary, setSummary] = useState({
      aggregate_accuracy: 0,
      stability: 'Standard',
      recommendation: ''
   });
  const [loading, setLoading] = useState(true);
   const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
   const [selectedSheetAnalysis, setSelectedSheetAnalysis] = useState(null);
   const [sheetAnalysisLoading, setSheetAnalysisLoading] = useState(false);
   const [salesChartMode, setSalesChartMode] = useState('past');
   const [taskViewFilter, setTaskViewFilter] = useState('present');
   const [expandedTaskId, setExpandedTaskId] = useState(null);
   const [stockFilter, setStockFilter] = useState('ALL');
   const [actionNote, setActionNote] = useState('');
   const [historySearch, setHistorySearch] = useState('');
   const [historyDateFilter, setHistoryDateFilter] = useState('');
   const [historyMonthFilter, setHistoryMonthFilter] = useState('ALL');
   const [historyYearFilter, setHistoryYearFilter] = useState('ALL');
   const actionNoteTimerRef = useRef(null);
   const reportRef = useRef(null);
   const reportContentRef = useRef(null);
   const auditFetchInFlightRef = useRef(false);

   const historyYears = useMemo(() => {
      const yearSet = new Set();
      history.forEach((item) => {
         const parsed = getHistoryItemDate(item);
         if (!parsed) return;
         yearSet.add(parsed.getFullYear());
      });
      return Array.from(yearSet).sort((a, b) => b - a);
   }, [history]);

   const filteredHistory = useMemo(() => {
      const q = String(historySearch || '').trim().toLowerCase();
      const selectedMonth = historyMonthFilter === 'ALL' ? null : Number(historyMonthFilter);
      const selectedYear = historyYearFilter === 'ALL' ? null : Number(historyYearFilter);

      return history.filter((item) => {
         const parsedDate = getHistoryItemDate(item);

         if (historyDateFilter) {
            if (!parsedDate || toDateKey(parsedDate) !== historyDateFilter) {
               return false;
            }
         }

         if (selectedMonth !== null) {
            if (!parsedDate || (parsedDate.getMonth() + 1) !== selectedMonth) {
               return false;
            }
         }

         if (selectedYear !== null) {
            if (!parsedDate || parsedDate.getFullYear() !== selectedYear) {
               return false;
            }
         }

         if (q) {
            const haystack = [
               item?.sheet_name,
               item?.parent_sheet_name,
               item?.insight,
               item?.status,
               item?.analysis_status,
            ]
               .filter(Boolean)
               .join(' ')
               .toLowerCase();

            if (!haystack.includes(q)) {
               return false;
            }
         }

         return true;
      });
   }, [history, historySearch, historyDateFilter, historyMonthFilter, historyYearFilter]);

   const groupedHistory = useMemo(() => {
      const map = new Map();
      filteredHistory.forEach((item) => {
         const key = item.upload_id || item.id || item.parent_sheet_name || item.sheet_name;
         const existing = map.get(key) || {
            key,
            name: item.parent_sheet_name || item.sheet_name || `Upload ${key}`,
            latestTime: item.timestamp || item.completed_at || null,
            items: [],
         };
         existing.items.push(item);
         const timeValue = item.timestamp || item.completed_at || null;
         if (timeValue && (!existing.latestTime || new Date(timeValue) > new Date(existing.latestTime))) {
            existing.latestTime = timeValue;
         }
         map.set(key, existing);
      });
      return Array.from(map.values()).sort((a, b) => {
         const aTime = new Date(a.latestTime || 0).getTime();
         const bTime = new Date(b.latestTime || 0).getTime();
         return bTime - aTime;
      });
   }, [filteredHistory]);

   useEffect(() => {
      fetchAuditData();
   }, [selectedUploadId]);

   useEffect(() => {
      if (!selectedUploadId) {
         setSelectedSheetAnalysis(null);
         return;
      }
      loadSelectedSheetAnalysis(selectedUploadId);
   }, [selectedUploadId]);

   useEffect(() => {
      if (selectedHistoryItem) {
         setSalesChartMode('past');
         setTaskViewFilter('present');
         setExpandedTaskId(null);
         setStockFilter('ALL');
      }
   }, [selectedHistoryItem]);

   useEffect(() => {
      return () => {
         if (actionNoteTimerRef.current) {
            clearTimeout(actionNoteTimerRef.current);
         }
      };
   }, []);

   const flashActionNote = (message) => {
      if (actionNoteTimerRef.current) {
         clearTimeout(actionNoteTimerRef.current);
      }
      setActionNote(message);
      actionNoteTimerRef.current = setTimeout(() => {
         setActionNote('');
      }, 2500);
   };

   const sanitizeFileName = (value) => {
      return String(value || 'analysis_report')
         .replace(/[^a-zA-Z0-9-_]+/g, '_')
         .replace(/_+/g, '_')
         .replace(/^_+|_+$/g, '')
         .toLowerCase();
   };

      const escapeHtml = (value) => String(value ?? '')
         .replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;')
         .replace(/'/g, '&#39;');

   const buildExportPayload = () => {
      if (!selectedHistoryItem) return null;
      return {
         exported_at: new Date().toISOString(),
         sheet: {
            id: selectedHistoryItem.upload_id || selectedHistoryItem.id || null,
            name: selectedHistoryItem.sheet_name || 'Unknown Sheet',
            status: selectedHistoryItem.analysis_status || selectedHistoryItem.status || null,
            completed_at: selectedHistoryItem.completed_at || selectedHistoryItem.timestamp || null,
            predicted: selectedHistoryItem.predicted ?? null,
            actual: selectedHistoryItem.actual ?? null,
            accuracy: selectedHistoryItem.accuracy ?? null,
            insight: selectedHistoryItem.insight || null,
         },
         analysis: selectedSheetAnalysis || null,
      };
   };

   const copyToClipboard = async (text) => {
      if (navigator.clipboard?.writeText) {
         await navigator.clipboard.writeText(text);
         return;
      }

      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
   };

   const handleDownloadReport = async () => {
      const payload = buildExportPayload();
      if (!payload) return;

      flashActionNote('Preparing PDF...');

      try {
         const exportHost = document.createElement('div');
         exportHost.style.position = 'fixed';
         exportHost.style.left = '-10000px';
         exportHost.style.top = '0';
         exportHost.style.zIndex = '-1';
         exportHost.style.background = '#ffffff';
         exportHost.style.padding = '24px';

         const generatedAt = new Date().toLocaleString();
         const stockRows = (stockProducts || [])
            .map((prod, idx) => {
               const risk = String(prod?.risk || '').replace(/_/g, ' ');
               return `
                  <tr>
                     <td>${idx + 1}</td>
                     <td>${escapeHtml(prod?.name || '')}</td>
                     <td>${escapeHtml(prod?.sku || '')}</td>
                     <td>${escapeHtml(risk)}</td>
                     <td>${escapeHtml(prod?.on_hand ?? '')}</td>
                     <td>${escapeHtml(prod?.reorder ?? '')}</td>
                     <td>${escapeHtml(prod?.days_to_stock ?? '')}</td>
                  </tr>`;
            })
            .join('');

         const taskRows = (tasks || [])
            .slice(0, 100)
            .map((task, idx) => `
               <tr>
                  <td>${idx + 1}</td>
                  <td>${escapeHtml(task?.title || '')}</td>
                  <td>${escapeHtml(task?.type || '')}</td>
                  <td>${escapeHtml(task?.priority || '')}</td>
                  <td>${escapeHtml(task?.status || '')}</td>
                  <td>${escapeHtml(task?.timeframe || '')}</td>
                  <td>${escapeHtml(task?.confidence ?? '')}%</td>
               </tr>`)
            .join('');

         const forecastRows = getForecastChartData(selectedSheetAnalysis)
            .map((row, idx) => `
               <tr>
                  <td>${idx + 1}</td>
                  <td>${escapeHtml(row?.period || '')}</td>
                  <td>${escapeHtml(row?.predicted ?? '')}</td>
                  <td>${escapeHtml(row?.lower ?? '')}</td>
                  <td>${escapeHtml(row?.upper ?? '')}</td>
               </tr>`)
            .join('');

         const pastRows = getPastSalesSeries(selectedSheetAnalysis)
            .map((row, idx) => `
               <tr>
                  <td>${idx + 1}</td>
                  <td>${escapeHtml(row?.period || '')}</td>
                  <td>${escapeHtml(row?.actual ?? '')}</td>
               </tr>`)
            .join('');

         const exportNode = document.createElement('div');
         exportNode.style.width = '1024px';
         exportNode.style.background = '#ffffff';
         exportNode.style.color = '#0f172a';
         exportNode.style.fontFamily = 'Segoe UI, Arial, sans-serif';
         exportNode.style.padding = '28px';
         exportNode.innerHTML = `
            <div style="border:1px solid #dbeafe;border-radius:14px;padding:18px 20px;background:#f8fbff;margin-bottom:18px;">
               <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
                  <div>
                     <h1 style="margin:0;font-size:24px;line-height:1.2;font-weight:800;color:#0f172a;">Full Sheet Analysis Report</h1>
                     <p style="margin:6px 0 0 0;font-size:12px;color:#475569;">Professional export generated from Past Results.</p>
                  </div>
                  <div style="text-align:right;">
                     <div style="font-size:11px;color:#64748b;font-weight:700;">Generated</div>
                     <div style="font-size:12px;color:#0f172a;font-weight:700;">${escapeHtml(generatedAt)}</div>
                  </div>
               </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">
               <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;background:#ffffff;">
                  <div style="font-size:10px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;">Sheet Name</div>
                  <div style="font-size:15px;color:#0f172a;font-weight:800;margin-top:4px;">${escapeHtml(payload.sheet?.name || 'N/A')}</div>
               </div>
               <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;background:#ffffff;">
                  <div style="font-size:10px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;">AI Forecast</div>
                  <div style="font-size:20px;color:#0f172a;font-weight:800;margin-top:4px;">${escapeHtml(payload.sheet?.predicted ?? '0')}</div>
               </div>
               <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;background:#ffffff;">
                  <div style="font-size:10px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;">Real Sales</div>
                  <div style="font-size:20px;color:#0f172a;font-weight:800;margin-top:4px;">${escapeHtml(payload.sheet?.actual ?? '0')}</div>
               </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:20px;">
               ${(kpiCards || []).map((kpi) => `
               <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;background:#ffffff;">
                  <div style="font-size:10px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;">${escapeHtml(kpi.title)}</div>
                  <div style="font-size:18px;color:#0f172a;font-weight:800;margin-top:4px;">${escapeHtml(kpi.value)}</div>
                  <div style="font-size:11px;color:#64748b;margin-top:4px;">${escapeHtml(kpi.change)}</div>
               </div>`).join('')}
            </div>

            <h2 style="font-size:16px;margin:0 0 8px 0;color:#0f172a;">Stock Alerts</h2>
            <table style="width:100%;border-collapse:collapse;margin-bottom:18px;font-size:11px;">
               <thead>
                  <tr style="background:#eff6ff;">
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">#</th>
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">Product</th>
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">SKU</th>
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">Risk</th>
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">On Hand</th>
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">Reorder</th>
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">Days to Stockout</th>
                  </tr>
               </thead>
               <tbody>${stockRows || '<tr><td colspan="7" style="border:1px solid #cbd5e1;padding:8px;">No stock rows available</td></tr>'}</tbody>
            </table>

            <h2 style="font-size:16px;margin:0 0 8px 0;color:#0f172a;">Forecast Series</h2>
            <table style="width:100%;border-collapse:collapse;margin-bottom:18px;font-size:11px;">
               <thead>
                  <tr style="background:#eff6ff;">
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">#</th>
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">Period</th>
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">Predicted</th>
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">Lower</th>
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">Upper</th>
                  </tr>
               </thead>
               <tbody>${forecastRows || '<tr><td colspan="5" style="border:1px solid #cbd5e1;padding:8px;">No forecast rows available</td></tr>'}</tbody>
            </table>

            <h2 style="font-size:16px;margin:0 0 8px 0;color:#0f172a;">Past Sales Series</h2>
            <table style="width:100%;border-collapse:collapse;margin-bottom:18px;font-size:11px;">
               <thead>
                  <tr style="background:#eff6ff;">
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">#</th>
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">Period</th>
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">Actual Sales</th>
                  </tr>
               </thead>
               <tbody>${pastRows || '<tr><td colspan="3" style="border:1px solid #cbd5e1;padding:8px;">No past sales rows available</td></tr>'}</tbody>
            </table>

            <h2 style="font-size:16px;margin:0 0 8px 0;color:#0f172a;">Task Intelligence</h2>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
               <thead>
                  <tr style="background:#eff6ff;">
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">#</th>
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">Title</th>
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">Type</th>
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">Priority</th>
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">Status</th>
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">Timeframe</th>
                     <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">Confidence</th>
                  </tr>
               </thead>
               <tbody>${taskRows || '<tr><td colspan="7" style="border:1px solid #cbd5e1;padding:8px;">No tasks available</td></tr>'}</tbody>
            </table>
         `;

         exportHost.appendChild(exportNode);
         document.body.appendChild(exportHost);

         const scale = Math.min(2, Math.max(1.25, window.devicePixelRatio || 1));
         const canvas = await html2canvas(exportNode, {
            scale,
            useCORS: true,
            backgroundColor: '#ffffff',
            scrollY: 0,
            windowWidth: exportNode.scrollWidth,
            windowHeight: exportNode.scrollHeight,
         });

         document.body.removeChild(exportHost);

         const pdf = new jsPDF('p', 'mm', 'a4');
         const pdfWidth = pdf.internal.pageSize.getWidth();
         const pdfHeight = pdf.internal.pageSize.getHeight();
         const imgWidth = pdfWidth;
         const pageHeightPx = Math.floor((canvas.width * pdfHeight) / pdfWidth);
         const pageCanvas = document.createElement('canvas');
         const pageCtx = pageCanvas.getContext('2d');
         let renderedHeight = 0;
         let pageIndex = 0;

         if (!pageCtx) {
            throw new Error('Canvas context unavailable');
         }

         while (renderedHeight < canvas.height) {
            const sliceHeight = Math.min(pageHeightPx, canvas.height - renderedHeight);
            pageCanvas.width = canvas.width;
            pageCanvas.height = sliceHeight;
            pageCtx.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
            pageCtx.drawImage(
               canvas,
               0,
               renderedHeight,
               canvas.width,
               sliceHeight,
               0,
               0,
               canvas.width,
               sliceHeight
            );

            const imgData = pageCanvas.toDataURL('image/jpeg', 0.92);
            const imgHeight = (sliceHeight * imgWidth) / canvas.width;

            if (pageIndex > 0) {
               pdf.addPage();
            }
            pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');

            renderedHeight += sliceHeight;
            pageIndex += 1;
         }

         const fileName = sanitizeFileName(payload.sheet?.name || 'analysis_report');
         pdf.save(`${fileName}.pdf`);
         flashActionNote('PDF downloaded');
      } catch (err) {
         console.error('PDF export failed:', err);
         flashActionNote('PDF export failed');
      }
   };

   const handleShareReport = async () => {
      const payload = buildExportPayload();
      if (!payload) return;

      const shareText = `Analysis report: ${payload.sheet?.name || 'Sheet'} (Accuracy ${Number(payload.sheet?.accuracy || 0).toFixed(1)}%)`;
      const url = window.location.href;

      try {
         if (navigator.share) {
            await navigator.share({
               title: 'Analysis Report',
               text: shareText,
               url,
            });
            flashActionNote('Share sheet opened');
            return;
         }

         await copyToClipboard(`${shareText}\n${url}`);
         flashActionNote('Share link copied');
      } catch (err) {
         console.error('Share failed:', err);
         flashActionNote('Share failed');
      }
   };

   const fetchAuditData = async ({ silent = false } = {}) => {
    if (auditFetchInFlightRef.current) {
      return;
    }
    auditFetchInFlightRef.current = true;
    try {
         if (!silent) {
             setLoading(true);
         }
         let summaryPayload = null;

         let uploads = [];
         try {
            const res = await api.get('/ingestion/uploads-list/?limit=120&include_analysis=1');
            uploads = normalizeHistoryRows(Array.isArray(res?.data) ? res.data : []);
         } catch (uploadErr) {
            console.error('❌ uploads-list endpoint failed:', uploadErr);
            uploads = [];
         }

         let cleanerRows = [];
         try {
            const runRes = await api.get('/ingestion/data-cleaner-runs/?limit=120&include_analysis=1');
            const rawCleaner = Array.isArray(runRes?.data)
               ? runRes.data
               : Array.isArray(runRes?.data?.results)
                  ? runRes.data.results
                  : [];
            cleanerRows = normalizeHistoryRows(rawCleaner);
         } catch (fbErr) {
            console.error('❌ data-cleaner-runs endpoint failed:', fbErr);
            cleanerRows = [];
         }

         const mergedMap = new Map();
         [...uploads, ...cleanerRows].forEach((row) => {
            const id = getHistoryId(row);
            if (!id) return;
            const existing = mergedMap.get(id);
            mergedMap.set(id, mergeHistoryEntry(existing, row));
         });

         let combined = sortHistoryRows(Array.from(mergedMap.values()));

         combined = sortHistoryRows(
            combined.flatMap((row) => buildSheetRowsFromAnalysis(row))
         );

         setHistory(combined);
         if (!summaryPayload && combined.length > 0) {
            const first = combined[0];
            summaryPayload = {
               aggregate_accuracy: Number(first?.accuracy || 0),
               stability: normalizeStatusLabel(first?.analysis_status || first?.status || '') || 'Standard',
               recommendation: first?.insight || '',
            };
         }
         setSummary(summaryPayload || { aggregate_accuracy: 0, stability: 'Standard', recommendation: '' });
    } catch (err) {
      console.error('❌ Failed to fetch audit data:', err);
      setHistory([]);
      setSummary({ aggregate_accuracy: 0, stability: 'Standard', recommendation: '' });
    } finally {
      if (!silent) {
         setLoading(false);
      }
      auditFetchInFlightRef.current = false;
    }
  };

   useEffect(() => {
      let timer;
      let cancelled = false;

      const scheduleRefresh = async () => {
         if (cancelled) return;
         timer = setTimeout(async () => {
            if (cancelled) return;
            await fetchAuditData({ silent: true });
            if (!cancelled) {
               scheduleRefresh();
            }
         }, 30000);
      };

      scheduleRefresh();
      return () => {
         cancelled = true;
         clearTimeout(timer);
      };
   }, [selectedUploadId]);

   useEffect(() => {
      const onFocus = () => fetchAuditData({ silent: true });
      window.addEventListener('focus', onFocus);
      return () => window.removeEventListener('focus', onFocus);
   }, []);

   const formatDateTime = (item) => {
      const raw = item?.timestamp || item?.completed_at || item?.created_at || item?.updated_at || item?.date;
      if (!raw) {
         return { dateText: 'Date not available', timeText: '' };
      }

      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
         return { dateText: String(raw), timeText: '' };
      }

      return {
         dateText: parsed.toLocaleDateString(undefined, {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
         }),
         timeText: parsed.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
         }),
      };
   };

   const formatValue = (value) => {
      if (value === null || value === undefined || value === '') return 'N/A';
      if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'N/A';
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';
      if (typeof value === 'object') {
         try {
            return JSON.stringify(value, null, 2);
         } catch {
            return String(value);
         }
      }
      return String(value);
   };

   const getForecastChartData = (analysis) => {
      const rows = Array.isArray(analysis?.demand_forecast) ? analysis.demand_forecast : [];
      return rows.slice(0, 12).map((row, idx) => ({
         period: row?.period || row?.date || row?.day || `W${idx + 1}`,
         predicted: Number(row?.predicted_demand || 0),
         lower: Number(row?.lower_bound ?? row?.predicted_demand ?? 0),
         upper: Number(row?.upper_bound ?? row?.predicted_demand ?? 0),
      }));
   };

   const getPastSalesSeries = (analysis) => {
      const rows = Array.isArray(analysis?.past_sales_weekly) ? analysis.past_sales_weekly : [];
      return rows.slice(0, 12).map((row, idx) => ({
         period: row?.period || row?.date || row?.day || `W${idx + 1}`,
         actual: Number(row?.actual || row?.sales || 0),
      }));
   };

   const loadSelectedSheetAnalysis = async (uploadId) => {
      if (!uploadId) {
         setSelectedSheetAnalysis(null);
         return;
      }
      setSheetAnalysisLoading(true);
      try {
         const res = await api.get(`/ingestion/upload-analysis/${uploadId}/`);
         setSelectedSheetAnalysis(res.data?.analysis || null);
      } catch {
         setSelectedSheetAnalysis(null);
      } finally {
         setSheetAnalysisLoading(false);
      }
   };

  const kpiCards = [
     {
        title: 'Sales Total',
        value: formatValue(selectedSheetAnalysis?.sales_summary?.total_sales),
        change: `Trend: ${selectedSheetAnalysis?.sales_summary?.trend || 'Stable'}`,
        pos: true,
        color: '#10b981',
        icon: TrendingUp,
        status_percent: 100,
     },
     {
        title: '4W Forecast',
        value: formatValue(selectedSheetAnalysis?.forecast_summary?.total_predicted_demand),
        change: `Pattern: ${selectedSheetAnalysis?.forecast_summary?.daily_pattern || 'Normal'}`,
        pos: true,
        color: '#3b82f6',
        icon: Zap,
        status_percent: 80,
     },
     {
        title: 'Low Stock Alerts',
        value: formatValue(selectedSheetAnalysis?.stock_analysis?.low_stock_items),
        change: 'Needs review',
        pos: Number(selectedSheetAnalysis?.stock_analysis?.low_stock_items || 0) === 0,
        color: '#f43f5e',
        icon: AlertCircle,
        status_percent: 60,
     },
     {
        title: 'Healthy Items',
        value: formatValue(selectedSheetAnalysis?.stock_analysis?.healthy_items),
        change: 'Stable',
        pos: true,
        color: '#10b981',
        icon: Package,
        status_percent: 100,
     },
  ];

  const tasks = useMemo(() => buildTasksFromAnalysis(selectedSheetAnalysis), [selectedSheetAnalysis]);

  const stockProducts = useMemo(() => mapStockProducts(selectedSheetAnalysis), [selectedSheetAnalysis]);

  const filteredStockProducts = useMemo(() => {
     return stockProducts.filter((prod) => stockFilter === 'ALL' || prod.risk === stockFilter);
  }, [stockProducts, stockFilter]);

  const groupedTasks = useMemo(() => {
     const present = tasks.filter((task) => task.status !== 'COMPLETED' && (task.timeframe === 'IMMEDIATE' || task.timeframe === 'SHORT_TERM'));
     const future = tasks.filter((task) => task.status !== 'COMPLETED' && task.timeframe === 'LONG_TERM');
     const past = tasks.filter((task) => task.status === 'COMPLETED');
     return { present, future, past };
  }, [tasks]);

  const renderTaskCard = (task, idx) => {
     const cfg = typeConfig[task.type] || typeConfig.ALERT;
     const Icon = cfg.icon;
     const isExpanded = expandedTaskId === task.id;
     const realActions = Array.isArray(task.productActions) && task.productActions.length > 0 ? task.productActions : null;
     const actions = (realActions || (Array.isArray(task.actionOptions) && task.actionOptions.length > 0 ? task.actionOptions : [task.action]));
     return (
        <motion.div
           key={task.id}
           layout
           initial={{ opacity: 0, y: 12 }}
           animate={{ opacity: 1, y: 0 }}
           exit={{ opacity: 0, y: -8 }}
           transition={{ delay: idx * 0.03 }}
           className={`glass-premium rounded-2xl transition-all cursor-pointer ${isExpanded ? 'p-6 border-emerald-500/35 shadow-[0_10px_30px_rgba(16,185,129,0.12)]' : 'p-5 hover:border-emerald-500/30'}`}
           onClick={() => setExpandedTaskId((prev) => (prev === task.id ? null : task.id))}
        >
           <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 min-w-0">
                 <div className="w-11 h-11 rounded-xl bg-[var(--bg-accent)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
                    <Icon size={18} className={cfg.color} />
                 </div>
                 <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                       <h4 className="text-sm font-bold text-[var(--text-main)] truncate">{task.title}</h4>
                       <span className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest">{task.type}</span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-2">{task.description}</p>
                    <div className="mt-2">
                       <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-emerald-400 mb-2">
                          <ArrowRight size={13} />
                          {realActions ? 'Real Product Actions' : task.status === 'COMPLETED' ? 'Action Taken' : 'Suggested Actions'}
                       </div>
                       <ul className="space-y-1.5">
                          {actions
                             .slice(0, isExpanded ? Math.max(actions.length, 8) : 3)
                             .map((item, actionIdx) => (
                             <li key={`${task.id}-action-${actionIdx}`} className="text-xs text-[var(--text-muted)] leading-relaxed flex items-start gap-2">
                                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                <span>{item}</span>
                             </li>
                          ))}
                       </ul>
                       {(realActions || (Array.isArray(task.actionOptions) && task.actionOptions.length > 3)) && (
                          <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1">
                             {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                             {isExpanded ? 'Show Less' : 'More Actions Available'}
                          </div>
                       )}
                       {isExpanded && (
                          <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-2">
                             <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">What We Will Do</p>
                             <p className="text-xs text-[var(--text-muted)] leading-relaxed">{task.action || 'Execute these actions in priority order and monitor results daily.'}</p>
                          </div>
                       )}
                    </div>
                 </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                 <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${statusClassMap[task.status] || statusClassMap.PENDING}`}>
                    {toTitle(task.status)}
                 </span>
                 <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${priorityClassMap[task.priority] || priorityClassMap.MEDIUM}`}>
                    {task.priority}
                 </span>
                 <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${timeframeClassMap[task.timeframe] || timeframeClassMap.SHORT_TERM}`}>
                    {task.timeframe === 'IMMEDIATE' ? 'Present' : task.timeframe === 'SHORT_TERM' ? 'Next 7 Days' : 'Future'}
                 </span>
                 <div className="text-[10px] font-black text-[var(--text-dim)] uppercase tracking-widest">
                    Confidence {task.confidence}%
                 </div>
              </div>
           </div>
        </motion.div>
     );
  };

   if (loading) {
      return (
         <div className="flex flex-col items-center justify-center p-32 gap-6 bg-slate-950/20 rounded-3xl">
            <div className="w-16 h-16 border-4 border-emerald-500/10 border-t-purple-500 rounded-full animate-spin" />
             <p className="text-xs font-black tracking-[0.2em] text-purple-400 uppercase">Loading past results...</p>
         </div>
      );
   }

  return (
    <div className="space-y-10 pb-20">
      {/* Historical Audit Log */}
      <GlassCard className={`!p-0 relative overflow-hidden rounded-3xl ${isLight ? 'border-slate-200 bg-white shadow-sm' : 'border-white/5 bg-slate-900/40 shadow-2xl'}`}>
         <div className={`p-8 flex items-center justify-between ${isLight ? 'border-b border-slate-200' : 'border-b border-white/5'}`}>
            <div className="flex items-center gap-4">
               <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isLight ? 'bg-slate-100 border border-slate-200 text-slate-500' : 'bg-white/5 border border-white/10 text-slate-400'}`}>
                  <History size={24} />
               </div>
               <div>
                  <h3 className={`text-xl font-bold tracking-tight ${isLight ? 'text-[var(--text-main)]' : 'text-white'}`}>Upload History</h3>
                   <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.1em] mt-1">Every sheet you uploaded — AI prediction vs actual results</p>
               </div>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
               <CheckCircle2 size={14} className="text-emerald-500" />
               <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Locked Record</span>
            </div>
         </div>

         <div className="p-6 md:p-8">
            <div className={`mb-6 rounded-2xl border p-4 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-white/10'}`}>
               <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div className="md:col-span-2 relative">
                     <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
                     <input
                        type="text"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Search by sheet name or status"
                        className={`w-full h-11 rounded-xl border pl-10 pr-3 text-sm font-medium transition-colors ${isLight ? 'bg-white border-slate-200 text-slate-700 placeholder:text-slate-400 focus:border-emerald-400' : 'bg-slate-950/60 border-white/10 text-slate-200 placeholder:text-slate-500 focus:border-emerald-500/50'} focus:outline-none`}
                     />
                  </div>

                  <input
                     type="date"
                     value={historyDateFilter}
                     onChange={(e) => setHistoryDateFilter(e.target.value)}
                     className={`h-11 rounded-xl border px-3 text-sm font-medium transition-colors ${isLight ? 'bg-white border-slate-200 text-slate-700 focus:border-emerald-400' : 'bg-slate-950/60 border-white/10 text-slate-200 focus:border-emerald-500/50'} focus:outline-none`}
                  />

                  <select
                     value={historyMonthFilter}
                     onChange={(e) => setHistoryMonthFilter(e.target.value)}
                     className={`h-11 rounded-xl border px-3 text-sm font-medium transition-colors ${isLight ? 'bg-white border-slate-200 text-slate-700 focus:border-emerald-400' : 'bg-slate-950/60 border-white/10 text-slate-200 focus:border-emerald-500/50'} focus:outline-none`}
                  >
                     <option value="ALL">All Months</option>
                     {Array.from({ length: 12 }, (_, idx) => {
                        const monthNo = idx + 1;
                        const label = new Date(2026, idx, 1).toLocaleString(undefined, { month: 'long' });
                        return (
                           <option key={monthNo} value={monthNo}>{label}</option>
                        );
                     })}
                  </select>

                  <select
                     value={historyYearFilter}
                     onChange={(e) => setHistoryYearFilter(e.target.value)}
                     className={`h-11 rounded-xl border px-3 text-sm font-medium transition-colors ${isLight ? 'bg-white border-slate-200 text-slate-700 focus:border-emerald-400' : 'bg-slate-950/60 border-white/10 text-slate-200 focus:border-emerald-500/50'} focus:outline-none`}
                  >
                     <option value="ALL">All Years</option>
                     {historyYears.map((year) => (
                        <option key={year} value={year}>{year}</option>
                     ))}
                  </select>
               </div>

               <div className="mt-3 flex items-center justify-between">
                  <p className={`text-[11px] font-bold uppercase tracking-widest ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                     Showing {filteredHistory.length} of {history.length} records
                  </p>
                  <button
                     type="button"
                     onClick={() => {
                        setHistorySearch('');
                        setHistoryDateFilter('');
                        setHistoryMonthFilter('ALL');
                        setHistoryYearFilter('ALL');
                     }}
                     className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors ${isLight ? 'border-slate-300 text-slate-600 hover:bg-slate-100' : 'border-white/20 text-slate-300 hover:bg-white/5'}`}
                  >
                     Clear Filters
                  </button>
               </div>
            </div>

            {history.length === 0 && (
               <div className={`px-8 py-10 rounded-2xl ${isLight ? 'text-slate-500 border border-slate-200 bg-slate-50' : 'text-slate-400 border border-white/10 bg-white/[0.02]'}`}>
                  <p className="text-center text-sm font-medium mb-3">📋 No upload history found yet.</p>
                  <p className={`text-center text-xs ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                     Go to <strong>Data Cleaner</strong> → Create a sheet with data rows → Click <strong>Publish</strong>
                  </p>
                  <p className={`text-center text-xs mt-2 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                     After publishing, return here to see your analysis results and AI predictions.
                  </p>
               </div>
            )}

            {history.length > 0 && filteredHistory.length === 0 && (
               <div className={`px-8 py-8 rounded-2xl mb-6 ${isLight ? 'text-slate-600 border border-slate-200 bg-slate-50' : 'text-slate-300 border border-white/10 bg-white/[0.02]'}`}>
                  <p className="text-center text-sm font-semibold mb-2">No records match selected search filters.</p>
                  <p className={`text-center text-xs ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Try changing sheet name text, date, month, or year filter.</p>
               </div>
            )}

            <div className="space-y-6">
               {groupedHistory.map((group) => (
                  <div key={group.key} className="space-y-3">
                     <div className="flex items-center justify-between px-2">
                        <div>
                           <p className={`text-xs font-black uppercase tracking-widest ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                              {group.name}
                           </p>
                           <p className={`text-[11px] font-semibold ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                              {group.items.length} sheet{group.items.length > 1 ? 's' : ''} analyzed
                           </p>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${isLight ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'}`}>
                           Upload Bundle
                        </div>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                           {group.items.map((item, i) => {
                 const formatted = formatDateTime(item);
                 const accuracy = Number(item.accuracy || 0);
                 const clampedAccuracy = Math.max(0, Math.min(100, accuracy));
                        const itemKey = getHistoryItemKey(item) || `${item.upload_id || item.id || 'row'}-${i}`;
                         const isSheetCard = item.card_type === 'SHEET';
                    const liveBadgeClass = isLight
                       ? 'text-emerald-700 border-emerald-200 bg-emerald-50'
                       : 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';
                    const normalizedStatus = String(item.analysis_status || item.status || '').toUpperCase();
                    const statusTone = normalizedStatus.includes('FAIL')
                       ? {
                          card: 'border border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-rose-50/50 shadow-sm hover:shadow-md',
                          metric: 'border border-rose-200/60 bg-white/80',
                          track: 'bg-rose-100',
                          statusColor: 'text-rose-700 border-rose-200 bg-rose-100',
                          labelText: 'text-rose-700/70',
                          titleText: 'text-rose-950',
                          valueText: 'text-rose-900',
                          subText: 'text-rose-700/70',
                          bodyText: 'text-rose-900/80',
                          barColor: 'bg-rose-500',
                          iconColor: 'text-rose-600',
                       }
                       : (normalizedStatus.includes('PROCESS') || normalizedStatus.includes('PENDING') || normalizedStatus.includes('MAP'))
                         ? {
                            card: 'border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-amber-50/50 shadow-sm hover:shadow-md',
                            metric: 'border border-amber-200/60 bg-white/80',
                            track: 'bg-amber-100',
                            statusColor: 'text-amber-700 border-amber-200 bg-amber-100',
                            labelText: 'text-amber-700/70',
                            titleText: 'text-amber-950',
                            valueText: 'text-amber-900',
                            subText: 'text-amber-700/70',
                            bodyText: 'text-amber-900/80',
                            barColor: 'bg-amber-500',
                            iconColor: 'text-amber-600',
                         }
                         : {
                            card: 'border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/50 shadow-sm hover:shadow-md',
                            metric: 'border border-emerald-200/60 bg-white/80',
                            track: 'bg-emerald-100',
                            statusColor: 'text-emerald-700 border-emerald-200 bg-emerald-100',
                            labelText: 'text-emerald-700/70',
                            titleText: 'text-emerald-950',
                            valueText: 'text-emerald-900',
                            subText: 'text-emerald-700/70',
                            bodyText: 'text-emerald-900/80',
                            barColor: 'bg-emerald-500',
                            iconColor: 'text-emerald-600',
                         };

                 return (
                            <motion.div
                               key={itemKey}
                     initial={{ opacity: 0, y: 14 }}
                     animate={{ opacity: 1, y: 0 }}
                     transition={{ delay: i * 0.04 }}
                                                                     className={`rounded-2xl p-5 transition-all cursor-pointer hover:-translate-y-0.5 hover:shadow-lg ${statusTone.card} ${item.is_live ? 'ring-1 ring-emerald-400/30' : ''}`}
                                              onClick={() => {
                                                 setSelectedHistoryItem(item);
                                                 if (item?.upload_id) {
                                                    pinUploadAnalysis(item.upload_id);
                                                    loadSelectedSheetAnalysis(item.upload_id);
                                                 } else {
                                                    setSelectedSheetAnalysis(null);
                                                 }
                                              }}
                   >
                       <div className="flex items-start justify-between gap-3 mb-4">
                         <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                               <p className={`text-[11px] font-black uppercase tracking-widest truncate ${statusTone.labelText}`}>
                                  {item.sheet_name || `Sheet ${i + 1}`}
                               </p>
                               {item.is_live && (
                                  <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${liveBadgeClass}`}>
                                     Live
                                  </span>
                               )}
                            </div>
                            <div className="flex items-center gap-2">
                               <Calendar size={13} className={statusTone.iconColor} />
                               <p className={`text-[12px] font-semibold ${statusTone.subText}`}>
                                  {formatted.dateText}{formatted.timeText ? ` | ${formatted.timeText}` : ''}
                               </p>
                            </div>
                         </div>
                         <div className="flex flex-col items-end gap-1.5">
                            <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wide ${statusTone.statusColor}`}>
                               {accuracy.toFixed(1)}%
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${statusTone.bodyText}`}>
                               {item.status || 'Review Needed'}
                            </span>
                         </div>
                       </div>

                       <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className={`rounded-xl p-3 ${statusTone.metric}`}>
                             <p className={`text-[10px] font-black uppercase tracking-widest ${statusTone.labelText}`}>{isSheetCard ? 'Normalized Rows' : 'AI Forecast'}</p>
                             <p className={`text-2xl font-black tabular-nums mt-1 ${statusTone.valueText}`}>{item.predicted}</p>
                          </div>
                          <div className={`rounded-xl p-3 ${statusTone.metric}`}>
                             <p className={`text-[10px] font-black uppercase tracking-widest ${statusTone.labelText}`}>{isSheetCard ? 'Raw Rows' : 'Real Sales'}</p>
                             <p className={`text-2xl font-black tabular-nums mt-1 ${statusTone.titleText}`}>{item.actual}</p>
                          </div>
                       </div>

                       <div className="pt-3 border-t border-black/5">
                          <div className="flex items-center justify-between mb-2">
                             <p className={`text-[10px] font-black uppercase tracking-widest ${statusTone.labelText}`}>{isSheetCard ? 'Normalization' : 'Accuracy Meter'}</p>
                             <p className={`text-[11px] font-bold ${statusTone.bodyText}`}>{clampedAccuracy.toFixed(1)}% score</p>
                          </div>
                          <div className={`w-full h-2 rounded-full overflow-hidden ${statusTone.track}`}>
                             <div className={`h-full ${statusTone.barColor}`} style={{ width: `${clampedAccuracy}%` }} />
                          </div>
                       </div>
                   </motion.div>
                 );
                        })}
                     </div>
                  </div>
               ))}
            </div>
         </div>
      </GlassCard>

         <AnimatePresence>
            {selectedHistoryItem && (
               <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4"
                  onClick={() => setSelectedHistoryItem(null)}
               >
                  <motion.div
                     initial={{ opacity: 0, y: 16, scale: 0.98 }}
                     animate={{ opacity: 1, y: 0, scale: 1 }}
                     exit={{ opacity: 0, y: 12, scale: 0.98 }}
                     className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl ${isLight ? 'bg-white border border-slate-200' : 'bg-slate-900 border border-white/10'}`}
                     ref={reportRef}
                     onClick={(e) => e.stopPropagation()}
                  >
                     <div ref={reportContentRef}>
                     <div className={`top-0 z-10 px-6 py-4 border-b flex items-start justify-between ${isLight ? 'bg-white/95 border-slate-200' : 'bg-slate-900/95 border-white/10'}`}>
                        <div>
                           <h3 className={`text-lg font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>Full Sheet Analysis Result</h3>
                           <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{selectedHistoryItem.sheet_name || 'Selected sheet result'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                           {actionNote && (
                              <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${isLight ? 'border-slate-200 text-slate-600 bg-slate-50' : 'border-white/10 text-slate-300 bg-white/5'}`}>
                                 {actionNote}
                              </span>
                           )}
                           <button
                              className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors ${isLight ? 'border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100' : 'border-white/15 text-slate-300 hover:text-white hover:bg-white/5'}`}
                              aria-label="Download report"
                              onClick={handleDownloadReport}
                           >
                              <Download size={16} />
                           </button>
                           <button
                              className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors ${isLight ? 'border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100' : 'border-white/15 text-slate-300 hover:text-white hover:bg-white/5'}`}
                              aria-label="Share report"
                              onClick={handleShareReport}
                           >
                              <Share2 size={16} />
                           </button>
                           <button
                              className={`w-9 h-9 rounded-xl border flex items-center justify-center ${isLight ? 'border-slate-300 text-slate-600 hover:text-slate-900' : 'border-white/15 text-slate-300 hover:text-white'}`}
                              onClick={() => setSelectedHistoryItem(null)}
                              aria-label="Close details"
                           >
                              <X size={16} />
                           </button>
                        </div>
                     </div>

                     <div className="p-6 space-y-6">
                        <div className={`rounded-2xl p-4 border ${isLight ? 'bg-blue-50 border-blue-200' : 'bg-blue-500/10 border-blue-500/20'}`}>
                           <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                              <p className={`text-xs font-bold ${isLight ? 'text-blue-700' : 'text-blue-300'}`}>
                                 This analysis sheet is pinned for Business Home, Stock Alerts, Sales Forecast, Past Result, and Tasks.
                              </p>
                              <div className="flex items-center gap-2">
                                 <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${selectedUploadId === selectedHistoryItem?.upload_id ? (isLight ? 'text-emerald-700 border-emerald-300 bg-emerald-50' : 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10') : (isLight ? 'text-slate-600 border-slate-300 bg-white' : 'text-slate-300 border-white/20 bg-slate-900')}`}>
                                    {selectedUploadId === selectedHistoryItem?.upload_id ? 'Pinned' : 'Not Pinned'}
                                 </span>
                                 {selectedUploadId === selectedHistoryItem?.upload_id && (
                                    <button
                                       onClick={clearPinnedUploadAnalysis}
                                       className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors ${isLight ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-white/20 text-slate-200 hover:bg-white/5'}`}
                                    >
                                       Use Latest Upload
                                    </button>
                                 )}
                              </div>
                           </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                           <div className={`rounded-2xl p-4 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-slate-950/50 border border-white/10'}`}>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Accuracy</p>
                              <p className="text-2xl font-black text-emerald-500 mt-1">{Number(selectedHistoryItem.accuracy || 0).toFixed(2)}%</p>
                           </div>
                           <div className={`rounded-2xl p-4 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-slate-950/50 border border-white/10'}`}>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">AI Forecast</p>
                              <p className={`text-2xl font-black mt-1 ${isLight ? 'text-slate-800' : 'text-white'}`}>{formatValue(selectedHistoryItem.predicted)}</p>
                           </div>
                           <div className={`rounded-2xl p-4 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-slate-950/50 border border-white/10'}`}>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Real Sales</p>
                              <p className={`text-2xl font-black mt-1 ${isLight ? 'text-slate-800' : 'text-white'}`}>{formatValue(selectedHistoryItem.actual)}</p>
                           </div>
                        </div>

                        <div className={`rounded-2xl p-4 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-slate-950/50 border border-white/10'}`}>
                           <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Key Numbers from This Sheet</p>
                           {sheetAnalysisLoading ? (
                              <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>Loading sheet intelligence...</p>
                           ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                 {kpiCards.map((kpi) => {
                                    const Icon = kpi.icon;
                                    return (
                                       <div key={kpi.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                          <div className="flex justify-between items-start mb-4">
                                             <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-slate-50 border border-slate-200" style={{ color: kpi.color }}>
                                                <Icon size={20} />
                                             </div>
                                             <div className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-tighter ${kpi.pos ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                                {kpi.change}
                                             </div>
                                          </div>
                                          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{kpi.title}</div>
                                          <div className="text-xl font-black text-slate-900 tracking-tight">{kpi.value}</div>
                                          <div className="w-full h-1 bg-slate-100 rounded-full mt-4 overflow-hidden">
                                             <div className="h-full" style={{ width: `${kpi.status_percent}%`, background: kpi.color }} />
                                          </div>
                                       </div>
                                    );
                                 })}
                              </div>
                           )}
                        </div>

                        <div className={`rounded-2xl p-4 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-slate-950/50 border border-white/10'}`}>
                           <div className="flex items-center justify-between mb-4">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Stock Alerts</p>
                              <div className={`flex items-center gap-2 p-1.5 rounded-2xl border ${isLight ? 'bg-slate-100 border-slate-200' : 'bg-[var(--bg-sidebar)] border-[var(--border-subtle)]'}`}>
                                 {['ALL', 'OUT_OF_STOCK', 'LOW_STOCK', 'DEADSTOCK', 'OVERSTOCK', 'HEALTHY'].map((f) => (
                                    <button
                                       key={f}
                                       className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                                          stockFilter === f
                                             ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                                             : 'text-[var(--text-muted)] hover:text-emerald-500 hover:bg-emerald-500/5'
                                       }`}
                                       onClick={() => setStockFilter(f)}
                                    >
                                       {f.replace(/_/g, ' ')}
                                    </button>
                                 ))}
                              </div>
                           </div>

                           {filteredStockProducts.length === 0 ? (
                              <p className="text-xs text-[var(--text-muted)]">No products match the selected filter.</p>
                           ) : (
                              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                 <AnimatePresence mode="popLayout">
                                    {filteredStockProducts.map((prod) => {
                                       const config = STOCK_RISK_CONFIG[prod.risk] || STOCK_RISK_CONFIG.HEALTHY;
                                       const tone = (isLight ? STOCK_RISK_THEME_LIGHT : STOCK_RISK_THEME_DARK)[prod.risk] || (isLight ? STOCK_RISK_THEME_LIGHT.HEALTHY : STOCK_RISK_THEME_DARK.HEALTHY);
                                       const actionPlan = getStockActionPlan(prod);
                                       const hasSafetyPoint = Number(prod.reorder || 0) > 0;
                                       const StatusIcon = config.icon;
                                       return (
                                          <motion.div
                                             key={prod.id}
                                             layout
                                             initial={{ opacity: 0, scale: 0.98 }}
                                             animate={{ opacity: 1, scale: 1 }}
                                             exit={{ opacity: 0, scale: 0.98 }}
                                             className={`border rounded-[2.5rem] p-8 transition-all group overflow-hidden relative shadow-lg ${tone.card}`}
                                          >
                                             <div className="absolute top-0 right-0 w-[400px] h-full bg-gradient-to-l from-white/[0.02] to-transparent pointer-events-none" />
                                             <div className="relative z-10 flex flex-col h-full">
                                                <div className="flex items-start justify-between mb-8">
                                                   <div className="flex items-center gap-4">
                                                      <div className="w-14 h-14 rounded-2xl bg-[var(--bg-accent)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] group-hover:border-emerald-500/20 group-hover:text-emerald-500 transition-all duration-500 shadow-inner">
                                                         <Package size={28} strokeWidth={1.5} />
                                                      </div>
                                                      <div>
                                                         <h4 className={`text-xl font-bold leading-none mb-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>{prod.name}</h4>
                                                         <span className={`text-[10px] font-bold uppercase tracking-widest ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>{prod.sku} • {prod.category}</span>
                                                      </div>
                                                   </div>
                                                   <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 ${config.className}`}>
                                                      <StatusIcon size={14} />
                                                      <span className="text-[9px] font-bold uppercase tracking-widest">{config.label}</span>
                                                   </div>
                                                </div>

                                                <div className={`grid ${hasSafetyPoint ? 'grid-cols-3' : 'grid-cols-2'} gap-8 mb-8`}>
                                                   <div>
                                                      <span className={`block text-[9px] font-bold uppercase tracking-widest mb-1 ${isLight ? 'text-slate-500' : 'text-slate-600'}`}>On Hand</span>
                                                      <span className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{prod.on_hand} <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-600'}`}>UNITS</span></span>
                                                   </div>
                                                   {hasSafetyPoint && (
                                                      <div>
                                                         <span className={`block text-[9px] font-bold uppercase tracking-widest mb-1 ${isLight ? 'text-slate-500' : 'text-slate-600'}`}>Safety Point</span>
                                                         <span className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-[var(--text-main)]'}`}>{prod.reorder}</span>
                                                         <p className={`text-[10px] mt-1 ${isLight ? 'text-slate-500' : 'text-[var(--text-muted)]'}`}>Minimum buffer to prevent stockout.</p>
                                                      </div>
                                                   )}
                                                   <div>
                                                      <span className={`block text-[9px] font-bold uppercase tracking-widest mb-1 ${isLight ? 'text-slate-500' : 'text-slate-600'}`}>Days to Stockout</span>
                                                      <span className={`text-lg font-bold uppercase ${isLight ? 'text-emerald-600' : 'text-emerald-500/60'}`}>{prod.days_to_stock ?? 'Data not available'}</span>
                                                   </div>
                                                </div>

                                                <div className={`mb-6 rounded-2xl border p-4 ${tone.planWrap}`}>
                                                   <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${tone.label}`}>Recommended Action Plan</p>
                                                   <p className={`text-[12px] leading-relaxed mb-4 ${isLight ? 'text-slate-600' : 'text-slate-200'}`}>{actionPlan.summary}</p>
                                                   <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                      <div className={`rounded-xl border p-3 ${tone.tile}`}>
                                                         <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${tone.label}`}>{actionPlan.line1Label}</p>
                                                         <p className={`text-sm font-bold ${tone.valuePrimary}`}>{actionPlan.line1Value}</p>
                                                      </div>
                                                      <div className={`rounded-xl border p-3 ${tone.tile}`}>
                                                         <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${tone.label}`}>{actionPlan.line2Label}</p>
                                                         <p className={`text-sm font-bold ${tone.valueSecondary}`}>{actionPlan.line2Value}</p>
                                                      </div>
                                                      <div className={`rounded-xl border p-3 ${tone.tile}`}>
                                                         <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${tone.label}`}>{actionPlan.line3Label}</p>
                                                         <p className={`text-sm font-bold ${tone.valueTertiary}`}>{actionPlan.line3Value}</p>
                                                      </div>
                                                   </div>
                                                </div>

                                                <div className="mt-auto space-y-4 pt-6 border-t border-white/5">
                                                   <div className="flex items-center justify-between gap-1">
                                                      <button
                                                         className={`flex-1 py-3.5 rounded-2xl text-[9px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                                                            isLight
                                                               ? 'bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 hover:border-slate-300'
                                                               : 'bg-white/5 border border-white/5 text-slate-500 hover:text-white hover:bg-white/10 hover:border-white/10'
                                                         }`}
                                                      >
                                                         Inventory Audit
                                                      </button>
                                                      <button
                                                         className={`flex-[1.5] py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest ${
                                                            prod.risk === 'OUT_OF_STOCK' || prod.risk === 'LOW_STOCK'
                                                               ? (isLight ? 'bg-rose-500 text-white shadow-rose-500/20' : 'bg-rose-500 text-slate-950 shadow-rose-500/10')
                                                               : (isLight ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-emerald-500 text-slate-950 shadow-emerald-500/10')
                                                         }`}
                                                      >
                                                         {prod.risk === 'OUT_OF_STOCK' ? 'Emergency Replenish' : (prod.risk === 'LOW_STOCK' ? 'Restock Now' : 'Optimize Supply')}
                                                         <ArrowRight size={14} />
                                                      </button>
                                                   </div>
                                                </div>
                                             </div>
                                          </motion.div>
                                       );
                                    })}
                                 </AnimatePresence>
                              </div>
                           )}
                        </div>

                        <div className={`rounded-2xl p-4 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-slate-950/50 border border-white/10'}`}>
                           <div className="flex items-center justify-between mb-3">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sales Performance</p>
                              <div className="flex bg-[var(--bg-accent)] p-1.5 rounded-2xl border border-[var(--border-subtle)]">
                                 <button
                                    onClick={() => setSalesChartMode('past')}
                                    className={`px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                                       salesChartMode === 'past'
                                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                          : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                                    }`}
                                 >
                                    Past
                                 </button>
                                 <button
                                    onClick={() => setSalesChartMode('present')}
                                    className={`px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                                       salesChartMode === 'present'
                                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                          : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                                    }`}
                                 >
                                    Present + Future
                                 </button>
                              </div>
                           </div>
                           {sheetAnalysisLoading ? (
                              <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>Loading performance...</p>
                           ) : (
                              <div className={`rounded-xl p-3 ${isLight ? 'bg-white border border-slate-200' : 'bg-slate-900 border border-white/10'}`}>
                                 <div style={{ width: '100%', height: '260px' }}>
                                    <PredictionChart
                                       pastData={getPastSalesSeries(selectedSheetAnalysis)}
                                       forecastData={getForecastChartData(selectedSheetAnalysis)}
                                       mode={salesChartMode}
                                       height={260}
                                       showLegend
                                    />
                                 </div>
                              </div>
                           )}
                        </div>

                        <div className={`rounded-2xl p-4 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-slate-950/50 border border-white/10'}`}>
                           <div className="flex items-center justify-between mb-4">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Task Intelligence</p>
                              <div className="flex bg-[var(--bg-accent)] p-1.5 rounded-2xl border border-[var(--border-subtle)]">
                                 {['all', 'present', 'future', 'past'].map((tab) => (
                                    <button
                                       key={tab}
                                       onClick={() => setTaskViewFilter(tab)}
                                       className={`px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                                          taskViewFilter === tab ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                                       }`}
                                    >
                                       {tab}
                                    </button>
                                 ))}
                              </div>
                           </div>

                           {tasks.length === 0 ? (
                              <p className="text-xs text-[var(--text-muted)]">No actions available for this sheet yet.</p>
                           ) : (
                              <div className="space-y-6">
                                 {(taskViewFilter === 'all' || taskViewFilter === 'present') && (
                                    <section>
                                       <h3 className="text-sm font-black text-emerald-400 uppercase tracking-widest mb-3">Present Actions (Abhi Karna Hai)</h3>
                                       <div className="space-y-3">
                                          <AnimatePresence>
                                             {groupedTasks.present.map((task, idx) => renderTaskCard(task, idx))}
                                          </AnimatePresence>
                                          {groupedTasks.present.length === 0 && (
                                             <p className="text-xs text-[var(--text-muted)]">Present me koi action pending nahi hai.</p>
                                          )}
                                       </div>
                                    </section>
                                 )}

                                 {(taskViewFilter === 'all' || taskViewFilter === 'future') && (
                                    <section>
                                       <h3 className="text-sm font-black text-blue-400 uppercase tracking-widest mb-3">Future Actions (Prediction)</h3>
                                       <div className="space-y-3">
                                          <AnimatePresence>
                                             {groupedTasks.future.map((task, idx) => renderTaskCard(task, idx))}
                                          </AnimatePresence>
                                          {groupedTasks.future.length === 0 && (
                                             <p className="text-xs text-[var(--text-muted)]">Future predictive actions abhi available nahi hain.</p>
                                          )}
                                       </div>
                                    </section>
                                 )}

                                 {(taskViewFilter === 'all' || taskViewFilter === 'past') && (
                                    <section>
                                       <h3 className="text-sm font-black text-amber-400 uppercase tracking-widest mb-3">Past Tasks (Jo Complete Ho Chuke)</h3>
                                       <div className="space-y-3">
                                          <AnimatePresence>
                                             {groupedTasks.past.map((task, idx) => renderTaskCard(task, idx))}
                                          </AnimatePresence>
                                          {groupedTasks.past.length === 0 && (
                                             <p className="text-xs text-[var(--text-muted)]">Past completed tasks abhi available nahi hain.</p>
                                          )}
                                       </div>
                                    </section>
                                 )}
                              </div>
                           )}
                        </div>

                     </div>
                     </div>
                  </motion.div>
               </motion.div>
            )}
         </AnimatePresence>
    </div>
  );
};

export default PredictiveAudit;
