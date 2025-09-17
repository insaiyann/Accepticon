import { useCallback, useMemo, useState } from 'react';
import {
  speechTranscriptionPipeline,
  type TranscriptionSummary
} from '../services/speech/SpeechTranscriptionPipeline';

interface UseSpeechTranscriptionResult {
  isConfigured: boolean;
  isProcessing: boolean;
  error: string | null;
  lastRun: TranscriptionSummary | null;
  transcribeAllAudioMessages: () => Promise<TranscriptionSummary>;
  clearError: () => void;
}

export const useSpeechTranscription = (): UseSpeechTranscriptionResult => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<TranscriptionSummary | null>(null);

  const isConfigured = useMemo(() => speechTranscriptionPipeline.hasValidConfiguration(), []);

  const transcribeAllAudioMessages = useCallback(async (): Promise<TranscriptionSummary> => {
    setIsProcessing(true);
    setError(null);

    try {
      const summary = await speechTranscriptionPipeline.transcribeAllAudioMessages();
      setLastRun(summary);
      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transcription failed. See console for details.';
      setError(message);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isConfigured,
    isProcessing,
    error,
    lastRun,
    transcribeAllAudioMessages,
    clearError
  };
};

export default useSpeechTranscription;
