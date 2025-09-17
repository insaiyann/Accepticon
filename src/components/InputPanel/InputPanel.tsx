import React, { useState } from 'react';
import { Icon } from '../common/Icon';
import { ThreadTree } from '../ThreadTree/ThreadTree';
import { ChatOverlay } from '../ChatOverlay/ChatOverlay';
import { useMessages } from '../../hooks/useMessages';
import { useThreads } from '../../hooks/useThreads';
// Removed old STT hook – using minimal service directly
import { minimalSTTService } from '../../services/MinimalSTTService';
import { indexedDBService } from '../../services/storage/IndexedDBService';
import { useDiagram } from '../../context/DiagramContext';
import type { Thread } from '../../types/Thread';
import type { AudioMessage, TextMessage, ImageMessage } from '../../types/Message';

export const InputPanel: React.FC = () => {
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [isChatOverlayOpen, setIsChatOverlayOpen] = useState(false);
  const [threadMessages, setThreadMessages] = useState<(TextMessage | AudioMessage | ImageMessage)[]>([]);
  
  const { 
    messages, 
    error: messagesError,
    addTextMessage,
    addAudioMessage,
    addImageMessage
  } = useMessages();

  const {
    threads,
    loading: threadsLoading,
    error: threadsError,
    createThread,
    deleteThread,
    updateThread,
    toggleCollapsed,
    moveMessageToThread
  } = useThreads();

  // Thread interaction handlers
  const handleThreadClick = async (thread: Thread) => {
    setSelectedThread(thread);
    
    try {
      console.log(`🧵 InputPanel: Loading messages for thread: ${thread.id} - "${thread.title}"`);
      
      // Load messages specific to this thread
      const threadSpecificMessages = await indexedDBService.getMessagesForThread(thread.id);
      
      console.log(`📋 InputPanel: Loaded ${threadSpecificMessages.length} messages for thread ${thread.id}`);
      
      setThreadMessages(threadSpecificMessages);
      setIsChatOverlayOpen(true);
    } catch (error) {
      console.error('❌ InputPanel: Failed to load thread messages:', error);
      setThreadMessages([]);
      setIsChatOverlayOpen(true);
    }
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
    options?: { 
      data?: File | Blob; 
      duration?: number;
      fileName?: string;
      fileSize?: number;
      mimeType?: string;
    }
  ) => {
    if (!selectedThread) return;
    
    try {
      console.log('📤 InputPanel: Sending message to thread:', { 
        threadId: selectedThread.id, 
        content, 
        type, 
        options 
      });
      
      let newMessage: TextMessage | AudioMessage | ImageMessage;
      
      if (type === 'text') {
        newMessage = await addTextMessage(content);
        console.log('✅ InputPanel: Text message saved to IndexedDB:', newMessage.id);
      } else if (type === 'audio' && options?.data instanceof Blob) {
        const durationInSeconds = options.duration || 0;
        
        console.log('🎤 InputPanel: Audio duration received:', {
          duration: durationInSeconds,
          blobSize: options.data.size
        });
        
        newMessage = await addAudioMessage(options.data, durationInSeconds);
        console.log('✅ InputPanel: Audio message saved to IndexedDB:', newMessage.id);
      } else if (type === 'image' && options?.data instanceof File) {
        console.log('🖼️ InputPanel: Image upload received:', {
          fileName: options.fileName || 'image.png',
          fileSize: options.fileSize || options.data.size,
          mimeType: options.mimeType || options.data.type
        });
        
        newMessage = await addImageMessage(
          options.data,
          options.fileName || 'image.png',
          content // description
        );
        console.log('✅ InputPanel: Image message saved to IndexedDB:', newMessage.id);
      } else {
        console.warn('⚠️ InputPanel: Unsupported message type or missing data:', { type, options });
        return;
      }
      
      // Associate the message with the selected thread
      console.log(`🔗 InputPanel: Associating message ${newMessage.id} with thread ${selectedThread.id}`);
      await moveMessageToThread(newMessage.id, selectedThread.id);
      
      // Update the local thread messages state
      setThreadMessages(prev => [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp));
      
      console.log('✅ InputPanel: Message added to thread and UI updated');
    } catch (error) {
      console.error('❌ InputPanel: Failed to send message:', error);
    }
  };

  const handleCloseChatOverlay = () => {
    setIsChatOverlayOpen(false);
    setSelectedThread(null);
  };

  // Replaced pipeline context with minimal unified service
  const [pipelineInitialized, setPipelineInitialized] = React.useState(false);
  const [pipelineProcessing, setPipelineProcessing] = React.useState(false);
  const [pipelineError, setPipelineError] = React.useState<string | null>(null);
  const [currentStep, setCurrentStep] = React.useState<string>('Ready');
  const clearError = () => setPipelineError(null);

  React.useEffect(()=>{ (async()=>{ const r = await minimalSTTService.initializeAll(); setPipelineInitialized(r.stt && r.openai); if(!(r.stt && r.openai)) setPipelineError('Failed to initialize Azure services'); })(); },[]);

  // Minimal STT state (very lightweight)
  const [sttInitialized, setSttInitialized] = React.useState(false);
  const [sttProcessing, setSttProcessing] = React.useState(false);
  const [sttError, setSttError] = React.useState<string | null>(null);
  const [sttResult, setSttResult] = React.useState<{successful:number; failed:number; errors:string[]}|null>(null);
  // No granular progress variables in minimal version

  React.useEffect(() => {
    (async () => {
      const ok = await minimalSTTService.autoInitialize();
      setSttInitialized(ok);
      if (!ok) setSttError('Failed to initialize Speech Service');
    })();
  }, []);

  const clearSTTError = () => setSttError(null);

  const processAudioMessages = async (): Promise<boolean> => {
    if (!sttInitialized) {
      setSttError('STT not initialized');
      return false;
    }
    try {
      setSttProcessing(true);
      setSttError(null);
      setSttResult(null);
      const res = await minimalSTTService.transcribeAllAudioMessages();
      setSttResult({ successful: res.recognized, failed: res.failed, errors: [] });
      setSttProcessing(false);
      return res.success;
    } catch (e) {
      setSttProcessing(false);
      setSttError(e instanceof Error ? e.message : 'Unknown STT error');
      return false;
    }
  };

  const { setDiagram } = useDiagram();

  const handleGenerateDiagram = async () => {
    if (messages.length === 0) {
      alert('Please add some messages before generating a diagram');
      return;
    }

  if (!pipelineInitialized) {
      alert('Processing pipeline not initialized. Please check your Azure credentials.');
      return;
    }

    if (!sttInitialized) {
      alert('STT pipeline not initialized. Please check your Azure Speech Service credentials.');
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

      // Step 1: Process audio messages with the new STT pipeline
      console.log('🎤 InputPanel: Processing audio messages with new STT pipeline...');
      const sttSuccess = await processAudioMessages();
      
      if (!sttSuccess) {
        console.error('❌ InputPanel: STT processing failed');
        alert('Failed to process audio messages. Please check the console for details.');
        return;
      }

      console.log('✅ InputPanel: STT processing completed successfully');

      // Step 2: Generate diagram with the existing pipeline
      const messageIds = messages.map(msg => msg.id);
      console.log('🔗 InputPanel: Message IDs to process:', messageIds);
      
      setPipelineProcessing(true); setCurrentStep('Generating diagram...');
      try {
        const result = await minimalSTTService.generateDiagramFromStoredMessages();
        console.log('✅ InputPanel: Diagram generated', { length: result.mermaidCode.length, title: result.title });
        setDiagram(result.mermaidCode, result.title || 'Diagram');
      } catch(e) {
        const msg = e instanceof Error ? e.message : 'Diagram generation failed';
        setPipelineError(msg); console.error('❌ Diagram generation failed', msg);
      } finally { setPipelineProcessing(false); setCurrentStep('Ready'); }
    } catch (error) {
      console.error('❌ InputPanel: Failed to generate diagram:', error);
    }
  };

  const hasMessages = messages.length > 0;
  const canGenerate = hasMessages && !pipelineProcessing && !sttProcessing && pipelineInitialized && sttInitialized;

  return (
    <div className="input-panel">
      <div className="input-panel-header">
        <h2>Thread Messages</h2>
        <p>Organize your conversations in threads</p>
      </div>
      
      <div className="input-panel-content">
        {/* Error display */}
        {(messagesError || threadsError || pipelineError || sttError) && (
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
            <span>{messagesError || threadsError || pipelineError || sttError}</span>
            {(pipelineError || sttError) && (
              <button 
                onClick={pipelineError ? clearError : clearSTTError}
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
        {(pipelineProcessing || sttProcessing) && (
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
              <span>
                {sttProcessing ? 'Processing audio transcriptions...' : currentStep || 'Processing...'}
              </span>
            </div>
            {/* No detailed progress in minimal STT */}
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
            {(pipelineProcessing || sttProcessing) ? 'Generating...' : 'Generate Mermaid Diagram'}
          </button>
          <p className="generate-info">
            {(() => {
              // Improve status messaging to avoid perpetual "Initializing" when initialization already failed
              if (!pipelineInitialized) {
                if (pipelineError) {
                  return 'Azure services not initialized – check configuration.';
                }
                // If there's no explicit error but still not initialized, show a neutral waiting state
                return currentStep && currentStep.toLowerCase().includes('initializing')
                  ? 'Initializing Azure services...'
                  : 'Awaiting Azure configuration...';
              }
              if (!sttInitialized) {
                return sttError ? 'Speech-to-Text not initialized – check credentials.' : 'Initializing Speech-to-Text service...';
              }
              if (!hasMessages) {
                return 'Add messages to enable diagram generation';
              }
              return `Ready to generate diagram from ${messages.length} message${messages.length === 1 ? '' : 's'}`;
            })()}
          </p>
          {sttResult && (
            <div style={{
              marginTop: '0.5rem',
              padding: '0.5rem',
              backgroundColor: sttResult.failed > 0 ? '#fff3cd' : '#d4edda',
              color: sttResult.failed > 0 ? '#856404' : '#155724',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}>
              <strong>Last STT Results:</strong> {sttResult.successful} successful, {sttResult.failed} failed
              {sttResult.errors.length > 0 && (
                <div style={{ marginTop: '0.25rem' }}>
                  <details>
                    <summary>View errors ({sttResult.errors.length})</summary>
                    <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1rem' }}>
                      {sttResult.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chat Overlay */}
      <ChatOverlay
        isOpen={isChatOverlayOpen}
        onClose={handleCloseChatOverlay}
        thread={selectedThread}
        messages={threadMessages}
        onSendMessage={handleSendMessage}
        isProcessing={pipelineProcessing}
      />
    </div>
  );
};

export default InputPanel;
