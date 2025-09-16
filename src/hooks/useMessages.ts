import { useState, useEffect, useCallback } from 'react';
import type { TextMessage, AudioMessage, ImageMessage } from '../types/Message';
import { indexedDBService } from '../services/storage/IndexedDBService';
import { audioRecorderService, type AudioRecordingState } from '../services/audio/AudioRecorder';

interface UseMessagesResult {
  messages: (TextMessage | AudioMessage | ImageMessage)[];
  loading: boolean;
  error: string | null;
  addTextMessage: (content: string) => Promise<TextMessage>;
  addAudioMessage: (audioBlob: Blob, duration: number) => Promise<AudioMessage>;
  addImageMessage: (imageBlob: Blob, fileName: string, description?: string) => Promise<ImageMessage>;
  deleteMessage: (id: string) => Promise<void>;
  refreshMessages: () => Promise<void>;
}

export const useMessages = (): UseMessagesResult => {
  const [messages, setMessages] = useState<(TextMessage | AudioMessage | ImageMessage)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize database and load messages
  useEffect(() => {
    const initializeAndLoadMessages = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('🔄 useMessages: Initializing IndexedDB and loading messages...');
        await indexedDBService.initialize();
        
        console.log('📊 useMessages: Calling getAllMessages...');
        const loadedMessages = await indexedDBService.getAllMessages();
        
        console.log(`📋 useMessages: Loaded ${loadedMessages.length} messages:`, loadedMessages.map(m => ({
          id: m.id,
          type: m.type,
          hasContent: !!m.content,
          timestamp: new Date(m.timestamp).toLocaleString()
        })));
        
        setMessages(loadedMessages);
      } catch (err) {
        console.error('❌ useMessages: Failed to load messages:', err);
        setError(err instanceof Error ? err.message : 'Failed to load messages');
      } finally {
        setLoading(false);
      }
    };

    initializeAndLoadMessages();
  }, []);

  const addTextMessage = useCallback(async (content: string): Promise<TextMessage> => {
    try {
      const newMessage = await indexedDBService.addTextMessage({
        content,
        timestamp: Date.now(),
        processed: false,
        type: 'text'
      });
      
      setMessages(prev => [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp));
      return newMessage;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add text message');
      throw err;
    }
  }, []);

  const addAudioMessage = useCallback(async (audioBlob: Blob, duration: number): Promise<AudioMessage> => {
    try {
      console.log('🎤 useMessages: Adding audio message...', {
        audioBlobSize: audioBlob.size,
        audioBlobType: audioBlob.type,
        duration: duration
      });
      
      const newMessage = await indexedDBService.addAudioMessage({
        audioBlob,
        duration,
        timestamp: Date.now(),
        processed: false,
        type: 'audio',
        content: `Audio message (${Math.round(duration / 1000)}s)`
      });
      
      console.log('✅ useMessages: Audio message added to IndexedDB:', {
        id: newMessage.id,
        type: newMessage.type,
        hasAudioBlob: !!newMessage.audioBlob,
        audioBlobSize: newMessage.audioBlob?.size || 0
      });
      
      setMessages(prev => {
        const updated = [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp);
        console.log(`📋 useMessages: Updated messages state (${updated.length} total):`, updated.map(m => ({
          id: m.id,
          type: m.type
        })));
        return updated;
      });
      
      return newMessage;
    } catch (err) {
      console.error('❌ useMessages: Failed to add audio message:', err);
      setError(err instanceof Error ? err.message : 'Failed to add audio message');
      throw err;
    }
  }, []);

  const addImageMessage = useCallback(async (imageBlob: Blob, fileName: string, description?: string): Promise<ImageMessage> => {
    try {
      console.log('🖼️ useMessages: Adding image message...', {
        imageBlobSize: imageBlob.size,
        imageBlobType: imageBlob.type,
        fileName: fileName,
        hasDescription: !!description
      });
      
      const newMessage = await indexedDBService.addImageMessage({
        imageBlob,
        fileName,
        fileSize: imageBlob.size,
        mimeType: imageBlob.type,
        description,
        timestamp: Date.now(),
        processed: false,
        type: 'image',
        content: description || `Image: ${fileName}`
      });
      
      console.log('✅ useMessages: Image message added to IndexedDB:', {
        id: newMessage.id,
        type: newMessage.type,
        fileName: newMessage.fileName,
        fileSize: newMessage.fileSize,
        hasDescription: !!newMessage.description
      });
      
      setMessages(prev => {
        const updated = [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp);
        console.log(`📋 useMessages: Updated messages state (${updated.length} total):`, updated.map(m => ({
          id: m.id,
          type: m.type
        })));
        return updated;
      });
      
      return newMessage;
    } catch (err) {
      console.error('❌ useMessages: Failed to add image message:', err);
      setError(err instanceof Error ? err.message : 'Failed to add image message');
      throw err;
    }
  }, []);

  const deleteMessage = useCallback(async (id: string) => {
    try {
      console.log(`🗑️ useMessages: Attempting to delete message: ${id}`);
      
      // Delete from IndexedDB first
      const deleted = await indexedDBService.deleteMessage(id);
      
      if (deleted) {
        console.log(`✅ useMessages: Message ${id} deleted from database, updating local state`);
        // Remove from local state only if successfully deleted from database
        setMessages(prev => prev.filter(msg => msg.id !== id));
      } else {
        console.warn(`⚠️ useMessages: Message ${id} not found in database, removing from local state anyway`);
        // Still remove from local state even if not found in database (cleanup)
        setMessages(prev => prev.filter(msg => msg.id !== id));
      }
    } catch (err) {
      console.error(`❌ useMessages: Failed to delete message ${id}:`, err);
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
    addImageMessage,
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
