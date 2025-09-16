export interface Thread {
  id: string;
  title: string;
  parentId?: string; // null for root threads
  childIds: string[];
  messageIds: string[]; // Keep for backward compatibility
  
  // New: Organized message collections
  messages: {
    text: string[]; // Array of text message IDs
    audio: string[]; // Array of audio message IDs  
    image: string[]; // Array of image message IDs
  };
  
  // Enhanced processing status
  processingStatus: {
    audioTranscriptionsComplete: boolean;
    totalAudioMessages: number;
    transcribedAudioMessages: number;
    lastProcessedAt?: number;
  };
  
  collapsed: boolean;
  createdAt: number;
  updatedAt: number;
  metadata: {
    messageCount: number;
    lastActivity: number;
    tags?: string[];
    hasImages: boolean;
    hasAudio: boolean;
  };
}

export interface ThreadHierarchy {
  rootThreads: Thread[];
  threadMap: Map<string, Thread>;
  messageToThreadMap: Map<string, string>;
}

// Thread message type with extended capabilities
export interface ThreadMessage {
  id: string;
  threadId: string;
  orderInThread: number;
  sender: 'user' | 'assistant';
  type: 'text' | 'audio' | 'image';
  content: string;
  timestamp: number;
  processed: boolean;
  duration?: number; // Only for audio messages
  transcription?: string; // Transcribed text for audio messages
  data?: File | Blob; // For audio recordings or images
  metadata?: Record<string, unknown>;
}

export interface CreateThreadOptions {
  title: string;
  parentId?: string;
}

export interface UpdateThreadOptions {
  title?: string;
  collapsed?: boolean;
  tags?: string[];
  childIds?: string[];
}

export interface ThreadContextMenuPosition {
  x: number;
  y: number;
}

export interface ThreadStats {
  totalThreads: number;
  totalMessages: number;
  averageMessagesPerThread: number;
  lastActivity: number;
}
