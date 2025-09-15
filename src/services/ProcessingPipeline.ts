import speechService from './azure/SpeechService';
import openAIService from './azure/OpenAIService';
import { indexedDBService } from './storage/IndexedDBService';
import { processingQueueService } from './ProcessingQueue';
import type { Message, AudioMessage, ProcessingQueueItem, DiagramCache } from '../types/Message';
import type { MermaidGenerationOptions } from './azure/OpenAIService';

export interface ProcessingResult {
  success: boolean;
  data?: unknown;
  error?: string;
  processingTime: number;
}

export interface PipelineConfig {
  azureSpeech: {
    subscriptionKey: string;
    region: string;
    language?: string;
  };
  azureOpenAI: {
    apiKey: string;
    endpoint: string;
    apiVersion: string;
    deploymentName: string;
  };
  processing: {
    enableQueue: boolean;
    maxRetries: number;
    timeout: number;
  };
}

class ProcessingPipelineService {
  private isInitialized = false;
  private config: PipelineConfig | null = null;

  /**
   * Initialize the processing pipeline with all required services
   */
  async initialize(config: PipelineConfig): Promise<void> {
    try {
      this.config = config;

      // Initialize Azure Speech Service
      await speechService.initialize({
        key: config.azureSpeech.subscriptionKey,
        region: config.azureSpeech.region,
        language: config.azureSpeech.language || 'en-US'
      });

      // Initialize Azure OpenAI Service
      await openAIService.initialize({
        apiKey: config.azureOpenAI.apiKey,
        endpoint: config.azureOpenAI.endpoint,
        apiVersion: config.azureOpenAI.apiVersion,
        deploymentName: config.azureOpenAI.deploymentName
      });

      // Register queue processors if queue is enabled
      if (config.processing.enableQueue) {
        this.registerQueueProcessors();
      }

      this.isInitialized = true;
      console.log('Processing pipeline initialized successfully');
    } catch (error) {
      console.error('Failed to initialize processing pipeline:', error);
      throw new Error('Processing pipeline initialization failed');
    }
  }

  /**
   * Process messages to generate mermaid diagrams
   */
  async generateDiagramFromMessages(
    messageIds: string[],
    options: MermaidGenerationOptions = {}
  ): Promise<ProcessingResult> {
    if (!this.isInitialized) {
      throw new Error('Processing pipeline not initialized');
    }

    const startTime = Date.now();

    try {
      // 1. Retrieve all messages
      const messages = await Promise.all(
        messageIds.map(id => indexedDBService.getMessage(id))
      );

      const validMessages = messages.filter(msg => msg !== null) as Message[];
      
      if (validMessages.length === 0) {
        throw new Error('No valid messages found');
      }

      // 2. Process audio messages to get transcriptions
      const processedMessages = await this.processAudioMessages(validMessages);

      // 3. Combine all text content
      const combinedText = this.combineMessageContent(processedMessages);
      
      if (!combinedText.trim()) {
        throw new Error('No text content found to generate diagram');
      }

      // 4. Generate mermaid diagram
      const diagramResult = await openAIService.generateMermaidDiagram(
        combinedText,
        options
      );

      // 5. Cache the result
      const cachedDiagram = await indexedDBService.cacheDiagram({
        messageIds,
        mermaidCode: diagramResult.mermaidCode,
        title: diagramResult.title,
        diagramType: diagramResult.diagramType,
        generatedAt: Date.now(),
        options
      });

      const processingTime = Date.now() - startTime;

      console.log(`Successfully generated diagram in ${processingTime}ms`);

      return {
        success: true,
        data: {
          diagram: cachedDiagram,
          result: diagramResult
        },
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error('Failed to generate diagram:', errorMessage);

      return {
        success: false,
        error: errorMessage,
        processingTime
      };
    }
  }

  /**
   * Queue diagram generation for later processing
   */
  async queueDiagramGeneration(
    messageIds: string[],
    options: MermaidGenerationOptions = {}
  ): Promise<ProcessingQueueItem> {
    if (!this.config?.processing.enableQueue) {
      throw new Error('Queue processing is not enabled');
    }

    return await processingQueueService.addToQueue(
      'diagram-generation',
      messageIds.join(','), // Use combined IDs as message ID
      {
        messageIds,
        options
      }
    );
  }

  /**
   * Process audio messages to get transcriptions
   */
  private async processAudioMessages(messages: Message[]): Promise<Message[]> {
    const processedMessages: Message[] = [];

    for (const message of messages) {
      if (message.type === 'audio' && (message as AudioMessage).audioBlob && !message.transcription) {
        try {
          console.log(`Transcribing audio message: ${message.id}`);
          
          // Convert blob to array buffer for speech service
          const audioMessage = message as AudioMessage;
          const transcriptionResult = await speechService.transcribeAudio(audioMessage.audioBlob!);
          const transcriptionText = transcriptionResult.text;
          
          // Update message with transcription
          const updatedMessage = { ...message, transcription: transcriptionText };
          await indexedDBService.updateMessage(message.id, { transcription: transcriptionText });
          
          processedMessages.push(updatedMessage);
          console.log(`Transcription completed for message: ${message.id}`);
          
        } catch (error) {
          console.error(`Failed to transcribe audio message ${message.id}:`, error);
          // Include original message even if transcription fails
          processedMessages.push(message);
        }
      } else {
        processedMessages.push(message);
      }
    }

    return processedMessages;
  }

  /**
   * Combine content from all messages into a single text
   */
  private combineMessageContent(messages: Message[]): string {
    const textParts: string[] = [];

    for (const message of messages) {
      if (message.type === 'text' && message.content) {
        textParts.push(message.content);
      } else if (message.type === 'audio' && message.transcription) {
        textParts.push(message.transcription);
      }
    }

    return textParts.join('\n\n').trim();
  }

  /**
   * Register queue processors for background processing
   */
  private registerQueueProcessors(): void {
    // Register diagram generation processor
    processingQueueService.registerProcessor({
      type: 'diagram-generation',
      process: async (item: ProcessingQueueItem) => {
        const { messageIds, options } = item.data as {
          messageIds: string[];
          options: MermaidGenerationOptions;
        };

        const result = await this.generateDiagramFromMessages(messageIds, options);
        
        if (!result.success) {
          throw new Error(result.error || 'Diagram generation failed');
        }

        console.log(`Queue processor completed diagram generation for item: ${item.id}`);
      }
    });

    // Register audio transcription processor
    processingQueueService.registerProcessor({
      type: 'audio-transcription',
      process: async (item: ProcessingQueueItem) => {
        const { messageId } = item.data as { messageId: string };
        
        const message = await indexedDBService.getMessage(messageId);
        if (!message || message.type !== 'audio' || !(message as AudioMessage).audioBlob) {
          throw new Error('Invalid audio message for transcription');
        }

        const audioMessage = message as AudioMessage;
        const transcriptionResult = await speechService.transcribeAudio(audioMessage.audioBlob!);
        
        await indexedDBService.updateMessage(messageId, { transcription: transcriptionResult.text });
        
        console.log(`Queue processor completed transcription for message: ${messageId}`);
      }
    });

    console.log('Queue processors registered successfully');
  }

  /**
   * Queue audio transcription for background processing
   */
  async queueAudioTranscription(messageId: string): Promise<ProcessingQueueItem> {
    if (!this.config?.processing.enableQueue) {
      throw new Error('Queue processing is not enabled');
    }

    return await processingQueueService.addToQueue(
      'audio-transcription',
      messageId,
      { messageId }
    );
  }

  /**
   * Get cached diagram for message combination
   */
  async getCachedDiagram(messageIds: string[]): Promise<DiagramCache | null> {
    try {
      return await indexedDBService.getCachedDiagramByMessageIds(messageIds);
    } catch (error) {
      console.error('Failed to get cached diagram:', error);
      return null;
    }
  }

  /**
   * Get processing pipeline status
   */
  getStatus(): {
    isInitialized: boolean;
    speechService: {
      isInitialized: boolean;
      hasConfig: boolean;
      hasRecognizer: boolean;
    };
    openAIService: {
      isInitialized: boolean;
      hasClient: boolean;
      endpoint?: string;
    };
    queueService: {
      isProcessing: boolean;
      currentlyProcessing: string[];
      registeredProcessors: string[];
    };
  } {
    return {
      isInitialized: this.isInitialized,
      speechService: speechService.getStatus(),
      openAIService: openAIService.getStatus(),
      queueService: processingQueueService.getStatus()
    };
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    currentlyProcessing: number;
  }> {
    return await processingQueueService.getQueueStats();
  }

  /**
   * Clean up all services
   */
  async cleanup(): Promise<void> {
    try {
      await speechService.cleanup();
      await openAIService.cleanup();
      processingQueueService.pauseProcessing();
      
      this.isInitialized = false;
      this.config = null;
      
      console.log('Processing pipeline cleaned up successfully');
    } catch (error) {
      console.error('Error during pipeline cleanup:', error);
    }
  }
}

// Create singleton instance
export const processingPipelineService = new ProcessingPipelineService();
export default processingPipelineService;
