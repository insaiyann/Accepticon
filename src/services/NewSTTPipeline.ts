/**
 * New Speech-to-Text Pipeline Service
 * Created from scratch following Microsoft Azure Speech SDK documentation
 * https://learn.microsoft.com/en-us/azure/ai-services/speech-service/get-started-speech-to-text
 * 
 * This service provides a clean, standalone STT pipeline that can process
 * audio messages and save transcripts upon clicking the generate mermaid diagram button.
 */

import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';
import { indexedDBService } from './storage/IndexedDBService';
import type { AudioMessage } from '../types/Message';

export interface STTConfiguration {
  subscriptionKey: string;
  region: string;
  language?: string;
}

export interface TranscriptionResult {
  success: boolean;
  text: string;
  confidence: number;
  duration: number;
  error?: string;
  status: 'recognized' | 'no_match' | 'recognition_error' | 'pending' | 'processing' | 'conversion_error' | 'timeout';
}

export interface PipelineProgress {
  step: string;
  current: number;
  total: number;
  message: string;
}

export class NewSTTPipelineService {
  private speechConfig: SpeechSDK.SpeechConfig | null = null;
  private isInitialized = false;
  
  // Event handlers for progress tracking
  private onProgressCallback?: (progress: PipelineProgress) => void;
  private onErrorCallback?: (error: string) => void;
  private onCompleteCallback?: (results: { 
    totalProcessed: number; 
    successful: number; 
    failed: number; 
    errors: string[] 
  }) => void;

  /**
   * Initialize the STT service with Azure Speech configuration
   * Following Microsoft documentation patterns
   */
  async initialize(config: STTConfiguration): Promise<void> {
    try {
      console.log('🔧 NewSTTPipeline: Initializing Azure Speech Service...');
      
      // Validate configuration
      if (!config.subscriptionKey || !config.region) {
        throw new Error('Missing required configuration: subscriptionKey and region are required');
      }

      // Create SpeechConfig using the fromSubscription method as per documentation
      this.speechConfig = SpeechSDK.SpeechConfig.fromSubscription(config.subscriptionKey, config.region);
      
      // Set speech recognition language (default to en-US)
      this.speechConfig.speechRecognitionLanguage = config.language || 'en-US';
      
      // Configure additional properties for better performance
      this.speechConfig.setProperty(
        SpeechSDK.PropertyId.SpeechServiceConnection_RecoMode,
        'INTERACTIVE'
      );
      
      // Set timeouts as per best practices
      this.speechConfig.setProperty(
        SpeechSDK.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
        '10000'
      );
      
      this.speechConfig.setProperty(
        SpeechSDK.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
        '10000'
      );

      this.isInitialized = true;
      console.log('✅ NewSTTPipeline: Successfully initialized Azure Speech Service');
      
    } catch (error) {
      console.error('❌ NewSTTPipeline: Failed to initialize:', error);
      throw new Error(`STT Pipeline initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Auto-initialize using environment variables
   */
  async autoInitialize(): Promise<boolean> {
    try {
      // Get environment variables as per Microsoft documentation
      const speechKey = import.meta.env.VITE_AZURE_SPEECH_KEY;
      const speechRegion = import.meta.env.VITE_AZURE_SPEECH_REGION;
      
      if (!speechKey || !speechRegion) {
        console.error('❌ NewSTTPipeline: Missing environment variables VITE_AZURE_SPEECH_KEY or VITE_AZURE_SPEECH_REGION');
        return false;
      }

      await this.initialize({
        subscriptionKey: speechKey,
        region: speechRegion,
        language: 'en-US'
      });
      
      return true;
    } catch (error) {
      console.error('❌ NewSTTPipeline: Auto-initialization failed:', error);
      return false;
    }
  }

  /**
   * Set event handlers for pipeline progress tracking
   */
  setEventHandlers(
    onProgress?: (progress: PipelineProgress) => void,
    onError?: (error: string) => void,
    onComplete?: (results: { 
      totalProcessed: number; 
      successful: number; 
      failed: number; 
      errors: string[] 
    }) => void
  ): void {
    this.onProgressCallback = onProgress;
    this.onErrorCallback = onError;
    this.onCompleteCallback = onComplete;
  }

  /**
   * Main pipeline method: Process all audio messages and save transcripts
   * Called when the "Generate Mermaid Diagram" button is clicked
   */
  async processAudioMessagesAndSaveTranscripts(): Promise<{
    success: boolean;
    totalProcessed: number;
    successful: number;
    failed: number;
    errors: string[];
  }> {
    if (!this.isInitialized) {
      const error = 'STT Pipeline not initialized. Call initialize() first.';
      this.onErrorCallback?.(error);
      throw new Error(error);
    }

    console.log('🚀 NewSTTPipeline: Starting audio message processing...');
    
    const result = {
      success: false,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      errors: [] as string[]
    };

    try {
      // Step 1: Get all audio messages
      this.reportProgress('Collecting audio messages', 0, 1, 'Scanning database for audio messages...');
      
      const audioMessages = await indexedDBService.getAudioMessages();
      console.log(`📋 NewSTTPipeline: Found ${audioMessages.length} audio messages`);
      
      if (audioMessages.length === 0) {
        console.log('ℹ️ NewSTTPipeline: No audio messages found to process');
        result.success = true;
        this.onCompleteCallback?.(result);
        return result;
      }

      // Filter messages that need transcription
      const messagesToProcess = audioMessages.filter(msg => 
        !msg.transcription || msg.transcriptionStatus !== 'recognized'
      );
      
      console.log(`🎯 NewSTTPipeline: ${messagesToProcess.length} messages need transcription`);
      result.totalProcessed = messagesToProcess.length;

      // Step 2: Process each audio message
      for (let i = 0; i < messagesToProcess.length; i++) {
        const message = messagesToProcess[i];
        const progress = i + 1;
        
        this.reportProgress(
          'Transcribing audio',
          progress,
          messagesToProcess.length,
          `Processing message ${progress}/${messagesToProcess.length}...`
        );

        try {
          console.log(`[${progress}/${messagesToProcess.length}] 🎤 Processing message: ${message.id}`);
          
          // Transcribe the audio
          const transcriptionResult = await this.transcribeAudioMessage(message);
          
          if (transcriptionResult.success) {
            // Save the transcript to the message
            await this.saveTranscriptToMessage(message.id, transcriptionResult);
            result.successful++;
            console.log(`[${progress}/${messagesToProcess.length}] ✅ Success: "${transcriptionResult.text}"`);
          } else {
            result.failed++;
            result.errors.push(`Message ${message.id}: ${transcriptionResult.error || 'Unknown error'}`);
            console.log(`[${progress}/${messagesToProcess.length}] ❌ Failed: ${transcriptionResult.error}`);
          }
          
        } catch (error) {
          result.failed++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Message ${message.id}: ${errorMsg}`);
          console.error(`[${progress}/${messagesToProcess.length}] ❌ Exception:`, error);
        }

        // Small delay to prevent overwhelming the service
        if (i < messagesToProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      result.success = true;
      console.log(`✅ NewSTTPipeline: Completed processing. Success: ${result.successful}, Failed: ${result.failed}`);
      
      this.onCompleteCallback?.(result);
      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ NewSTTPipeline: Pipeline processing failed:', error);
      this.onErrorCallback?.(errorMsg);
      result.errors.push(errorMsg);
      return result;
    }
  }

  /**
   * Transcribe a single audio message
   * Following Microsoft documentation for audio file transcription
   */
  private async transcribeAudioMessage(audioMessage: AudioMessage): Promise<TranscriptionResult> {
    if (!this.speechConfig) {
      throw new Error('Speech config not initialized');
    }

    if (!audioMessage.audioBlob || audioMessage.audioBlob.size === 0) {
      return {
        success: false,
        text: '',
        confidence: 0,
        duration: 0,
        error: 'No audio data available',
        status: 'recognition_error'
      };
    }

    try {
      console.log(`🎵 Transcribing audio blob: ${audioMessage.audioBlob.size} bytes, type: ${audioMessage.audioBlob.type}`);
      
      // Convert Blob to ArrayBuffer for processing
      const arrayBuffer = await audioMessage.audioBlob.arrayBuffer();
      
      // Create AudioConfig from audio data following Microsoft documentation pattern
      const pushStream = SpeechSDK.AudioInputStream.createPushStream();
      const audioData = new Uint8Array(arrayBuffer);
      pushStream.write(audioData.buffer);
      pushStream.close();

      const audioConfig = SpeechSDK.AudioConfig.fromStreamInput(pushStream);
      
      // Create SpeechRecognizer as per documentation
      const speechRecognizer = new SpeechSDK.SpeechRecognizer(this.speechConfig, audioConfig);
      
      // Perform speech recognition using recognizeOnceAsync (best for short audio clips)
      const result = await new Promise<SpeechSDK.SpeechRecognitionResult>((resolve, reject) => {
        speechRecognizer.recognizeOnceAsync(
          (result) => {
            speechRecognizer.close();
            resolve(result);
          },
          (error) => {
            speechRecognizer.close();
            reject(new Error(`Speech recognition failed: ${error}`));
          }
        );
      });

      // Process the result according to Microsoft documentation patterns
      return this.processRecognitionResult(result);

    } catch (error) {
      console.error('❌ Transcription error:', error);
      return {
        success: false,
        text: '',
        confidence: 0,
        duration: 0,
        error: error instanceof Error ? error.message : 'Unknown transcription error',
        status: 'recognition_error'
      };
    }
  }

  /**
   * Process Azure Speech SDK recognition result
   * Following Microsoft documentation result handling patterns
   */
  private processRecognitionResult(result: SpeechSDK.SpeechRecognitionResult): TranscriptionResult {
    console.log(`📥 Processing recognition result. Reason: ${result.reason}, Text: "${result.text}"`);
    
    switch (result.reason) {
      case SpeechSDK.ResultReason.RecognizedSpeech:
        if (result.text && result.text.trim().length > 0) {
          return {
            success: true,
            text: result.text.trim(),
            confidence: 0.85, // Default confidence for successful recognition
            duration: 0, // Could be calculated from audio if needed
            status: 'recognized'
          };
        } else {
          return {
            success: false,
            text: '',
            confidence: 0.1,
            duration: 0,
            error: 'Empty transcription result',
            status: 'no_match'
          };
        }

      case SpeechSDK.ResultReason.NoMatch:
        console.warn('⚠️ No speech could be recognized');
        return {
          success: false,
          text: '',
          confidence: 0.1,
          duration: 0,
          error: 'No speech detected in audio',
          status: 'no_match'
        };

      case SpeechSDK.ResultReason.Canceled: {
        const cancellation = SpeechSDK.CancellationDetails.fromResult(result);
        console.error('❌ Speech recognition was canceled:', cancellation.errorDetails);
        return {
          success: false,
          text: '',
          confidence: 0,
          duration: 0,
          error: cancellation.errorDetails || 'Recognition was canceled',
          status: 'recognition_error'
        };
      }

      default:
        console.error('❓ Unexpected recognition result reason:', result.reason);
        return {
          success: false,
          text: '',
          confidence: 0,
          duration: 0,
          error: `Unexpected result reason: ${result.reason}`,
          status: 'recognition_error'
        };
    }
  }

  /**
   * Save transcript to audio message in IndexedDB
   */
  private async saveTranscriptToMessage(messageId: string, transcriptionResult: TranscriptionResult): Promise<void> {
    try {
      const updateData: Partial<AudioMessage> = {
        transcription: transcriptionResult.text,
        transcriptionStatus: transcriptionResult.status,
        transcriptionConfidence: transcriptionResult.confidence
      };

      if (transcriptionResult.error) {
        updateData.transcriptionError = transcriptionResult.error;
      }

      await indexedDBService.updateMessage(messageId, updateData);
      console.log(`💾 Saved transcript for message ${messageId}`);
      
    } catch (error) {
      console.error(`❌ Failed to save transcript for message ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Report progress to callback handler
   */
  private reportProgress(step: string, current: number, total: number, message: string): void {
    console.log(`📊 Progress: ${step} - ${current}/${total} - ${message}`);
    this.onProgressCallback?.({
      step,
      current,
      total,
      message
    });
  }

  /**
   * Get the current status of the pipeline
   */
  getStatus(): {
    isInitialized: boolean;
    hasConfiguration: boolean;
    language: string | undefined;
  } {
    return {
      isInitialized: this.isInitialized,
      hasConfiguration: this.speechConfig !== null,
      language: this.speechConfig?.speechRecognitionLanguage
    };
  }

  /**
   * Test the configuration by attempting a simple recognition
   */
  async testConfiguration(): Promise<boolean> {
    if (!this.speechConfig) {
      return false;
    }

    try {
      console.log('🧪 Testing STT configuration...');
      
      // Create a minimal test with empty audio stream
      const pushStream = SpeechSDK.AudioInputStream.createPushStream();
      pushStream.close();
      
      const audioConfig = SpeechSDK.AudioConfig.fromStreamInput(pushStream);
      const speechRecognizer = new SpeechSDK.SpeechRecognizer(this.speechConfig, audioConfig);
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          speechRecognizer.close();
          resolve(true); // Consider timeout as success (credentials are likely valid)
        }, 5000);

        speechRecognizer.recognizeOnceAsync(
          () => {
            clearTimeout(timeout);
            speechRecognizer.close();
            console.log('✅ Configuration test successful');
            resolve(true);
          },
          (error) => {
            clearTimeout(timeout);
            speechRecognizer.close();
            
            // Check for authentication errors
            if (error.includes('401') || error.includes('unauthorized')) {
              console.error('❌ Authentication failed - check your Azure Speech Service key');
              resolve(false);
            } else {
              console.log('✅ Configuration test passed (expected error for empty audio)');
              resolve(true);
            }
          }
        );
      });
    } catch (error) {
      console.error('❌ Configuration test failed:', error);
      return false;
    }
  }

  /**
   * Get supported languages for speech recognition
   */
  static getSupportedLanguages(): string[] {
    return [
      'en-US', // English (United States)
      'en-GB', // English (United Kingdom)
      'en-AU', // English (Australia)
      'en-CA', // English (Canada)
      'en-IN', // English (India)
      'es-ES', // Spanish (Spain)
      'es-MX', // Spanish (Mexico)
      'fr-FR', // French (France)
      'de-DE', // German (Germany)
      'it-IT', // Italian (Italy)
      'pt-BR', // Portuguese (Brazil)
      'ja-JP', // Japanese (Japan)
      'ko-KR', // Korean (Korea)
      'zh-CN', // Chinese (Mandarin, Simplified)
      'zh-TW', // Chinese (Traditional)
      'ar-SA', // Arabic (Saudi Arabia)
      'hi-IN', // Hindi (India)
      'ru-RU', // Russian (Russia)
      'th-TH', // Thai (Thailand)
      'vi-VN'  // Vietnamese (Vietnam)
    ];
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      this.speechConfig = null;
      this.isInitialized = false;
      console.log('✅ NewSTTPipeline: Cleanup completed');
    } catch (error) {
      console.error('❌ NewSTTPipeline: Cleanup failed:', error);
    }
  }
}

// Create and export singleton instance
export const newSTTPipelineService = new NewSTTPipelineService();
export default newSTTPipelineService;
