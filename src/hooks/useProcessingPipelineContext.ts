import { useMemo } from 'react';
import { speechTranscriptionPipeline } from '../services/speech/SpeechTranscriptionPipeline';

interface ProcessingPipelineContext {
  isInitialized: boolean;
  isProcessing: boolean;
  currentStep: string;
  error: string | null;
  currentMermaidCode: string | null;
  currentTitle: string | null;
  generateMermaidFromAllThreads: () => Promise<boolean>;
  clearError: () => void;
}

export const useProcessingPipelineContext = (): ProcessingPipelineContext => {
  const isInitialized = useMemo(() => speechTranscriptionPipeline.hasValidConfiguration(), []);

  return {
    isInitialized,
    isProcessing: false,
    currentStep: 'Idle',
    error: null,
    currentMermaidCode: null,
    currentTitle: null,
    generateMermaidFromAllThreads: async () => {
      console.warn('[useProcessingPipelineContext] Mermaid generation is disabled in the minimal pipeline.');
      return false;
    },
    clearError: () => {
      // No-op: minimal pipeline no longer tracks diagram errors.
    }
  };
};

export default useProcessingPipelineContext;
