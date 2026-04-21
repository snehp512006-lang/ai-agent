import React, { createContext, useContext, useState } from 'react';

/**
 * Layout Context
 * Manages fullscreen state across Sidebar, Navbar, and Main Content
 * Allows child components to trigger full-screen chart mode
 */
const LayoutContext = createContext();

export const LayoutProvider = ({ children }) => {
  const [isLayoutFullscreen, setIsLayoutFullscreen] = useState(false);

  const enableFullscreen = () => setIsLayoutFullscreen(true);
  const disableFullscreen = () => setIsLayoutFullscreen(false);
  const toggleFullscreen = () => setIsLayoutFullscreen(!isLayoutFullscreen);

  return (
    <LayoutContext.Provider
      value={{
        isLayoutFullscreen,
        enableFullscreen,
        disableFullscreen,
        toggleFullscreen,
      }}
    >
      {children}
    </LayoutContext.Provider>
  );
};

export const useLayoutFullscreen = () => {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayoutFullscreen must be used within LayoutProvider');
  }
  return context;
};
