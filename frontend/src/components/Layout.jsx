import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { useLayoutFullscreen } from '../context/LayoutContext';

const Layout = ({ children }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { isLayoutFullscreen } = useLayoutFullscreen();

  return (
    <div className="app-shell">
      {/* Sidebar - Hidden in Fullscreen Mode */}
      {!isLayoutFullscreen && (
        <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
      )}

      {/* Main Wrapper */}
      <div 
        className={`main-wrapper ${isCollapsed ? 'collapsed-sidebar' : ''}`}
        style={{ 
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Navbar - Hidden in Fullscreen Mode */}
        {!isLayoutFullscreen && <Navbar />}

        {/* Main Content - Full Screen When Active */}
        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
