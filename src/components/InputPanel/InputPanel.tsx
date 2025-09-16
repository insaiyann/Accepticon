import React, { useState } from 'react';
import { Icon } from '../common/Icon';
import { ThreadTree } from '../ThreadTree/ThreadTree';
import { ChatOverlay } from '../ChatOverlay/ChatOverlay';
import { useMessages } from '../../hooks/useMessages';
import { useThreads } from '../../hooks/useThreads';
import { useProcessingPipelineContext } from '../../hooks/useProcessingPipelineContext';
import type { Thread, ThreadMessage } from '../../types/Thread';
import type { AudioMessage } from '../../types/Message';

export const InputPanel: React.FC = () => {
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [isChatOverlayOpen, setIsChatOverlayOpen] = useState(false);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  
  const { 
    messages, 
    error: messagesError,
    addTextMessage,
    addAudioMessage
  } = useMessages();

  const {
    threads,
    loading: threadsLoading,
    error: threadsError,
    createThread,
    deleteThread,
    updateThread,
    toggleCollapsed
  } = useThreads();

  // Thread interaction handlers
  const handleThreadClick = async (thread: Thread) => {
    setSelectedThread(thread);
    // Load thread messages (for now we'll use empty array, can be extended later)
    setThreadMessages([]);
    setIsChatOverlayOpen(true);
  };

  const handleCreateThread = async (parentId?: string) => {
    try {
      const title = `New Thread ${new Date().toLocaleString()}`;
      await createThread({ title, parentId });
    } catch (error) {
      console.error('Failed to create thread:', error);
    }
  };

  const handleRenameThread = async (threadId: string, newTitle: string) => {
    try {
      await updateThread(threadId, { title: newTitle });
    } catch (error) {
      console.error('Failed to rename thread:', error);
    }
  };

  const handleSendMessage = async (
    content: string,
    type: 'text' | 'audio' | 'image',
    options?: { data?: File | Blob; duration?: number }
  ) => {
    if (!selectedThread) return;
    
    try {
      console.log('📤 InputPanel: Sending message:', { content, type, options });
      
      if (type === 'text') {
        await addTextMessage(content);
        console.log('✅ InputPanel: Text message saved to IndexedDB');
      } else if (type === 'audio' && options?.data instanceof Blob) {
        const durationInSeconds = options.duration || 0;
        
        console.log('🎤 InputPanel: Audio duration received:', {
          duration: durationInSeconds,
          blobSize: options.data.size
        });
        
        await addAudioMessage(options.data, durationInSeconds);
        console.log('✅ InputPanel: Audio message saved to IndexedDB');
      } else {
        console.warn('⚠️ InputPanel: Unsupported message type or missing data:', { type, options });
        return;
      }
      
      // Create a temporary thread message for UI display
      const newMessage: ThreadMessage = {
        id: Date.now().toString(),
        threadId: selectedThread.id,
        orderInThread: threadMessages.length,
        sender: 'user',
        type,
        content,
        timestamp: Date.now(),
        processed: false,
        data: options?.data,
        duration: options?.duration,
      };
      
      setThreadMessages(prev => [...prev, newMessage]);
      console.log('✅ InputPanel: Message added to thread UI');
    } catch (error) {
      console.error('❌ InputPanel: Failed to send message:', error);
    }
  };

  const handleCloseChatOverlay = () => {
    setIsChatOverlayOpen(false);
    setSelectedThread(null);
  };

  const {
    isProcessing: pipelineProcessing,
    progress,
    error: pipelineError,
    isInitialized,
    generateDiagram,
    clearError
  } = useProcessingPipelineContext();

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
        <h2>Thread Messages</h2>
        <p>Organize your conversations in threads</p>
      </div>
      
      <div className="input-panel-content">
        {/* Error display */}
        {(messagesError || threadsError || pipelineError) && (
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
            <span>{messagesError || threadsError || pipelineError}</span>
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

        {/* Thread Tree */}
        <div className="threads-container">
          {threadsLoading ? (
            <div className="loading">Loading threads...</div>
          ) : threadsError ? (
            <div className="error">Error loading threads: {threadsError}</div>
          ) : (
            <ThreadTree
              threads={threads}
              onThreadClick={handleThreadClick}
              onCreateThread={handleCreateThread}
              onDeleteThread={deleteThread}
              onToggleCollapse={toggleCollapsed}
              onRenameThread={handleRenameThread}
              selectedThreadId={selectedThread?.id}
            />
          )}
        </div>
        
        {/* Generate diagram section */}
        <div className="generate-section">
          <button 
            className="btn btn-primary generate-button"
            onClick={handleGenerateDiagram}
            disabled={!canGenerate}
          >
            <Icon name="diagram" size={16} className="icon" />
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

      {/* Chat Overlay */}
      <ChatOverlay
        isOpen={isChatOverlayOpen}
        onClose={handleCloseChatOverlay}
        thread={selectedThread}
        messages={messages}
        onSendMessage={handleSendMessage}
        isProcessing={pipelineProcessing}
      />
    </div>
  );
};

export default InputPanel;
