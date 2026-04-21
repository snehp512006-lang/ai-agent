import React from 'react';
import { Upload, Loader2, Rows, Columns, FileSpreadsheet, Search, Maximize2, Minimize2, SlidersHorizontal, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DataTable from '../../../components/AIProcessor/DataTable';

const ProcessorMainSection = ({
  status,
  isLight,
  uploadProgressPct,
  uploadFormattedProgress,
  uploadPhaseLabel,
  uploadPhaseMessage,
  uploadStatusText,
  fileInputRef,
  newSheetInputRef,
  onUpload,
  sheetPreviewOptions,
  sheetClassFilter,
  setSheetClassFilter,
  sheetViewKey,
  setSheetViewKey,
  sheetClassOptions,
  filteredSheetOptions,
  activeSheetPreview,
  sheetPreviewPage,
  setSheetPreviewPage,
  sheetPreviewTotalRows,
  sheetPreviewRowsLoading,
  tableSearchQuery,
  setTableSearchQuery,
  tableSearchField,
  setTableSearchField,
  tableSearchMode,
  setTableSearchMode,
  tableStatusFilter,
  setTableStatusFilter,
  tableBusinessFilter,
  setTableBusinessFilter,
  filterFieldOptions,
  businessFilterOptions,
  hasAdvancedFilters,
  onResetAdvancedFilters,
  onToggleFullscreen,
  isFullscreen,
  activeSheetDiagnostics,
  filteredDisplayData,
  displayColumnsCount,
  displayTableColumns,
  effectiveProcessingIndex,
}) => {
  const PREVIEW_PAGE_SIZE = 300;
  const boundedUploadProgress = Math.max(0, Math.min(100, Number(uploadProgressPct || 0)));
  const uploadPercentText = uploadFormattedProgress || `${boundedUploadProgress.toFixed(1)}%`;
  const phaseKey = String(uploadPhaseLabel || '').toUpperCase();
  const totalPreviewRows = activeSheetPreview
    ? (Number.isFinite(Number(sheetPreviewTotalRows))
      ? Number(sheetPreviewTotalRows)
      : Number(activeSheetPreview.total_rows || 0))
    : 0;
  const previewTotalPages = Math.max(1, Math.ceil(totalPreviewRows / PREVIEW_PAGE_SIZE));
  const safePreviewPage = Math.min(Math.max(1, Number(sheetPreviewPage || 1)), previewTotalPages);
  const previewStartRow = totalPreviewRows > 0 ? ((safePreviewPage - 1) * PREVIEW_PAGE_SIZE) + 1 : 0;
  const previewEndRow = totalPreviewRows > 0 ? Math.min(safePreviewPage * PREVIEW_PAGE_SIZE, totalPreviewRows) : 0;
  const activeFilterPills = [
    tableSearchField !== 'ALL' ? `Field: ${tableSearchField}` : null,
    tableSearchMode !== 'contains' ? `Match: ${tableSearchMode.replace('_', ' ')}` : null,
    tableStatusFilter !== 'ALL' ? `Status: ${tableStatusFilter}` : null,
    tableBusinessFilter !== 'ALL' ? `Business: ${tableBusinessFilter}` : null,
    tableSearchQuery.trim() ? `Query: ${tableSearchQuery.trim()}` : null,
  ].filter(Boolean);

  const uploadBadgeTone = phaseKey.includes('FINAL')
    ? {
      shell: isLight
        ? 'border-violet-200 bg-violet-50 text-violet-700'
        : 'border-violet-500/30 bg-violet-500/15 text-violet-200',
      dot: 'bg-violet-500',
    }
    : (phaseKey.includes('PROCESS') || phaseKey.includes('ANALYSIS'))
      ? {
        shell: isLight
          ? 'border-blue-200 bg-blue-50 text-blue-700'
          : 'border-blue-500/30 bg-blue-500/15 text-blue-200',
        dot: 'bg-blue-500',
      }
      : {
        shell: isLight
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200',
        dot: 'bg-emerald-500',
      };

  return (
    <main className="max-w-7xl mx-auto space-y-8">
      <AnimatePresence mode="wait">
        {status === 'IDLE' || status === 'UPLOADING' ? (
          <motion.div
            key="uploader"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`group w-full h-[600px] rounded-[3rem] border-2 border-dashed transition-all flex flex-col items-center justify-center gap-6 cursor-pointer ${status === 'UPLOADING'
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : isLight
                ? 'bg-gradient-to-br from-emerald-50 via-white to-emerald-50/70 border-emerald-200/70 shadow-[inset_0_2px_16px_rgba(16,185,129,0.06)] hover:border-emerald-300/80'
                : 'bg-emerald-950/40 border-emerald-500/25 shadow-[inset_0_2px_18px_rgba(2,6,23,0.5)] hover:border-emerald-500/40'
              }`}
            onClick={() => status === 'IDLE' && fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={onUpload}
              className="hidden"
              accept=".csv,.xlsx,.xls,.json"
            />
            <input
              type="file"
              ref={newSheetInputRef}
              onChange={onUpload}
              className="hidden"
              accept=".csv,.xlsx,.xls,.json"
            />

            {status === 'UPLOADING' ? (
              <>
                <div className="relative w-40 h-40 rounded-[2rem] bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shadow-[0_25px_60px_rgba(16,185,129,0.18)]">
                  <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 160 160" aria-hidden="true">
                    <circle cx="80" cy="80" r="58" stroke="rgba(16,185,129,0.18)" strokeWidth="10" fill="none" />
                    <circle
                      cx="80"
                      cy="80"
                      r="58"
                      stroke="url(#uploadProgressGradient)"
                      strokeWidth="10"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={364.42}
                      strokeDashoffset={364.42 - ((boundedUploadProgress / 100) * 364.42)}
                      style={{ transition: 'stroke-dashoffset 260ms ease-out' }}
                    />
                    <defs>
                      <linearGradient id="uploadProgressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#2563eb" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="relative z-10 flex flex-col items-center">
                    <Loader2 className="text-emerald-500 animate-spin" size={30} />
                  </div>
                </div>

                <div className="w-full max-w-xl text-center space-y-3">
                  <h2 className={`text-2xl font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-emerald-50'}`}>
                    {uploadPhaseLabel || 'AI Schema Discovery'}
                  </h2>
                  <p className={`text-sm font-semibold transition-all duration-500 ${isLight ? 'text-slate-500' : 'text-emerald-100/75'}`}>
                    {uploadPhaseMessage || uploadStatusText || 'Resolving ambiguous vectors via LLM consensus...'}
                  </p>

                  <div className="flex items-center justify-end">
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-sm ${uploadBadgeTone.shell}`}>
                      <span className={`w-2 h-2 rounded-full animate-pulse ${uploadBadgeTone.dot}`} />
                      <span className="text-[11px] font-black uppercase tracking-widest">Progress</span>
                      <span className="text-sm font-black tabular-nums">{uploadPercentText}</span>
                    </div>
                  </div>

                  <div className={`w-full h-3 rounded-full overflow-hidden ${isLight ? 'bg-slate-200/80 shadow-[inset_0_2px_6px_rgba(15,23,42,0.12)]' : 'bg-emerald-900/45 shadow-[inset_0_2px_6px_rgba(2,6,23,0.5)]'}`}>
                    <motion.div
                      className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-blue-500"
                      animate={{ width: `${boundedUploadProgress}%` }}
                      transition={{ duration: 0.24, ease: 'easeInOut' }}
                    />
                  </div>

                  <div className={`text-[11px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-emerald-700' : 'text-emerald-300/90'}`}>
                    Live analysis progress in sync with AI pipeline
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className={`w-24 h-24 rounded-3xl flex items-center justify-center transition-colors ${
                  isLight
                    ? 'bg-emerald-100/70 text-emerald-600 group-hover:bg-emerald-100'
                    : 'bg-emerald-500/10 text-emerald-300 group-hover:bg-emerald-500/20'
                }`}>
                  <Upload className="mb-0 transition-colors" size={48} />
                </div>
                <div className="text-center">
                  <h2 className={`text-xl font-black tracking-tight mb-2 ${isLight ? 'text-emerald-950' : 'text-emerald-50'}`}>
                    Drop your dataset here
                  </h2>
                  <p className={`text-sm font-medium ${isLight ? 'text-emerald-700/70' : 'text-emerald-100/70'}`}>
                    Accepts .CSV, .XLSX up to 50MB
                  </p>
                </div>
                <div className={`mt-4 px-8 py-3 rounded-full font-black text-[10px] uppercase tracking-widest ${
                  isLight
                    ? 'bg-emerald-600 text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)]'
                    : 'bg-emerald-500 text-emerald-950 shadow-[0_10px_25px_rgba(16,185,129,0.25)]'
                }`}>
                  Select File
                </div>
              </>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="table"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full space-y-6"
          >
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="px-4 py-2 bg-[var(--bg-accent)] rounded-xl border border-[var(--border-subtle)] flex items-center gap-3">
                    <Rows size={16} className="text-[var(--text-muted)]" />
                    <span className="text-xs font-black text-[var(--text-main)]">{filteredDisplayData.length} <span className="text-[var(--text-muted)] font-bold ml-1">RECORDS</span></span>
                  </div>
                  <div className="px-4 py-2 bg-[var(--bg-accent)] rounded-xl border border-[var(--border-subtle)] flex items-center gap-3">
                    <Columns size={16} className="text-[var(--text-muted)]" />
                    <span className="text-xs font-black text-[var(--text-main)]">{displayColumnsCount} <span className="text-[var(--text-muted)] font-bold ml-1">COLUMNS</span></span>
                  </div>
                  {activeSheetPreview && (
                    <div className="px-4 py-2 bg-[var(--bg-accent)] rounded-xl border border-[var(--border-subtle)] flex items-center gap-3">
                      <FileSpreadsheet size={16} className="text-[var(--text-muted)]" />
                      <span className="text-xs font-black text-[var(--text-main)]">{activeSheetPreview.classification} <span className="text-[var(--text-muted)] font-bold ml-1">SHEET</span></span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {sheetPreviewOptions.length > 0 && (
                    <div className="flex items-center gap-2">
                      <select
                        value={sheetClassFilter}
                        onChange={(e) => {
                          const nextFilter = e.target.value;
                          setSheetClassFilter(nextFilter);
                          if (sheetViewKey !== 'analysis') {
                            const stillVisible = sheetPreviewOptions.some(
                              (s) => s.sheet_name === sheetViewKey && (nextFilter === 'ALL' || String(s.classification) === nextFilter)
                            );
                            if (!stillVisible) setSheetViewKey('analysis');
                          }
                        }}
                        className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-main)] focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
                      >
                        {sheetClassOptions.map((cls) => (
                          <option key={cls} value={cls}>{cls}</option>
                        ))}
                      </select>

                      <select
                        value={sheetViewKey}
                        onChange={(e) => setSheetViewKey(e.target.value)}
                        className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-main)] focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
                      >
                        <option value="analysis">Consolidated Analysis View</option>
                        {filteredSheetOptions.map((sheet) => (
                          <option key={sheet.sheet_name} value={sheet.sheet_name}>
                            {sheet.sheet_name} ({sheet.classification})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    onClick={onToggleFullscreen}
                    className={`p-2.5 rounded-xl border transition-colors ${
                      isLight
                        ? 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                    title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                  >
                    {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-4 shadow-sm">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
                        <SlidersHorizontal size={18} />
                      </div>
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-500">Advanced Search</div>
                        <div className="text-sm font-semibold text-[var(--text-main)]">
                          Filter by field, match logic, audit status, and business outcome
                        </div>
                      </div>
                    </div>

                    {hasAdvancedFilters && (
                      <button
                        type="button"
                        onClick={onResetAdvancedFilters}
                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-[11px] font-black uppercase tracking-widest text-[var(--text-main)] transition hover:border-emerald-400/50 hover:text-emerald-500"
                      >
                        <X size={14} />
                        Clear Filters
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 xl:grid-cols-[1.3fr_0.9fr_0.8fr_0.8fr_0.9fr]">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={14} />
                      <input
                        type="text"
                        value={tableSearchQuery}
                        onChange={(e) => setTableSearchQuery(e.target.value)}
                        placeholder={activeSheetPreview ? 'Search selected sheet...' : 'Search analysis table...'}
                        className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel,rgba(255,255,255,0.65))] px-10 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/10"
                      />
                    </div>

                    <select
                      value={tableSearchField}
                      onChange={(e) => setTableSearchField(e.target.value)}
                      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel,rgba(255,255,255,0.65))] px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/10"
                    >
                      {filterFieldOptions.map((field) => (
                        <option key={field} value={field}>
                          {field === 'ALL' ? 'All Fields' : field}
                        </option>
                      ))}
                    </select>

                    <select
                      value={tableSearchMode}
                      onChange={(e) => setTableSearchMode(e.target.value)}
                      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel,rgba(255,255,255,0.65))] px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/10"
                    >
                      <option value="contains">Contains</option>
                      <option value="equals">Equals</option>
                      <option value="starts_with">Starts With</option>
                      <option value="empty">Is Empty</option>
                      <option value="not_empty">Is Filled</option>
                    </select>

                    <select
                      value={tableStatusFilter}
                      onChange={(e) => setTableStatusFilter(e.target.value)}
                      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel,rgba(255,255,255,0.65))] px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/10"
                    >
                      <option value="ALL">All Audit Status</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="PROCESSING">Processing</option>
                      <option value="PENDING">Pending</option>
                    </select>

                    <select
                      value={tableBusinessFilter}
                      onChange={(e) => setTableBusinessFilter(e.target.value)}
                      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel,rgba(255,255,255,0.65))] px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/10"
                    >
                      {businessFilterOptions.map((option) => (
                        <option key={option} value={option}>
                          {option === 'ALL' ? 'All Business Status' : option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      {['HEALTHY', 'LOW STOCK', 'OUT OF STOCK', 'OVERSTOCK', 'DEADSTOCK'].map((quickFilter) => (
                        <button
                          key={quickFilter}
                          type="button"
                          onClick={() => setTableBusinessFilter((current) => (current === quickFilter ? 'ALL' : quickFilter))}
                          className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition ${
                            tableBusinessFilter === quickFilter
                              ? 'border-emerald-400 bg-emerald-500/10 text-emerald-500'
                              : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-emerald-400/40 hover:text-emerald-500'
                          }`}
                        >
                          {quickFilter}
                        </button>
                      ))}
                    </div>

                    <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                      Showing {filteredDisplayData.length} matching rows
                    </div>
                  </div>

                  {activeFilterPills.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      {activeFilterPills.map((pill) => (
                        <span
                          key={pill}
                          className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-600"
                        >
                          {pill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {activeSheetDiagnostics && (
                <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                  {activeSheetDiagnostics.sheet_name} | {activeSheetDiagnostics.classification} | confidence {activeSheetDiagnostics.confidence}% | rows {activeSheetDiagnostics.rows_after_clean}/{activeSheetDiagnostics.raw_rows}
                </div>
              )}
              {activeSheetPreview?.truncated && (
                <div className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">
                  Preview mode: showing rows {previewStartRow}-{previewEndRow} out of {totalPreviewRows} for selected sheet.
                </div>
              )}
              {activeSheetPreview?.truncated && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2">
                  <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wide">
                    Batch {safePreviewPage} / {previewTotalPages} (300 rows per batch)
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSheetPreviewPage((prev) => Math.max(1, Number(prev || 1) - 1))}
                      disabled={safePreviewPage <= 1 || sheetPreviewRowsLoading}
                      className="px-3 py-1.5 text-[11px] font-black rounded-lg border border-[var(--border-subtle)] text-[var(--text-main)] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => setSheetPreviewPage((prev) => Math.min(previewTotalPages, Number(prev || 1) + 1))}
                      disabled={safePreviewPage >= previewTotalPages || sheetPreviewRowsLoading}
                      className="px-3 py-1.5 text-[11px] font-black rounded-lg border border-[var(--border-subtle)] text-[var(--text-main)] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
              <DataTable
                data={filteredDisplayData}
                columns={displayTableColumns}
                processingRowIndex={effectiveProcessingIndex}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
};

export default ProcessorMainSection;
