export const buildStatsFromAnalysisSummary = (analysisData) => ({
  anomalies: Array.isArray(analysisData?.alerts) ? analysisData.alerts.length : 0,
  cleaned: analysisData?.inventory_summary?.total_products || 0,
  predictions: analysisData?.inventory_summary?.total_sales || 0,
  verified: analysisData?.inventory_summary?.total_products || 0,
});
