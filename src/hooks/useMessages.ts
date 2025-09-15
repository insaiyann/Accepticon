import { useState, useEffect, useCallback } from 'react';
import type { TextMessage, AudioMessage } from '../types/Message';
import { indexedDBService } from '../services/storage/IndexedDBService';
import { audioRecorderService, type AudioRecordingState } from '../services/audio/AudioRecorder';

interface UseMessagesResult {
  messages: (TextMessage | AudioMessage)[];
  loading: boolean;
  error: string | null;
  addTextMessage: (content: string) => Promise<void>;
  addAudioMessage: (audioBlob: Blob, duration: number) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  refreshMessages: () => Promise<void>;
}

export const useMessages = (): UseMessagesResult => {
  const [messages, setMessages] = useState<(TextMessage | AudioMessage)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize database and load messages
  useEffect(() => {
    const initializeAndLoadMessages = async () => {
      try {
        setLoading(true);
        setError(null);
        
        await indexedDBService.initialize();
        const loadedMessages = await indexedDBService.getAllMessages();
        setMessages(loadedMessages);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load messages');
      } finally {
        setLoading(false);
      }
    };

    initializeAndLoadMessages();
  }, []);

  const addTextMessage = useCallback(async (content: string) => {
    try {
      const newMessage = await indexedDBService.addTextMessage({
        content,
        timestamp: Date.now(),
        processed: false,
        type: 'text'
      });
      
      setMessages(prev => [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add text message');
      throw err;
    }
  }, []);

  const addAudioMessage = useCallback(async (audioBlob: Blob, duration: number) => {
    try {
      const newMessage = await indexedDBService.addAudioMessage({
        audioBlob,
        duration,
        timestamp: Date.now(),
        processed: false,
        type: 'audio',
        content: `Audio message (${Math.round(duration / 1000)}s)`
      });
      
      setMessages(prev => [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add audio message');
      throw err;
    }
  }, []);

  const deleteMessage = useCallback(async (id: string) => {
    try {
      // Note: We'll implement delete functionality in IndexedDBService later
      // For now, just remove from local state
      setMessages(prev => prev.filter(msg => msg.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete message');
      throw err;
    }
  }, []);

  const refreshMessages = useCallback(async () => {
    try {
      setLoading(true);
      const loadedMessages = await indexedDBService.getAllMessages();
      setMessages(loadedMessages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh messages');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    messages,
    loading,
    error,
    addTextMessage,
    addAudioMessage,
    deleteMessage,
    refreshMessages
  };
};

interface UseAudioRecorderResult {
  recordingState: AudioRecordingState;
  isSupported: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  cancelRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
}

export const useAudioRecorder = (): UseAudioRecorderResult => {
  const [recordingState, setRecordingState] = useState<AudioRecordingState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    error: null
  });

  // Check if audio recording is supported
  const [isSupported, setIsSupported] = useState(false);
  
  useEffect(() => {
    // Simple check for MediaRecorder support
    const supported = !!(navigator.mediaDevices && 
                         'getUserMedia' in navigator.mediaDevices && 
                         window.MediaRecorder);
    setIsSupported(supported);
  }, []);

  useEffect(() => {
    // Set up state change callback
    audioRecorderService.setStateChangeCallback(setRecordingState);
    
    return () => {
      // Cleanup on unmount
      audioRecorderService.cancelRecording();
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      await audioRecorderService.startRecording({
        maxDuration: 5 * 60 * 1000 // 5 minutes max
      });
    } catch (err) {
      setRecordingState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to start recording'
      }));
      throw err;
    }
  }, []);

  const stopRecording = useCallback(async () => {
    try {
      const result = await audioRecorderService.stopRecording();
      return result.blob;
    } catch (err) {
      setRecordingState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to stop recording'
      }));
      return null;
    }
  }, []);

  const cancelRecording = useCallback(() => {
    audioRecorderService.cancelRecording();
  }, []);

  const pauseRecording = useCallback(() => {
    audioRecorderService.pauseRecording();
  }, []);

  const resumeRecording = useCallback(() => {
    audioRecorderService.resumeRecording();
  }, []);

  return {
    recordingState,
    isSupported,
    startRecording,
    stopRecording,
    cancelRecording,
    pauseRecording,
    resumeRecording
  };
};
