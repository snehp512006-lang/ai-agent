export const buildPendingRows = (completedRows) => completedRows.map((row) => ({
  ...row,
  ai_status: 'PENDING',
  ai_result: '',
  cleaned_summary: '',
  prediction: '',
  is_reinforced: false,
}));
