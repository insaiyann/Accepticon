import React, { useEffect } from 'react';
import MermaidViewer from '../MermaidViewer/MermaidViewer';
import './ViewerPanel.css';
import { useDiagram } from '../../context/DiagramContext';
import { useViewerContent } from '../../context/ViewerContentContext';
import MarkdownViewer from '../common/MarkdownViewer';

export const ViewerPanel: React.FC = () => {
  const { mermaidCode, title } = useDiagram();
  const {
    runMode,
    diagram: diagramState,
    summary: summaryState,
    plan: planState,
    technicals: technicalsState
  } = useViewerContent();
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

  // Trigger generation when switching to a tab without content
  React.useEffect(()=> {
    // prime diagram on mount
    runMode('diagram');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(()=> {
    if (activeTab === 'summary' && !summaryState.loading && !summaryState.markdown && !summaryState.error) runMode('summary');
    if (activeTab === 'plan' && !planState.loading && !planState.markdown && !planState.error) runMode('plan');
    if (activeTab === 'technicals' && !technicalsState.loading && !technicalsState.markdown && !technicalsState.error) runMode('technicals');
  }, [activeTab, summaryState, planState, technicalsState, runMode]);

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
          <div>
            <MermaidViewer 
              mermaidCode={diagramState.mermaidCode || mermaidCode}
              title={title}
              onError={handleDiagramError}
              className="viewer-panel-mermaid"
            />
            {diagramState.loading && <div className="loading-note">Generating diagram...</div>}
            {diagramState.error && <div className="error-note">{diagramState.error}</div>}
          </div>
        )}
        {activeTab === 'summary' && (
          <MarkdownViewer
            markdown={summaryState.markdown}
            loading={summaryState.loading}
            error={summaryState.error}
            onRetry={()=> runMode('summary', { force: true })}
            title="Source Summary"
          />
        )}
        {activeTab === 'plan' && (
          <MarkdownViewer
            markdown={planState.markdown}
            loading={planState.loading}
            error={planState.error}
            onRetry={()=> runMode('plan', { force: true })}
            title="Implementation Plan"
          />
        )}
        {activeTab === 'technicals' && (
          <MarkdownViewer
            markdown={technicalsState.markdown}
            loading={technicalsState.loading}
            error={technicalsState.error}
            onRetry={()=> runMode('technicals', { force: true })}
            title="Technicals"
          />
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
