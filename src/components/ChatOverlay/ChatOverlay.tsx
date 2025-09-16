import React, { useState, useRef, useEffect } from 'react';
import type { Thread, ThreadMessage } from '../../types/Thread';
import type { TextMessage, AudioMessage } from '../../types/Message';
import { Icon } from '../common/Icon';
import './ChatOverlay.css';

interface BlobWithDuration extends Blob {
  estimatedDuration?: number;
}

interface AudioMessageProps {
  audioData: Blob | undefined;
  estimatedDuration?: number; // Add estimated duration prop
}

const AudioMessage: React.FC<AudioMessageProps> = ({ audioData, estimatedDuration }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<string>('0:00');
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    // If we have an estimated duration, use it as fallback
    if (estimatedDuration) {
      const minutes = Math.floor(estimatedDuration / 60);
      const seconds = Math.floor(estimatedDuration % 60);
      setDuration(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }

    if (audioData && audioRef.current) {
      const audio = audioRef.current;
      const audioUrl = URL.createObjectURL(audioData);
      audio.src = audioUrl;

      const handleLoadedMetadata = () => {
        console.log('Audio metadata loaded, duration:', audio.duration);
        if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
          const durationInSeconds = Math.floor(audio.duration);
          const minutes = Math.floor(durationInSeconds / 60);
          const seconds = durationInSeconds % 60;
          setDuration(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        }
      };

      const handleCanPlayThrough = () => {
        console.log('Audio can play through, duration:', audio.duration);
        if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
          const durationInSeconds = Math.floor(audio.duration);
          const minutes = Math.floor(durationInSeconds / 60);
          const seconds = durationInSeconds % 60;
          setDuration(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        }
      };

      const handleTimeUpdate = () => {
        // Could be used for progress tracking if needed
      };

      const handleEnded = () => {
        setIsPlaying(false);
      };

      const handleLoadedData = () => {
        console.log('Audio data loaded, duration:', audio.duration);
        if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
          const durationInSeconds = Math.floor(audio.duration);
          const minutes = Math.floor(durationInSeconds / 60);
          const seconds = durationInSeconds % 60;
          setDuration(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        }
      };

      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('loadeddata', handleLoadedData);
      audio.addEventListener('canplaythrough', handleCanPlayThrough);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);

      // Force load the audio
      audio.load();

      return () => {
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('loadeddata', handleLoadedData);
        audio.removeEventListener('canplaythrough', handleCanPlayThrough);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('ended', handleEnded);
        URL.revokeObjectURL(audioUrl);
      };
    }
  }, [audioData, estimatedDuration]);

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
        <span className="audio-duration">{duration}</span>
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
      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  );
};

export interface ChatOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  thread: Thread | null;
  messages: ThreadMessage[] | (TextMessage | AudioMessage)[]; // Accept both types
  onSendMessage: (content: string, type: 'text' | 'audio' | 'image', data?: File | Blob) => void;
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

  // Helper function to normalize messages for display
  const normalizeMessage = (message: ThreadMessage | TextMessage | AudioMessage) => {
    if ('sender' in message) {
      // It's a ThreadMessage
      return {
        id: message.id,
        type: message.type,
        content: message.content,
        timestamp: message.timestamp,
        sender: message.sender,
        data: message.data,
        audioBlob: message.type === 'audio' ? message.data : undefined
      };
    } else {
      // It's a TextMessage or AudioMessage
      return {
        id: message.id,
        type: message.type,
        content: message.content,
        timestamp: message.timestamp,
        sender: 'user' as const, // Default to user for persisted messages
        data: message.type === 'audio' ? (message as AudioMessage).audioBlob : undefined,
        audioBlob: message.type === 'audio' ? (message as AudioMessage).audioBlob : undefined
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
        
        // Add the duration as a property to the blob for later retrieval
        Object.defineProperty(audioBlob, 'estimatedDuration', {
          value: recordingDuration,
          writable: false,
          enumerable: false,
          configurable: false
        });
        
        onSendMessage('Audio message', 'audio', audioBlob);
        
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
        onSendMessage(file.name, 'image', file);
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
        onSendMessage(file.name, 'image', file);
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
          <button 
            className="chat-overlay-close"
            onClick={onClose}
            aria-label="Close chat"
          >
            <Icon name="x" size={20} />
          </button>
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
                        estimatedDuration={normalizedMessage.audioBlob && 'estimatedDuration' in normalizedMessage.audioBlob ? (normalizedMessage.audioBlob as BlobWithDuration).estimatedDuration : undefined}
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
