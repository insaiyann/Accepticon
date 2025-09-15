export interface Message {
  id: string;
  type: 'text' | 'audio';
  content: string; // For text messages, this is the text. For audio, this is a reference ID
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
}

export interface TextMessage extends Message {
  type: 'text';
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
