import React, { useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { motion } from 'framer-motion';
import { BrainCircuit, Loader2, Sparkles } from 'lucide-react';

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const TOOLTIP_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const getHorizonLimit = (horizon) => {
  if (horizon === 'week') return 7;
  if (horizon === 'month') {
    const now = new Date();
    const daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return daysInCurrentMonth >= 31 ? 31 : 30;
  }
  return 365;
};

const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const raw = value.trim();
    // Ignore ambiguous labels like "Mar 1" that JS auto-parses as year 2001.
    const hasExplicitYear = /\b\d{4}\b/.test(raw);
    const isISODate = /^\d{4}-\d{1,2}-\d{1,2}/.test(raw);
    const isSlashDateWithYear = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(raw);
    if (!hasExplicitYear && !isISODate && !isSlashDateWithYear) return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatShortDate = (value) => {
  const date = parseDate(value);
  if (!date) return String(value ?? '');
  return SHORT_DATE_FORMATTER.format(date);
};

const formatTooltipDate = (value) => {
  const date = parseDate(value);
  if (!date) return String(value ?? '');
  return TOOLTIP_DATE_FORMATTER.format(date);
};

const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

/* ─── Custom Tooltip ─────────────────────────────────────────── */
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  const d = payload[0]?.payload || {};
  const isPast = d.is_past === true || d.actual !== undefined && d.actual !== null;
  const value = isPast ? d.actual : d.predicted || d.value;
  const labelText = formatTooltipDate(label);
  const accentColor = isPast ? 'text-blue-400' : 'text-emerald-400';
  const dotColor = isPast ? 'bg-blue-400' : 'bg-emerald-400';
  const labelType = isPast ? 'Historical Sales' : 'AI Smart Forecast';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="bg-slate-900/98 backdrop-blur-2xl border border-white/10 p-6 rounded-[2rem] shadow-[0_32px_64px_rgba(0,0,0,0.5)] min-w-[240px] ring-1 ring-white/5"
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.25em]">
          {labelText}
        </span>
        <div className={`w-2 h-2 rounded-full ${dotColor} ${!isPast && 'animate-pulse shadow-[0_0_8px_#10b981]'}`} />
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span className={`text-4xl font-black tracking-tighter ${accentColor}`}>
            {value != null ? Math.round(Number(value)).toLocaleString() : '0'}
          </span>
          <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">units</span>
        </div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] mt-2">
          {labelType}
        </p>
      </div>

      {!isPast && (d.lower != null || d.upper != null) && (
        <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 gap-4">
          <div>
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Lower Bound</p>
            <p className="text-xs font-bold text-emerald-300/80">{Math.round(d.lower || 0).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Upper Bound</p>
            <p className="text-xs font-bold text-emerald-300/80">{Math.round(d.upper || 0).toLocaleString()}</p>
          </div>
        </div>
      )}
    </motion.div>
  );
};

/* ─── Custom Legend ──────────────────────────────────────────── */
const CustomLegend = ({ mode = 'combined' }) => (
  <motion.div 
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.2 }}
    style={{ 
      display: 'flex', 
      gap: 20, 
      justifyContent: 'flex-end', 
      marginBottom: 20, 
      flexWrap: 'wrap',
      paddingBottom: 16,
      borderBottom: '1px solid rgba(226, 232, 240, 0.5)',
      minHeight: 'auto',
    }}
  >
    {[
      mode !== 'present' ? { color: '#3b82f6', label: 'Past Sales', dashed: false, isBar: false } : null,
      { color: '#10b981', label: 'AI Forecast', dashed: true, isBar: false },
    ].filter(Boolean).map(({ color, label, dashed, isBar }) => (
      <motion.div 
        key={label} 
        whileHover={{ scale: 1.05 }}
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 10,
          padding: '8px 14px',
          borderRadius: '8px',
          background: 'rgba(226, 232, 240, 0.05)',
          border: `1px solid ${color}20`,
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          whiteSpace: 'nowrap',
        }}
      >
        {isBar ? (
          <div style={{ width: 12, height: 12, borderRadius: 3, background: color, opacity: 0.8, boxShadow: `0 0 8px ${color}40`, flexShrink: 0 }} />
        ) : (
          <svg width={24} height={10} style={{ flexShrink: 0 }}>
            {dashed ? (
              <line x1={0} y1={5} x2={24} y2={5} stroke={color} strokeWidth={2.5} strokeDasharray="5 4" />
            ) : (
              <line x1={0} y1={5} x2={24} y2={5} stroke={color} strokeWidth={2.5} />
            )}
          </svg>
        )}
        <span style={{ 
          color: '#1f2937', 
          fontSize: 10, 
          fontWeight: 800, 
          textTransform: 'uppercase', 
          letterSpacing: '0.16em',
          opacity: 0.9,
          flexShrink: 0,
        }}>
          {label}
        </span>
      </motion.div>
    ))}
  </motion.div>
);

/* ─── Main Chart Component ───────────────────────────────────── */
const PredictionChart = ({
  pastData = [],
  forecastData = [],
  mode = 'combined',
  showLegend = true,
  height = 380,
  fullScreen = false,
  isAnalyzing = false,
  horizon = 'month',
}) => {
  const showPast = mode !== 'present';
  const showForecast = mode !== 'past';
  const numericHeight = Number(height);
  const isFixedHeight = Number.isFinite(numericHeight) && numericHeight > 0;
  const chartHeight = isFixedHeight ? Math.max(220, numericHeight) : '100%';
  const chartMargin = fullScreen
    ? { top: 20, right: 48, left: 64, bottom: 32 }
    : { top: 16, right: 32, left: 70, bottom: 24 };
  const formatAxisLabel = (value) => {
    const date = parseDate(value);
    return date ? SHORT_DATE_FORMATTER.format(date) : value;
  };

  // Merge past + future into one unified data array
  const chartData = useMemo(() => {
    // If backend returns a combined format with 'value', 'lower', 'upper'
    if (forecastData.length > 0 && forecastData[0].date && !forecastData[0].name) {
      const hist = (pastData || []).map(d => ({
        name: d.date || d.period || d.name,
        actual: toFiniteNumber(d.value || d.actual),
        is_past: true
      }));
      const fore = (forecastData || []).map(d => ({
        name: d.date,
        predicted: toFiniteNumber(d.value || d.predicted),
        lower: toFiniteNumber(d.lower),
        upper: toFiniteNumber(d.upper),
        is_past: false
      }));
      return [...hist, ...fore];
    }

    // Fallback to old behavior
    let forecastSlice = forecastData || [];
    if (showForecast) {
      forecastSlice = forecastSlice.slice(0, getHorizonLimit(horizon));
    }

    const past = (showPast ? pastData : []).map((d, idx, arr) => ({
      name: d.period || d.name,
      actual: toFiniteNumber(d.actual),
      predicted: null,
      is_past: true,
      is_current: idx === arr.length - 1,
    }));

    const future = (showForecast ? forecastSlice : []).map((d) => ({
      name: d.period || d.name,
      actual: null,
      predicted: toFiniteNumber(d.predicted),
      is_past: false,
      is_current: false,
    }));

    const combined = [...past, ...future];
    const seen = new Set();
    return combined.filter((item) => {
      if (!item.name) return false;
      if (seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    });
  }, [pastData, forecastData, showPast, showForecast, horizon]);

  // Forecast start divider label (first forecast point after past ends)
  const forecastStartLabel = useMemo(() => {
    if (!showForecast) return null;
    const future = forecastData || [];
    if (!future.length) return null;
    if (!showPast) {
      return future[0]?.period || future[0]?.name || null;
    }
    const pastNames = new Set((pastData || []).map((d) => d.period || d.name));
    const firstForecast = future.find((d) => !pastNames.has(d.period || d.name));
    return firstForecast?.period || firstForecast?.name || null;
  }, [pastData, forecastData, showForecast, showPast]);

  const currentPoint = useMemo(() => {
    if (!showPast) return null;
    const past = pastData || [];
    if (!past.length) return null;
    const last = past[past.length - 1];
    return {
      name: last.period || last.name,
      value: last.actual != null ? Number(last.actual) : null,
    };
  }, [pastData, showPast]);

  if (!chartData.length || isAnalyzing) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ 
          height: isFixedHeight ? chartHeight : 320,
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          flexDirection: 'column', 
          gap: 16,
          background: isAnalyzing 
            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(59, 130, 246, 0.05) 100%)'
            : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
          borderRadius: '16px',
          border: isAnalyzing ? '2px solid rgba(16, 185, 129, 0.2)' : '2px dashed #cbd5e1',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {isAnalyzing && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '2px',
              background: 'linear-gradient(90deg, transparent, #10b981, transparent)',
            }}
          />
        )}
        
        <motion.div 
          animate={isAnalyzing ? { 
            scale: [1, 1.1, 1],
            rotate: [0, 5, -5, 0]
          } : { 
            scale: [1, 1.05, 1] 
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          style={{ opacity: isAnalyzing ? 0.8 : 0.3 }}
        >
          {isAnalyzing ? (
            <div className="relative">
              <BrainCircuit size={56} className="text-emerald-500" />
              <motion.div
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute -top-2 -right-2"
              >
                <Sparkles size={20} className="text-amber-400" />
              </motion.div>
            </div>
          ) : (
            <span style={{ fontSize: 48 }}>📊</span>
          )}
        </motion.div>
        
        <div className="flex flex-col items-center gap-3 px-10">
          <p style={{ 
            color: isAnalyzing ? '#059669' : '#1e293b', 
            fontSize: 15, 
            fontWeight: 800, 
            letterSpacing: '0.01em', 
            textAlign: 'center',
            lineHeight: 1.5
          }}>
            {isAnalyzing ? "AI is analyzing your data…" : "No data uploaded yet"}
          </p>
          {isAnalyzing ? (
            <div className="flex items-center gap-2 mt-1">
              <Loader2 size={14} className="text-emerald-500 animate-spin" />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', opacity: 0.8 }}>
                Building your sales forecast — this takes a few seconds
              </span>
            </div>
          ) : (
            <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textAlign: 'center', lineHeight: 1.6 }}>
              Go to <strong style={{ color: '#10b981' }}>Data Cleaner</strong> in the sidebar and upload your sales or inventory sheet (Excel / CSV). The chart will appear automatically once your data is processed.
            </p>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      style={{
        width: '100%',
        height: chartHeight,
        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        border: fullScreen ? 'none' : '1px solid #e2e8f0',
        borderRadius: fullScreen ? '0px' : '16px',
        padding: fullScreen ? '32px' : '28px',
        boxShadow: fullScreen
          ? 'none'
          : '0 4px 20px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {showLegend && <CustomLegend mode={mode} />}
      <div style={{ flex: 1, minHeight: 220, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={220}>
          <ComposedChart data={chartData} margin={chartMargin}>
            <defs>
              {/* Enhanced gradients */}
              <linearGradient id="gradPast" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="50%" stopColor="#3b82f6" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
              </linearGradient>
              <filter id="shadow">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
              </filter>
            </defs>

            <CartesianGrid
              strokeDasharray="4 6"
              stroke="#cbd5e1"
              vertical={false}
              opacity={0.3}
              horizontalPoints={[0, 0.25, 0.5, 0.75, 1]}
            />

            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }}
              dy={15}
              interval={horizon === 'week' ? 0 : horizon === 'month' ? 6 : 'preserveStartEnd'}
              tickFormatter={formatAxisLabel}
              padding={{ left: 20, right: 20 }}
              minTickGap={20}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
              width={60}
              dx={-8}
            />

          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1.5, opacity: 0.5 }} />

          {/* Reference line for "Present" marker */}
          {showPast && showForecast && currentPoint && (
              <ReferenceLine 
                x={currentPoint.name} 
                stroke="#64748b" 
                strokeWidth={1} 
                strokeDasharray="3 3"
                label={{ 
                  value: 'PRESENT', 
                  position: 'top', 
                  fill: '#64748b', 
                  fontSize: 8, 
                  fontWeight: 900, 
                  letterSpacing: '0.2em',
                  dy: -10
                }} 
              />
          )}

          {/* Past sales area */}
          {showPast && (
            <Area
              type="monotone"
              dataKey="actual"
              stroke="#3b82f6"
              strokeWidth={4}
              fill="url(#gradPast)"
              fillOpacity={1}
              isAnimationActive={true}
              dot={false}
              activeDot={{ r: 6, fill: '#3b82f6', stroke: '#ffffff', strokeWidth: 2 }}
              connectNulls={true}
            />
          )}

          {/* AI Forecast area (Matching Image 1) */}
          {showForecast && (
            <Area
              type="monotone"
              dataKey="predicted"
              stroke="#10b981"
              strokeWidth={4}
              strokeDasharray={mode === 'combined' ? "8 5" : "0"}
              fill="rgba(16, 185, 129, 0.15)"
              isAnimationActive={true}
              dot={false}
              activeDot={{ r: 6, fill: '#10b981', stroke: '#ffffff', strokeWidth: 2 }}
              connectNulls={true}
            />
          )}

          {/* AI Forecast area (Matching Image 1) */}
          {showForecast && (
            <Area
              type="monotone"
              dataKey="predicted"
              stroke="#10b981"
              strokeWidth={4}
              strokeDasharray={mode === 'combined' ? "8 5" : "0"}
              fill="rgba(16, 185, 129, 0.15)"
              isAnimationActive={true}
              dot={false}
              activeDot={{ r: 6, fill: '#10b981', stroke: '#ffffff', strokeWidth: 2 }}
              connectNulls={true}
            />
          )}

          {/* Top Label for Peak (Image 1 style) */}
          {showForecast && (
            <ReferenceLine 
              x={chartData[chartData.length - 1]?.name} 
              stroke="transparent"
              label={{ 
                value: 'PROJECTED PEAK', 
                position: 'top', 
                fill: '#0f172a', 
                fontSize: 9, 
                fontWeight: 900,
                letterSpacing: '0.1em'
              }} 
            />
          )}

          {/* Reference line for "Present" marker */}
          {showPast && showForecast && currentPoint && (
              <ReferenceLine 
                x={currentPoint.name} 
                stroke="#64748b" 
                strokeWidth={1} 
                strokeDasharray="3 3"
                label={{ 
                  value: 'PRESENT', 
                  position: 'top', 
                  fill: '#64748b', 
                  fontSize: 8, 
                  fontWeight: 900, 
                  letterSpacing: '0.2em',
                  dy: -10
                }} 
              />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default PredictionChart;
