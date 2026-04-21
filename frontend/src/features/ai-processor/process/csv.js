export const buildCsvString = (rows, columns) => {
  if (!Array.isArray(rows) || rows.length === 0) return '';

  const columnKeys = (columns || []).map((c) => (typeof c === 'string' ? c : c.accessorKey));
  const headers = columnKeys.map((k) => String(k).replace(/_/g, ' ').toUpperCase());
  headers.push('AUDIT_FINDING', 'SYSTEM_ACTION', 'BUSINESS_STATUS', 'NEURAL_TRUST');

  const csvRows = rows.map((row) => {
    const rowData = columnKeys.map((k) => {
      let val = row[k];
      if (val === null || val === undefined) val = '';
      return `"${String(val).replace(/"/g, '""')}"`;
    });

    rowData.push(
      `"${(row.ai_result || '').replace(/"/g, '""')}"`,
      `"${(row.cleaned_summary || '').replace(/"/g, '""')}"`,
      `"${(row.prediction || '').replace(/"/g, '""')}"`,
      `"${(row.is_reinforced ? 'Audit Passed' : 'Verified').replace(/"/g, '""')}"`
    );

    return rowData.join(',');
  });

  return [headers.join(','), ...csvRows].join('\n');
};
