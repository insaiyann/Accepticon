import React, { useEffect } from 'react';
import MermaidViewer from '../MermaidViewer/MermaidViewer';
import './ViewerPanel.css';
import { useDiagram } from '../../context/DiagramContext';

export const ViewerPanel: React.FC = () => {
  const { mermaidCode, title } = useDiagram();
  const [error, setError] = React.useState<string | null>(null);
  const clearError = React.useCallback(()=> setError(null),[]);

  // Tab management
  type TabKey = 'diagram' | 'summary' | 'plan' | 'technicals';
  const [activeTab, setActiveTab] = React.useState<TabKey>('diagram');

  const tabs: { key: TabKey; label: string; }[] = [
    { key: 'diagram', label: 'Mermaid Viewer' },
    { key: 'summary', label: 'Source summary' },
    { key: 'plan', label: 'Implementation plan' },
    { key: 'technicals', label: 'Technicals' }
  ];

  const handleDiagramError = (error: string) => {
    console.error('Diagram rendering error:', error);
    // Could show a toast notification here
  };

  // Clear any pipeline errors when the component mounts
  useEffect(() => {
    if (error) {
      // Auto-clear errors after 5 seconds
      const timer = setTimeout(() => {
        clearError();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  return (
    <div className="viewer-panel">
      {/* Tab bar */}
      <div className="viewer-tabs" role="tablist" aria-label="Viewer sections">
        {tabs.map(tab => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`viewer-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="viewer-content" role="tabpanel" aria-live="polite">
        {activeTab === 'diagram' && (
          <MermaidViewer 
            mermaidCode={mermaidCode}
            title={title}
            onError={handleDiagramError}
            className="viewer-panel-mermaid"
          />
        )}
        {activeTab === 'summary' && (
          <div className="tab-placeholder">
            <h3>Source summary</h3>
            <p>This tab will display an auto-generated summary of the source or conversation context.</p>
            <p className="todo-note">TODO: Integrate summarization pipeline.</p>
          </div>
        )}
        {activeTab === 'plan' && (
          <div className="tab-placeholder">
            <h3>Implementation plan</h3>
            <p>High level and step-by-step implementation plan for the current task will appear here.</p>
            <ul>
              <li>Capture user goal</li>
              <li>Break into actionable steps</li>
              <li>Track progress & status</li>
            </ul>
            <p className="todo-note">TODO: Hook into planning context state.</p>
          </div>
        )}
        {activeTab === 'technicals' && (
          <div className="tab-placeholder">
            <h3>Technicals</h3>
            <p>Technical diagnostics, performance metrics, and debug info will show here.</p>
            <p className="todo-note">TODO: Add diagnostics feed.</p>
          </div>
        )}
      </div>

      {/* Show pipeline errors if any */}
      {error && (
        <div className="pipeline-error-overlay">
          <div className="pipeline-error">
            <span className="error-icon">⚠️</span>
            <span className="error-message">{error}</span>
            <button className="error-close" onClick={clearError}>×</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewerPanel;
