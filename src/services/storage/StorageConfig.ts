// Database configuration
export const DB_NAME = 'MermaidPWADB';
export const DB_VERSION = 2; // Increment version for thread support

// Object store names
export const STORES = {
  MESSAGES: 'messages',
  AUDIO_MESSAGES: 'audioMessages', 
  THREADS: 'threads',
  PROCESSING_QUEUE: 'processingQueue',
  DIAGRAM_CACHE: 'diagramCache',
  APP_SETTINGS: 'appSettings'
} as const;

// Database schema definition
export interface DBSchema {
  [STORES.MESSAGES]: {
    key: string;
    value: {
      id: string;
      type: 'text';
      content: string;
      timestamp: number;
      processed: boolean;
      metadata?: Record<string, unknown>;
    };
    indexes: {
      timestamp: number;
      processed: boolean;
    };
  };

  [STORES.AUDIO_MESSAGES]: {
    key: string;
    value: {
      id: string;
      type: 'audio';
      audioBlob: Blob;
      duration: number;
      transcription?: string;
      timestamp: number;
      processed: boolean;
      metadata?: Record<string, unknown>;
    };
    indexes: {
      timestamp: number;
      processed: boolean;
    };
  };

  [STORES.THREADS]: {
    key: string;
    value: {
      id: string;
      title: string;
      parentId?: string;
      childIds: string[];
      messageIds: string[];
      collapsed: boolean;
      createdAt: number;
      updatedAt: number;
      metadata: {
        messageCount: number;
        lastActivity: number;
        tags?: string[];
      };
    };
    indexes: {
      parentId: string;
      createdAt: number;
      updatedAt: number;
    };
  };

  [STORES.PROCESSING_QUEUE]: {
    key: string;
    value: {
      id: string;
      type: 'speech-to-text' | 'diagram-generation';
      messageId: string;
      data: unknown;
      retryCount: number;
      status: 'pending' | 'processing' | 'completed' | 'failed';
      timestamp: number;
      error?: string;
    };
    indexes: {
      status: 'pending' | 'processing' | 'completed' | 'failed';
      timestamp: number;
    };
  };

  [STORES.DIAGRAM_CACHE]: {
    key: string;
    value: {
      id: string;
      inputHash: string;
      mermaidCode: string;
      generatedAt: number;
    };
    indexes: {
      inputHash: string;
      generatedAt: number;
    };
  };

  [STORES.APP_SETTINGS]: {
    key: string;
    value: {
      key: string;
      value: unknown;
      updated: number;
    };
  };
}
