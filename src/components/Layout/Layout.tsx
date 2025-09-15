import React, { useState } from 'react';
import ConfigurationPanel from '../ConfigurationPanel/ConfigurationPanel';
import { useProcessingPipelineContext } from '../../hooks/useProcessingPipelineContext';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const { isInitialized } = useProcessingPipelineContext();

  const handleConfigSave = async (credentials: {
    speechKey: string;
    speechRegion: string;
    openaiKey: string;
    openaiEndpoint: string;
    openaiDeployment: string;
  }) => {
    // Configuration saving will trigger re-initialization through the context
    console.log('Credentials saved:', credentials);
    // The ProcessingPipelineProvider will handle the actual initialization
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Mermaid Diagram Generator</h1>
        <div className="header-controls">
          <div className="status-indicator">
            <span className={`status-dot ${isInitialized ? 'connected' : 'disconnected'}`}></span>
            <span className="status-text">
              {isInitialized ? 'Connected' : 'Not Connected'}
            </span>
          </div>
          <button 
            className="settings-button"
            onClick={() => setIsConfigOpen(true)}
            title="Azure Configuration"
          >
            ⚙️
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
