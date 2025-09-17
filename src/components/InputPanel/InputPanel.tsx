import React, { useState } from 'react';
import { Icon } from '../common/Icon';
import { ThreadTree } from '../ThreadTree/ThreadTree';
import { ChatOverlay } from '../ChatOverlay/ChatOverlay';
import { useMessages } from '../../hooks/useMessages';
import { useThreads } from '../../hooks/useThreads';
import { useSpeechTranscription } from '../../hooks/useSpeechTranscription';
import { indexedDBService } from '../../services/storage/IndexedDBService';
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

  const {
    isConfigured: speechConfigured,
    isProcessing: isTranscribing,
    error: transcriptionError,
    lastRun: transcriptionSummary,
    transcribeAllAudioMessages,
    clearError: clearTranscriptionError
  } = useSpeechTranscription();

  const audioMessages = messages.filter(
    (message): message is AudioMessage => message.type === 'audio'
  );

  const handleThreadClick = async (thread: Thread) => {
    setSelectedThread(thread);

    try {
      console.log('[InputPanel] Loading messages for thread', thread.id);
      const threadSpecificMessages = await indexedDBService.getMessagesForThread(thread.id);
      setThreadMessages(threadSpecificMessages);
      setIsChatOverlayOpen(true);
    } catch (error) {
      console.error('[InputPanel] Failed to load thread messages', error);
      setThreadMessages([]);
      setIsChatOverlayOpen(true);
    }
  };

  const handleCreateThread = async (parentId?: string) => {
    try {
      const title = `New Thread ${new Date().toLocaleString()}`;
      await createThread({ title, parentId });
    } catch (error) {
      console.error('[InputPanel] Failed to create thread', error);
    }
  };

  const handleRenameThread = async (threadId: string, newTitle: string) => {
    try {
      await updateThread(threadId, { title: newTitle });
    } catch (error) {
      console.error('[InputPanel] Failed to rename thread', error);
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
    if (!selectedThread) {
      return;
    }

    try {
      let newMessage: TextMessage | AudioMessage | ImageMessage;

      if (type === 'text') {
        newMessage = await addTextMessage(content);
      } else if (type === 'audio' && options?.data instanceof Blob) {
        const durationInMs = options.duration ?? 0;
        newMessage = await addAudioMessage(options.data, durationInMs);
      } else if (type === 'image' && options?.data instanceof File) {
        newMessage = await addImageMessage(
          options.data,
          options.fileName || 'image.png',
          content
        );
      } else {
        console.warn('[InputPanel] Unsupported message type or missing data', { type, options });
        return;
      }

      await moveMessageToThread(newMessage.id, selectedThread.id);

      setThreadMessages(prev =>
        [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp)
      );
    } catch (error) {
      console.error('[InputPanel] Failed to send message', error);
    }
  };

  const handleCloseChatOverlay = () => {
    setIsChatOverlayOpen(false);
    setSelectedThread(null);
  };

  const handleGenerateDiagram = async () => {
    if (audioMessages.length === 0) {
      alert('Record at least one audio message before running transcription.');
      return;
    }

    if (!speechConfigured) {
      alert('Azure Speech configuration is missing. Set VITE_AZURE_SPEECH_KEY and VITE_AZURE_SPEECH_REGION.');
      return;
    }

    try {
      console.log('[InputPanel] Starting minimal speech transcription pipeline', {
        audioCount: audioMessages.length
      });
      await transcribeAllAudioMessages();
      console.log('[InputPanel] Transcription pipeline completed');
    } catch (error) {
      console.error('[InputPanel] Transcription failed', error);
      alert('Transcription failed. Check the console for details.');
    }
  };

  const canGenerate = audioMessages.length > 0 && speechConfigured && !isTranscribing;

  const generateStatusMessage = (() => {
    if (!speechConfigured) {
      return 'Add Azure Speech credentials to enable transcription.';
    }
    if (audioMessages.length === 0) {
      return 'Record audio messages to enable transcription.';
    }
    if (isTranscribing) {
      return 'Running speech-to-text on saved audio messages...';
    }
    if (transcriptionSummary) {
      return `Last run: ${transcriptionSummary.succeeded} succeeded, ${transcriptionSummary.failed} failed.`;
    }
    return `Ready to transcribe ${audioMessages.length} audio message${audioMessages.length === 1 ? '' : 's'}.`;
  })();

  return (
    <div className="input-panel">
      <div className="input-panel-header">
        <h2>Thread Messages</h2>
        <p>Organize your conversations in threads</p>
      </div>

      <div className="input-panel-content">
        {/* Error display */}
        {(messagesError || threadsError || transcriptionError) && (
          <div
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              borderRadius: '4px',
              margin: '0 1rem 1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span>{messagesError || threadsError || transcriptionError}</span>
            {transcriptionError && (
              <button
                onClick={clearTranscriptionError}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#721c24',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  fontWeight: 'bold'
                }}
              >
                Dismiss
              </button>
            )}
          </div>
        )}

        {/* Processing status */}
        {isTranscribing && (
          <div
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#d1ecf1',
              color: '#0c5460',
              borderRadius: '4px',
              margin: '0 1rem 1rem'
            }}
          >
            <span>Transcribing audio messages...</span>
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
            {isTranscribing ? 'Transcribing...' : 'Generate Mermaid Diagram'}
          </button>
          <p className="generate-info">{generateStatusMessage}</p>
          {transcriptionSummary && transcriptionSummary.details.length > 0 && (
            <div
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem',
                backgroundColor: '#f2f2f2',
                borderRadius: '4px',
                fontSize: '0.875rem'
              }}
            >
              <strong>Transcription log:</strong>
              <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1rem' }}>
                {transcriptionSummary.details.map(detail => (
                  <li key={detail.id}>
                    {detail.id}: {detail.text ?? detail.error ?? 'No result'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <ChatOverlay
        isOpen={isChatOverlayOpen}
        onClose={handleCloseChatOverlay}
        thread={selectedThread}
        messages={threadMessages}
        onSendMessage={handleSendMessage}
        isProcessing={isTranscribing}
      />
    </div>
  );
};

export default InputPanel;
