export const buildInitialLogsAfterAnalysis = (analysisData) => [
  { message: 'Ingestion Phase: Success', status: 'done', type: 'success', category: 'Data Cleaning' },
  {
    message: `Sheets Loaded: ${analysisData?.metadata?.total_sheets_loaded ?? 0}`,
    status: 'done',
    type: 'success',
    category: 'Validation',
  },
  {
    message: `Detected ${analysisData?.inventory_summary?.total_products ?? 0} Products`,
    status: 'done',
    type: 'success',
    category: 'Validation',
  },
  {
    message: `Confidence Score: ${analysisData?.confidence_score ?? 0}%`,
    status: 'done',
    type: 'success',
    category: 'AI Analysis',
  },
  { message: 'Deep Scan Complete.', status: 'done', type: 'success', category: 'Finalizing' },
];

export const buildStartProcessingLogs = () => [
  { message: 'Initializing Multi-Model Ingestion Pipeline...', status: 'processing', type: 'info', category: 'Data Cleaning' },
  { message: 'Audit Trace: Connecting to Intelligence Cloud...', status: 'done', type: 'success', category: 'Data Cleaning' },
  { message: 'Statistical Engine Hot-Loaded.', status: 'done', type: 'success', category: 'AI Analysis' },
  { message: 'Finalizing Consensus Logic...', status: 'processing', type: 'info', category: 'Forecasting' },
];

export const buildFinalizeLogs = (resolvedAnalysis, summary, mappedData) => ([
  {
    message: `Analysis Complete: ${summary?.processed || mappedData.length} records processed.`,
    status: 'done',
    type: 'success',
    category: 'Finalizing',
  },
  {
    message: `Enterprise Data Shield: Confidence ${String(resolvedAnalysis?.confidence_score ?? 'N/A')} (${String(resolvedAnalysis?.confidence_label ?? 'Pending')}).`,
    status: 'done',
    type: 'success',
    category: 'AI Analysis',
  },
]);
