import React from 'react';
import type { TextMessage, AudioMessage } from '../../types/Message';

interface MessageProps {
  message: TextMessage | AudioMessage;
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

export const MessageComponent: React.FC<MessageProps> = ({ message, onDelete }) => {
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement>(null);

  // Create audio URL for audio messages
  React.useEffect(() => {
    if (message.type === 'audio' && message.audioBlob) {
      const url = URL.createObjectURL(message.audioBlob);
      setAudioUrl(url);
      
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

  if (message.type === 'text') {
    return (
      <div className="message message-text">
        <div className="message-header">
          <span className="message-type">Text</span>
          <span className="message-time">{formatTime(message.timestamp)}</span>
          {onDelete && (
            <button 
              className="message-delete" 
              onClick={handleDelete}
              aria-label="Delete message"
            >
              ×
            </button>
          )}
        </div>
        <div className="message-content">
          <p>{message.content}</p>
          {message.transcription && (
            <div className="message-transcription">
              <small>Transcription: {message.transcription}</small>
            </div>
          )}
        </div>
        <div className="message-status">
          {message.processed ? (
            <span className="status-processed">✓ Processed</span>
          ) : (
            <span className="status-pending">⏳ Pending</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="message message-audio">
      <div className="message-header">
        <span className="message-type">Audio</span>
        <span className="message-time">{formatTime(message.timestamp)}</span>
        {onDelete && (
          <button 
            className="message-delete" 
            onClick={handleDelete}
            aria-label="Delete message"
          >
            ×
          </button>
        )}
      </div>
      <div className="message-content">
        <div className="audio-controls">
          {audioUrl ? (
            <>
              <button 
                className="btn btn-secondary btn-icon" 
                onClick={handleAudioPlay}
                aria-label="Play audio"
              >
                <span>▶️</span>
                <span>Play</span>
              </button>
              <audio ref={audioRef} src={audioUrl} preload="metadata" />
              <span className="audio-duration">
                {formatDuration(message.duration)}
              </span>
            </>
          ) : (
            <span className="audio-loading">Loading audio...</span>
          )}
        </div>
        
        {message.transcription && (
          <div className="message-transcription">
            <p>{message.transcription}</p>
          </div>
        )}
        
        {!message.transcription && message.processed && (
          <div className="message-transcription">
            <small style={{ color: '#666' }}>No transcription available</small>
          </div>
        )}
      </div>
      <div className="message-status">
        {message.processed ? (
          <span className="status-processed">✓ Processed</span>
        ) : (
          <span className="status-pending">⏳ Pending</span>
        )}
      </div>
    </div>
  );
};

export default MessageComponent;
