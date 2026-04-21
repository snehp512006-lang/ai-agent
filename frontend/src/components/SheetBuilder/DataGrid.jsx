import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Type,
  Hash,
  Calendar,
  ChevronDown,
  CheckSquare,
  Paperclip,
  MoreVertical,
  Plus,
  Trash2,
  Save,
  Download,
  CheckCircle2,
  Loader2
} from 'lucide-react';

const DataGrid = ({
  columns,
  data,
  onCellChange,
  onAddRow,
  onAddColumn,
  onColumnClick,
  activeColumnId,
  onDeleteRow,
  onDeleteColumn,
  onSave,
  onPublish,
  onExport,
  sheetName,
  onSheetNameChange,
  isPublishing = false,
  analysisStatus = null
}) => {
  const [activeCell, setActiveCell] = useState(null); // {rowIdx, colId}
  const [hoveredRow, setHoveredRow] = useState(null);
  const [hoveredCol, setHoveredCol] = useState(null);

  return (
    <div className="flex-1 h-full flex flex-col min-h-0 bg-transparent overflow-hidden">
      {/* Scrollable Container - The h-0 flex-1 trick forces the child to fit the parent exactly */}
      <div
        className="flex-1 h-0 overflow-auto custom-scrollbar relative"
        onMouseLeave={() => { setHoveredRow(null); setHoveredCol(null); }}
      >
        <table className="w-full border-separate border-spacing-0 min-w-max">
          <thead className="sticky top-0 z-30">
            <tr className="bg-[var(--bg-sidebar)] backdrop-blur-3xl relative z-40">
              <th className="w-14 sticky left-0 z-40 bg-[var(--bg-sidebar)] border-b border-r border-[var(--border-subtle)] p-5 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">#</th>
              {columns.map(col => (
                <th
                  key={col.id}
                  style={{ width: col.width }}
                  className={`border-b border-r border-[var(--border-subtle)] p-5 text-left group cursor-pointer transition-all duration-300 ${activeColumnId === col.id ? 'bg-emerald-500/[0.04] border-b-emerald-500/50 shadow-[0_-10px_30px_rgba(16,185,129,0.05)]' :
                    hoveredCol === col.id ? 'bg-[var(--bg-accent)]' : ''
                    }`}
                  onClick={() => onColumnClick && onColumnClick(col.id)}
                  onMouseEnter={() => setHoveredCol(col.id)}
                  onMouseLeave={() => setHoveredCol(null)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`text-[11px] font-black uppercase tracking-[0.15em] ${activeColumnId === col.id ? 'text-emerald-400' : 'text-[var(--text-muted)] group-hover:text-[var(--text-main)] transition-colors'}`}>{col.name}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteColumn && onDeleteColumn(col.id); }}
                        className="p-1.5 hover:bg-red-500/10 hover:text-red-400 rounded-lg text-slate-600 transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </th>
              ))}
              {/* Integrated Add Column Header */}
              <th
                className="w-20 border-b border-[var(--border-subtle)] bg-[var(--bg-accent)] hover:bg-emerald-500/10 transition-colors cursor-pointer group relative"
                onClick={onAddColumn}
                title="Add New Column"
              >
                <div className="flex items-center justify-center h-full">
                  <div className="w-9 h-9 rounded-2xl bg-[var(--bg-accent)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] group-hover:text-emerald-500 group-hover:border-emerald-500/30 group-hover:scale-110 transition-all duration-300 shadow-sm">
                    <Plus size={18} strokeWidth={3} />
                  </div>
                </div>
              </th>
              <th className="flex-1 border-b border-[var(--border-subtle)] bg-[var(--bg-accent)]" />
            </tr>
          </thead>
          <tbody>
            {(data && data.length > 0 ? data : [...Array(12)]).map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className={`transition-colors group ${hoveredRow === rowIdx ? 'bg-[var(--bg-accent)]' : 'hover:bg-[var(--bg-accent)]/30'}`}
                onMouseEnter={() => setHoveredRow(rowIdx)}
              >
                <td className={`w-14 sticky left-0 z-10 border-r border-b border-[var(--border-subtle)] p-5 text-center group/row backdrop-blur-3xl transition-colors ${hoveredRow === rowIdx ? 'bg-[var(--bg-accent)]' : 'bg-[var(--bg-sidebar)]'
                  }`}>
                  <span className="text-[11px] text-[var(--text-dim)] font-bold tabular-nums group-hover/row:opacity-0 transition-opacity">
                    {rowIdx + 1}
                  </span>
                  <button
                    onClick={() => onDeleteRow && onDeleteRow(rowIdx)}
                    className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/row:opacity-100 text-red-500/60 hover:text-red-500 transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                </td>
                {columns.map(col => (
                  <td
                    key={col.id}
                    className={`border-r border-b border-[var(--border-subtle)] p-0 bg-transparent relative transition-colors ${activeCell?.rowIdx === rowIdx && activeCell?.colId === col.id ? 'bg-emerald-500/[0.05]' :
                      hoveredCol === col.id ? 'bg-[var(--bg-accent)]' : ''
                      }`}
                    onMouseEnter={() => setHoveredCol(col.id)}
                  >
                    {(() => {
                      const value = row ? row[col.name] ?? '' : '';

                      let isValid = true;
                      if (value !== '') {
                        if (col.type === 'email') {
                          isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
                        } else if (col.type === 'url') {
                          isValid = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(value);
                        } else if (col.type === 'phone') {
                          isValid = /^[\d\s\-\+\(\)]+$/.test(value) && value.length >= 7;
                        } else if (col.type === 'number' || col.type === 'currency') {
                          isValid = !isNaN(Number(value));
                        }
                      }

                      const textColor = isValid ? "text-[var(--text-main)] focus:text-emerald-400" : "text-red-500 focus:text-red-600 font-bold";
                      const baseClassName = `w-full h-full bg-transparent p-5 text-[13px] ${textColor} outline-none border-none placeholder:text-[var(--text-dim)] font-medium transition-colors`;

                      if (col.type === 'checkbox') {
                        return (
                          <div className="w-full h-full flex items-center justify-center">
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-emerald-500 bg-[var(--bg-input)] border-[var(--border-input)] rounded cursor-pointer"
                              checked={!!value}
                              onFocus={() => setActiveCell({ rowIdx, colId: col.id })}
                              onBlur={() => setActiveCell(null)}
                              onChange={(e) => onCellChange && onCellChange(rowIdx, col.name, e.target.checked)}
                            />
                          </div>
                        );
                      }

                      let inputType = 'text';
                      if (col.type === 'number' || col.type === 'currency') inputType = 'text'; // use text to allow showing red if invalid number entered before
                      else if (col.type === 'date') inputType = 'date';
                      else if (col.type === 'email') inputType = 'text'; // custom validation
                      else if (col.type === 'phone') inputType = 'tel';
                      else if (col.type === 'url') inputType = 'text'; // custom validation

                      if (col.type === 'dropdown') {
                        return (
                          <select
                            className={`${baseClassName} appearance-none cursor-pointer [&>option]:bg-[var(--bg-base)]`}
                            value={value}
                            onFocus={() => setActiveCell({ rowIdx, colId: col.id })}
                            onBlur={() => setActiveCell(null)}
                            onChange={(e) => onCellChange && onCellChange(rowIdx, col.name, e.target.value)}
                          >
                            <option value="" disabled>Select...</option>
                            {(col.options || []).map((opt, i) => (
                              <option key={i} value={opt}>{opt}</option>
                            ))}
                          </select>
                        );
                      }

                      return (
                        <input
                          type={inputType}
                          className={baseClassName}
                          placeholder={col.type === 'custom' && col.customType ? `Enter ${col.customType}...` : "Enter data..."}
                          value={value}
                          spellCheck={col.type === 'text' || col.type === 'custom'}
                          onFocus={() => setActiveCell({ rowIdx, colId: col.id })}
                          onBlur={() => setActiveCell(null)}
                          onChange={(e) => onCellChange && onCellChange(rowIdx, col.name, e.target.value)}
                        />
                      );
                    })()}
                    {activeCell?.rowIdx === rowIdx && activeCell?.colId === col.id && (
                      <div className="absolute inset-0 border-2 border-emerald-500/30 pointer-events-none" />
                    )}
                  </td>
                ))}
                <td className="flex-1 border-b border-[var(--border-subtle)] bg-[var(--bg-accent)]/10" />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="group/add-row">
              <td
                className="w-14 sticky left-0 z-10 border-r border-[var(--border-subtle)] p-5 text-center bg-[var(--bg-sidebar)] backdrop-blur-3xl group-hover/add-row:bg-emerald-500/10 transition-all cursor-pointer"
                onClick={onAddRow}
              >
                <div className="flex items-center justify-center">
                  <div className="w-8 h-8 rounded-xl bg-[var(--bg-accent)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] group-hover/add-row:text-emerald-400 group-hover/add-row:border-emerald-500/30 group-hover/add-row:scale-110 transition-all duration-300 shadow-sm">
                    <Plus size={16} strokeWidth={3} />
                  </div>
                </div>
              </td>
              <td
                colSpan={columns.length}
                className="bg-[var(--bg-accent)]/50 px-8 py-5 group-hover/add-row:bg-emerald-500/[0.03] transition-colors cursor-pointer"
                onClick={onAddRow}
              >
              </td>
              <td className="flex-1 bg-[var(--bg-accent)]/30" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer / Docked Action Bar */}
      <div className="p-6 border-t border-[var(--border-subtle)] bg-[var(--bg-sidebar)] backdrop-blur-3xl flex items-center justify-between relative overflow-hidden shrink-0">
        {/* Footer Glow */}
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[100px] bg-emerald-500/5 blur-[80px] pointer-events-none" />

        <div className="flex items-center gap-3">
          <div
            className={`w-2 h-2 rounded-full ${
              analysisStatus === 'PROCESSING'
                ? 'bg-emerald-500 animate-pulse'
                : analysisStatus === 'COMPLETED'
                  ? 'bg-emerald-500'
                  : analysisStatus === 'ERROR'
                    ? 'bg-rose-500'
                    : 'bg-emerald-500 animate-pulse'
            }`}
          />
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            {analysisStatus === 'PROCESSING'
              ? 'AI Processing'
              : analysisStatus === 'COMPLETED'
                ? 'Analysis Completed'
                : analysisStatus === 'ERROR'
                  ? 'Analysis Error'
                  : 'System Ready'}
          </span>
        </div>

        <div className="flex items-center gap-4 relative z-10">
          <button
            onClick={onExport}
            className="flex items-center gap-3 px-8 py-2.5 rounded-2xl bg-[var(--bg-accent)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-accent)]/80 transition-all text-[11px] font-black uppercase tracking-[0.2em] group active:scale-95"
          >
            <div className="p-1.5 bg-[var(--bg-accent)] rounded-lg group-hover:-translate-y-1 transition-transform">
              <Download size={14} className="group-hover:scale-110 transition-transform" />
            </div>
            Export
          </button>

          <button
            onClick={onPublish}
            disabled={isPublishing}
            className={`flex items-center gap-3 px-8 py-2.5 rounded-2xl border text-[11px] font-black uppercase tracking-[0.2em] group active:scale-95 transition-all ${
              isPublishing
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500 opacity-70 cursor-not-allowed'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500 hover:text-white'
            }`}
          >
            <div className={`p-1.5 rounded-lg transition-transform ${isPublishing ? 'bg-emerald-500/20' : 'bg-emerald-500/20 group-hover:bg-slate-900/20 group-hover:rotate-12'}`}>
              {isPublishing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CheckCircle2 size={14} className="group-hover:scale-110 transition-transform" />
              )}
            </div>
            {isPublishing ? 'Publishing...' : 'Publish'}
          </button>
          <button
            onClick={onSave}
            className="premium-btn px-10 py-3 rounded-2xl bg-blue-600 text-white text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-[0_20px_40px_rgba(37,99,235,0.2)] flex items-center gap-3 group active:scale-95"
          >
            <div className="p-1.5 bg-white/10 rounded-lg group-hover:rotate-12 transition-transform">
              <Save size={14} className="group-hover:scale-110 transition-transform" />
            </div>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataGrid;
