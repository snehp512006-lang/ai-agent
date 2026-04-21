export const getDynamicStatusText = (displayProgressPct, phaseLabel) => {
  if (displayProgressPct < 5) {
    return 'Initializing AI Models...';
  }
  if (displayProgressPct > 95) {
    return 'Finalizing Insights...';
  }
  if (String(phaseLabel).toLowerCase().includes('clean')) return 'Analyzing patterns...';
  if (String(phaseLabel).toLowerCase().includes('analysis')) return 'Detecting anomalies...';
  return 'Forecasting trends...';
};
