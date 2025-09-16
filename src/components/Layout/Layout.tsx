import React, { useState } from 'react';
import ConfigurationPanel from '../ConfigurationPanel/ConfigurationPanel';
import { useSimplifiedSTTPipeline } from '../../hooks/useSimplifiedSTTPipeline';
import { Icon } from '../common/Icon';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const { isInitialized } = useSimplifiedSTTPipeline();

  const handleConfigSave = async (credentials: {
    speechKey: string;
    speechRegion: string;
    openaiKey: string;
    openaiEndpoint: string;
    openaiDeployment: string;
  }) => {
    // Configuration saving will trigger re-initialization through environment variables
    console.log('Credentials saved:', credentials);
    // The simplified pipeline will auto-initialize with environment variables
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-logo">
          <div className="logo-icon">
            <Icon name="diagram" size={24} className="icon" />
          </div>
          <h1>AcceptiCon</h1>
        </div>
        <div className="header-controls">
          <div className="status-indicator">
            <span className={`status-dot ${isInitialized ? 'connected' : 'disconnected'}`}></span>
            <span className="status-text">
              {isInitialized ? 'Connected' : 'Not Connected'}
            </span>
          </div>
          <button 
            className="settings-button btn-secondary"
            onClick={() => setIsConfigOpen(true)}
            title="Azure Configuration"
          >
            <Icon name="settings" size={16} className="icon" />
          </button>
        </div>
      </header>
      <main className="app-content">
        {children}
      </main>
      
      <ConfigurationPanel
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        onSave={handleConfigSave}
      />
    </div>
  );
};

export default Layout;
