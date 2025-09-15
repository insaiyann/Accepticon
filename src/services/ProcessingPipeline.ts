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
      console.log(`🚀 Starting diagram generation for ${messageIds.length} message(s):`, messageIds);

      // 1. Retrieve all messages
      console.log(`📥 Attempting to retrieve ${messageIds.length} message IDs:`, messageIds);
      const messages = await Promise.all(
        messageIds.map(async id => {
          console.log(`🔍 Retrieving message with ID: ${id}`);
          const message = await indexedDBService.getMessage(id);
          console.log(`📄 Retrieved message:`, {
            id: message?.id,
            type: message?.type,
            hasContent: !!message?.content,
            hasAudioBlob: !!(message as AudioMessage)?.audioBlob,
            audioBlobSize: (message as AudioMessage)?.audioBlob?.size || 0,
            hasTranscription: !!(message as AudioMessage)?.transcription,
            transcription: (message as AudioMessage)?.transcription
          });
          return message;
        })
      );

      const validMessages = messages.filter(msg => msg !== null) as Message[];
      
      console.log(`📋 Retrieved ${validMessages.length} valid messages:`, validMessages.map(m => ({
        id: m.id,
        type: m.type,
        hasContent: !!m.content,
        hasTranscription: !!(m as AudioMessage).transcription,
        content: m.type === 'text' ? m.content?.substring(0, 50) + '...' : 'Audio message'
      })));
      
      console.log(`🎤 CRITICAL DEBUG - Messages by type:`, {
        textMessages: validMessages.filter(m => m.type === 'text').length,
        audioMessages: validMessages.filter(m => m.type === 'audio').length,
        otherMessages: validMessages.filter(m => m.type !== 'text' && m.type !== 'audio').length,
        allTypes: validMessages.map(m => m.type)
      });
      
      if (validMessages.length === 0) {
        throw new Error('No valid messages found');
      }

      // 2. Process audio messages to get transcriptions
      console.log(`🎤 Processing audio messages for transcription...`);
      const processedMessages = await this.processAudioMessages(validMessages);

      // 3. Combine all text content
      console.log(`📝 Combining text content from processed messages...`);
      const combinedText = this.combineMessageContent(processedMessages);
      
      console.log(`📄 Combined text content (${combinedText.length} chars):`, combinedText);
      
      if (!combinedText.trim()) {
        console.error(`❌ No text content found after processing ${processedMessages.length} messages`);
        console.log(`🔍 Message details:`, processedMessages.map(m => ({
          id: m.id,
          type: m.type,
          content: m.content,
          transcription: (m as AudioMessage).transcription
        })));
        throw new Error('No text content found to generate diagram');
      }

      // 4. Generate mermaid diagram
      console.log(`🎨 Generating mermaid diagram from text content...`);
      const diagramResult = await openAIService.generateMermaidDiagram(
        combinedText,
        options
      );

      console.log(`✨ Diagram generated successfully:`, {
        diagramType: diagramResult.diagramType,
        title: diagramResult.title,
        codeLength: diagramResult.mermaidCode.length
      });

      // 5. Cache the result
      const inputHash = this.generateInputHash(combinedText, options);
      const cachedDiagram = await indexedDBService.cacheDiagram({
        inputHash,
        messageIds,
        mermaidCode: diagramResult.mermaidCode,
        title: diagramResult.title,
        diagramType: diagramResult.diagramType,
        generatedAt: Date.now(),
        options: options as Record<string, unknown>
      });

      const processingTime = Date.now() - startTime;

      console.log(`🎉 Successfully generated diagram in ${processingTime}ms`);

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
      
      console.error(`❌ Failed to generate diagram after ${processingTime}ms:`, errorMessage);
      console.error(`🔍 Error details:`, error);

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
    const audioMessages = messages.filter(m => m.type === 'audio') as AudioMessage[];
    
    console.log(`🎵 Found ${audioMessages.length} audio message(s) to process`);
    console.log(`🔍 Audio messages details:`, audioMessages.map(m => ({
      id: m.id,
      type: m.type,
      hasAudioBlob: !!m.audioBlob,
      audioBlobSize: m.audioBlob?.size || 0,
      duration: m.duration,
      hasTranscription: !!m.transcription,
      currentTranscription: m.transcription
    })));

    for (const message of messages) {
      console.log(`🔄 Processing message ${message.id} of type ${message.type}`);
      
      if (message.type === 'audio') {
        const audioMessage = message as AudioMessage;
        console.log(`🎤 Audio message details:`, {
          id: audioMessage.id,
          hasAudioBlob: !!audioMessage.audioBlob,
          audioBlobSize: audioMessage.audioBlob?.size || 0,
          hasTranscription: !!audioMessage.transcription,
          transcription: audioMessage.transcription
        });
        
        if (audioMessage.audioBlob && !audioMessage.transcription) {
          try {
            console.log(`🎤 Starting transcription for audio message: ${message.id}`);
            
            // Validate audio blob
            if (!audioMessage.audioBlob || audioMessage.audioBlob.size === 0) {
              console.warn(`⚠️  Audio message ${message.id} has no audio blob or empty blob`);
              processedMessages.push(message);
              continue;
            }

            console.log(`🔊 Audio blob details:`, {
              size: audioMessage.audioBlob.size,
              type: audioMessage.audioBlob.type,
              duration: audioMessage.duration
            });
            
            console.log(`🚀 Calling Azure Speech Service transcribeAudio...`);
            const transcriptionResult = await speechService.transcribeAudio(audioMessage.audioBlob!);
            console.log(`📥 Received transcription result:`, transcriptionResult);
            
            const transcriptionText = transcriptionResult.text;
            
            // Log the STT results
            console.log(`📝 Speech-to-Text completed for message: ${message.id}`);
            console.log(`📊 Transcription details:`, {
              messageId: message.id,
              originalDuration: `${Math.round(audioMessage.duration / 1000)}s`,
              transcribedText: transcriptionText,
              confidence: transcriptionResult.confidence,
              language: transcriptionResult.language || 'en-US',
              processingTime: `${transcriptionResult.duration}ms`
            });
            console.log(`💬 Transcribed text: "${transcriptionText}"`);
            
            // Update message with transcription
            const updatedMessage = { ...message, transcription: transcriptionText };
            console.log(`💾 Saving transcription to IndexedDB...`);
            await indexedDBService.updateMessage(message.id, { transcription: transcriptionText });
            console.log(`💾 Transcription saved to IndexedDB`);
            
            processedMessages.push(updatedMessage);
            console.log(`✅ Transcription completed and saved for message: ${message.id}`);
            
          } catch (error) {
            console.error(`❌ Failed to transcribe audio message ${message.id}:`, error);
            console.error(`❌ Error details:`, {
              message: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined
            });
            // Include original message even if transcription fails - will use fallback content
            console.log(`🔄 Including message ${message.id} without transcription (will use fallback content)`);
            processedMessages.push(message);
          }
        } else if (audioMessage.transcription) {
          console.log(`♻️  Audio message ${message.id} already has transcription: "${audioMessage.transcription}"`);
          processedMessages.push(message);
        } else if (!audioMessage.audioBlob) {
          console.warn(`⚠️  Audio message ${message.id} has no audio blob to transcribe`);
          processedMessages.push(message); // Still include it for fallback content
        } else {
          console.log(`🔄 Audio message ${message.id} will be included without transcription (fallback content)`);
          processedMessages.push(message); // Include for fallback content
        }
      } else {
        console.log(`📝 Text message ${message.id}: "${message.content?.substring(0, 50)}..."`);
        processedMessages.push(message);
      }
    }

    console.log(`✨ Finished processing ${processedMessages.length} messages`);
    console.log(`🔍 Final processed messages:`, processedMessages.map(m => ({
      id: m.id,
      type: m.type,
      hasContent: !!m.content,
      hasTranscription: !!(m as AudioMessage).transcription,
      transcription: (m as AudioMessage).transcription
    })));
    return processedMessages;
  }

  /**
   * Combine content from all messages into a single text
   */
  private combineMessageContent(messages: Message[]): string {
    const textParts: string[] = [];

    console.log(`📝 ProcessingPipeline: Combining content from ${messages.length} messages...`);

    for (const message of messages) {
      console.log(`🔄 Processing message ${message.id} of type ${message.type}`);
      
      if (message.type === 'text' && message.content) {
        console.log(`📝 Adding text content: "${message.content.substring(0, 50)}..."`);
        textParts.push(message.content);
      } else if (message.type === 'audio') {
        const audioMessage = message as AudioMessage;
        if (audioMessage.transcription) {
          console.log(`🎤 Adding transcription: "${audioMessage.transcription}"`);
          textParts.push(audioMessage.transcription);
        } else {
          // Fallback: use a placeholder or the content field
          const fallbackContent = audioMessage.content || `[Audio message ${Math.round(audioMessage.duration / 1000)}s - transcription pending]`;
          console.log(`⚠️ Audio message ${message.id} has no transcription, using fallback: "${fallbackContent}"`);
          textParts.push(fallbackContent);
        }
      }
    }

    const combinedText = textParts.join('\n\n').trim();
    console.log(`📄 Combined ${textParts.length} text parts into ${combinedText.length} characters`);
    
    return combinedText;
  }

  /**
   * Generate a hash for input content and options for caching
   */
  private generateInputHash(content: string, options: MermaidGenerationOptions): string {
    const hashInput = content + JSON.stringify(options);
    // Simple hash function - in production, consider using a proper hash library
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `hash_${Math.abs(hash)}_${Date.now()}`;
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
        
        console.log(`🎤 Queue processor: Starting transcription for message: ${messageId}`);
        
        const message = await indexedDBService.getMessage(messageId);
        if (!message || message.type !== 'audio' || !(message as AudioMessage).audioBlob) {
          throw new Error('Invalid audio message for transcription');
        }

        const audioMessage = message as AudioMessage;
        const transcriptionResult = await speechService.transcribeAudio(audioMessage.audioBlob!);
        
        // Log the STT results from queue processor
        console.log(`📝 Queue STT completed for message: ${messageId}`);
        console.log(`📊 Queue transcription details:`, {
          messageId: messageId,
          originalDuration: `${Math.round(audioMessage.duration / 1000)}s`,
          transcribedText: transcriptionResult.text,
          confidence: transcriptionResult.confidence,
          language: transcriptionResult.language || 'en-US',
          processingTime: `${transcriptionResult.duration}ms`
        });
        console.log(`💬 Queue transcribed text: "${transcriptionResult.text}"`);
        
        await indexedDBService.updateMessage(messageId, { transcription: transcriptionResult.text });
        
        console.log(`✅ Queue processor completed transcription for message: ${messageId}`);
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
