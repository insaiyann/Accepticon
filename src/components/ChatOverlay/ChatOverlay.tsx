import React, { useState, useRef, useEffect } from 'react';
import type { Thread, ThreadMessage } from '../../types/Thread';
import type { TextMessage, AudioMessage, ImageMessage } from '../../types/Message';
import { Icon } from '../common/Icon';
import { AudioDownloadService } from '../../services/download/AudioDownloadService';
import './ChatOverlay.css';

interface AudioMessageProps {
  audioData: Blob | undefined;
  duration: number;
  transcription?: string;
  transcriptionStatus?: string;
  transcriptionError?: string;
  transcriptionConfidence?: number;
  messageId?: string; // Add message ID for download
}

const AudioMessage: React.FC<AudioMessageProps> = ({ 
  audioData, 
  duration, 
  transcription, 
  transcriptionStatus,
  transcriptionError,
  transcriptionConfidence,
  messageId
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioData && audioRef.current) {
      const audio = audioRef.current;
      const audioUrl = URL.createObjectURL(audioData);
      audio.src = audioUrl;

      const handleEnded = () => {
        setIsPlaying(false);
      };

      audio.addEventListener('ended', handleEnded);

      return () => {
        audio.removeEventListener('ended', handleEnded);
        URL.revokeObjectURL(audioUrl);
      };
    }
  }, [audioData]);

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const handleDownload = async () => {
    if (audioData && messageId) {
      try {
        // Create a temporary AudioMessage object for download
        const audioMessage: AudioMessage = {
          id: messageId,
          type: 'audio',
          audioBlob: audioData,
          duration: duration * 1000, // Convert to milliseconds
          timestamp: Date.now(),
          processed: true,
          content: `Audio message (${Math.round(duration)}s)`,
          transcriptionStatus: 'recognized',
          transcription: transcription || '',
          audioFormat: audioData.type
        };
        
        await AudioDownloadService.downloadAudioMessage(audioMessage);
      } catch (error) {
        console.error('Failed to download audio:', error);
        // TODO: Add user-friendly error notification
      }
    }
  };

  const formatDuration = (d: number) => {
    const minutes = Math.floor(d / 60);
    const seconds = Math.floor(d % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getTranscriptionStatusIcon = (status?: string) => {
    switch (status) {
      case 'recognized': return '✅';
      case 'processing': return '🔄';
      case 'no_match': return '❌';
      case 'recognition_error':
      case 'conversion_error':
      case 'timeout': return '⚠️';
      default: return '⏳';
    }
  };

  const getTranscriptionStatusText = (status?: string) => {
    switch (status) {
      case 'recognized': return 'Transcribed';
      case 'processing': return 'Processing...';
      case 'no_match': return 'No speech detected';
      case 'recognition_error': return 'Recognition failed';
      case 'conversion_error': return 'Audio format error';
      case 'timeout': return 'Recognition timeout';
      case 'pending': return 'Pending transcription';
      default: return 'Unknown status';
    }
  };

  if (!audioData) {
    return (
      <div className="message-audio">
        <Icon name="mic" size={16} />
        <span>Audio message (no data)</span>
      </div>
    );
  }

  return (
    <div className="message-audio">
      <div className="message-audio-header">
        <Icon name="mic" size={16} />
        <span>Audio Message</span>
        <span className="audio-duration">{formatDuration(duration)}</span>
        {audioData && messageId && (
          <button 
            className="audio-download-button"
            onClick={handleDownload}
            aria-label="Download audio"
            title="Download audio as WAV"
          >
            <Icon name="download" size={14} />
          </button>
        )}
      </div>
      <div className="message-audio-controls">
        <button 
          className="audio-play-button"
          onClick={handlePlayPause}
          aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={20} />
        </button>
        <div className="audio-waveform">
          <div className="waveform-bars">
            {Array.from({ length: 12 }).map((_, i) => (
              <div 
                key={i} 
                className="waveform-bar" 
                style={{ height: `${Math.random() * 100}%` }}
              />
            ))}
          </div>
        </div>
      </div>
      
      {/* Transcription section with enhanced status display */}
      <div className="message-audio-transcription-section">
        <div className="transcription-status">
          <span className="status-icon">{getTranscriptionStatusIcon(transcriptionStatus)}</span>
          <span className="status-text">{getTranscriptionStatusText(transcriptionStatus)}</span>
          {transcriptionConfidence && transcriptionStatus === 'recognized' && (
            <span className="confidence-score">
              ({Math.round(transcriptionConfidence * 100)}%)
            </span>
          )}
        </div>
        
        {transcription && transcription.trim().length > 0 && transcriptionStatus === 'recognized' && (
          <div className="message-audio-transcription">
            <Icon name="text" size={14} />
            <span className="transcription-text">"{transcription}"</span>
          </div>
        )}
        
        {transcriptionError && (transcriptionStatus === 'recognition_error' || transcriptionStatus === 'conversion_error') && (
          <div className="transcription-error">
            <Icon name="error" size={14} />
            <span className="error-text">{transcriptionError}</span>
          </div>
        )}
        
        {transcriptionStatus === 'no_match' && (
          <div className="transcription-hint">
            <Icon name="info" size={14} />
            <span className="hint-text">Try recording again with clearer speech</span>
          </div>
        )}
      </div>
      
      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  );
};

export interface ChatOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  thread: Thread | null;
  messages: ThreadMessage[] | (TextMessage | AudioMessage | ImageMessage)[]; // Accept all message types
  onSendMessage: (
    content: string,
    type: 'text' | 'audio' | 'image',
    options?: { 
      data?: File | Blob; 
      duration?: number;
      fileName?: string;
      fileSize?: number;
      mimeType?: string;
    }
  ) => void;
  isProcessing?: boolean;
}

export const ChatOverlay: React.FC<ChatOverlayProps> = ({
  isOpen,
  onClose,
  thread,
  messages,
  onSendMessage,
  isProcessing = false
}) => {
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Helper function to get audio messages for bulk download
  const getAudioMessages = (): AudioMessage[] => {
    return messages
      .map(normalizeMessage)
      .filter(msg => msg.type === 'audio' && msg.audioBlob)
      .map(msg => ({
        id: msg.id,
        type: 'audio' as const,
        audioBlob: msg.audioBlob!,
        duration: (msg.duration || 0) * 1000, // Convert to milliseconds
        timestamp: msg.timestamp,
        processed: true,
        content: `Audio message (${Math.round((msg.duration || 0))}s)`,
        transcriptionStatus: 'recognized' as const,
        transcription: msg.transcription || '',
        audioFormat: msg.audioBlob?.type || 'audio/wav'
      }));
  };

  const handleBulkDownload = async () => {
    const audioMessages = getAudioMessages();
    if (audioMessages.length === 0) {
      console.warn('No audio messages to download');
      return;
    }

    try {
      await AudioDownloadService.downloadMultipleAudioMessages(audioMessages);
    } catch (error) {
      console.error('Failed to download audio messages:', error);
      // TODO: Add user-friendly error notification
    }
  };

  // Helper function to normalize messages for display
  const normalizeMessage = (message: ThreadMessage | TextMessage | AudioMessage | ImageMessage) => {
    if ('sender' in message) {
      // It's a ThreadMessage
      return {
        id: message.id,
        type: message.type,
        content: message.content,
        timestamp: message.timestamp,
        sender: message.sender,
        data: message.data,
        audioBlob: message.type === 'audio' ? message.data : undefined,
        duration: message.duration,
        transcription: message.type === 'audio' ? (message as ThreadMessage & { transcription?: string }).transcription : undefined,
        transcriptionStatus: message.type === 'audio' ? (message as ThreadMessage & { transcriptionStatus?: string }).transcriptionStatus : undefined,
        transcriptionError: message.type === 'audio' ? (message as ThreadMessage & { transcriptionError?: string }).transcriptionError : undefined,
        transcriptionConfidence: message.type === 'audio' ? (message as ThreadMessage & { transcriptionConfidence?: number }).transcriptionConfidence : undefined,
        imageBlob: message.type === 'image' ? message.data : undefined,
        fileName: message.type === 'image' ? (message as ThreadMessage & { fileName?: string }).fileName : undefined,
      };
    } else {
      // It's a TextMessage, AudioMessage, or ImageMessage
      return {
        id: message.id,
        type: message.type,
        content: message.content,
        timestamp: message.timestamp,
        sender: 'user' as const, // Default to user for persisted messages
        data: message.type === 'audio' ? (message as AudioMessage).audioBlob 
              : message.type === 'image' ? (message as ImageMessage).imageBlob 
              : undefined,
        audioBlob: message.type === 'audio' ? (message as AudioMessage).audioBlob : undefined,
        duration: message.type === 'audio' ? (message as AudioMessage).duration : undefined,
        transcription: message.type === 'audio' ? (message as AudioMessage).transcription : undefined,
        transcriptionStatus: message.type === 'audio' ? (message as AudioMessage).transcriptionStatus : undefined,
        transcriptionError: message.type === 'audio' ? (message as AudioMessage).transcriptionError : undefined,
        transcriptionConfidence: message.type === 'audio' ? (message as AudioMessage).transcriptionConfidence : undefined,
        imageBlob: message.type === 'image' ? (message as ImageMessage).imageBlob : undefined,
        fileName: message.type === 'image' ? (message as ImageMessage).fileName : undefined,
      };
    }
  };

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      // Debug: Ensure backdrop is rendered correctly
      console.log('Chat overlay opened');
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setRecordingStartTime(null);
    }
  };

  const handleSendText = () => {
    if (inputText.trim() && !isProcessing) {
      onSendMessage(inputText.trim(), 'text');
      setInputText('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      const startTime = Date.now();
      setRecordingStartTime(startTime);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const recordingDuration = recordingStartTime ? (Date.now() - recordingStartTime) / 1000 : 0;
        
        onSendMessage('Audio message', 'audio', {
          data: audioBlob,
          duration: recordingDuration,
        });
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        onSendMessage(file.name, 'image', { data: file });
      }
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragIn = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDragActive(true);
    }
  };

  const handleDragOut = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        onSendMessage(file.name, 'image', { data: file });
      }
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (!isOpen) return null;

  return (
    <div 
      className="chat-overlay-backdrop" 
      onClick={onClose}
      data-testid="chat-overlay-backdrop"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.6)'
      }}
    >
      <div 
        className={`chat-overlay ${dragActive ? 'drag-active' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        data-testid="chat-overlay"
        style={{
          zIndex: 100000,
          position: 'relative'
        }}
      >
        {/* Header */}
        <div className="chat-overlay-header">
          <div className="chat-overlay-title">
            <Icon name="message-circle" size={20} />
            <h2>{thread?.title || 'New Conversation'}</h2>
            {thread?.metadata?.messageCount && (
              <span className="message-count">
                {thread.metadata.messageCount} messages
              </span>
            )}
          </div>
          <div className="chat-overlay-actions">
            {getAudioMessages().length > 0 && (
              <button 
                className="bulk-download-button"
                onClick={handleBulkDownload}
                title={`Download ${getAudioMessages().length} audio messages`}
                aria-label="Download all audio messages"
              >
                <Icon name="download" size={16} />
                <span>{getAudioMessages().length}</span>
              </button>
            )}
            <button 
              className="chat-overlay-close"
              onClick={onClose}
              aria-label="Close chat"
            >
              <Icon name="x" size={20} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="chat-overlay-messages">
          {messages.length === 0 ? (
            <div className="chat-empty-state">
              <div className="chat-empty-icon">
                <Icon name="message-circle" size={48} />
              </div>
              <h3>Start a conversation</h3>
              <p>Send a message, record audio, or share an image to begin.</p>
            </div>
          ) : (
            messages.map((message) => {
              const normalizedMessage = normalizeMessage(message);
              return (
                <div 
                  key={normalizedMessage.id} 
                  className={`chat-message ${normalizedMessage.sender === 'user' ? 'user' : 'assistant'}`}
                >
                  <div className="chat-message-content">
                    {normalizedMessage.type === 'text' && (
                      <div className="message-text">{normalizedMessage.content}</div>
                    )}
                    {normalizedMessage.type === 'audio' && (
                      <AudioMessage
                        audioData={normalizedMessage.audioBlob}
                        duration={normalizedMessage.duration || 0}
                        transcription={normalizedMessage.transcription}
                        transcriptionStatus={normalizedMessage.transcriptionStatus}
                        transcriptionError={normalizedMessage.transcriptionError}
                        transcriptionConfidence={normalizedMessage.transcriptionConfidence}
                        messageId={normalizedMessage.id}
                      />
                    )}
                    {normalizedMessage.type === 'image' && (
                      <div className="message-image">
                        <Icon name="image" size={16} />
                        <span>{normalizedMessage.content}</span>
                        {normalizedMessage.data && (
                          <img 
                            src={URL.createObjectURL(normalizedMessage.data)} 
                            alt={normalizedMessage.content}
                            className="message-image-preview"
                          />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="chat-message-time">
                    {formatTime(normalizedMessage.timestamp)}
                  </div>
                </div>
              );
            })
          )}
          {isProcessing && (
            <div className="chat-message assistant">
              <div className="chat-message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Drag overlay */}
        {dragActive && (
          <div className="drag-overlay">
            <div className="drag-overlay-content">
              <Icon name="upload" size={48} />
              <p>Drop image here to share</p>
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="chat-overlay-input">
          <div className="input-container">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Type a message..."
              className="text-input"
              rows={1}
              disabled={isProcessing}
            />
            
            <div className="input-actions">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="action-button"
                disabled={isProcessing}
                aria-label="Attach image"
              >
                <Icon name="image" size={20} />
              </button>
              
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`action-button ${isRecording ? 'recording' : ''}`}
                disabled={isProcessing}
                aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              >
                <Icon name="mic" size={20} />
              </button>
              
              <button
                onClick={handleSendText}
                className="send-button"
                disabled={!inputText.trim() || isProcessing}
                aria-label="Send message"
              >
                <Icon name="send" size={20} />
              </button>
            </div>
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
      </div>
    </div>
  );
};
