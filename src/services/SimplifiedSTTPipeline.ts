import { azureSpeechService } from './azure/SpeechService';
import { openAIService } from './azure/OpenAIService';
import { indexedDBService } from './storage/IndexedDBService';
import type { AudioMessage } from '../types/Message';
import type { MermaidGenerationOptions } from './azure/OpenAIService';

export interface STTPipelineConfig {
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
}

export interface PipelineResult {
  success: boolean;
  mermaidCode?: string;
  title?: string;
  error?: string;
}

class SimplifiedSTTPipelineService {
  private isInitialized = false;

  /**
   * Initialize Azure services
   */
  async initialize(config: STTPipelineConfig): Promise<void> {
    console.log('🔧 SimplifiedSTTPipeline: Initializing Azure services...');

    // Initialize Azure Speech Service
    await azureSpeechService.initialize({
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

    this.isInitialized = true;
    console.log('✅ SimplifiedSTTPipeline: Azure services initialized successfully');
  }

  /**
   * Main pipeline: Get all audio messages from all threads, transcribe them, then generate Mermaid
   */
  async processAllThreadsAndGenerateMermaid(options: MermaidGenerationOptions = {}): Promise<PipelineResult> {
    if (!this.isInitialized) {
      throw new Error('Pipeline not initialized. Call initialize() first.');
    }

    console.log('🚀 SimplifiedSTTPipeline: Starting pipeline processing...');

    try {
      // Step 1: Get all audio messages from all threads
      console.log('📋 Step 1: Collecting all audio messages from all threads...');
      const allAudioMessages = await this.getAllAudioMessagesFromAllThreads();
      console.log(`🎤 Found ${allAudioMessages.length} audio messages across all threads`);

      // Step 2: Transcribe all audio messages that don't have transcriptions
      console.log('🎯 Step 2: Transcribing audio messages...');
      await this.transcribeAudioMessages(allAudioMessages);

      // Step 3: Collect all text content (text messages + transcriptions)
      console.log('📝 Step 3: Collecting all text content...');
      const allTextContent = await this.getAllTextContent();
      console.log(`📄 Collected text content: ${allTextContent.length} characters`);

      if (!allTextContent.trim()) {
        return {
          success: false,
          error: 'No text content found to generate diagram'
        };
      }

      // Step 4: Generate Mermaid diagram
      console.log('🎨 Step 4: Generating Mermaid diagram...');
      const diagramResult = await openAIService.generateMermaidDiagram(allTextContent, options);

      console.log('✅ SimplifiedSTTPipeline: Pipeline completed successfully');
      return {
        success: true,
        mermaidCode: diagramResult.mermaidCode,
        title: diagramResult.title
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ SimplifiedSTTPipeline: Pipeline failed:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Get all audio messages from all threads
   */
  private async getAllAudioMessagesFromAllThreads(): Promise<AudioMessage[]> {
    console.log('🔍 Getting all audio messages from database...');
    
    // Get all audio messages directly from the audioMessages store
    const allAudioMessages = await indexedDBService.getAudioMessages();
    
    console.log(`📊 Found ${allAudioMessages.length} total audio messages`);
    return allAudioMessages;
  }

  /**
   * Transcribe audio messages that don't have transcriptions yet
   */
  private async transcribeAudioMessages(audioMessages: AudioMessage[]): Promise<void> {
    console.log(`🎤 Processing ${audioMessages.length} audio messages for transcription...`);

    for (let i = 0; i < audioMessages.length; i++) {
      const audioMessage = audioMessages[i];
      
      // Skip if already has successful transcription
      if (audioMessage.transcription && audioMessage.transcriptionStatus === 'recognized') {
        console.log(`[${i + 1}/${audioMessages.length}] ✅ ${audioMessage.id}: Already transcribed`);
        continue;
      }

      // Skip if no audio blob
      if (!audioMessage.audioBlob || audioMessage.audioBlob.size === 0) {
        console.log(`[${i + 1}/${audioMessages.length}] ⚠️ ${audioMessage.id}: No audio blob`);
        continue;
      }

      try {
        console.log(`[${i + 1}/${audioMessages.length}] 🔄 ${audioMessage.id}: Starting transcription...`);
        
        // Update status to processing
        await indexedDBService.updateMessage(audioMessage.id, { transcriptionStatus: 'processing' });

        // Transcribe audio
        const transcriptionResult = await azureSpeechService.transcribeAudio(audioMessage.audioBlob);
        
        console.log(`[${i + 1}/${audioMessages.length}] 📥 ${audioMessage.id}: Result - ${transcriptionResult.status}`);
        
        // Update message with transcription result
        const updateData: Partial<AudioMessage> = {
          transcription: transcriptionResult.text,
          transcriptionStatus: transcriptionResult.status,
          transcriptionConfidence: transcriptionResult.confidence
        };

        if (transcriptionResult.error) {
          updateData.transcriptionError = transcriptionResult.error;
        }

        await indexedDBService.updateMessage(audioMessage.id, updateData);
        
        // Update local object for immediate use
        Object.assign(audioMessage, updateData);

        if (transcriptionResult.status === 'recognized' && transcriptionResult.text.length > 0) {
          console.log(`[${i + 1}/${audioMessages.length}] ✅ ${audioMessage.id}: "${transcriptionResult.text}"`);
        } else {
          console.log(`[${i + 1}/${audioMessages.length}] ⚠️ ${audioMessage.id}: No speech detected`);
        }

      } catch (error) {
        console.error(`[${i + 1}/${audioMessages.length}] ❌ ${audioMessage.id}: Transcription failed:`, error);
        
        await indexedDBService.updateMessage(audioMessage.id, {
          transcriptionStatus: 'recognition_error',
          transcriptionError: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    console.log('✅ Audio transcription processing completed');
  }

  /**
   * Get all text content from text messages and audio transcriptions
   */
  private async getAllTextContent(): Promise<string> {
    console.log('📝 Collecting all text content...');

    const textParts: string[] = [];

    // Get all text messages
    const textMessages = await indexedDBService.getTextMessages();
    console.log(`📄 Found ${textMessages.length} text messages`);
    
    for (const textMessage of textMessages) {
      if (textMessage.content?.trim()) {
        textParts.push(textMessage.content);
      }
    }

    // Get all audio messages with successful transcriptions
    const audioMessages = await indexedDBService.getAudioMessages();
    const transcribedAudio = audioMessages.filter(m => 
      m.transcriptionStatus === 'recognized' && 
      m.transcription?.trim()
    );
    
    console.log(`🎤 Found ${transcribedAudio.length} audio messages with transcriptions`);

    for (const audioMessage of transcribedAudio) {
      if (audioMessage.transcription?.trim()) {
        textParts.push(audioMessage.transcription);
      }
    }

    // Get all image messages with descriptions
    const imageMessages = await indexedDBService.getImageMessages();
    const imagesWithDescriptions = imageMessages.filter(m => m.description?.trim());
    
    console.log(`🖼️ Found ${imagesWithDescriptions.length} image messages with descriptions`);

    for (const imageMessage of imagesWithDescriptions) {
      if (imageMessage.description?.trim()) {
        textParts.push(`Image: ${imageMessage.description}`);
      }
    }

    const combinedText = textParts.join('\n\n').trim();
    console.log(`📋 Combined ${textParts.length} content pieces into ${combinedText.length} characters`);

    return combinedText;
  }

  /**
   * Check if pipeline is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Auto-initialize with environment variables
   */
  async autoInitialize(): Promise<boolean> {
    const speechKey = import.meta.env.VITE_AZURE_SPEECH_KEY;
    const speechRegion = import.meta.env.VITE_AZURE_SPEECH_REGION;
    const openaiKey = import.meta.env.VITE_AZURE_OPENAI_KEY;
    const openaiEndpoint = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT;
    const openaiDeployment = import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT;

    if (!speechKey || !speechRegion || !openaiKey || !openaiEndpoint || !openaiDeployment) {
      console.error('❌ SimplifiedSTTPipeline: Missing environment variables');
      return false;
    }

    try {
      await this.initialize({
        azureSpeech: {
          subscriptionKey: speechKey,
          region: speechRegion,
          language: 'en-US'
        },
        azureOpenAI: {
          apiKey: openaiKey,
          endpoint: openaiEndpoint,
          apiVersion: '2024-04-01-preview',
          deploymentName: openaiDeployment
        }
      });
      return true;
    } catch (error) {
      console.error('❌ SimplifiedSTTPipeline: Auto-initialization failed:', error);
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      await azureSpeechService.cleanup();
      await openAIService.cleanup();
      this.isInitialized = false;
      console.log('✅ SimplifiedSTTPipeline: Cleanup completed');
    } catch (error) {
      console.error('❌ SimplifiedSTTPipeline: Cleanup failed:', error);
    }
  }
}

// Create singleton instance
export const simplifiedSTTPipelineService = new SimplifiedSTTPipelineService();
export default simplifiedSTTPipelineService;
