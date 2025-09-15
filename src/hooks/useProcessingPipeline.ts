import { useState, useCallback } from 'react';
import { processingPipelineService } from '../services/ProcessingPipeline';
import type { DiagramCache } from '../types/Message';
import type { MermaidGenerationOptions } from '../services/azure/OpenAIService';

export interface ProcessingState {
  isProcessing: boolean;
  progress: string;
  error: string | null;
  currentDiagram: DiagramCache | null;
}

export interface PipelineConfig {
  azureSpeech: {
    subscriptionKey: string;
    region: string;
    language?: string;
  };
  azureOpenAI: {
    apiKey: string;
    endpoint: string;
    apiVersion: string;
    deploymentName: string;
  };
  processing: {
    enableQueue: boolean;
    maxRetries: number;
    timeout: number;
  };
}

export const useProcessingPipeline = () => {
  const [state, setState] = useState<ProcessingState>({
    isProcessing: false,
    progress: '',
    error: null,
    currentDiagram: null
  });

  const [isInitialized, setIsInitialized] = useState(false);

  /**
   * Initialize the processing pipeline with configuration
   */
  const initialize = useCallback(async (config: PipelineConfig): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, isProcessing: true, progress: 'Initializing services...', error: null }));
      
      await processingPipelineService.initialize(config);
      setIsInitialized(true);
      
      setState(prev => ({ ...prev, isProcessing: false, progress: 'Ready' }));
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Initialization failed';
      setState(prev => ({ ...prev, isProcessing: false, error: errorMessage, progress: 'Failed' }));
      return false;
    }
  }, []);

  /**
   * Generate diagram from message IDs
   */
  const generateDiagram = useCallback(async (
    messageIds: string[], 
    options: MermaidGenerationOptions = {}
  ): Promise<DiagramCache | null> => {
    if (!isInitialized) {
      setState(prev => ({ ...prev, error: 'Pipeline not initialized' }));
      return null;
    }

    try {
      setState(prev => ({ 
        ...prev, 
        isProcessing: true, 
        progress: 'Checking cache...', 
        error: null 
      }));

      // Check for cached diagram first
      const cached = await processingPipelineService.getCachedDiagram(messageIds);
      if (cached) {
        setState(prev => ({ 
          ...prev, 
          isProcessing: false, 
          progress: 'Loaded from cache',
          currentDiagram: cached
        }));
        return cached;
      }

      // Generate new diagram
      setState(prev => ({ ...prev, progress: 'Processing messages...' }));
      
      const result = await processingPipelineService.generateDiagramFromMessages(messageIds, options);
      
      if (result.success && result.data) {
        const resultData = result.data as { diagram: DiagramCache };
        const diagram = resultData.diagram;
        setState(prev => ({ 
          ...prev, 
          isProcessing: false, 
          progress: 'Diagram generated successfully',
          currentDiagram: diagram
        }));
        return diagram;
      } else {
        throw new Error(result.error || 'Unknown error occurred');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Generation failed';
      setState(prev => ({ 
        ...prev, 
        isProcessing: false, 
        error: errorMessage, 
        progress: 'Failed'
      }));
      return null;
    }
  }, [isInitialized]);

  /**
   * Queue diagram generation for background processing
   */
  const queueDiagramGeneration = useCallback(async (
    messageIds: string[], 
    options: MermaidGenerationOptions = {}
  ): Promise<boolean> => {
    if (!isInitialized) {
      setState(prev => ({ ...prev, error: 'Pipeline not initialized' }));
      return false;
    }

    try {
      setState(prev => ({ 
        ...prev, 
        progress: 'Adding to processing queue...',
        error: null
      }));

      await processingPipelineService.queueDiagramGeneration(messageIds, options);
      
      setState(prev => ({ 
        ...prev, 
        progress: 'Queued for processing'
      }));
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Queue operation failed';
      setState(prev => ({ ...prev, error: errorMessage }));
      return false;
    }
  }, [isInitialized]);

  /**
   * Get processing pipeline status
   */
  const getStatus = useCallback(() => {
    return processingPipelineService.getStatus();
  }, []);

  /**
   * Get queue statistics
   */
  const getQueueStats = useCallback(async () => {
    try {
      return await processingPipelineService.getQueueStats();
    } catch (error) {
      console.error('Failed to get queue stats:', error);
      return null;
    }
  }, []);

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
    setState(prev => ({ ...prev, currentDiagram: null }));
  }, []);

  /**
   * Set current diagram (for external updates)
   */
  const setCurrentDiagram = useCallback((diagram: DiagramCache | null) => {
    setState(prev => ({ ...prev, currentDiagram: diagram }));
  }, []);

  /**
   * Auto-initialize with environment variables
   */
  const autoInitialize = useCallback(async (): Promise<boolean> => {
    // Check if environment variables are available
    const speechKey = import.meta.env.VITE_AZURE_SPEECH_KEY;
    const speechRegion = import.meta.env.VITE_AZURE_SPEECH_REGION;
    const openaiKey = import.meta.env.VITE_AZURE_OPENAI_KEY;
    const openaiEndpoint = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT;
    const openaiDeployment = import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT;

    if (!speechKey || !speechRegion || !openaiKey || !openaiEndpoint || !openaiDeployment) {
      setState(prev => ({ 
        ...prev, 
        error: 'Azure credentials not configured. Please set environment variables.' 
      }));
      return false;
    }

    const config: PipelineConfig = {
      azureSpeech: {
        subscriptionKey: speechKey,
        region: speechRegion,
        language: 'en-US'
      },
      azureOpenAI: {
        apiKey: openaiKey,
        endpoint: openaiEndpoint,
        apiVersion: '2023-12-01-preview',
        deploymentName: openaiDeployment
      },
      processing: {
        enableQueue: true,
        maxRetries: 3,
        timeout: 30000
      }
    };

    return await initialize(config);
  }, [initialize]);

  /**
   * Cleanup resources
   */
  const cleanup = useCallback(async () => {
    try {
      await processingPipelineService.cleanup();
      setIsInitialized(false);
      setState({
        isProcessing: false,
        progress: '',
        error: null,
        currentDiagram: null
      });
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }, []);

  return {
    // State
    ...state,
    isInitialized,

    // Actions
    initialize,
    autoInitialize,
    generateDiagram,
    queueDiagramGeneration,
    clearError,
    clearDiagram,
    setCurrentDiagram,
    cleanup,

    // Utilities
    getStatus,
    getQueueStats
  };
};
