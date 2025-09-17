/**
 * React Hook for the New STT Pipeline
 * Provides a clean interface to use the new Speech-to-Text pipeline service
 */

import { useState, useCallback, useEffect } from 'react';
import { newSTTPipelineService, type PipelineProgress } from '../services/NewSTTPipeline';

export interface NewSTTPipelineState {
  isInitialized: boolean;
  isProcessing: boolean;
  progress: PipelineProgress | null;
  error: string | null;
  lastResult: {
    totalProcessed: number;
    successful: number;
    failed: number;
    errors: string[];
  } | null;
}

export const useNewSTTPipeline = () => {
  const [state, setState] = useState<NewSTTPipelineState>({
    isInitialized: false,
    isProcessing: false,
    progress: null,
    error: null,
    lastResult: null
  });

  /**
   * Initialize the pipeline on mount
   */
  useEffect(() => {
    const initializePipeline = async () => {
      try {
        console.log('🔧 useNewSTTPipeline: Initializing pipeline...');
        
        const success = await newSTTPipelineService.autoInitialize();
        
        setState(prev => ({
          ...prev,
          isInitialized: success,
          error: success ? null : 'Failed to initialize Azure Speech Service. Please check your environment variables.'
        }));

        if (success) {
          console.log('✅ useNewSTTPipeline: Pipeline initialized successfully');
        } else {
          console.error('❌ useNewSTTPipeline: Pipeline initialization failed');
        }
      } catch (error) {
        console.error('❌ useNewSTTPipeline: Initialization error:', error);
        setState(prev => ({
          ...prev,
          isInitialized: false,
          error: error instanceof Error ? error.message : 'Failed to initialize STT pipeline'
        }));
      }
    };

    initializePipeline();

    // Setup event handlers
    newSTTPipelineService.setEventHandlers(
      // Progress handler
      (progress) => {
        setState(prev => ({
          ...prev,
          progress
        }));
      },
      // Error handler
      (error) => {
        setState(prev => ({
          ...prev,
          error,
          isProcessing: false
        }));
      },
      // Complete handler
      (result) => {
        setState(prev => ({
          ...prev,
          lastResult: {
            totalProcessed: result.totalProcessed,
            successful: result.successful,
            failed: result.failed,
            errors: result.errors
          },
          isProcessing: false,
          progress: null
        }));
      }
    );

    // Cleanup on unmount
    return () => {
      newSTTPipelineService.cleanup();
    };
  }, []);

  /**
   * Process all audio messages and save transcripts
   * This is called when the "Generate Mermaid Diagram" button is clicked
   */
  const processAudioMessages = useCallback(async (): Promise<boolean> => {
    if (!state.isInitialized) {
      setState(prev => ({ 
        ...prev, 
        error: 'STT Pipeline not initialized. Please check your Azure credentials.' 
      }));
      return false;
    }

    try {
      setState(prev => ({
        ...prev,
        isProcessing: true,
        error: null,
        progress: null,
        lastResult: null
      }));

      console.log('🚀 useNewSTTPipeline: Starting audio message processing...');
      
      const result = await newSTTPipelineService.processAudioMessagesAndSaveTranscripts();
      
      console.log('✅ useNewSTTPipeline: Processing completed:', result);
      return result.success;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('❌ useNewSTTPipeline: Processing failed:', error);
      
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: errorMessage,
        progress: null
      }));
      
      return false;
    }
  }, [state.isInitialized]);

  /**
   * Test the configuration
   */
  const testConfiguration = useCallback(async (): Promise<boolean> => {
    if (!state.isInitialized) {
      return false;
    }

    try {
      console.log('🧪 useNewSTTPipeline: Testing configuration...');
      const isValid = await newSTTPipelineService.testConfiguration();
      console.log(`📊 useNewSTTPipeline: Configuration test result: ${isValid ? 'PASS' : 'FAIL'}`);
      return isValid;
    } catch (error) {
      console.error('❌ useNewSTTPipeline: Configuration test failed:', error);
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
   * Clear last result
   */
  const clearResult = useCallback(() => {
    setState(prev => ({ ...prev, lastResult: null, progress: null }));
  }, []);

  /**
   * Manual re-initialization (if needed)
   */
  const reinitialize = useCallback(async (): Promise<boolean> => {
    try {
      setState(prev => ({ 
        ...prev, 
        isInitialized: false, 
        error: null 
      }));

      const success = await newSTTPipelineService.autoInitialize();
      
      setState(prev => ({
        ...prev,
        isInitialized: success,
        error: success ? null : 'Failed to re-initialize Azure Speech Service'
      }));

      return success;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isInitialized: false,
        error: error instanceof Error ? error.message : 'Re-initialization failed'
      }));
      return false;
    }
  }, []);

  /**
   * Get current pipeline status
   */
  const getStatus = useCallback(() => {
    return newSTTPipelineService.getStatus();
  }, []);

  /**
   * Get supported languages
   */
  const getSupportedLanguages = useCallback(() => {
    // Return common Azure Speech Service supported languages
    return [
      { code: 'en-US', name: 'English (United States)' },
      { code: 'en-GB', name: 'English (United Kingdom)' },
      { code: 'es-ES', name: 'Spanish (Spain)' },
      { code: 'fr-FR', name: 'French (France)' },
      { code: 'de-DE', name: 'German (Germany)' },
      { code: 'it-IT', name: 'Italian (Italy)' },
      { code: 'pt-BR', name: 'Portuguese (Brazil)' },
      { code: 'zh-CN', name: 'Chinese (Simplified)' },
      { code: 'ja-JP', name: 'Japanese (Japan)' },
      { code: 'ko-KR', name: 'Korean (South Korea)' }
    ];
  }, []);

  return {
    // State
    isInitialized: state.isInitialized,
    isProcessing: state.isProcessing,
    progress: state.progress,
    error: state.error,
    lastResult: state.lastResult,

    // Actions
    processAudioMessages,
    testConfiguration,
    clearError,
    clearResult,
    reinitialize,
    getStatus,
    getSupportedLanguages,

    // Computed values
    canProcess: state.isInitialized && !state.isProcessing,
    progressPercentage: state.progress ? Math.round((state.progress.current / state.progress.total) * 100) : 0,
    hasResults: state.lastResult !== null,
    isConfigured: state.isInitialized
  };
};

export default useNewSTTPipeline;
