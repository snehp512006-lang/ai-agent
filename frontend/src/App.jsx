import React, { useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { AnalysisProvider } from './context/analysisContext';
import { LayoutProvider } from './context/LayoutContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import TaskHistory from './pages/TaskHistory';
import InventoryRisks from './pages/InventoryRisks';
import ForecastViewer from './pages/ForecastViewer';
import ClientRecords from './pages/ClientRecords';
import EmailAgent from './pages/EmailAgent';
import Login from './pages/Login';
import SheetBuilder from './pages/SheetBuilder';
import AIRealTimeProcessor from './pages/AIRealTimeProcessor';
import PredictiveAudit from './pages/PredictiveAudit';
import './index.css';

// Higher order component for route protection
const ProtectedRoute = ({ children, useLayout = true }) => {
  const { user, loading } = useContext(AuthContext);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-[var(--text-main)] font-medium tracking-widest uppercase text-xs">Loading Core Systems</div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return useLayout ? <Layout>{children}</Layout> : children;
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AnalysisProvider>
          <LayoutProvider>
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Routes>
                <Route path="/login" element={<Login />} />
                
                {/* Protected Routes */}
                <Route path="/"           element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/risks"      element={<ProtectedRoute><InventoryRisks /></ProtectedRoute>} />
                <Route path="/forecast"   element={<ProtectedRoute><ForecastViewer /></ProtectedRoute>} />
                <Route path="/clients"    element={<ProtectedRoute><ClientRecords /></ProtectedRoute>} />
                <Route path="/email"      element={<ProtectedRoute><EmailAgent /></ProtectedRoute>} />
                <Route path="/ai-processor" element={<ProtectedRoute><AIRealTimeProcessor /></ProtectedRoute>} />
                <Route path="/tasks"      element={<ProtectedRoute><TaskHistory /></ProtectedRoute>} />
                <Route path="/audit"      element={<ProtectedRoute><PredictiveAudit /></ProtectedRoute>} />
                <Route path="/builder"    element={<ProtectedRoute useLayout={false}><SheetBuilder /></ProtectedRoute>} />
                
                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Router>
          </LayoutProvider>
        </AnalysisProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
