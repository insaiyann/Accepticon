import React, { useState } from 'react';
import MessageComponent from '../common/MessageComponent';
import { useMessages, useAudioRecorder } from '../../hooks/useMessages';
import { useProcessingPipelineContext } from '../../hooks/useProcessingPipelineContext';
import type { AudioMessage } from '../../types/Message';

const formatDuration = (duration: number): string => {
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export const InputPanel: React.FC = () => {
  const [textInput, setTextInput] = useState('');
  
  const { 
    messages, 
    loading: messagesLoading, 
    error: messagesError,
    addTextMessage, 
    addAudioMessage, 
    deleteMessage 
  } = useMessages();
  
  const {
    recordingState,
    isSupported: audioSupported,
    startRecording,
    stopRecording,
    cancelRecording
  } = useAudioRecorder();

  const {
    isProcessing: pipelineProcessing,
    progress,
    error: pipelineError,
    isInitialized,
    generateDiagram,
    clearError
  } = useProcessingPipelineContext();

  const handleSendText = async () => {
    if (!textInput.trim()) return;
    
    try {
      await addTextMessage(textInput.trim());
      setTextInput('');
    } catch (error) {
      console.error('Failed to send text message:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const handleStartRecording = async () => {
    if (!audioSupported) {
      alert('Audio recording is not supported in this browser');
      return;
    }

    try {
      await startRecording();
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Failed to start recording. Please check your microphone permissions.');
    }
  };

  const handleStopRecording = async () => {
    try {
      const audioBlob = await stopRecording();
      if (audioBlob) {
        await addAudioMessage(audioBlob, recordingState.duration);
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  const handleCancelRecording = () => {
    cancelRecording();
  };

  const handleGenerateDiagram = async () => {
    if (messages.length === 0) {
      alert('Please add some messages before generating a diagram');
      return;
    }

    if (!isInitialized) {
      alert('Processing pipeline not initialized. Please check your Azure credentials.');
      return;
    }
    
    try {
      console.log('🎨 InputPanel: Starting diagram generation...');
      console.log(`📋 InputPanel: Current messages (${messages.length}):`, messages.map(m => ({
        id: m.id,
        type: m.type,
        hasContent: !!m.content,
        hasAudioBlob: !!(m.type === 'audio' && (m as AudioMessage).audioBlob),
        audioBlobSize: (m.type === 'audio' && (m as AudioMessage).audioBlob?.size) || 0,
        hasTranscription: !!(m.type === 'audio' && (m as AudioMessage).transcription)
      })));
      
      const messageIds = messages.map(msg => msg.id);
      console.log('🔗 InputPanel: Message IDs to process:', messageIds);
      
      const diagram = await generateDiagram(messageIds);
      
      if (diagram) {
        console.log('✅ InputPanel: Diagram generated successfully:', diagram);
      } else {
        console.warn('⚠️ InputPanel: No diagram returned');
      }
    } catch (error) {
      console.error('❌ InputPanel: Failed to generate diagram:', error);
    }
  };

  const hasMessages = messages.length > 0;
  const canGenerate = hasMessages && !pipelineProcessing && isInitialized;

  return (
    <div className="input-panel">
      <div className="input-panel-header">
        <h2>Input Messages</h2>
        <p>Add text or voice messages</p>
      </div>
      
      <div className="input-panel-content">
        {/* Recording indicator */}
        {recordingState.isRecording && (
          <div className="recording-indicator">
            <div className="recording-dot"></div>
            <span className="recording-time">
              Recording: {formatDuration(recordingState.duration)}
            </span>
            <button 
              className="btn btn-secondary" 
              onClick={handleStopRecording}
            >
              Stop
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={handleCancelRecording}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Error display */}
        {(messagesError || recordingState.error || pipelineError) && (
          <div style={{ 
            padding: '0.5rem 1rem', 
            backgroundColor: '#f8d7da', 
            color: '#721c24',
            borderRadius: '4px',
            margin: '0 1rem 1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>{messagesError || recordingState.error || pipelineError}</span>
            {pipelineError && (
              <button 
                onClick={clearError}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: '#721c24',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  fontWeight: 'bold'
                }}
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* Processing status */}
        {pipelineProcessing && (
          <div style={{ 
            padding: '0.5rem 1rem', 
            backgroundColor: '#d1ecf1', 
            color: '#0c5460',
            borderRadius: '4px',
            margin: '0 1rem 1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ 
                width: '12px', 
                height: '12px', 
                border: '2px solid #0c5460',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
              <span>{progress || 'Processing...'}</span>
            </div>
          </div>
        )}

        {/* Messages container */}
        <div className="messages-container">
          {messagesLoading ? (
            <div className="loading">Loading messages...</div>
          ) : hasMessages ? (
            messages.map(message => (
              <MessageComponent
                key={message.id}
                message={message}
                onDelete={deleteMessage}
              />
            ))
          ) : (
            <div className="messages-empty">
              <div className="messages-empty-icon">💬</div>
              <p>No messages yet</p>
              <p style={{ fontSize: '0.9rem' }}>
                Start by typing a message or recording audio
              </p>
            </div>
          )}
        </div>
        
        {/* Input controls */}
        <div className="input-area">
          <input 
            type="text" 
            placeholder="Type your message here..."
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={recordingState.isRecording}
          />
          <button 
            className="btn btn-primary"
            onClick={handleSendText}
            disabled={!textInput.trim() || recordingState.isRecording}
          >
            Send
          </button>
          <button 
            className="btn btn-secondary btn-icon"
            onClick={recordingState.isRecording ? handleStopRecording : handleStartRecording}
            disabled={!audioSupported}
            title={audioSupported ? 'Record audio message' : 'Audio recording not supported'}
          >
            <span>{recordingState.isRecording ? '⏹️' : '🎤'}</span>
            <span>{recordingState.isRecording ? 'Stop' : 'Record'}</span>
          </button>
        </div>
        
        {/* Generate diagram section */}
        <div className="generate-section">
          <button 
            className="btn btn-primary generate-button"
            onClick={handleGenerateDiagram}
            disabled={!canGenerate}
          >
            {pipelineProcessing ? 'Generating...' : 'Generate Mermaid Diagram'}
          </button>
          <p className="generate-info">
            {!isInitialized 
              ? 'Initializing Azure services...'
              : !hasMessages 
              ? 'Add messages to enable diagram generation'
              : `Ready to generate diagram from ${messages.length} message${messages.length === 1 ? '' : 's'}`
            }
          </p>
        </div>
      </div>
    </div>
  );
};

export default InputPanel;
