/**
 * Simple Audio Pipeline - Clean, minimal pipeline for audio processing
 * Built from scratch for reliability and simplicity
 */

import { simpleAudioRecorder, SimpleAudioRecorder } from './audio/SimpleAudioRecorder';
import { simpleSpeechService } from './azure/SimpleSpeechService';
import { indexedDBService } from './storage/IndexedDBService';
import { openAIService } from './azure/OpenAIService';
import type { AudioMessage } from '../types/Message';
import type { MermaidGenerationOptions } from './azure/OpenAIService';

export interface PipelineConfig {
  azureSpeechKey: string;
  azureSpeechRegion: string;
  azureOpenAIKey: string;
  azureOpenAIEndpoint: string;
  azureOpenAIDeployment: string;
}

export interface PipelineResult {
  success: boolean;
  mermaidCode?: string;
  title?: string;
  error?: string;
  transcriptionCount?: number;
  totalMessages?: number;
}

export interface PipelineState {
  isInitialized: boolean;
  isProcessing: boolean;
  currentStep: string;
  error: string | null;
}

export class SimpleAudioPipeline {
  private isInitialized = false;
  private state: PipelineState = {
    isInitialized: false,
    isProcessing: false,
    currentStep: 'Ready',
    error: null
  };
  
  private onStateChange?: (state: PipelineState) => void;

  /**
   * Set state change callback
   */
  setStateChangeCallback(callback: (state: PipelineState) => void): void {
    this.onStateChange = callback;
  }

  /**
   * Get current pipeline state
   */
  getState(): PipelineState {
    return { ...this.state };
  }

  /**
   * Update state and notify callback
   */
  private updateState(updates: Partial<PipelineState>): void {
    this.state = { ...this.state, ...updates };
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }

  /**
   * Initialize the pipeline with configuration
   */
  async initialize(config: PipelineConfig): Promise<void> {
    try {
      console.log('🚀 Initializing Simple Audio Pipeline...');
      this.updateState({ currentStep: 'Initializing Azure services...', error: null });

      // Initialize Azure Speech Service
      await simpleSpeechService.initialize({
        subscriptionKey: config.azureSpeechKey,
        region: config.azureSpeechRegion,
        language: 'en-US'
      });

      // Initialize Azure OpenAI Service
      await openAIService.initialize({
        apiKey: config.azureOpenAIKey,
        endpoint: config.azureOpenAIEndpoint,
        apiVersion: '2024-04-01-preview',
        deploymentName: config.azureOpenAIDeployment
      });

      this.isInitialized = true;
      this.updateState({
        isInitialized: true,
        currentStep: 'Ready',
        error: null
      });

      console.log('✅ Simple Audio Pipeline initialized successfully');

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Initialization failed';
      console.error('❌ Pipeline initialization failed:', message);
      
      this.updateState({
        isInitialized: false,
        currentStep: 'Initialization failed',
        error: message
      });
      
      throw error;
    }
  }

  /**
   * Auto-initialize using environment variables
   */
  async autoInitialize(): Promise<boolean> {
    const config = {
      azureSpeechKey: import.meta.env.VITE_AZURE_SPEECH_KEY,
      azureSpeechRegion: import.meta.env.VITE_AZURE_SPEECH_REGION,
      azureOpenAIKey: import.meta.env.VITE_AZURE_OPENAI_KEY,
      azureOpenAIEndpoint: import.meta.env.VITE_AZURE_OPENAI_ENDPOINT,
      azureOpenAIDeployment: import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT
    };

    // Check required environment variables
    const missing = Object.entries(config)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      const message = `Missing environment variables: ${missing.join(', ')}`;
      console.error('❌ Auto-initialization failed:', message);
      this.updateState({
        isInitialized: false,
        currentStep: 'Missing configuration',
        error: message
      });
      return false;
    }

    try {
      await this.initialize(config);
      return true;
    } catch (error) {
      console.error('❌ Auto-initialization failed:', error);
      return false;
    }
  }

  /**
   * Record audio and return the audio message
   */
  async recordAudio(): Promise<AudioMessage> {
    if (!this.isInitialized) {
      throw new Error('Pipeline not initialized');
    }

    console.log('🎤 Starting audio recording...');
    
    // Log recording format information
    const recordingInfo = SimpleAudioRecorder.getRecordingInfo();
    console.log('🎵 Recording format info:', recordingInfo);
    
    this.updateState({ isProcessing: true, currentStep: 'Recording audio...', error: null });

    try {
      // Start recording
      await simpleAudioRecorder.startRecording();
      
      // Note: In a real app, you'd wait for user to stop recording
      // For this example, we'll record for 5 seconds
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Stop recording
      const recordingResult = await simpleAudioRecorder.stopRecording();
      
      // Verify WAV format
      const isWav = SimpleAudioRecorder.isWavFormat(recordingResult.audioBlob);
      console.log('🔍 Audio format verification:', {
        isWav,
        format: recordingResult.format,
        size: recordingResult.audioBlob.size
      });
      
      if (!isWav) {
        console.error('❌ Audio is not in WAV format despite enforcement!');
      } else {
        console.log('✅ Audio confirmed in WAV format for optimal speech recognition');
      }
      
      // Create audio message
      const audioMessage: AudioMessage = {
        id: `audio-${Date.now()}`,
        type: 'audio',
        content: '',  // Audio messages store content as reference
        timestamp: Date.now(),
        processed: false,
        audioBlob: recordingResult.audioBlob,
        duration: recordingResult.duration,
        transcription: undefined,
        transcriptionStatus: 'pending'
      };

      // Save to database
      await indexedDBService.addAudioMessage(audioMessage);
      
      console.log('✅ Audio recorded and saved in WAV format');
      this.updateState({ isProcessing: false, currentStep: 'Ready' });
      
      return audioMessage;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Recording failed';
      console.error('❌ Audio recording failed:', message);
      this.updateState({
        isProcessing: false,
        currentStep: 'Recording failed',
        error: message
      });
      throw error;
    }
  }

  /**
   * Transcribe a single audio message
   */
  async transcribeAudio(audioMessage: AudioMessage): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Pipeline not initialized');
    }

    if (!audioMessage.audioBlob) {
      throw new Error('No audio blob in message');
    }

    const isWav = SimpleAudioRecorder.isWavFormat(audioMessage.audioBlob);
    console.log(`🎯 Transcribing audio message ${audioMessage.id}...`, {
      format: audioMessage.audioBlob.type,
      isWav,
      size: audioMessage.audioBlob.size
    });
    
    if (!isWav) {
      console.warn(`⚠️ Audio message ${audioMessage.id} is not in WAV format! This may cause transcription issues.`);
    }
    
    try {
      // Update status to processing
      await indexedDBService.updateMessage(audioMessage.id, {
        transcriptionStatus: 'processing'
      });

      // Transcribe using Azure Speech Service
      const result = await simpleSpeechService.transcribeAudio(audioMessage.audioBlob);

      // Update message with result
      const updateData: Partial<AudioMessage> = {
        transcription: result.text,
        transcriptionStatus: result.success ? 'recognized' : 'no_match',
        transcriptionConfidence: result.confidence
      };

      if (!result.success) {
        updateData.transcriptionError = result.error;
      }

      await indexedDBService.updateMessage(audioMessage.id, updateData);

      console.log(`✅ Transcription completed:`, {
        id: audioMessage.id,
        success: result.success,
        text: result.text,
        confidence: result.confidence,
        wasWavFormat: isWav
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transcription failed';
      console.error(`❌ Transcription failed for ${audioMessage.id}:`, message);
      
      await indexedDBService.updateMessage(audioMessage.id, {
        transcriptionStatus: 'recognition_error',
        transcriptionError: message
      });
      
      throw error;
    }
  }

  /**
   * Process all audio messages and generate Mermaid diagram
   */
  async processAllAndGenerateMermaid(options: MermaidGenerationOptions = {}): Promise<PipelineResult> {
    if (!this.isInitialized) {
      throw new Error('Pipeline not initialized');
    }

    console.log('🚀 Starting full pipeline processing...');
    this.updateState({ isProcessing: true, currentStep: 'Loading audio messages...', error: null });

    try {
      // Step 1: Get all audio messages
      const audioMessages = await indexedDBService.getAudioMessages();
      console.log(`📋 Found ${audioMessages.length} audio messages`);

      // Step 2: Transcribe messages that need transcription
      const untranscribedMessages = audioMessages.filter(
        (msg: AudioMessage) => msg.transcriptionStatus !== 'recognized' && msg.audioBlob
      );

      console.log(`🎯 Need to transcribe ${untranscribedMessages.length} audio messages`);
      
      let transcriptionCount = 0;
      
      for (let i = 0; i < untranscribedMessages.length; i++) {
        const message = untranscribedMessages[i];
        const progress = `Transcribing audio ${i + 1} of ${untranscribedMessages.length}...`;
        
        this.updateState({ currentStep: progress });
        
        try {
          await this.transcribeAudio(message);
          transcriptionCount++;
        } catch (error) {
          console.warn(`⚠️ Failed to transcribe message ${message.id}:`, error);
          // Continue with other messages
        }
      }

      // Step 3: Collect all text content
      this.updateState({ currentStep: 'Collecting text content...' });
      
      const textContent = await this.collectAllTextContent();
      console.log(`📄 Collected ${textContent.length} characters of text content`);

      if (textContent.trim().length === 0) {
        return {
          success: false,
          error: 'No text content found to generate diagram',
          transcriptionCount,
          totalMessages: audioMessages.length
        };
      }

      // Step 4: Generate Mermaid diagram
      this.updateState({ currentStep: 'Generating Mermaid diagram...' });
      
      const diagramResult = await openAIService.generateMermaidDiagram(textContent, options);

      this.updateState({ isProcessing: false, currentStep: 'Ready' });

      console.log('✅ Pipeline processing completed successfully');
      
      return {
        success: true,
        mermaidCode: diagramResult.mermaidCode,
        title: diagramResult.title,
        transcriptionCount,
        totalMessages: audioMessages.length
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Pipeline processing failed';
      console.error('❌ Pipeline processing failed:', message);
      
      this.updateState({
        isProcessing: false,
        currentStep: 'Processing failed',
        error: message
      });

      return {
        success: false,
        error: message
      };
    }
  }

  /**
   * Collect all text content from messages
   */
  private async collectAllTextContent(): Promise<string> {
    const textParts: string[] = [];

    // Get text messages
    const textMessages = await indexedDBService.getTextMessages();
    for (const message of textMessages) {
      if (message.content?.trim()) {
        textParts.push(message.content);
      }
    }

    // Get transcribed audio messages
    const audioMessages = await indexedDBService.getAudioMessages();
    const transcribedAudio = audioMessages.filter(
      (msg: AudioMessage) => msg.transcriptionStatus === 'recognized' && msg.transcription?.trim()
    );
    
    for (const message of transcribedAudio) {
      if (message.transcription?.trim()) {
        textParts.push(message.transcription);
      }
    }

    // Get image messages with descriptions
    const imageMessages = await indexedDBService.getImageMessages();
    for (const message of imageMessages) {
      if (message.description?.trim()) {
        textParts.push(`Image: ${message.description}`);
      }
    }

    console.log(`📊 Content summary:`, {
      textMessages: textMessages.length,
      transcribedAudio: transcribedAudio.length,
      imageMessages: imageMessages.length,
      totalParts: textParts.length
    });

    return textParts.join('\n\n').trim();
  }

  /**
   * Check if pipeline is ready
   */
  isReady(): boolean {
    return this.isInitialized && simpleSpeechService.isReady();
  }

  /**
   * Cleanup pipeline resources
   */
  cleanup(): void {
    simpleSpeechService.cleanup();
    this.isInitialized = false;
    this.updateState({
      isInitialized: false,
      isProcessing: false,
      currentStep: 'Stopped',
      error: null
    });
    console.log('🧹 Pipeline cleaned up');
  }
}

// Export singleton instance
export const simpleAudioPipeline = new SimpleAudioPipeline();
