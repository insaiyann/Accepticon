import { useState, useCallback, useEffect } from 'react';
import { simplifiedSTTPipelineService } from '../services/SimplifiedSTTPipeline';
import type { MermaidGenerationOptions } from '../services/azure/OpenAIService';

export interface SimplifiedPipelineState {
  isProcessing: boolean;
  progress: string;
  error: string | null;
  isInitialized: boolean;
  currentMermaidCode: string | null;
  currentTitle: string | null;
}

export const useSimplifiedSTTPipeline = () => {
  const [state, setState] = useState<SimplifiedPipelineState>({
    isProcessing: false,
    progress: '',
    error: null,
    isInitialized: false,
    currentMermaidCode: null,
    currentTitle: null
  });

  /**
   * Auto-initialize on mount
   */
  useEffect(() => {
    const initializePipeline = async () => {
      try {
        setState(prev => ({ ...prev, progress: 'Initializing Azure services...' }));
        const success = await simplifiedSTTPipelineService.autoInitialize();
        
        setState(prev => ({
          ...prev,
          isInitialized: success,
          progress: success ? 'Ready' : 'Failed to initialize',
          error: success ? null : 'Failed to initialize Azure services. Please check your environment variables.'
        }));
      } catch (error) {
        setState(prev => ({
          ...prev,
          isInitialized: false,
          progress: 'Failed to initialize',
          error: error instanceof Error ? error.message : 'Initialization failed'
        }));
      }
    };

    initializePipeline();

    // Cleanup on unmount
    return () => {
      simplifiedSTTPipelineService.cleanup();
    };
  }, []);

  /**
   * Generate Mermaid diagram from all threads
   */
  const generateMermaidFromAllThreads = useCallback(async (options: MermaidGenerationOptions = {}): Promise<boolean> => {
    if (!state.isInitialized) {
      setState(prev => ({ ...prev, error: 'Pipeline not initialized' }));
      return false;
    }

    try {
      setState(prev => ({
        ...prev,
        isProcessing: true,
        progress: 'Collecting audio messages from all threads...',
        error: null,
        currentMermaidCode: null,
        currentTitle: null
      }));

      // Update progress as we go through the pipeline
      setState(prev => ({ ...prev, progress: 'Transcribing audio messages...' }));
      
      const result = await simplifiedSTTPipelineService.processAllThreadsAndGenerateMermaid(options);

      if (result.success) {
        setState(prev => ({
          ...prev,
          isProcessing: false,
          progress: 'Mermaid diagram generated successfully!',
          currentMermaidCode: result.mermaidCode || null,
          currentTitle: result.title || null
        }));
        return true;
      } else {
        setState(prev => ({
          ...prev,
          isProcessing: false,
          progress: 'Failed to generate diagram',
          error: result.error || 'Unknown error occurred'
        }));
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({
        ...prev,
        isProcessing: false,
        progress: 'Failed to generate diagram',
        error: errorMessage
      }));
      return false;
    }
  }, [state.isInitialized]);

  /**
   * Clear current error
   */
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  /**
   * Clear current diagram
   */
  const clearDiagram = useCallback(() => {
    setState(prev => ({ 
      ...prev, 
      currentMermaidCode: null, 
      currentTitle: null,
      progress: state.isInitialized ? 'Ready' : 'Not initialized'
    }));
  }, [state.isInitialized]);

  /**
   * Manual initialize with custom config (if needed)
   */
  const manualInitialize = useCallback(async (): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, progress: 'Re-initializing...' }));
      const success = await simplifiedSTTPipelineService.autoInitialize();
      
      setState(prev => ({
        ...prev,
        isInitialized: success,
        progress: success ? 'Ready' : 'Failed to initialize',
        error: success ? null : 'Failed to initialize Azure services'
      }));
      
      return success;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isInitialized: false,
        progress: 'Failed to initialize',
        error: error instanceof Error ? error.message : 'Initialization failed'
      }));
      return false;
    }
  }, []);

  return {
    // State
    ...state,

    // Actions
    generateMermaidFromAllThreads,
    clearError,
    clearDiagram,
    manualInitialize
  };
};
