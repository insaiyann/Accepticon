// Deprecated placeholder for removed pipeline hook
export const useSimpleAudioPipeline = () => ({ isInitialized:false, isProcessing:false, currentStep:'Removed', error:'Deprecated', currentMermaidCode:null, currentTitle:null, generateMermaidFromAllThreads: async()=>false, recordAudio: async()=>false, manualInitialize: async()=>false, clearError:()=>{}, clearDiagram:()=>{}, getStatistics:()=>null, isReady:()=>false });
export default useSimpleAudioPipeline;
/**
 * Simple Audio Pipeline Hook - Clean React hook for the new pipeline
 * Built from scratch for reliability and simplicity
 */

import { useState, useEffect, useCallback } from 'react';
import { simpleAudioPipeline } from '../services/SimpleAudioPipeline';
import type { PipelineState, PipelineResult } from '../services/SimpleAudioPipeline';
import type { MermaidGenerationOptions } from '../services/azure/OpenAIService';

export interface SimpleAudioPipelineState extends PipelineState {
  currentMermaidCode: string | null;
  currentTitle: string | null;
  lastResult: PipelineResult | null;
}

export const useSimpleAudioPipeline = () => {
  const [state, setState] = useState<SimpleAudioPipelineState>({
    isInitialized: false,
    isProcessing: false,
    currentStep: 'Not initialized',
    error: null,
    currentMermaidCode: null,
    currentTitle: null,
    lastResult: null
  });

  /**
   * Update state when pipeline state changes
   */
  const handlePipelineStateChange = useCallback((pipelineState: PipelineState) => {
    setState(prevState => ({
      ...prevState,
      ...pipelineState
    }));
  }, []);

  /**
   * Initialize the pipeline on mount
   */
  useEffect(() => {

    // Set up pipeline state change callback
    simpleAudioPipeline.setStateChangeCallback(handlePipelineStateChange);

    // Auto-initialize the pipeline
    const initializePipeline = async () => {
      try {
        const success = await simpleAudioPipeline.autoInitialize();
        if (!success) {
          setState(prev => ({
            ...prev,
            error: 'Failed to initialize: Check your Azure configuration'
          }));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Initialization failed';
        setState(prev => ({
          ...prev,
          error: message
        }));
      }
    };

    initializePipeline();

    // Cleanup on unmount (remove listener but do not always tear down pipeline for other consumers)
    return () => {
      simpleAudioPipeline.removeStateChangeCallback(handlePipelineStateChange);
      // Only perform full cleanup if no more listeners
      // (Heuristic: if there are zero callbacks after removal)
      // Accessing private field isn't possible; rely on a safe cleanup always for now could disrupt others.
      // Better: expose a method to check subscribers; skipping full cleanup to prevent race.
    };
  }, [handlePipelineStateChange]);

  /**
   * Process all audio messages and generate Mermaid diagram
   */
  const generateMermaidFromAllThreads = useCallback(async (
    options: MermaidGenerationOptions = {}
  ): Promise<boolean> => {
    if (!state.isInitialized) {
      setState(prev => ({
        ...prev,
        error: 'Pipeline not initialized'
      }));
      return false;
    }

    try {
      
      // Clear previous results and errors
      setState(prev => ({
        ...prev,
        error: null,
        currentMermaidCode: null,
        currentTitle: null,
        lastResult: null
      }));

      const result = await simpleAudioPipeline.processAllAndGenerateMermaid(options);

      setState(prev => ({
        ...prev,
        lastResult: result,
        currentMermaidCode: result.success ? result.mermaidCode || null : null,
        currentTitle: result.success ? result.title || null : null,
        error: result.success ? null : result.error || 'Unknown error occurred'
      }));

      if (result.success) {
        return true;
      } else {
        return false;
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      
      setState(prev => ({
        ...prev,
        error: message,
        lastResult: {
          success: false,
          error: message
        }
      }));
      
      return false;
    }
  }, [state.isInitialized]);

  /**
   * Record audio and save it as an audio message
   */
  const recordAudio = useCallback(async (): Promise<boolean> => {
    if (!state.isInitialized) {
      setState(prev => ({
        ...prev,
        error: 'Pipeline not initialized'
      }));
      return false;
    }

    try {
      await simpleAudioPipeline.recordAudio();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Recording failed';
      setState(prev => ({
        ...prev,
        error: message
      }));
      return false;
    }
  }, [state.isInitialized]);

  /**
   * Manual re-initialization
   */
  const manualInitialize = useCallback(async (): Promise<boolean> => {
    try {
      const success = await simpleAudioPipeline.autoInitialize();
      if (!success) {
        setState(prev => ({
          ...prev,
          error: 'Failed to re-initialize: Check your Azure configuration'
        }));
      }
      return success;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Re-initialization failed';
      setState(prev => ({
        ...prev,
        error: message
      }));
      return false;
    }
  }, []);

  /**
   * Clear current error
   */
  const clearError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null
    }));
  }, []);

  /**
   * Clear current diagram
   */
  const clearDiagram = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentMermaidCode: null,
      currentTitle: null,
      lastResult: null
    }));
  }, []);

  /**
   * Get pipeline statistics from last result
   */
  const getStatistics = useCallback(() => {
    if (!state.lastResult) {
      return null;
    }

    return {
      totalMessages: state.lastResult.totalMessages || 0,
      transcriptionCount: state.lastResult.transcriptionCount || 0,
      success: state.lastResult.success
    };
  }, [state.lastResult]);

  return {
    // State
    isInitialized: state.isInitialized,
    isProcessing: state.isProcessing,
    currentStep: state.currentStep,
    error: state.error,
    currentMermaidCode: state.currentMermaidCode,
    currentTitle: state.currentTitle,
    
    // Actions
    generateMermaidFromAllThreads,
    recordAudio,
    manualInitialize,
    clearError,
    clearDiagram,
    
    // Utilities
    getStatistics,
    isReady: () => simpleAudioPipeline.isReady()
  };
};
