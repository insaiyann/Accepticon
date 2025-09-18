// Database configuration
export const DB_NAME = 'MermaidPWADB';
export const DB_VERSION = 4; // v4: add modeCache store for multi-mode AI persistent caching

// Object store names
export const STORES = {
  MESSAGES: 'messages',
  AUDIO_MESSAGES: 'audioMessages',
  IMAGE_MESSAGES: 'imageMessages', // New store for images
  THREADS: 'threads',
  PROCESSING_QUEUE: 'processingQueue',
  DIAGRAM_CACHE: 'diagramCache',
  APP_SETTINGS: 'appSettings'
  , MODE_CACHE: 'modeCache'
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

  [STORES.IMAGE_MESSAGES]: {
    key: string;
    value: {
      id: string;
      type: 'image';
      imageBlob: Blob;
      fileName: string;
      fileSize: number;
      mimeType: string;
      description?: string;
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
      messages: {
        text: string[];
        audio: string[];
        image: string[];
      };
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

  [STORES.MODE_CACHE]: {
    key: string; // id
    value: {
      id: string;
      mode: string; // AIViewerMode
      inputHash: string;
      model: string;
      promptVersion: string;
      mermaidCode?: string;
      markdown?: string;
      raw: string;
      tokensUsed: number;
      generatedAt: number;
      sourceSize: number;
    };
    indexes: {
      inputHash: string;
      mode: string;
      generatedAt: number;
    };
  };
}
