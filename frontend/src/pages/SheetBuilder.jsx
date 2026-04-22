import React, { useState, useEffect, useContext, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Save,
  History,
  Download,
  Sparkles,
  Search,
  Settings,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  FileSpreadsheet,
  Globe,
  Lock,
  MoreVertical,
  X,
  Layout as LayoutIcon,
  CheckCircle2,
  Clock,
  PanelRightClose,
  PanelRightOpen,
  UploadCloud,
  Edit2,
  Trash2,
  Archive,
  ArchiveRestore,
  AlertTriangle,
  LayoutGrid,
  Bell,
  Sun,
  Moon,
  Maximize2,
  Minimize2
} from 'lucide-react';
import GlassCard from '../components/GlassCard';
import DataGrid from '../components/SheetBuilder/DataGrid';
import Sidebar from '../components/Sidebar';
import { AuthContext } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useAnalysis } from '../context/useAnalysis';
import api from '../api/client';
import { getApiBaseUrl } from '../api/client';

const SheetBuilder = () => {
  const { user } = useContext(AuthContext);
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';
  const { pinUploadAnalysis } = useAnalysis();
  const [activeView, setActiveView] = useState('dashboard'); // 'dashboard' | 'builder'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isRightPanelOpen, setRightPanelOpen] = useState(true);
  const [sheetName, setSheetName] = useState("Untitled Project Data");
  const [status, setStatus] = useState("Draft");
  const [aiPrompt, setAiPrompt] = useState("");
  const [libraryView, setLibraryView] = useState('active'); // 'active' | 'trash'
  const [searchQuery, setSearchQuery] = useState("");
  const [editingSheetId, setEditingSheetId] = useState(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPromptInput, setAiPromptInput] = useState("");
  const [aiFile, setAiFile] = useState(null);
  const [isAIBuilding, setIsAIBuilding] = useState(false);
  const [tempSheetName, setTempSheetName] = useState("");
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const [savedSheets, setSavedSheets] = useState([]);
  const [deletedSheets, setDeletedSheets] = useState([]);
  const [currentSheetId, setCurrentSheetId] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ visible: false, title: '', message: '', onConfirm: null, type: 'danger' });
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalName, setSaveModalName] = useState('');
  const [showTrash, setShowTrash] = useState(false);
  const [trashSearchQuery, setTrashSearchQuery] = useState('');
  const [trashIsFullWidth, setTrashIsFullWidth] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState(null);
  const [bulkActionType, setBulkActionType] = useState(null); // 'PURGE' | 'RESTORE' | 'HUB' | null
  const [selectedTrashIds, setSelectedTrashIds] = useState([]);
  const [newlyRestoredIds, setNewlyRestoredIds] = useState(() => {
    try {
      const saved = localStorage.getItem('newlyRestoredIds');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('newlyRestoredIds', JSON.stringify(newlyRestoredIds));
  }, [newlyRestoredIds]);

  // Fetch sheets when returning to dashboard
  useEffect(() => {
    if (activeView === 'dashboard') {
      fetchSheets();
    }
  }, [activeView]);

  // Auto-Open Bulk Hub after selection inactivity
  useEffect(() => {
    if (selectedTrashIds.length > 0 && !bulkActionType && showTrash) {
      const timer = setTimeout(() => {
        setBulkActionType('HUB');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [selectedTrashIds, bulkActionType, showTrash]);

  const fetchSheets = async () => {
    try {
      const response = await api.get('/ingestion/sheets/');
      const rawData = response.data.results || response.data || [];

      const processedSheets = rawData.map(s => ({
        ...s,
        cols: s.schema_definition?.length || 0,
        rows: s.current_data?.length || 0,
        date: new Date(s.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        version: 'v1.0'
      }));

      // Separate into active and archived
      setSavedSheets(processedSheets.filter(s => s.status !== 'ARCHIVED'));
      setDeletedSheets(processedSheets.filter(s => s.status === 'ARCHIVED'));
    } catch (error) {
      console.error("Failed to fetch sheets:", error);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast({ visible: false, message: '', type: 'success' }), 3000);
  };

  const handleConfirm = (title, message, onConfirm, type = 'danger') => {
    setConfirmModal({ visible: true, title, message, onConfirm, type });
  };

  const [columns, setColumns] = useState([]);

  const [gridData, setGridData] = useState([]);

  const [activeColumnId, setActiveColumnId] = useState(null);

  const [lastSaved, setLastSaved] = useState(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [analysisRunStatus, setAnalysisRunStatus] = useState(null);
  const analysisStreamRef = useRef(null);

  // Auto-Save Effect (Every 30 seconds if changes exist)
  useEffect(() => {
    if (activeView !== 'builder') return;

    const timer = setInterval(() => {
      handleAutoSave();
    }, 30000);

    return () => clearInterval(timer);
  }, [activeView, gridData, columns, sheetName, currentSheetId]);

  useEffect(() => {
    return () => {
      if (analysisStreamRef.current) {
        analysisStreamRef.current.close();
        analysisStreamRef.current = null;
      }
    };
  }, []);

  const startAutoProcessing = (uploadId) => {
    const parsed = Number(uploadId);
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    if (analysisStreamRef.current) {
      analysisStreamRef.current.close();
    }

    setAnalysisRunStatus('PROCESSING');
    const token = localStorage.getItem('access_token');
    const baseUrl = getApiBaseUrl();
    const sseUrl = `${baseUrl}/ingestion/stream/${parsed}/?token=${token}`;
    const es = new EventSource(sseUrl);
    analysisStreamRef.current = es;

    es.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data);
        const nextStatus = String(update?.status || '').toUpperCase();
        if (nextStatus === 'COMPLETED') {
          setAnalysisRunStatus('COMPLETED');
          showToast('AI analysis completed');
          es.close();
          analysisStreamRef.current = null;
        } else if (nextStatus === 'ERROR') {
          setAnalysisRunStatus('ERROR');
          showToast('AI analysis failed', 'warning');
          es.close();
          analysisStreamRef.current = null;
        }
      } catch {
        // Ignore malformed stream payloads.
      }
    };

    es.onerror = () => {
      setAnalysisRunStatus('ERROR');
      showToast('AI analysis stream interrupted', 'warning');
      es.close();
      analysisStreamRef.current = null;
    };
  };

  const handleAutoSave = async () => {
    if (!gridData.length && !columns.length) return;
    setIsAutoSaving(true);
    try {
      const payload = {
        name: sheetName || "Untitled Draft",
        status: 'DRAFT',
        schema_definition: columns,
        current_data: gridData
      };
      if (currentSheetId) {
        await api.put(`/ingestion/sheets/${currentSheetId}/`, payload);
      } else {
        const response = await api.post('/ingestion/sheets/', payload);
        setCurrentSheetId(response.data.id);
      }
      setLastSaved(new Date());
    } catch (err) {
      console.error("Auto-save failed", err);
    } finally {
      setTimeout(() => setIsAutoSaving(false), 2000);
    }
  };

  const handleSaveDraftAndStay = () => {
    // Open the premium save modal instead of saving directly
    setSaveModalName(sheetName && !sheetName.includes('Untitled') ? sheetName : '');
    setShowSaveModal(true);
  };

  const confirmSaveDraft = async () => {
    const nameToSave = saveModalName.trim();
    if (!nameToSave) {
      showToast("Please enter a sheet name", "warning");
      return;
    }
    setShowSaveModal(false);
    setSheetName(nameToSave);
    setIsAutoSaving(true);
    try {
      const payload = {
        name: nameToSave,
        status: 'DRAFT',
        schema_definition: columns,
        current_data: gridData
      };
      if (currentSheetId) {
        await api.put(`/ingestion/sheets/${currentSheetId}/`, payload);
      } else {
        const response = await api.post('/ingestion/sheets/', payload);
        setCurrentSheetId(response.data.id);
      }
      setLastSaved(new Date());
      showToast(`"${nameToSave}" saved as Draft!`);
    } catch (err) {
      showToast("Failed to save draft", "destructive");
    } finally {
      setTimeout(() => setIsAutoSaving(false), 1000);
    }
  };

  const handlePublishAndReturn = async () => {
    if (isPublishing) return;
    if (!sheetName || sheetName.includes("Untitled")) {
      showToast("Please enter a professional sheet name first", "warning");
      return;
    }

    setIsPublishing(true);
    try {
      const payload = {
        name: sheetName,
        status: 'PUBLISHED',
        schema_definition: columns,
        current_data: gridData
      };

      if (currentSheetId) {
        await api.put(`/ingestion/sheets/${currentSheetId}/`, payload);
      } else {
        await api.post('/ingestion/sheets/', payload);
      }

      const cleanRows = (Array.isArray(gridData) ? gridData : [])
        .map((row) => {
          const next = {};
          (columns || []).forEach((col) => {
            if (!col?.name) return;
            const value = row?.[col.name];
            if (value !== undefined) next[col.name] = value;
          });
          return next;
        })
        .filter((row) => Object.values(row).some((v) => v !== null && v !== undefined && String(v).trim() !== ''));

      let publishToast = "Sheet saved successfully!";
      let publishToastType = "success";

      if (cleanRows.length) {
        try {
          const safeName = sheetName.trim().replace(/[^a-z0-9-_]+/gi, '_').slice(0, 40) || 'sheet';
          const blob = new Blob([JSON.stringify(cleanRows)], { type: 'application/json' });
          const file = new File([blob], `${safeName}.json`, { type: 'application/json' });
          const formData = new FormData();
          formData.append('file', file);

          console.log('📤 Uploading sheet to /ingestion/upload/', { fileName: safeName, rowCount: cleanRows.length });
          const uploadRes = await api.post('/ingestion/upload/', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });

          const uploadId = uploadRes.data?.upload_id;
          console.log('✅ Upload successful! uploadId:', uploadId);
          if (uploadId) {
            console.log('📌 Pinning upload analysis for:', uploadId);
            await pinUploadAnalysis(uploadId);
            startAutoProcessing(uploadId);
          }
          publishToast = "Sheet saved and sent to AI analysis";
        } catch (err) {
          console.error('❌ Upload failed:', err.message, err.response?.data || err);
          publishToast = "Saved, but analysis upload failed: " + (err.response?.data?.message || err.message);
          publishToastType = "warning";
        }
      } else {
        publishToast = "Sheet saved. Add data rows to run analysis";
        publishToastType = "warning";
      }

      showToast(publishToast, publishToastType);
      setActiveView('dashboard'); // This returns to dashboard and triggers fetchSheets
    } catch (err) {
      showToast("Failed to save sheet to cloud", "destructive");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleManualSave = async () => {
    if (!sheetName) {
      showToast("Please enter a sheet name first", "warning");
      return;
    }
    await handlePublishAndReturn();
  };

  const deleteSheet = async (id) => {
    try {
      await api.patch(`/ingestion/sheets/${id}/`, { status: 'ARCHIVED' });
      showToast("Sheet moved to Trash");
      fetchSheets();
    } catch (error) {
      showToast("Failed to delete sheet", "destructive");
    }
  };

  const executeExport = async () => {
    try {
      const payload = {
        name: sheetName || "Untitled Document",
        status: 'PUBLISHED',
        schema_definition: columns,
        current_data: gridData
      };

      // 1. Save to Database
      if (currentSheetId) {
        await api.put(`/ingestion/sheets/${currentSheetId}/`, payload);
      } else {
        const response = await api.post('/ingestion/sheets/', payload);
        setCurrentSheetId(response.data.id);
      }

      setLastSaved(new Date());

      // 2. Trigger Native OS Save Dialog
      if ('showSaveFilePicker' in window) {
        const handle = await window.showSaveFilePicker({
          suggestedName: sheetName || "Untitled Document",
          types: [
            {
              description: 'JSON Format (Schema + Data)',
              accept: { 'application/json': ['.json'] }
            },
            {
              description: 'CSV Format (Raw Data Only)',
              accept: { 'text/csv': ['.csv'] }
            }
          ],
        });

        let fileContent = "";
        if (handle.name.endsWith('.csv')) {
          const headers = columns.map(c => c.name).join(',');
          const rows = gridData.map(row => columns.map(c => `"${row[c.id] || ''}"`).join(',')).join('\n');
          fileContent = `${headers}\n${rows}`;
        } else {
          fileContent = JSON.stringify({ schema: columns, data: gridData }, null, 2);
        }

        const writable = await handle.createWritable();
        await writable.write(fileContent);
        await writable.close();
        showToast(`Successfully saved "${sheetName}" to device`);
      } else {
        showToast(`Successfully saved "${sheetName}" to Platform`);
      }

      fetchSheets();
    } catch (error) {
      console.error("Export Error:", error);
      if (error.name === 'AbortError') {
        showToast("Save cancelled by user", "warning");
      } else {
        showToast("Export failed", "destructive");
      }
    }
  };

  const handleCellChange = (rowIdx, colName, value) => {
    const newData = [...gridData];
    if (!newData[rowIdx]) newData[rowIdx] = {};
    newData[rowIdx][colName] = value;
    setGridData(newData);
  };

  const handleAddRow = () => {
    setGridData([...gridData, {}]);
  };

  const handleAddColumn = () => {
    const newId = String(columns.length + 1);
    setColumns([...columns, { id: newId, name: `New Column ${newId}`, type: 'text', width: 150 }]);
    setActiveColumnId(newId);
  };

  const handleAIAction = async () => {
    if (!aiPromptInput) return;
    setIsAIBuilding(true);
    setShowAIModal(false);

    try {
      const formData = new FormData();
      if (aiPromptInput) formData.append('prompt', aiPromptInput);
      if (aiFile) formData.append('file', aiFile);

      const response = await api.post('/ingestion/sheets/ai-generate/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.status === 'success') {
        const { columns: aiCols, data: aiData } = response.data;

        // Convert Gemini's structured columns to the builder format
        const formattedCols = aiCols.map((col, idx) => ({
          id: String(idx + 1),
          name: col.name,
          type: col.type || 'text',
          width: 180,
          options: col.options || []
        }));

        setColumns(formattedCols);
        setGridData(aiData);
        setSheetName(aiPromptInput ? aiPromptInput.substring(0, 30) : "AI Generated Archive");
        setAiPromptInput("");
        setAiFile(null);
        showToast(`AI Model generated "${aiPromptInput?.substring(0, 20) || 'multimodal'}..." architecture`);
      } else {
        throw new Error(response.data.error || 'AI Generation failed');
      }
    } catch (err) {
      console.error('AI Building Error:', err);
      showToast(err.response?.data?.error || "AI Generation Engine offline", "destructive");
    } finally {
      setIsAIBuilding(false);
    }
  };

  const handleDeleteRow = (rowIdx) => {
    const newData = [...gridData];
    newData.splice(rowIdx, 1);
    setGridData(newData);
  };

  const handleDeleteColumn = (colId) => {
    if (columns.length <= 1) return;
    const newColumns = columns.filter(c => c.id !== colId);
    setColumns(newColumns);
    if (activeColumnId === colId) {
      setActiveColumnId(newColumns[0].id);
    }
  };

  return (
    <div className="flex h-screen bg-[var(--bg-base)] overflow-hidden text-[var(--text-main)] font-inter">

      {/* Sidebar Navigation - Hidden in Fullscreen */}
      {!isFullscreen && <Sidebar isCollapsed={isSidebarCollapsed} setIsCollapsed={setSidebarCollapsed} />}

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        <AnimatePresence mode="wait">
          {activeView === 'dashboard' ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex flex-col relative overflow-hidden bg-[var(--bg-base)]"
            >
              {/* Dashboard Ambient Glows */}
              <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />
              <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-blue-500/5 blur-[120px] rounded-full pointer-events-none" />

              {/* Dashboard Header */}
              <header className="h-[72px] px-12 flex items-center justify-between relative z-10 border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] backdrop-blur-3xl">
                <div>
                  <h1 className="text-xl font-black text-[var(--text-main)] tracking-tight flex items-center gap-3">
                    <LayoutGrid className="text-emerald-500" size={22} />
                    Architecture Dashboard
                  </h1>
                  <p className="text-[var(--text-muted)] text-[10px] font-black uppercase tracking-[0.2em] mt-1">Manage your professional schema cards</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/5 bg-white/[0.02] text-slate-400 hover:text-white hover:bg-white/[0.05] transition-all"
                    onClick={toggleTheme}
                    title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                  >
                    {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                    <span className="text-[10px] font-black uppercase tracking-widest">{theme === 'dark' ? 'Light' : 'Dark'}</span>
                  </button>

                  <button className="relative p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-slate-400 hover:text-white transition-all group">
                    <Bell size={18} className="group-hover:rotate-12 transition-transform" />
                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500 border-2 border-[#0a0f1d] shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  </button>
                </div>
              </header>

              {/* Action Toolbar */}
              <div className="px-12 py-5 flex items-center justify-between gap-6 border-b border-[var(--border-subtle)] bg-[var(--bg-accent)] relative z-40">
                <div className="relative group/search flex-1 max-w-sm">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within/search:text-emerald-500 transition-colors" />
                  <input
                    type="text"
                    placeholder="Search schemas..."
                    className="w-full bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl pl-12 pr-6 py-3 text-sm text-[var(--text-main)] focus:outline-none focus:border-emerald-500/30 focus:ring-2 focus:ring-emerald-500/10 transition-all placeholder:text-slate-600"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white/5 px-4 py-2.5 rounded-xl border border-white/5">
                    {savedSheets.length} Sheets
                  </div>
                  {/* Trash Button */}
                  <button
                    onClick={() => setShowTrash(true)}
                    className={`relative p-3 rounded-2xl border transition-all active:scale-95 group ${deletedSheets.length > 0
                      ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
                      : 'bg-white/5 border-white/10 text-slate-500 hover:text-red-400 hover:border-red-500/20 hover:bg-red-500/5'
                      }`}
                  >
                    {/* Unique Recycle Bin SVG */}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="group-hover:scale-110 transition-transform">
                      {/* Recycling arrows forming triangle */}
                      <path d="M7.5 4L5 8h4L7.5 4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="none" />
                      <path d="M5 8c0 0 1 3 5 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
                      <path d="M16.5 4L19 8h-4l1.5-4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="none" />
                      <path d="M19 8c0 0-1 3-5 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
                      {/* Bin body */}
                      <rect x="6" y="11" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
                      <line x1="9" y1="14" x2="9" y2="17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      <line x1="12" y1="14" x2="12" y2="17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      <line x1="15" y1="14" x2="15" y2="17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                    {deletedSheets.length > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-1 shadow-lg shadow-red-500/30">
                        {deletedSheets.length}
                      </span>
                    )}

                    {/* Premium Tooltip */}
                    <div className="absolute top-[120%] right-0 w-max px-4 py-2 bg-[#020617] border border-white/10 rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.5)] opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 origin-top-right z-50 flex flex-col items-center">
                      <div className="absolute -top-[5px] right-5 w-2 h-2 bg-[#020617] border-t border-l border-white/10 rotate-45" />
                      <span className="text-[10px] font-black text-white uppercase tracking-widest relative z-10 w-full text-left">Recycle Bin</span>
                      <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest relative z-10 mt-1 w-full text-left">Restore or Purge Schemas</span>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setSheetName("Untitled New Document");
                      setColumns([{ id: '1', name: 'Field 1', type: 'text', width: 200 }]);
                      setGridData([{}, {}, {}]);
                      setCurrentSheetId(null);
                      setActiveView('builder');
                    }}
                    className="group relative premium-btn px-8 py-3 rounded-2xl bg-emerald-500 text-slate-950 text-[11px] font-black uppercase tracking-widest shadow-[0_20px_40px_rgba(16,185,129,0.2)] active:scale-95 flex items-center gap-3 transition-all hover:bg-emerald-400"
                  >
                    <Plus size={16} strokeWidth={3} /> Create New Sheet

                    {/* Premium Tooltip */}
                    <div className="absolute top-[120%] right-1/2 translate-x-[50%] w-max px-4 py-2 bg-[#020617] border border-white/10 rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.5)] opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 origin-top z-50 flex flex-col items-center">
                      <div className="absolute -top-[5px] left-1/2 -translate-x-[50%] w-2 h-2 bg-[#020617] border-t border-l border-white/10 rotate-45" />
                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest relative z-10 w-full text-center">New Architecture</span>
                      <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest relative z-10 mt-1 w-full text-center">Deploy a blank schema</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Dashboard Content */}
              <div className="flex-1 overflow-y-auto p-12 custom-scrollbar relative z-10">
                <div className="max-w-7xl mx-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                    {savedSheets
                      .filter(sheet => sheet.name.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((sheet, index) => (
                        <motion.div
                          key={sheet.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          whileHover={{ y: -10, transition: { duration: 0.3 } }}
                          className={`group relative glass-premium rounded-[3rem] p-10 transition-all duration-500 overflow-hidden shadow-xl ${newlyRestoredIds.includes(sheet.id)
                              ? 'border-indigo-500/50 shadow-[0_0_50px_rgba(99,102,241,0.2)] overflow-visible ring-2 ring-indigo-500/30'
                              : 'border-[var(--border-subtle)] hover:border-emerald-500/40 hover:shadow-2xl hover:shadow-emerald-500/5'
                            }`}
                        >
                          {/* Restored Indicator Pulsing Ring */}
                          {newlyRestoredIds.includes(sheet.id) && (
                            <div className="absolute inset-0 rounded-[inherit] ring-[2px] ring-indigo-500/60 animate-pulse pointer-events-none" />
                          )}

                          {/* Corner Glow Flare */}
                          <div className={`absolute -top-24 -left-24 w-48 h-48 rounded-full blur-[80px] pointer-events-none ${newlyRestoredIds.includes(sheet.id) ? 'bg-indigo-500/20 opacity-100' : 'bg-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700'
                            }`} />

                          <div className="relative z-10 h-full flex flex-col">
                            <div className="flex items-start justify-between mb-10">
                              <div
                                className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center group-hover:scale-110 transition-all duration-500 cursor-pointer ${newlyRestoredIds.includes(sheet.id)
                                    ? 'bg-gradient-to-br from-indigo-500/20 to-purple-500/10 border border-indigo-500/50 text-indigo-400 shadow-[0_0_30px_rgba(99,102,241,0.3)]'
                                    : 'bg-gradient-to-br from-emerald-500/20 to-blue-500/10 border border-emerald-500/30 text-emerald-400 group-hover:shadow-[0_0_30px_rgba(16,185,129,0.3)]'
                                  }`}
                                onClick={() => {
                                  setSheetName(sheet.name);
                                  setColumns(sheet.schema_definition || columns);
                                  setGridData(sheet.current_data || gridData);
                                  setCurrentSheetId(sheet.id);
                                  setActiveView('builder');
                                  showToast(`Active Architecture: ${sheet.name}`);
                                }}
                              >
                                <FileSpreadsheet size={32} strokeWidth={1.5} />
                              </div>
                              <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-4 group-hover:translate-x-0">
                                <button
                                  onClick={() => {
                                    handleConfirm("Archive Architecture?", `"${sheet.name}" will be moved to history.`, async () => {
                                      try {
                                        await api.patch(`/ingestion/sheets/${sheet.id}/`, { status: 'ARCHIVED' });
                                        fetchSheets();
                                        showToast("Archived to Recycle Bin");
                                      } catch (e) {
                                        showToast("Action failed", "destructive");
                                      }
                                    });
                                  }}
                                  className="w-11 h-11 rounded-2xl bg-[var(--bg-accent)] border border-[var(--border-subtle)] text-[var(--text-dim)] hover:text-red-500 hover:border-red-500/20 hover:bg-red-500/10 transition-all active:scale-90 flex items-center justify-center shadow-sm"
                                  title="Archive Schema"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </div>

                            <div className="flex-1">
                              {editingSheetId === sheet.id ? (
                                <input
                                  autoFocus
                                  className="bg-[var(--bg-input)] border border-emerald-500/50 rounded-2xl px-6 py-4 text-xl text-[var(--text-main)] font-black w-full mb-2 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-inner"
                                  value={tempSheetName}
                                  onChange={(e) => setTempSheetName(e.target.value)}
                                  onBlur={async () => {
                                    if (tempSheetName && tempSheetName !== sheet.name) {
                                      try {
                                        await api.put(`/ingestion/sheets/${sheet.id}/`, { ...sheet, name: tempSheetName });
                                        showToast("Identity Updated");
                                        fetchSheets();
                                      } catch (e) { showToast("Error renaming", "destructive"); }
                                    }
                                    setEditingSheetId(null);
                                  }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                />
                              ) : (
                                <h3
                                  className="text-2xl font-black text-[var(--text-main)] truncate leading-none group-hover:text-emerald-500 transition-colors uppercase tracking-tight cursor-pointer mb-2"
                                  onClick={() => {
                                    setEditingSheetId(sheet.id);
                                    setTempSheetName(sheet.name);
                                  }}
                                >
                                  {sheet.name}
                                </h3>
                              )}

                              <div className="flex items-center gap-4 mt-4">
                                <div className={`px-3 py-1.5 rounded-xl flex items-center gap-2 border text-[10px] font-black uppercase tracking-widest ${(sheet.status || '').toUpperCase() === 'PUBLISHED'
                                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                                  : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]'
                                  }`}>
                                  {newlyRestoredIds.includes(sheet.id) ? (
                                    <>
                                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                                      Restored
                                    </>
                                  ) : (sheet.status || 'DRAFT').toUpperCase()}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock size={12} className="text-[var(--text-muted)]" />
                                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{sheet.date}</span>
                                </div>
                              </div>
                            </div>

                            <div className="mt-12 pt-8 border-t border-[var(--border-subtle)] flex items-center justify-between">
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-[var(--text-dim)] uppercase tracking-widest">Memory Footprint</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-lg font-black text-[var(--text-main)] tracking-widest leading-none">
                                    {(() => {
                                      try {
                                        const bytes = new Blob([JSON.stringify(sheet)]).size;
                                        return bytes > 1024 * 1024
                                          ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
                                          : `${(bytes / 1024).toFixed(1)} KB`;
                                      } catch { return '0.1 KB'; }
                                    })()}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1.5 text-right">
                                <div className={`px-4 h-8 flex items-center justify-center rounded-xl text-[10px] font-black uppercase tracking-widest border ${sheet.status === 'PUBLISHED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'bg-[var(--bg-accent)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                                  }`}>
                                  v{sheet.version || '1.0'}
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="builder"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex-1 flex flex-col relative h-full overflow-hidden"
            >
              {/* Top Premium Navbar - Hidden in Fullscreen for Focus Mode */}
              {!isFullscreen && (
                <header className="h-[72px] border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] backdrop-blur-3xl flex items-center justify-between px-10 z-30 relative overflow-hidden shrink-0">
                  <div className="absolute left-0 top-0 w-[400px] h-[200px] bg-emerald-500/5 blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

                  <div className="flex items-center gap-10 relative z-10">
                    <div className="flex items-center gap-5">
                      <motion.div
                        whileHover={{ scale: 1.05, rotate: 5 }}
                        onClick={() => setActiveView('dashboard')}
                        className="w-12 h-12 rounded-2xl bg-[var(--bg-accent)] border border-[var(--border-subtle)] flex items-center justify-center shadow-2xl shadow-emerald-500/10 cursor-pointer group"
                      >
                        <ChevronLeft className="text-emerald-400 group-hover:-translate-x-1 transition-transform" size={24} />
                      </motion.div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-4">
                          <h1 className="text-xl font-black tracking-tight text-[var(--text-main)] m-0">Sheet Builder</h1>
                          <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2 border ${status === 'Published' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${status === 'Published' ? 'bg-blue-400 animate-pulse' : 'bg-emerald-500 glow-pulse'}`} />
                            {status}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Full Screen button removed from here */}
                  </div>
                </header>
              )}

              {/* Main Workspace (Grid) */}
              <main className={`flex-1 relative overflow-hidden bg-[var(--bg-base)] flex transition-all duration-500 ${isFullscreen ? 'p-0' : 'p-12'}`}>
                {/* Exit Full Screen Button - Floating */}
                {isFullscreen && (
                  <button
                    onClick={() => setIsFullscreen(false)}
                    className="absolute top-8 right-8 z-[60] p-4 rounded-2xl bg-white/10 backdrop-blur-3xl border border-white/20 text-white hover:bg-white/20 transition-all shadow-2xl group"
                  >
                    <X size={24} className="group-hover:rotate-90 transition-transform" />
                  </button>
                )}

                <div className={`flex-1 overflow-hidden flex flex-col ${isFullscreen ? 'gap-0' : 'gap-10'}`}>
                  {/* Action Bar - Simplified in Fullscreen */}
                  <div
                    className={`flex items-end justify-between ${isFullscreen
                      ? `px-8 py-6 border-b ${isLight ? 'border-slate-200 bg-white/90' : 'border-white/5 bg-[#060b19]/60'} backdrop-blur-3xl relative z-40`
                      : 'px-6'
                    }`}
                  >
                    <div className="flex items-center gap-6">
                      <button
                        onClick={() => setShowAIModal(true)}
                        className={`relative premium-btn flex items-center gap-4 rounded-3xl bg-emerald-500 text-slate-950 font-black uppercase tracking-[0.2em] shadow-[0_20px_40px_rgba(16,185,129,0.2)] active:scale-95 group font-inter transition-all ${isFullscreen ? 'px-6 py-4 text-[10px]' : 'px-8 py-5 text-[11px]'}`}
                      >
                        <div className="relative">
                          <UploadCloud size={isFullscreen ? 18 : 20} strokeWidth={3} className="group-hover:-translate-y-1 transition-transform duration-300" />
                          <Sparkles size={10} className="absolute -top-1.5 -right-2.5 text-slate-950 animate-pulse" />
                        </div>
                        AI Sheet Builder

                        {/* Premium Tooltip */}
                        <div className="absolute top-[120%] left-0 w-max px-4 py-2 bg-[#020617] border border-white/10 rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.5)] opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 origin-top-left z-50 flex flex-col items-center">
                          <div className="absolute -top-[5px] left-5 w-2 h-2 bg-[#020617] border-t border-l border-white/10 rotate-45" />
                          <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest relative z-10 w-full text-left">AI Data Processor</span>
                          <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest relative z-10 mt-1 w-full text-left">Upload files for AI analysis</span>
                        </div>
                      </button>
                      {/* Professional Auto-Save Indicator */}
                      <AnimatePresence>
                        {isAutoSaving && (
                          <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mr-2"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                            <span className="text-[9px] font-black uppercase tracking-[0.2em]">Syncing...</span>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {!isAutoSaving && lastSaved && (
                        <div className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mr-4">
                          Last Sync: {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}

                      <input type="file" id="ai-upload-input" className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" />

                      {isFullscreen && (
                        <div className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                          <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Focus Mode Active
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-4">
                      <button
                        onClick={() => setRightPanelOpen(!isRightPanelOpen)}
                        className={`rounded-2xl border transition-all active:scale-95 shadow-2xl ${isFullscreen ? 'p-3' : 'p-4'} ${isRightPanelOpen
                          ? 'bg-white/10 border-white/20 text-white glow-emerald'
                          : 'bg-white/5 border-white/10 text-slate-500 hover:text-white hover:bg-white/10'
                          }`}
                      >
                        {isRightPanelOpen ? <PanelRightClose size={22} /> : <PanelRightOpen size={22} />}
                      </button>
                    </div>
                  </div>

                  {/* Grid Container Wrapper */}
                  <div className={`flex-1 relative min-h-0 flex flex-col overflow-hidden transition-all duration-500 ${isFullscreen ? 'rounded-0' : 'rounded-[32px] glass-premium border border-white/5 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)]'}`}>

                    {/* Professional Sheet Header Section */}
                    <div className="px-8 py-5 border-b border-white/5 bg-white/5 backdrop-blur-3xl flex items-center justify-between relative z-20">
                      <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                          <input
                            type="text"
                            value={sheetName}
                            onChange={(e) => setSheetName(e.target.value)}
                            className="bg-transparent border-none text-base font-black tracking-tight text-white focus:outline-none focus:ring-0 placeholder:text-slate-700 w-[240px] p-0"
                            placeholder="Untitled Document"
                          />
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Current Document Scope</span>
                            <div className="w-1 h-1 rounded-full bg-slate-800" />
                            <span className={`text-[9px] font-black uppercase tracking-widest ${status === 'Published' ? 'text-blue-400' : 'text-emerald-500'}`}>{status}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-8">
                        <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest opacity-60">Architectural Entities</span>
                        {!isFullscreen && (
                          <button
                            onClick={() => setIsFullscreen(true)}
                            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all group"
                            title="Enter Full Screen"
                          >
                            <LayoutIcon size={16} className="group-hover:scale-110 transition-transform" />
                          </button>
                        )}
                      </div>
                    </div>

                    <DataGrid
                      columns={columns}
                      data={gridData}
                      onAddRow={handleAddRow}
                      onAddColumn={handleAddColumn}
                      onCellChange={handleCellChange}
                      onDeleteRow={handleDeleteRow}
                      onDeleteColumn={handleDeleteColumn}
                      onColumnClick={(id) => {
                        setActiveColumnId(id);
                        setRightPanelOpen(true);
                      }}
                      activeColumnId={activeColumnId}
                      onSave={handleSaveDraftAndStay}
                      onPublish={handlePublishAndReturn}
                      isPublishing={isPublishing}
                      analysisStatus={analysisRunStatus}
                      onExport={executeExport}
                      sheetName={sheetName}
                      onSheetNameChange={setSheetName}
                    />
                  </div>
                </div>

                {/* Right Properties Panel */}
                <AnimatePresence>
                  {isRightPanelOpen && (
                    <motion.aside
                      initial={{ x: 380 }}
                      animate={{ x: 0 }}
                      exit={{ x: 380 }}
                      transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                      className="w-[380px] border-l border-[var(--border-subtle)] glass-premium overflow-hidden flex flex-col z-40 relative shadow-[-20px_0_60px_rgba(0,0,0,0.1)]"
                    >
                      <div className="absolute top-0 right-0 w-full h-[400px] bg-emerald-500/5 blur-[120px] pointer-events-none" />

                      <div className="p-8 border-b border-[var(--border-subtle)] flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-lg shadow-emerald-500/5">
                            <Settings size={20} />
                          </div>
                          <h3 className="font-black text-[var(--text-main)] uppercase tracking-[0.25em] text-[11px]">Properties</h3>
                        </div>
                        <button
                          onClick={() => setRightPanelOpen(false)}
                          className="p-2.5 rounded-xl hover:bg-[var(--bg-accent)] text-[var(--text-dim)] hover:text-[var(--text-main)] transition-all active:scale-90"
                        >
                          <X size={20} />
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto p-8 space-y-12 custom-scrollbar relative z-10">
                        <div className="absolute top-0 right-0 w-full h-[300px] bg-emerald-500/5 blur-[100px] pointer-events-none" />

                        {/* Schema Settings */}
                        <div className="space-y-6 relative z-10">
                          <div className="px-1 flex items-center justify-between mb-2">
                            <label className="text-[10px] font-black text-[var(--text-dim)] uppercase tracking-[0.25em]">Column Settings</label>
                            {columns.find(c => c.id === activeColumnId) && (
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]" />
                            )}
                          </div>

                          {columns.find(c => c.id === activeColumnId) ? (
                            <GlassCard premium shimmer delay={0.3} title="Field Properties">
                              <div className="space-y-8 p-1">
                                <div className="space-y-3">
                                  <p className="text-[10px] font-black text-[var(--text-dim)] uppercase tracking-[0.25em] pl-1">Field Name</p>
                                  <input
                                    className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-2xl p-4 text-[13px] text-[var(--text-main)] font-medium focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 outline-none transition-all placeholder:text-[var(--text-dim)]/30 shadow-inner"
                                    value={columns.find(c => c.id === activeColumnId)?.name || ''}
                                    onChange={(e) => {
                                      const newCols = [...columns];
                                      const idx = newCols.findIndex(c => c.id === activeColumnId);
                                      newCols[idx].name = e.target.value;
                                      setColumns(newCols);
                                    }}
                                  />
                                </div>

                                <div className="space-y-4">
                                  <p className="text-[10px] font-black text-[var(--text-dim)] uppercase tracking-[0.25em] pl-1">Data Type</p>
                                  <div className="relative group/select">
                                    <select
                                      className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-2xl p-4 text-[13px] text-[var(--text-main)] font-medium outline-none appearance-none cursor-pointer focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all [&>option]:bg-[var(--bg-sidebar)] shadow-inner"
                                      value={columns.find(c => c.id === activeColumnId)?.type || 'text'}
                                      onChange={(e) => {
                                        const newCols = [...columns];
                                        const idx = newCols.findIndex(c => c.id === activeColumnId);
                                        newCols[idx].type = e.target.value.toLowerCase();
                                        setColumns(newCols);
                                      }}
                                    >
                                      <option value="text">Text</option>
                                      <option value="number">Number</option>
                                      <option value="date">Date</option>
                                      <option value="dropdown">Dropdown</option>
                                      <option value="checkbox">Checkbox</option>
                                      <option value="email">Email</option>
                                      <option value="phone">Phone</option>
                                      <option value="currency">Currency</option>
                                      <option value="url">URL</option>
                                      <option value="custom">Custom</option>
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-dim)] pointer-events-none group-hover/select:text-[var(--text-main)] transition-colors" size={16} />
                                  </div>

                                  {columns.find(c => c.id === activeColumnId)?.type === 'custom' && (
                                    <div className="mt-3">
                                      <p className="text-[10px] text-[var(--text-dim)] mb-1">Custom Type Name</p>
                                      <input
                                        className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg p-2 text-xs text-[var(--text-main)] focus:ring-1 focus:ring-emerald-500/50 outline-none placeholder:text-[var(--text-dim)]/50"
                                        value={columns.find(c => c.id === activeColumnId)?.customType || ''}
                                        placeholder="e.g. Employee ID"
                                        onChange={(e) => {
                                          const newCols = [...columns];
                                          const idx = newCols.findIndex(c => c.id === activeColumnId);
                                          newCols[idx].customType = e.target.value;
                                          setColumns(newCols);
                                        }}
                                      />
                                    </div>
                                  )}

                                  {columns.find(c => c.id === activeColumnId)?.type === 'dropdown' && (
                                    <div className="mt-4 space-y-2 border-t border-[var(--border-subtle)] pt-3">
                                      <p className="text-[10px] text-[var(--text-dim)] mb-1">Dropdown Options</p>
                                      {(columns.find(c => c.id === activeColumnId)?.options || []).map((opt, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                          <input
                                            className="flex-1 bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg p-2 text-xs text-[var(--text-main)] focus:ring-1 focus:ring-emerald-500/50 outline-none"
                                            value={opt}
                                            onChange={(e) => {
                                              const newCols = [...columns];
                                              const colIdx = newCols.findIndex(c => c.id === activeColumnId);
                                              const newOptions = [...(newCols[colIdx].options || [])];
                                              newOptions[i] = e.target.value;
                                              newCols[colIdx].options = newOptions;
                                              setColumns(newCols);
                                            }}
                                          />
                                          <button
                                            className="p-2 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--bg-accent)] transition-colors"
                                            onClick={() => {
                                              const newCols = [...columns];
                                              const colIdx = newCols.findIndex(c => c.id === activeColumnId);
                                              const newOptions = [...(newCols[colIdx].options || [])];
                                              newOptions.splice(i, 1);
                                              newCols[colIdx].options = newOptions;
                                              setColumns(newCols);
                                            }}
                                          >
                                            <X size={14} />
                                          </button>
                                        </div>
                                      ))}
                                      <button
                                        className="w-full mt-2 py-2 rounded-lg bg-[var(--bg-accent)] hover:bg-[var(--bg-accent)]/80 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors border border-dashed border-[var(--border-subtle)] flex items-center justify-center gap-2"
                                        onClick={() => {
                                          const newCols = [...columns];
                                          const colIdx = newCols.findIndex(c => c.id === activeColumnId);
                                          const newOptions = [...(newCols[colIdx].options || []), `Option ${(newCols[colIdx].options?.length || 0) + 1}`];
                                          newCols[colIdx].options = newOptions;
                                          setColumns(newCols);
                                        }}
                                      >
                                        <Plus size={14} /> Add Option
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </GlassCard>
                          ) : (
                            <p className="text-[10px] text-[var(--text-dim)] italic text-center py-4">Select a column to edit properties</p>
                          )}
                        </div>
                      </div>
                    </motion.aside>
                  )}
                </AnimatePresence>
              </main>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Components: Modal & Toast */}
        <AnimatePresence>
          {confirmModal.visible && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-sm ${isLight ? 'bg-slate-200/70' : 'bg-slate-950/60'}`}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className={`w-full max-w-md rounded-[40px] p-10 border shadow-[0_40px_80px_rgba(0,0,0,0.6)] ${isLight ? 'bg-white border-slate-200 shadow-[0_24px_50px_rgba(15,23,42,0.12)]' : 'bg-[#0d152b] border-white/10'}`}
              >
                <div className="flex items-center gap-4 mb-8">
                  <div className={`p-4 rounded-2xl ${confirmModal.type === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}`}>
                    <AlertTriangle size={28} />
                  </div>
                  <h3 className="text-2xl font-black text-white tracking-tight">{confirmModal.title}</h3>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed mb-10">{confirmModal.message}</p>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setConfirmModal({ ...confirmModal, visible: false })}
                    className={`flex-1 px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 ${isLight ? 'bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200' : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'}`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      confirmModal.onConfirm();
                      setConfirmModal({ ...confirmModal, visible: false });
                    }}
                    className={`flex-1 px-8 py-4 rounded-2xl text-white text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg ${confirmModal.type === 'danger' ? 'bg-red-600 hover:bg-red-500 shadow-red-600/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'}`}
                  >
                    Confirm
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Premium Save-As Modal ── */}
        <AnimatePresence>
          {showSaveModal && (
            <motion.div
              key="save-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-950/70 backdrop-blur-md"
              onClick={() => setShowSaveModal(false)}
            >
              <motion.div
                key="save-modal"
                initial={{ scale: 0.85, opacity: 0, y: 40 }}
                animate={{ scale: 1, opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }}
                exit={{ scale: 0.88, opacity: 0, y: 30, transition: { duration: 0.18 } }}
                className="w-full max-w-lg relative overflow-hidden rounded-[40px] shadow-2xl glass-premium border border-[var(--border-subtle)]"
                onClick={e => e.stopPropagation()}
              >
                {/* Glow blobs */}
                <div className="absolute -top-24 -left-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

                <div className="relative p-10 backdrop-blur-3xl z-10">
                  {/* Close */}
                  <button
                    onClick={() => setShowSaveModal(false)}
                    className="absolute top-6 right-6 p-2 rounded-xl text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-accent)] transition-all"
                  >
                    <X size={18} />
                  </button>

                  {/* Icon + Title */}
                  <div className="flex items-center gap-5 mb-8">
                    <div className="w-16 h-16 rounded-3xl bg-[var(--bg-accent)] border border-[var(--border-subtle)] flex items-center justify-center shadow-lg shadow-emerald-500/5">
                      <Save size={28} className="text-emerald-500" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-[var(--text-main)] tracking-tight">Save Draft</h2>
                      <p className="text-[11px] text-[var(--text-dim)] font-bold uppercase tracking-widest mt-0.5">Architectural Schema • Secure Local Draft</p>
                    </div>
                  </div>

                  {/* Name Field */}
                  <div className="mb-8">
                    <label className="block text-[10px] font-black text-[var(--text-dim)] uppercase tracking-[0.2em] mb-3">
                      Schema Name
                    </label>
                    <div className="relative">
                      <input
                        autoFocus
                        type="text"
                        value={saveModalName}
                        onChange={e => setSaveModalName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmSaveDraft(); if (e.key === 'Escape') setShowSaveModal(false); }}
                        placeholder="e.g. Product Inventory Q1 2026"
                        className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 rounded-2xl px-5 py-4 text-[var(--text-main)] text-sm font-semibold placeholder:text-[var(--text-dim)]/50 outline-none transition-all shadow-inner"
                      />
                      {saveModalName && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-500"
                        />
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--text-dim)] mt-2 ml-1">This will be saved as a <span className="text-indigo-500 font-black">DRAFT</span> — only you can see it.</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setShowSaveModal(false)}
                      className="flex-1 px-6 py-4 rounded-2xl bg-[var(--bg-accent)] border border-[var(--border-subtle)] text-[var(--text-muted)] text-[11px] font-black uppercase tracking-[0.2em] hover:bg-[var(--bg-accent)]/80 hover:text-[var(--text-main)] transition-all active:scale-95"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmSaveDraft}
                      disabled={!saveModalName.trim()}
                      className="flex-[2] px-6 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-400 text-[var(--bg-base)] text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-emerald-500/20 hover:shadow-2xl hover:shadow-emerald-500/30 hover:to-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center justify-center gap-3"
                    >
                      <Save size={14} />
                      Save Draft
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── AI Sheet Generator Modal ── */}
        <AnimatePresence>
          {showAIModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[160] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl"
              onClick={() => setShowAIModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 40, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.95, y: 20, opacity: 0 }}
                className="w-full max-w-2xl bg-[#0a1225] border border-emerald-500/20 rounded-[3rem] p-10 overflow-hidden shadow-2xl relative"
                onClick={e => e.stopPropagation()}
              >
                {/* Decorative Background */}
                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-500/5 blur-[100px] -translate-y-1/2 translate-x-1/2" />

                <div className="relative z-10">
                  <div className="flex items-center gap-6 mb-10">
                    <div className="w-16 h-16 rounded-[1.5rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                      <Sparkles size={32} fill="currentColor" className="animate-pulse" />
                    </div>
                    <div>
                      <h2 className="text-3xl font-black text-[var(--text-main)] tracking-tighter uppercase leading-none mb-2">AI Sheet Generator</h2>
                      <p className="text-[10px] text-[var(--text-dim)] font-black tracking-widest uppercase">Powered by Gemini 2.0 Reasoning Engine</p>
                    </div>
                  </div>

                  <div className="space-y-6 mb-10">
                    <label className="text-[10px] font-black text-[var(--text-dim)] uppercase tracking-[0.3em] ml-1">Architectural Instructions & Assets</label>
                    <textarea
                      autoFocus
                      className="w-full h-24 bg-[var(--bg-input)] border border-[var(--border-input)] rounded-2xl p-6 text-sm text-[var(--text-main)] focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 outline-none transition-all placeholder:text-[var(--text-dim)]/50 resize-none font-medium shadow-inner"
                      placeholder="e.g. Recreate this financial chart as a 20-row sheet..."
                      value={aiPromptInput}
                      onChange={(e) => setAiPromptInput(e.target.value)}
                    />

                    {/* Multimodal Asset Dropzone */}
                    <div
                      className={`relative group/dropzone border-2 border-dashed rounded-2xl p-6 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 ${aiFile ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-white/[0.02] border-white/10 hover:border-emerald-500/30 hover:bg-white/[0.04]'}`}
                      onClick={() => !aiFile && document.getElementById('ai-asset-upload').click()}
                    >
                      <input
                        type="file"
                        id="ai-asset-upload"
                        className="hidden"
                        accept="image/*,application/pdf"
                        onChange={(e) => setAiFile(e.target.files[0])}
                      />
                      {aiFile ? (
                        <>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                              <CheckCircle2 size={20} />
                            </div>
                            <div className="text-left">
                              <p className="text-xs font-black text-[var(--text-main)] truncate max-w-[200px]">{aiFile.name}</p>
                              <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Asset Linked Successfully</p>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); setAiFile(null); }}
                              className="ml-4 p-2 rounded-lg bg-[var(--bg-accent)] hover:bg-[var(--bg-accent)]/80 text-[var(--text-muted)] hover:text-red-500 transition-all"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <UploadCloud size={32} className="text-[var(--text-muted)] group-hover/dropzone:text-emerald-500 transition-colors" />
                          <p className="text-[10px] text-[var(--text-dim)] font-black uppercase tracking-widest text-center">
                            Link Physical Asset <span className="text-[var(--text-muted)]/70">(Image, Chart, PDF)</span>
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setShowAIModal(false)}
                      className="flex-1 py-4 px-8 rounded-2xl bg-[var(--bg-accent)] border border-[var(--border-subtle)] text-[var(--text-muted)] text-xs font-black uppercase tracking-widest hover:text-[var(--text-main)] hover:bg-[var(--bg-accent)]/80 transition-all active:scale-95"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAIAction}
                      disabled={!aiPromptInput.trim() && !aiFile}
                      className="flex-[2] py-4 px-8 rounded-2xl bg-emerald-500 text-[var(--bg-base)] text-xs font-black uppercase tracking-widest shadow-2xl shadow-emerald-500/20 hover:bg-emerald-400 transition-all active:scale-95 disabled:opacity-30 disabled:hover:bg-emerald-500 flex items-center justify-center gap-3"
                    >
                      <Sparkles size={16} fill="currentColor" />
                      Initialize Generation
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── AI Building Loader ── */}
        <AnimatePresence>
          {isAIBuilding && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`fixed inset-0 z-[200] flex flex-col items-center justify-center backdrop-blur-2xl ${isLight ? 'bg-white/80' : 'bg-slate-950/80'}`}
            >
              <div className="relative mb-10">
                <div className="w-32 h-32 rounded-[2.5rem] border-2 border-emerald-500/20 flex items-center justify-center relative">
                  <Plus className="text-emerald-500 animate-spin" size={48} strokeWidth={3} />
                  <div className="absolute inset-0 rounded-[inherit] border-4 border-emerald-500 border-t-transparent animate-[spin_2s_linear_infinite]" />
                </div>
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-black text-white tracking-widest uppercase mb-2">Architecting Data...</h3>
                <p className="text-[10px] text-emerald-500 font-extrabold tracking-[0.4em] uppercase animate-pulse">Gemini injecting structural vectors</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Trash Panel Slide-Over ── */}
        <AnimatePresence>
          {showTrash && (
            <>
              {/* Backdrop */}
              <motion.div
                key="trash-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`fixed inset-0 z-[120] backdrop-blur-sm ${isLight ? 'bg-slate-200/70' : 'bg-slate-950/60'}`}
                onClick={() => setShowTrash(false)}
              />
              {/* Panel */}
              <motion.div
                key="trash-panel"
                initial={{ x: '100%', opacity: 0 }}
                animate={{
                  x: 0,
                  opacity: 1,
                  width: trashIsFullWidth ? '92%' : '100%',
                  maxWidth: trashIsFullWidth ? '1600px' : '480px',
                  transition: { type: 'spring', stiffness: 220, damping: 26 }
                }}
                exit={{ x: '100%', opacity: 0, transition: { duration: 0.25, ease: 'easeInOut' } }}
                className={`fixed top-0 right-0 h-full z-[130] flex flex-col border-l overflow-hidden ${isLight ? 'bg-white border-slate-200 shadow-[-30px_0_80px_rgba(15,23,42,0.12)]' : 'bg-[#030612] border-white/10 shadow-[-40px_0_100px_rgba(0,0,0,0.8)]'}`}
              >
                {/* Visual Flare Background */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/[0.03] blur-[120px] pointer-events-none rounded-full -translate-y-1/2 translate-x-1/2" />

                {/* Global Bulk Action Hub */}
                <AnimatePresence>
                  {bulkActionType && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={`absolute inset-0 z-[110] backdrop-blur-[40px] flex items-center justify-center p-12 overflow-y-auto ${isLight ? 'bg-white/90' : 'bg-slate-950/90'}`}
                    >
                      <motion.div
                        initial={{ scale: 0.95, y: 30 }}
                        animate={{ scale: 1, y: 0 }}
                        className={`w-full relative ${trashIsFullWidth ? 'max-w-4xl' : 'max-w-sm'}`}
                      >
                        {/* Professional Close Button */}
                        <motion.button
                          whileHover={{ scale: 1.1, rotate: 90 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => setBulkActionType(null)}
                          className={`absolute -top-4 -right-4 w-12 h-12 rounded-2xl border flex items-center justify-center transition-all z-[120] backdrop-blur-xl shadow-2xl ${isLight ? 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50' : 'bg-white/5 border-white/10 text-slate-500 hover:text-white hover:bg-white/10'}`}
                        >
                          <X size={20} />
                        </motion.button>

                        <div className={`text-center ${trashIsFullWidth ? 'mb-12' : 'mb-8'}`}>
                          <h3 className={`${trashIsFullWidth ? 'text-4xl' : 'text-2xl'} font-black text-white uppercase tracking-tighter mb-4 leading-none`}>Bulk Actions</h3>
                          <p className="text-[10px] text-slate-500 uppercase tracking-[0.3em] font-black">
                            {selectedTrashIds.length > 0
                              ? `Processing ${selectedTrashIds.length} Selected items`
                              : `Processing all ${deletedSheets.length} items`}
                          </p>
                        </div>

                        <div className={`grid ${trashIsFullWidth ? 'grid-cols-2' : 'grid-cols-1'} gap-4 mb-8`}>
                          {/* Reconstruction Card */}
                          <div
                            onClick={async () => {
                              const targetIds = selectedTrashIds.length > 0 ? selectedTrashIds : deletedSheets.map(s => s.id);
                              try {
                                setBulkActionType(null);
                                showToast(`${selectedTrashIds.length > 0 ? 'Selected' : 'All'} architectures restoring...`);
                                await Promise.all(targetIds.map(id => api.patch(`/ingestion/sheets/${id}/`, { status: 'DRAFT' })));
                                fetchSheets();
                                setNewlyRestoredIds(prev => [...prev, ...targetIds]);
                                setSelectedTrashIds([]);
                                showToast(`${targetIds.length} Items Restored`);
                              } catch (e) {
                                showToast("Bulk Restore Failed", "destructive");
                              }
                            }}
                            className={`group/recon relative ${trashIsFullWidth ? 'p-8 rounded-[2rem]' : 'p-5 rounded-2xl'} bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.05] hover:border-amber-500/30 transition-all cursor-pointer shadow-2xl`}
                          >
                            <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/[0.03] to-transparent opacity-0 group-hover/recon:opacity-100 transition-opacity rounded-[inherit]" />
                            <div className={`${trashIsFullWidth ? 'w-16 h-16 mb-6' : 'w-10 h-10 mb-4'} rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 group-hover/recon:scale-110 transition-all duration-500`}>
                              <ArchiveRestore size={trashIsFullWidth ? 32 : 20} />
                            </div>
                            <h4 className={`${trashIsFullWidth ? 'text-lg' : 'text-sm'} font-black text-white uppercase tracking-tight mb-2`}>Restore {selectedTrashIds.length > 0 ? 'Selected' : 'Everything'}</h4>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed mb-5">Return {selectedTrashIds.length > 0 ? 'selected' : 'all archived'} items to production.</p>
                            <div className="w-fit px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-[8px] font-black uppercase tracking-widest group-hover/recon:scale-105 transition-transform">
                              Confirm
                            </div>
                          </div>

                          {/* Erasure Card */}
                          <div
                            onClick={async () => {
                              const targetIds = selectedTrashIds.length > 0 ? selectedTrashIds : deletedSheets.map(s => s.id);
                              try {
                                setBulkActionType(null);
                                showToast(`Permanently deleting ${selectedTrashIds.length > 0 ? 'selected' : 'all'} items...`);
                                await Promise.all(targetIds.map(id => api.delete(`/ingestion/sheets/${id}/`)));
                                fetchSheets();
                                setSelectedTrashIds([]);
                                showToast(`${targetIds.length} Items Permanently Deleted`);
                              } catch (e) {
                                showToast("Bulk Deletion Failed", "destructive");
                              }
                            }}
                            className={`group/purge relative ${trashIsFullWidth ? 'p-8 rounded-[2rem]' : 'p-5 rounded-2xl'} bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.05] hover:border-red-500/30 transition-all cursor-pointer shadow-2xl`}
                          >
                            <div className="absolute inset-0 bg-gradient-to-tr from-red-500/[0.03] to-transparent opacity-0 group-hover/purge:opacity-100 transition-opacity rounded-[inherit]" />
                            <div className={`${trashIsFullWidth ? 'w-16 h-16 mb-6' : 'w-10 h-10 mb-4'} rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 group-hover/purge:scale-110 transition-all duration-500`}>
                              <Trash2 size={trashIsFullWidth ? 32 : 20} />
                            </div>
                            <h4 className={`${trashIsFullWidth ? 'text-lg' : 'text-sm'} font-black text-white uppercase tracking-tight mb-2`}>Purge {selectedTrashIds.length > 0 ? 'Selected' : 'Recycle Bin'}</h4>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed mb-5">Permanently remove {selectedTrashIds.length > 0 ? 'these items' : 'everything'}.</p>
                            <div className="w-fit px-3 py-1.5 rounded-lg bg-red-600 text-white text-[8px] font-black uppercase tracking-widest group-hover/purge:scale-105 transition-transform">
                              Erase
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Panel Header */}
                <div className={`flex items-center justify-between px-10 py-8 relative z-10 backdrop-blur-3xl ${isLight ? 'border-b border-slate-200 bg-white' : 'border-b border-white/[0.05] bg-white/[0.01]'}`}>
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-lg shadow-amber-500/10">
                      <Trash2 size={24} />
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-white uppercase tracking-tighter leading-none mb-2">Recycle Bin</h2>
                      <p className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">{deletedSheets.length} Archived Schema{deletedSheets.length !== 1 ? 's' : ''}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-px h-8 bg-white/5 mx-2" />
                    <button
                      onClick={() => setTrashIsFullWidth(!trashIsFullWidth)}
                      className={`p-2 rounded-xl transition-all active:scale-95 ${isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-500 hover:text-white hover:bg-white/10'}`}
                      title={trashIsFullWidth ? "Minimize View" : "Maximize View"}
                    >
                      {trashIsFullWidth ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                    </button>
                    <button
                      onClick={() => setShowTrash(false)}
                      className={`p-2 rounded-xl transition-all active:scale-95 ${isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-500 hover:text-white hover:bg-white/10'}`}
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Sub-Header: Search Bar */}
                <div className={`flex items-center justify-between px-10 py-5 relative z-10 ${isLight ? 'bg-white border-b border-slate-200' : 'bg-white/[0.01] border-b border-white/[0.05]'}`}>
                  <div className="flex items-center gap-6">
                    <button
                      onClick={() => {
                        if (selectedTrashIds.length === deletedSheets.length) {
                          setSelectedTrashIds([]);
                        } else {
                          setSelectedTrashIds(deletedSheets.map(s => s.id));
                        }
                      }}
                      className={`flex items-center gap-2 transition-colors ${isLight ? 'text-slate-500 hover:text-slate-900' : 'text-slate-500 hover:text-white'}`}
                    >
                      <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${selectedTrashIds.length === deletedSheets.length ? 'bg-amber-500 border-amber-500 text-slate-950' : isLight ? 'border-slate-300 text-transparent' : 'border-white/20 text-transparent'}`}>
                        <CheckCircle2 size={12} strokeWidth={3} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {selectedTrashIds.length === deletedSheets.length ? 'Deselect All' : 'Select All'}
                      </span>
                    </button>

                    {selectedTrashIds.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                        <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest">{selectedTrashIds.length} Selected</span>
                      </div>
                    )}
                  </div>

                  <div className="relative group/trashsearch flex-1 max-w-[400px] mx-8">
                    <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within/trashsearch:text-amber-500 transition-colors" />
                    <input
                      type="text"
                      placeholder="Search archived architectural datasets..."
                      className={`w-full rounded-2xl pl-11 pr-4 py-3 text-xs focus:outline-none focus:border-amber-500/30 focus:ring-4 focus:ring-amber-500/5 transition-all font-medium ${isLight ? 'bg-white border border-slate-200 text-slate-700 placeholder:text-slate-400' : 'bg-slate-950/40 border border-white/10 text-white placeholder:text-slate-700'}`}
                      value={trashSearchQuery}
                      onChange={(e) => setTrashSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                {/* Panel Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
                  {deletedSheets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-8 text-center py-20">
                      <div className="relative">
                        <div className="w-28 h-28 rounded-[2.5rem] bg-gradient-to-br from-white/[0.03] to-white/[0.01] border border-white/10 flex items-center justify-center text-slate-700 shadow-2xl relative overflow-hidden group/empty">
                          <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/5 to-transparent opacity-0 group-hover/empty:opacity-100 transition-opacity duration-700" />
                          <Trash2 size={48} strokeWidth={1} className="relative z-10 opacity-20" />
                        </div>
                        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-20 h-1.5 bg-amber-500/10 blur-md rounded-full" />
                      </div>
                      <div className="space-y-3">
                        <p className="text-xl font-black uppercase tracking-[0.3em] bg-gradient-to-r from-slate-300 via-white to-slate-500 bg-clip-text text-transparent">Archive Vacuum</p>
                        <p className="text-[10px] text-slate-600 tracking-[0.25em] uppercase font-black">All architectural datasets are currently in production</p>
                      </div>
                    </div>
                  ) : (
                    <div className={`grid ${trashIsFullWidth ? 'grid-cols-3' : 'grid-cols-1'} gap-6`}>
                      {deletedSheets
                        .filter(sheet => sheet.name.toLowerCase().includes(trashSearchQuery.toLowerCase()))
                        .map(sheet => (
                          <motion.div
                            key={sheet.id}
                            initial={{ opacity: 0, scale: 0.98, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98, y: 10 }}
                            className={`group transition-all duration-500 relative overflow-hidden ${trashIsFullWidth
                              ? "bg-white/[0.02] border border-white/[0.08] rounded-[2rem] p-8 hover:bg-white/[0.04] hover:border-amber-500/30 shadow-2xl hover:shadow-amber-500/5"
                              : "bg-white/[0.02] border border-white/[0.08] rounded-2xl p-5 hover:bg-white/[0.04] hover:border-amber-500/20 shadow-xl"}
                            ${selectedTrashIds.includes(sheet.id) ? 'border-amber-500/40 shadow-amber-500/10' : ''}`}
                          >
                            {/* Selection Checkbox */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (selectedTrashIds.includes(sheet.id)) {
                                  setSelectedTrashIds(selectedTrashIds.filter(id => id !== sheet.id));
                                } else {
                                  setSelectedTrashIds([...selectedTrashIds, sheet.id]);
                                }
                              }}
                              className={`absolute top-4 left-4 z-20 w-6 h-6 rounded-lg border flex items-center justify-center transition-all duration-300 backdrop-blur-md
                              ${selectedTrashIds.includes(sheet.id)
                                  ? 'bg-amber-500 border-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 scale-110'
                                  : 'bg-slate-950/40 border-white/10 text-transparent opacity-0 group-hover:opacity-100 hover:border-white/30'}`}
                            >
                              <CheckCircle2 size={16} strokeWidth={3} />
                            </button>
                            {/* Accent Glass Flare */}
                            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-500/10 to-transparent blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

                            {/* Localized Professional Popover */}
                            <AnimatePresence>
                              {deletingCardId === sheet.id && (
                                <motion.div
                                  initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                                  animate={{ opacity: 1, backdropFilter: 'blur(20px)' }}
                                  exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                                  className="absolute inset-0 z-50 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center border border-red-500/20 rounded-[inherit]"
                                >
                                  <div className="mb-5">
                                    <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-3">
                                      <AlertTriangle size={24} className="text-red-500 animate-pulse" />
                                    </div>
                                    <h5 className="text-sm font-black text-white uppercase tracking-[0.1em] mb-1">Permanent Removal</h5>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Destroying {sheet.cols} Data Nodes</p>
                                  </div>
                                  <div className="flex gap-2 w-full max-w-[220px]">
                                    <button
                                      onClick={() => setDeletingCardId(null)}
                                      className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black text-slate-300 hover:text-white hover:bg-white/10 transition-all uppercase tracking-widest"
                                    >
                                      Abort
                                    </button>
                                    <button
                                      onClick={async () => {
                                        try {
                                          await api.delete(`/ingestion/sheets/${sheet.id}/`);
                                          fetchSheets();
                                          showToast(`Secure Erasure Successful. ${deletedSheets.length - 1} remain.`);
                                          setDeletingCardId(null);
                                        } catch (e) {
                                          showToast("System Error: Deletion Failed", "destructive");
                                        }
                                      }}
                                      className="flex-1 py-2.5 rounded-xl bg-red-600 text-[9px] font-black text-white hover:bg-red-500 transition-all uppercase tracking-widest shadow-lg shadow-red-600/30"
                                    >
                                      Erase
                                    </button>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {trashIsFullWidth ? (
                              <div className="flex flex-col h-full relative z-10">
                                <div className="flex items-start justify-between mb-8">
                                  <div className="flex items-center gap-5">
                                    <div className="w-16 h-16 rounded-2xl bg-slate-950/60 border border-white/[0.05] flex items-center justify-center text-amber-500 shadow-inner group-hover:border-amber-500/20 transition-colors duration-500">
                                      <FileSpreadsheet size={32} strokeWidth={1.5} />
                                    </div>
                                    <div>
                                      <h4 className="text-2xl font-black text-white uppercase tracking-tighter mb-1.5 group-hover:text-amber-400 transition-colors duration-500 leading-none">{sheet.name}</h4>
                                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">{sheet.date}</span>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => setDeletingCardId(sheet.id)}
                                    className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-slate-500 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 transition-all flex items-center justify-center"
                                    title="Secure Delete"
                                  >
                                    <X size={18} />
                                  </button>
                                </div>

                                <div className="grid grid-cols-2 gap-6 py-6 border-t border-white/[0.05] mb-8">
                                  <div className="space-y-1.5">
                                    <span className="block text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">Storage Class</span>
                                    <div className="flex items-center gap-2 text-amber-500/80">
                                      <Archive size={12} />
                                      <span className="text-[10px] font-black uppercase tracking-widest">Cold Storage</span>
                                    </div>
                                  </div>
                                  <div className="space-y-1.5 text-right">
                                    <span className="block text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">Archival Footprint</span>
                                    <span className="inline-block px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05] shadow-inner text-[10px] font-black text-amber-500 uppercase tracking-tighter">
                                      {(() => {
                                        try {
                                          const bytes = new Blob([JSON.stringify(sheet)]).size;
                                          return bytes > 1024 * 1024
                                            ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
                                            : `${(bytes / 1024).toFixed(1)} KB`;
                                        } catch { return '0.1 KB'; }
                                      })()}
                                    </span>
                                  </div>
                                </div>

                                <button
                                  onClick={async () => {
                                    try {
                                      await api.patch(`/ingestion/sheets/${sheet.id}/`, { status: 'DRAFT' });
                                      fetchSheets();
                                      setNewlyRestoredIds(prev => [...prev, sheet.id]);
                                      showToast(`Architecture "${sheet.name}" restored successfully.`);
                                    } catch (e) {
                                      showToast("Restore operation failed", "destructive");
                                    }
                                  }}
                                  className="w-full h-14 rounded-2xl bg-white/[0.04] border border-white/10 text-amber-500 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-amber-500 hover:text-slate-950 hover:border-amber-500 hover:shadow-2xl hover:shadow-amber-500/20 transition-all duration-500 flex items-center justify-center gap-3 active:scale-[0.98]"
                                >
                                  <ArchiveRestore size={20} strokeWidth={2} />
                                  Restore to Production
                                </button>
                              </div>
                            ) : (
                              <div className="relative z-10">
                                <div className="flex items-center gap-4 mb-5">
                                  <div className="w-12 h-12 rounded-xl bg-slate-950/60 border border-white/[0.05] flex items-center justify-center text-amber-500 shrink-0 group-hover:border-amber-500/20 transition-colors duration-500">
                                    <FileSpreadsheet size={24} strokeWidth={1.5} />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-black text-white truncate uppercase tracking-tight mb-0.5 group-hover:text-amber-400 transition-colors duration-500">{sheet.name}</p>
                                    <span className="text-[9px] text-slate-600 uppercase tracking-widest font-black">{sheet.date}</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={async () => {
                                      try {
                                        await api.patch(`/ingestion/sheets/${sheet.id}/`, { status: 'DRAFT' });
                                        fetchSheets();
                                        setNewlyRestoredIds(prev => [...prev, sheet.id]);
                                        showToast(`Restored: ${sheet.name}`);
                                      } catch (e) {
                                        showToast("Failed to restore", "destructive");
                                      }
                                    }}
                                    className="flex-1 h-11 rounded-xl bg-white/[0.04] border border-white/10 text-amber-500 text-[9px] font-black uppercase tracking-[0.15em] hover:bg-amber-500 hover:text-slate-950 hover:border-amber-500 transition-all duration-500 flex items-center justify-center gap-2 active:scale-95"
                                  >
                                    <ArchiveRestore size={14} strokeWidth={2} /> Restore
                                  </button>
                                  <button
                                    onClick={() => setDeletingCardId(sheet.id)}
                                    className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 text-slate-500 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 transition-all flex items-center justify-center"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </motion.div>
                        ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {toast.visible && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.95 }}
              className={`fixed bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-4 px-8 py-5 rounded-full shadow-[0_32px_64px_rgba(0,0,0,0.6)] border ${toast.type === 'destructive' ? 'bg-red-950/90 border-red-500/50 text-red-400' : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-400'} backdrop-blur-3xl z-[200] min-w-[340px] justify-center`}
            >
              <div className={`p-2 rounded-full ${toast.type === 'destructive' ? 'bg-red-500/20' : 'bg-emerald-500/20'}`}>
                {toast.type === 'destructive' ? <Trash2 size={16} /> : <CheckCircle2 size={16} />}
              </div>
              <span className="text-xs font-black uppercase tracking-widest leading-none">{toast.message}</span>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
};

export default SheetBuilder;

