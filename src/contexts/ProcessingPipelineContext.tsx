import React, { createContext, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useProcessingPipeline } from '../hooks/useProcessingPipeline';
import type { DiagramCache } from '../types/Message';
import type { MermaidGenerationOptions } from '../services/azure/OpenAIService';

interface ProcessingPipelineContextType {
  // State
  isProcessing: boolean;
  progress: string;
  error: string | null;
  currentDiagram: DiagramCache | null;
  isInitialized: boolean;

  // Actions
  generateDiagram: (messageIds: string[], options?: MermaidGenerationOptions) => Promise<DiagramCache | null>;
  queueDiagramGeneration: (messageIds: string[], options?: MermaidGenerationOptions) => Promise<boolean>;
  clearError: () => void;
  clearDiagram: () => void;
  setCurrentDiagram: (diagram: DiagramCache | null) => void;

  // Utilities
  getStatus: () => {
    isInitialized: boolean;
    speechService: {
      isInitialized: boolean;
      hasConfig: boolean;
      hasRecognizer: boolean;
    };
    openAIService: {
      isInitialized: boolean;
      hasClient: boolean;
      endpoint?: string;
    };
    queueService: {
      isProcessing: boolean;
      currentlyProcessing: string[];
      registeredProcessors: string[];
    };
  };
  getQueueStats: () => Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    currentlyProcessing: number;
  } | null>;
}

const ProcessingPipelineContext = createContext<ProcessingPipelineContextType | null>(null);

// Export the context for use in the separate hook file
export { ProcessingPipelineContext };

interface ProcessingPipelineProviderProps {
  children: ReactNode;
}

export const ProcessingPipelineProvider: React.FC<ProcessingPipelineProviderProps> = ({ children }) => {
  const pipeline = useProcessingPipeline();

  // Auto-initialize on mount
  useEffect(() => {
    pipeline.autoInitialize().catch(error => {
      console.error('Failed to auto-initialize processing pipeline:', error);
    });

    // Cleanup on unmount
    return () => {
      pipeline.cleanup().catch(error => {
        console.error('Failed to cleanup processing pipeline:', error);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array to run only once on mount (prevents infinite loop)

  const contextValue: ProcessingPipelineContextType = {
    // State
    isProcessing: pipeline.isProcessing,
    progress: pipeline.progress,
    error: pipeline.error,
    currentDiagram: pipeline.currentDiagram,
    isInitialized: pipeline.isInitialized,

    // Actions
    generateDiagram: pipeline.generateDiagram,
    queueDiagramGeneration: pipeline.queueDiagramGeneration,
    clearError: pipeline.clearError,
    clearDiagram: pipeline.clearDiagram,
    setCurrentDiagram: pipeline.setCurrentDiagram,

    // Utilities
    getStatus: pipeline.getStatus,
    getQueueStats: pipeline.getQueueStats
  };

  return (
    <ProcessingPipelineContext.Provider value={contextValue}>
      {children}
    </ProcessingPipelineContext.Provider>
  );
};
