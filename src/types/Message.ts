// Transcription status for audio messages
export type TranscriptionStatus =
  | 'pending'
  | 'processing'
  | 'conversion_error'
  | 'recognition_error'
  | 'no_match'
  | 'recognized'
  | 'timeout';

export interface Message {
  id: string;
  type: 'text' | 'audio' | 'image';
  content: string; // For text messages, this is the text. For audio, this is a reference ID. For images, this is the description
  timestamp: number;
  processed: boolean;
  duration?: number; // Only for audio messages
  transcription?: string; // Transcribed text for audio messages
  metadata?: Record<string, unknown>;
}

export interface AudioMessage extends Message {
  type: 'audio';
  audioBlob?: Blob;
  duration: number;
  transcriptionStatus?: TranscriptionStatus;
  transcriptionError?: string | null;
  transcriptionConfidence?: number;
  audioFormat?: string;
}

export interface TextMessage extends Message {
  type: 'text';
}

export interface ImageMessage extends Message {
  type: 'image';
  imageBlob?: Blob;
  imageUrl?: string; // For display purposes
  fileName: string;
  fileSize: number;
  mimeType: string;
  description?: string; // User-provided description for AI context
}

// Update main Message type union
export type MessageUnion = TextMessage | AudioMessage | ImageMessage;

// Add thread-level message organization
export interface ThreadMessageCollection {
  threadId: string;
  textMessages: TextMessage[];
  audioMessages: AudioMessage[];
  imageMessages: ImageMessage[];
  totalCount: number;
  transcriptionStatus: {
    total: number;
    processed: number;
    pending: number;
    failed: number;
  };
}

export interface ProcessingQueueItem {
  id: string;
  type: 'speech-to-text' | 'diagram-generation' | 'audio-transcription';
  messageId: string;
  data: unknown;
  retryCount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  timestamp: number;
  error?: string;
}

export interface DiagramCache {
  id: string;
  inputHash: string;
  messageIds: string[];
  mermaidCode: string;
  title?: string;
  diagramType: string;
  generatedAt: number;
  options?: Record<string, unknown>;
}

export interface StorageQuota {
  used: number;
  available: number;
  warning: boolean; // > 80% usage
  critical: boolean; // > 95% usage
}

