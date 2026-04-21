import React, { useRef, useMemo, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { CheckCircle2, Loader2, AlertCircle, Play, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';

const DataTable = ({ data, columns, processingRowIndex }) => {
  const parentRef = useRef(null);
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56, // row height
    overscan: 12,
  });

  useEffect(() => {
    if (processingRowIndex !== null && processingRowIndex !== undefined) {
      rowVirtualizer.scrollToIndex(processingRowIndex, { 
        align: 'center',
        behavior: 'auto'
      });
    }
  }, [processingRowIndex, rowVirtualizer]);

  const activeItem = rowVirtualizer.getVirtualItems().find(v => v.index === processingRowIndex);
  let indicatorTop = '50%';
  if (activeItem && parentRef.current) {
    const parentRect = parentRef.current.getBoundingClientRect();
    const relativeY = activeItem.start - parentRef.current.scrollTop;
    // Calculate screen Y based on parent's physical position
    indicatorTop = `${Math.min(window.innerHeight - 80, Math.max(120, parentRect.top + relativeY + 28))}px`;
  }

  return (
    <div
      ref={parentRef}
      className={`h-[650px] overflow-auto rounded-[2rem] custom-scrollbar relative ${
        isLight
          ? 'border border-slate-200 bg-white shadow-sm'
          : 'border border-white/5 bg-slate-900/40 backdrop-blur-sm'
      }`}
    >
      <table className="w-full text-left border-separate border-spacing-0">
        <thead className={`sticky top-0 z-30 backdrop-blur-xl ${isLight ? 'bg-slate-100/95' : 'bg-slate-950/80'}`}>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th
                  key={header.id}
                  className={`py-5 px-6 text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${
                    isLight ? 'text-slate-500 border-b border-slate-200' : 'text-slate-500 border-b border-white/5'
                  }`}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {rowVirtualizer.getVirtualItems().length > 0 && (
            <tr>
              <td style={{ height: `${rowVirtualizer.getVirtualItems()[0].start}px` }} colSpan={columns.length} />
            </tr>
          )}
          {rowVirtualizer.getVirtualItems().map(virtualRow => {
            const row = rows[virtualRow.index];
            const isProcessing = virtualRow.index === processingRowIndex;
            const isCompleted = row.original?.ai_status === 'COMPLETED';
            
            return (
              <tr
                key={row.id}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className={`group transition-all duration-300 ${
                  isLight ? 'hover:bg-slate-50' : 'hover:bg-white/[0.02]'
                } ${
                  isProcessing 
                    ? isLight
                      ? 'bg-emerald-50 shadow-[inset_4px_0_0_0_#10b981,0_0_0_1px_rgba(16,185,129,0.25),0_0_22px_rgba(16,185,129,0.18)] border-y border-emerald-300 animate-pulse'
                      : 'bg-emerald-500/15 shadow-[inset_4px_0_0_0_#10b981,0_0_0_1px_rgba(16,185,129,0.35),0_0_26px_rgba(16,185,129,0.2)] border-y border-emerald-500/40 animate-pulse'
                    : isCompleted
                      ? isLight
                        ? 'bg-emerald-50/45 border-b border-emerald-100'
                        : 'bg-emerald-500/[0.06] border-b border-emerald-500/15'
                    : isLight
                      ? 'border-b border-slate-200'
                      : 'border-b border-white/5'
                }`}
              >
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className={`py-4 px-6 text-sm whitespace-nowrap ${
                    isCompleted
                      ? (isLight ? 'text-emerald-900/80 border-b border-emerald-100' : 'text-emerald-200/80 border-b border-emerald-500/10')
                      : (isLight ? 'text-slate-700 border-b border-slate-200' : 'text-slate-300 border-b border-white/5')
                  }`}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
          {rowVirtualizer.getVirtualItems().length > 0 && (
            <tr>
              <td 
                style={{ height: `${rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].end}px` }} 
                colSpan={columns.length} 
              />
            </tr>
          )}
        </tbody>
      </table>
        
      {/* Floating Indicator for Current Row */}
        <AnimatePresence>
          {processingRowIndex !== null && (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={`fixed left-8 z-40 bg-emerald-500 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-emerald-500/20 ${
                isLight ? 'text-white' : 'text-slate-950'
              }`}
              style={{ 
                top: indicatorTop,
                transition: 'top 0.1s ease-out'
              }}
            >
              <div className={`w-2 h-2 rounded-full animate-pulse ${isLight ? 'bg-white' : 'bg-slate-950'}`} />
              Processing Row {processingRowIndex + 1}
            </motion.div>
          )}
        </AnimatePresence>
    </div>
  );
};

export default DataTable;
