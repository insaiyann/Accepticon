import React, { useEffect } from 'react';
import MermaidViewer from '../MermaidViewer/MermaidViewer';
import { useProcessingPipelineContext } from '../../hooks/useProcessingPipelineContext';
import './ViewerPanel.css';

export const ViewerPanel: React.FC = () => {
  const { currentDiagram, error, clearError } = useProcessingPipelineContext();

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
      <MermaidViewer 
        mermaidCode={currentDiagram?.mermaidCode}
        title={currentDiagram?.title}
        onError={handleDiagramError}
        className="viewer-panel-mermaid"
      />
      
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
