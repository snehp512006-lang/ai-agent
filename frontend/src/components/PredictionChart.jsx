import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { motion } from 'framer-motion';
import { Activity, BrainCircuit, CalendarRange, Loader2, TrendingUp } from 'lucide-react';

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: '2-digit',
});

const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
});

const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const parseDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatShortDate = (value) => {
  const parsed = parseDate(value);
  return parsed ? SHORT_DATE_FORMATTER.format(parsed) : String(value || '');
};

const formatLongDate = (value) => {
  const parsed = parseDate(value);
  return parsed ? LONG_DATE_FORMATTER.format(parsed) : String(value || '');
};

const getHorizonLimit = (horizon) => {
  if (horizon === 'month') return 6;
  return 12;
};

const buildChartData = ({ pastData = [], forecastData = [], mode = 'combined', horizon = 'month' }) => {
  const showPast = mode !== 'present';
  const showForecast = mode !== 'past';
  const limitedForecast = showForecast ? forecastData.slice(0, getHorizonLimit(horizon)) : [];

  const pastRows = (showPast ? pastData : []).map((row) => ({
    period: row.period || row.name || row.date,
    actual: toFiniteNumber(row.actual ?? row.value),
    predicted: null,
    lower: null,
    upper: null,
    segment: 'past',
  }));

  const forecastRows = limitedForecast.map((row) => ({
    period: row.period || row.name || row.date,
    actual: null,
    predicted: toFiniteNumber(row.predicted ?? row.predicted_demand ?? row.value),
    lower: toFiniteNumber(row.lower),
    upper: toFiniteNumber(row.upper),
    segment: 'forecast',
  }));

  return [...pastRows, ...forecastRows].filter((row) => row.period);
};

const getSummaryCards = (rows = []) => {
  const historical = rows.filter((row) => row.actual != null);
  const forecast = rows.filter((row) => row.predicted != null);

  const lastActual = historical[historical.length - 1]?.actual ?? null;
  const avgForecast = forecast.length
    ? Math.round(forecast.reduce((sum, row) => sum + Number(row.predicted || 0), 0) / forecast.length)
    : null;
  const peakForecast = forecast.length
    ? Math.max(...forecast.map((row) => Number(row.predicted || 0)))
    : null;

  return [
    { label: 'Latest Actual', value: lastActual != null ? `${Math.round(lastActual).toLocaleString()} units` : 'Not available', icon: Activity, tone: 'emerald' },
    { label: 'Forecast Average', value: avgForecast != null ? `${avgForecast.toLocaleString()} units` : 'Not available', icon: TrendingUp, tone: 'blue' },
    { label: 'Forecast Peak', value: peakForecast != null ? `${peakForecast.toLocaleString()} units` : 'Not available', icon: CalendarRange, tone: 'violet' },
  ];
};

const toneClasses = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload || {};
  const isHistorical = row.actual != null;
  const value = isHistorical ? row.actual : row.predicted;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.10)]">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{formatLongDate(label)}</p>
      <p className={`mt-2 text-xl font-black ${isHistorical ? 'text-blue-700' : 'text-emerald-700'}`}>
        {value != null ? Math.round(value).toLocaleString() : '0'}
      </p>
      <p className="text-[11px] font-semibold text-slate-500">{isHistorical ? 'Actual sales' : 'Projected demand'}</p>
      {!isHistorical && row.lower != null && row.upper != null && (
        <p className="mt-2 text-[11px] text-slate-500">
          Range: {Math.round(row.lower).toLocaleString()} to {Math.round(row.upper).toLocaleString()}
        </p>
      )}
    </div>
  );
};

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
  const chartData = useMemo(
    () => buildChartData({ pastData, forecastData, mode, horizon }),
    [pastData, forecastData, mode, horizon],
  );

  const summaryCards = useMemo(() => getSummaryCards(chartData), [chartData]);
  const hasData = chartData.length > 0;
  const chartHeight = Number.isFinite(Number(height)) ? Math.max(280, Number(height)) : 380;

  if (!hasData || isAnalyzing) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex h-full min-h-[360px] flex-col justify-between rounded-[2rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-emerald-50/40 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700">Executive Forecast View</p>
            <h3 className="mt-2 text-2xl font-black text-slate-900">Analysis Graph</h3>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">
            {isAnalyzing ? 'Processing' : 'Waiting for analysis'}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {summaryCards.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className={`rounded-2xl border px-4 py-4 ${toneClasses[tone]}`}>
              <div className="flex items-center gap-2">
                <Icon size={14} />
                <p className="text-[10px] font-black uppercase tracking-[0.14em]">{label}</p>
              </div>
              <p className="mt-3 text-sm font-black text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-slate-300 bg-white/70 px-8 py-10 text-center">
          {isAnalyzing ? (
            <>
              <Loader2 size={36} className="animate-spin text-emerald-600" />
              <p className="mt-4 text-lg font-black text-slate-900">Building analysis graph</p>
              <p className="mt-2 max-w-xl text-sm font-medium text-slate-500">
                Your AI analysis is being processed. The graph will render automatically when past sales and forecast data become available.
              </p>
            </>
          ) : (
            <>
              <BrainCircuit size={38} className="text-emerald-600" />
              <p className="mt-4 text-lg font-black text-slate-900">No chart data available yet</p>
              <p className="mt-2 max-w-xl text-sm font-medium text-slate-500">
                This section now uses real analysis output. Once your analysis payload includes past sales or forecast values, the professional graph will appear here automatically.
              </p>
            </>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col rounded-[2rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-emerald-50/30 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.06)]"
      style={{ minHeight: chartHeight }}
    >
      <div className="mb-5 grid gap-3 md:grid-cols-3">
        {summaryCards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className={`rounded-2xl border px-4 py-4 ${toneClasses[tone]}`}>
            <div className="flex items-center gap-2">
              <Icon size={14} />
              <p className="text-[10px] font-black uppercase tracking-[0.14em]">{label}</p>
            </div>
            <p className="mt-3 text-sm font-black text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {showLegend && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">
            <span className="h-2 w-2 rounded-full bg-blue-600" />
            Actual Sales
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
            AI Forecast
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
            {mode === 'past' ? 'Past only' : mode === 'present' ? 'Forecast only' : 'Combined'}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white/80 p-4">
        <ResponsiveContainer width="100%" height={fullScreen ? '100%' : Math.max(260, chartHeight - 180)}>
          <AreaChart data={chartData} margin={{ top: 18, right: 18, left: 0, bottom: 10 }}>
            <defs>
              <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.24} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity={0.14} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 6" />
            <XAxis
              dataKey="period"
              tickFormatter={formatShortDate}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }}
              minTickGap={24}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }}
              tickFormatter={(value) => {
                if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
                return `${Math.round(value)}`;
              }}
              width={56}
            />
            <Tooltip content={<CustomTooltip />} />

            <Area type="monotone" dataKey="actual" stroke="none" fill="url(#actualFill)" connectNulls />
            <Line
              type="monotone"
              dataKey="actual"
              stroke="#2563eb"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 5, fill: '#2563eb', stroke: '#fff', strokeWidth: 2 }}
              connectNulls
            />

            <Area type="monotone" dataKey="predicted" stroke="none" fill="url(#forecastFill)" connectNulls />
            <Line
              type="monotone"
              dataKey="predicted"
              stroke="#10b981"
              strokeWidth={3}
              strokeDasharray="7 5"
              dot={false}
              activeDot={{ r: 5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default PredictionChart;
