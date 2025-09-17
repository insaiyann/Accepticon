/**
 * Simple Audio Pipeline - Compatibility layer for the new STT pipeline
 * This is a minimal implementation that forwards to the new STT pipeline
 */

// Removed dependency on previous NewSTTPipeline (deleted) – will use MinimalSTTService
import { minimalSTTService } from './MinimalSTTService';
import { simpleAudioRecorder } from './audio/SimpleAudioRecorder';
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
  error?: string;
  mermaidCode?: string;
  totalMessages?: number;
  transcriptionCount?: number;
}

export interface PipelineState {
  isInitialized: boolean;
  isProcessing: boolean;
  currentStep: string;
  error: string | null;
}

/**
 * Simple Audio Pipeline - Compatibility wrapper for new STT pipeline
 */
export class SimpleAudioPipeline {
  private isInitialized = false;
  // Support multiple subscribers (multiple components using the hook)
  private stateChangeCallbacks: Set<(state: PipelineState) => void> = new Set();

  /**
   * Set callback for state changes
   */
  setStateChangeCallback(callback: (state: PipelineState) => void): void {
    this.stateChangeCallbacks.add(callback);
  }

  /**
   * Remove a previously registered callback
   */
  removeStateChangeCallback(callback: (state: PipelineState) => void): void {
    this.stateChangeCallbacks.delete(callback);
  }

  /**
   * Update state and notify callback
   */
  private updateState(state: Partial<PipelineState>): void {
    const currentState: PipelineState = {
      isInitialized: this.isInitialized,
      isProcessing: false,
      currentStep: 'Ready',
      error: null,
      ...state
    };
    this.stateChangeCallbacks.forEach(cb => {
  try { cb(currentState); } catch { /* swallow callback errors */ }
    });
  }

  /**
   * Initialize the pipeline
   */
  async initialize(config: PipelineConfig): Promise<void> {
    try {
      this.updateState({ isProcessing: true, currentStep: 'Initializing...' });

  // Initialize minimal STT service
  const sttSuccess = await minimalSTTService.autoInitialize();
      if (!sttSuccess) {
        throw new Error('Failed to initialize STT pipeline');
      }

      // Initialize OpenAI service
      await openAIService.initialize({
        apiKey: config.azureOpenAIKey,
        endpoint: config.azureOpenAIEndpoint,
        deploymentName: config.azureOpenAIDeployment,
        apiVersion: '2024-02-01'
      });

      this.isInitialized = true;
      this.updateState({ 
        isInitialized: true, 
        isProcessing: false, 
        currentStep: 'Ready' 
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Initialization failed';
      this.updateState({ 
        isInitialized: false, 
        isProcessing: false, 
        error: message 
      });
      throw error;
    }
  }

  /**
   * Auto-initialize from environment variables
   */
  async autoInitialize(): Promise<boolean> {
    try {
      // Avoid re-initializing if already done
      if (this.isInitialized) {
        this.updateState({ isInitialized: true, currentStep: 'Ready' });
        return true;
      }
      const speechKey = import.meta.env.VITE_AZURE_SPEECH_KEY;
      const speechRegion = import.meta.env.VITE_AZURE_SPEECH_REGION;
      const openaiKey = import.meta.env.VITE_AZURE_OPENAI_KEY;
      const openaiEndpoint = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT;
      const openaiDeployment = import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT;

      if (!speechKey || !speechRegion || !openaiKey || !openaiEndpoint || !openaiDeployment) {
        // Explicitly surface a non-initialized state so the UI can show a failure instead of an endless "Initializing" message
        this.updateState({
          isInitialized: false,
          isProcessing: false,
          currentStep: 'Configuration missing',
          error: 'Missing Azure configuration. Open settings and provide required credentials.'
        });
        return false;
      }

      await this.initialize({
        azureSpeechKey: speechKey,
        azureSpeechRegion: speechRegion,
        azureOpenAIKey: openaiKey,
        azureOpenAIEndpoint: openaiEndpoint,
        azureOpenAIDeployment: openaiDeployment
      });

      return true;
    } catch (error) {
      // Ensure UI reflects failure state (avoid perpetual initializing message)
      this.updateState({
        isInitialized: false,
        isProcessing: false,
        currentStep: 'Initialization failed',
        error: error instanceof Error ? error.message : 'Auto-initialization failed'
      });
      return false;
    }
  }

  /**
   * Process all audio messages and generate Mermaid diagram
   */
  async processAllAndGenerateMermaid(options: MermaidGenerationOptions = {}): Promise<PipelineResult> {
    if (!this.isInitialized) {
      throw new Error('Pipeline not initialized');
    }

    try {
      this.updateState({ isProcessing: true, currentStep: 'Processing audio messages...' });

      // Step 1: Process audio with new STT pipeline
      const sttResult = await minimalSTTService.transcribeAllAudioMessages();
      if (!sttResult.success) {
        throw new Error('STT processing failed');
      }

      this.updateState({ currentStep: 'Collecting messages...' });

      // Step 2: Collect all messages and generate content
      const audioMessages = await indexedDBService.getAudioMessages();
      const allMessages = await indexedDBService.getAllMessages();

      const textParts: string[] = [];

      // Add text messages
      const textMessages = allMessages.filter(m => m.type === 'text');
      textMessages.forEach(msg => textParts.push(msg.content));

      // Add transcribed audio
      const transcribedAudio = audioMessages.filter(m => m.transcription?.trim());
      transcribedAudio.forEach(msg => textParts.push(`Audio: ${msg.transcription}`));

      // Add image descriptions
      const imageMessages = allMessages.filter(m => m.type === 'image');
      imageMessages.forEach(msg => {
        if (msg.description?.trim()) {
          textParts.push(`Image: ${msg.description}`);
        }
      });

      if (textParts.length === 0) {
        throw new Error('No content found to generate diagram');
      }

      this.updateState({ currentStep: 'Generating Mermaid diagram...' });

      // Step 3: Generate Mermaid diagram
      const content = textParts.join('\n\n').trim();
      const result = await openAIService.generateMermaidDiagram(content, options);

      this.updateState({ 
        isProcessing: false, 
        currentStep: 'Completed' 
      });

      return {
        success: true,
        mermaidCode: result.mermaidCode,
        totalMessages: allMessages.length,
        transcriptionCount: transcribedAudio.length
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Processing failed';
      
      this.updateState({ 
        isProcessing: false, 
        error: message 
      });

      return {
        success: false,
        error: message
      };
    }
  }

  /**
   * Record audio (delegated to audio recorder)
   * Note: This is a simplified interface. Real recording requires start/stop pattern.
   */
  async recordAudio(): Promise<void> {
    await simpleAudioRecorder.startRecording();
  }

  /**
   * Stop audio recording and return result
   */
  async stopRecording(): Promise<AudioMessage> {
    const result = await simpleAudioRecorder.stopRecording();
    
    // Create AudioMessage from recording result
    const audioMessage = await indexedDBService.addAudioMessage({
      type: 'audio',
      content: '',
      timestamp: Date.now(),
      processed: false,
      audioBlob: result.audioBlob,
      duration: result.duration,
      transcription: '',
      transcriptionStatus: 'pending'
    });
    
    return audioMessage;
  }

  /**
   * Check if pipeline is ready
   */
  isReady(): boolean {
  return this.isInitialized && minimalSTTService.getStatus().isInitialized;
  }

  /**
   * Cleanup pipeline resources
   */
  cleanup(): void {
    this.isInitialized = false;
    this.updateState({
      isInitialized: false,
      isProcessing: false,
      currentStep: 'Stopped',
      error: null
    });
  }
}

// Export singleton instance
export const simpleAudioPipeline = new SimpleAudioPipeline();
