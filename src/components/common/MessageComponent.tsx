import React from 'react';
import type { TextMessage, AudioMessage, ImageMessage } from '../../types/Message';
import { Icon } from './Icon';
import { AudioDownloadService } from '../../services/download/AudioDownloadService';
import './MessageComponent.css';

interface MessageProps {
  message: TextMessage | AudioMessage | ImageMessage;
  onDelete?: (id: string) => void;
}

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDuration = (duration: number): string => {
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getMessageTypeIcon = (type: string) => {
  switch (type) {
    case 'text': return { icon: 'message-circle', emoji: '📝' };
    case 'audio': return { icon: 'mic', emoji: '🎤' };
    case 'image': return { icon: 'image', emoji: '🖼️' };
    default: return { icon: 'message-circle', emoji: '💬' };
  }
};

export const MessageComponent: React.FC<MessageProps> = ({ message, onDelete }) => {
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement>(null);
  
  const messageTypeInfo = getMessageTypeIcon(message.type);

  // Create URLs for blobs
  React.useEffect(() => {
    if (message.type === 'audio' && message.audioBlob) {
      const url = URL.createObjectURL(message.audioBlob);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    
    if (message.type === 'image' && message.imageBlob) {
      const url = URL.createObjectURL(message.imageBlob);
      setImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [message]);

  const handleDelete = () => {
    if (onDelete) {
      onDelete(message.id);
    }
  };

  const handleAudioPlay = () => {
    if (audioRef.current) {
      audioRef.current.play();
    }
  };

  const handleAudioDownload = async () => {
    if (message.type === 'audio') {
      try {
        await AudioDownloadService.downloadAudioMessage(message as AudioMessage);
      } catch (error) {
        console.error('Failed to download audio:', error);
        // TODO: Add user-friendly error notification
      }
    }
  };

  const renderTextMessage = (msg: TextMessage) => (
    <div className="message-body">
      <div className="message-content-text">
        <p>{msg.content}</p>
      </div>
      {msg.transcription && (
        <div className="message-metadata">
          <Icon name="text" size={12} />
          <span>Transcription: {msg.transcription}</span>
        </div>
      )}
    </div>
  );

  const renderAudioMessage = (msg: AudioMessage) => (
    <div className="message-body">
      <div className="message-content-audio">
        <div className="audio-controls">
          {audioUrl ? (
            <>
              <button 
                className="audio-play-button" 
                onClick={handleAudioPlay}
                aria-label="Play audio"
              >
                <Icon name="play" size={16} />
              </button>
              <audio ref={audioRef} src={audioUrl} preload="metadata" />
              <div className="audio-waveform"></div>
              <span className="audio-duration">
                {formatDuration(msg.duration)}
              </span>
              <button 
                className="audio-download-button" 
                onClick={handleAudioDownload}
                aria-label="Download audio"
                title="Download audio as WAV"
              >
                <Icon name="download" size={16} />
              </button>
            </>
          ) : (
            <div className="audio-loading">
              <Icon name="refresh" size={16} />
              <span>Loading audio...</span>
            </div>
          )}
        </div>
        
        {msg.transcription && msg.transcription.trim().length > 0 && (
          <div className="message-metadata transcription">
            <Icon name="text" size={12} />
            <span className="transcription-label">Transcription:</span>
            <span className="transcription-content">"{msg.transcription}"</span>
          </div>
        )}
        
        {(!msg.transcription || msg.transcription.trim().length === 0) && msg.processed && (
          <div className="message-metadata muted">
            <Icon name="warning" size={12} />
            <span>Transcription pending or no speech detected</span>
          </div>
        )}
      </div>
    </div>
  );

  const renderImageMessage = (msg: ImageMessage) => (
    <div className="message-body">
      <div className="message-content-image">
        {imageUrl && (
          <div className="image-preview">
            <img 
              src={imageUrl} 
              alt={msg.fileName} 
              className="message-image"
            />
          </div>
        )}
        <div className="image-info">
          <div className="image-filename">
            <Icon name="image" size={14} />
            <span>{msg.fileName}</span>
          </div>
          <div className="image-metadata">
            <span className="file-size">{formatFileSize(msg.fileSize)}</span>
            <span className="file-type">{msg.mimeType.split('/')[1].toUpperCase()}</span>
          </div>
        </div>
        {msg.description && (
          <div className="message-metadata">
            <Icon name="message-circle" size={12} />
            <span>{msg.description}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={`enhanced-message enhanced-message-${message.type}`}>
      <div className="message-header">
        <div className="message-type-indicator">
          <span className="message-type-emoji">{messageTypeInfo.emoji}</span>
          <span className="message-type-label">{message.type}</span>
        </div>
        <div className="message-timestamp">
          {formatTime(message.timestamp)}
        </div>
        {onDelete && (
          <button 
            className="message-delete" 
            onClick={handleDelete}
            aria-label="Delete message"
          >
            <Icon name="delete" size={14} />
          </button>
        )}
      </div>

      {message.type === 'text' && renderTextMessage(message as TextMessage)}
      {message.type === 'audio' && renderAudioMessage(message as AudioMessage)}
      {message.type === 'image' && renderImageMessage(message as ImageMessage)}

      <div className="message-footer">
        <div className="message-status">
          {message.processed ? (
            <>
              <Icon name="check" size={12} />
              <span className="status-processed">Processed</span>
            </>
          ) : (
            <>
              <Icon name="refresh" size={12} />
              <span className="status-pending">Processing...</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageComponent;
