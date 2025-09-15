import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

export interface SpeechConfig {
  key: string;
  region: string;
  language?: string;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  duration: number;
  language?: string;
}

export interface SpeechError {
  code: string;
  message: string;
  details?: string;
}

class AzureSpeechService {
  private speechConfig: sdk.SpeechConfig | null = null;
  private recognizer: sdk.SpeechRecognizer | null = null;

  /**
   * Initialize the Speech service with configuration
   */
  async initialize(config: SpeechConfig): Promise<void> {
    try {
      this.speechConfig = sdk.SpeechConfig.fromSubscription(config.key, config.region);
      this.speechConfig.speechRecognitionLanguage = config.language || 'en-US';
      
      // Optimize for speech recognition accuracy
      this.speechConfig.setProperty(
        sdk.PropertyId.SpeechServiceResponse_TranslationRequestStablePartialResult, 
        'true'
      );
      
      console.log('Azure Speech Service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Azure Speech Service:', error);
      throw new Error(`Speech service initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return this.speechConfig !== null;
  }

  /**
   * Convert audio blob to text using Azure Speech-to-Text
   */
  async transcribeAudio(audioBlob: Blob): Promise<TranscriptionResult> {
    if (!this.speechConfig) {
      throw new Error('Speech service not initialized. Call initialize() first.');
    }

    console.log(`🎙️ SpeechService: Starting transcription of audio blob:`, {
      size: audioBlob.size,
      type: audioBlob.type,
      configExists: !!this.speechConfig
    });

    return new Promise((resolve, reject) => {
      try {
        console.log(`📖 SpeechService: Reading audio blob as ArrayBuffer...`);
        // Convert blob to ArrayBuffer
        const reader = new FileReader();
        reader.onload = () => {
          console.log(`✅ SpeechService: Successfully read audio blob, processing buffer...`);
          const arrayBuffer = reader.result as ArrayBuffer;
          console.log(`📊 SpeechService: ArrayBuffer size: ${arrayBuffer.byteLength} bytes`);
          this.processAudioBuffer(arrayBuffer, resolve, reject);
        };
        reader.onerror = () => {
          console.error(`❌ SpeechService: Failed to read audio blob`);
          reject(new Error('Failed to read audio blob'));
        };
        reader.readAsArrayBuffer(audioBlob);
      } catch (error) {
        console.error(`❌ SpeechService: Exception during transcription setup:`, error);
        reject(new Error(`Failed to process audio: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  }

  /**
   * Process audio buffer for transcription
   */
  private processAudioBuffer(
    arrayBuffer: ArrayBuffer, 
    resolve: (result: TranscriptionResult) => void,
    reject: (error: Error) => void
  ): void {
    try {
      console.log(`🔄 SpeechService: Processing audio buffer of size ${arrayBuffer.byteLength} bytes`);
      
      // Create audio config from array buffer
      const pushStream = sdk.AudioInputStream.createPushStream();
      const audioData = new Uint8Array(arrayBuffer);
      console.log(`📤 SpeechService: Writing audio data to push stream...`);
      pushStream.write(audioData.buffer);
      pushStream.close();
      console.log(`✅ SpeechService: Audio stream created and closed`);

      const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
      console.log(`🔧 SpeechService: Audio config created`);
      
      // Create recognizer
      console.log(`🎯 SpeechService: Creating speech recognizer...`);
      this.recognizer = new sdk.SpeechRecognizer(this.speechConfig!, audioConfig);
      console.log(`✅ SpeechService: Speech recognizer created`);

      let transcriptionText = '';
      let confidence = 0;
      const startTime = Date.now();

      // Handle recognition events
      this.recognizer.recognizing = (_, e) => {
        console.log('Recognizing:', e.result.text);
      };

      this.recognizer.recognized = (_, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
          transcriptionText += e.result.text + ' ';
          // Note: Azure Speech SDK doesn't always provide confidence scores
          // We'll use a default confidence based on result quality
          confidence = e.result.text.length > 0 ? 0.8 : 0.1;
          console.log('Recognized:', e.result.text);
        } else if (e.result.reason === sdk.ResultReason.NoMatch) {
          console.log('No speech could be recognized');
        }
      };

      this.recognizer.canceled = (_, e) => {
        console.log('Speech recognition canceled:', e.reason);
        
        if (e.reason === sdk.CancellationReason.Error) {
          const error: SpeechError = {
            code: e.errorCode.toString(),
            message: e.errorDetails,
            details: `Error during speech recognition: ${e.errorDetails}`
          };
          reject(new Error(`Speech recognition error: ${error.message}`));
        } else {
          // Cancellation due to other reasons (like end of stream)
          const duration = Date.now() - startTime;
          const result: TranscriptionResult = {
            text: transcriptionText.trim(),
            confidence,
            duration,
            language: this.speechConfig?.speechRecognitionLanguage
          };
          resolve(result);
        }
        
        this.cleanupRecognizer();
      };

      this.recognizer.sessionStopped = () => {
        console.log('Speech recognition session stopped');
        const duration = Date.now() - startTime;
        const result: TranscriptionResult = {
          text: transcriptionText.trim(),
          confidence,
          duration,
          language: this.speechConfig?.speechRecognitionLanguage
        };
        resolve(result);
        this.cleanupRecognizer();
      };

      // Start continuous recognition
      this.recognizer.startContinuousRecognitionAsync(
        () => {
          console.log('Speech recognition started');
        },
        (error) => {
          console.error('Failed to start speech recognition:', error);
          reject(new Error(`Failed to start recognition: ${error}`));
          this.cleanupRecognizer();
        }
      );

      // Stop recognition after a reasonable timeout (30 seconds)
      setTimeout(() => {
        if (this.recognizer) {
          this.recognizer.stopContinuousRecognitionAsync();
        }
      }, 30000);

    } catch (error) {
      reject(new Error(`Audio processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  /**
   * Transcribe multiple audio files in batch
   */
  async transcribeAudioBatch(audioBlobs: Blob[]): Promise<TranscriptionResult[]> {
    const results: TranscriptionResult[] = [];
    
    for (const blob of audioBlobs) {
      try {
        const result = await this.transcribeAudio(blob);
        results.push(result);
        
        // Add a small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error('Failed to transcribe audio in batch:', error);
        // Add empty result for failed transcription
        results.push({
          text: '',
          confidence: 0,
          duration: 0
        });
      }
    }
    
    return results;
  }

  /**
   * Test the speech service configuration
   */
  async testConfiguration(): Promise<boolean> {
    if (!this.speechConfig) {
      return false;
    }

    try {
      // Create a simple test with empty audio to verify credentials
      const pushStream = sdk.AudioInputStream.createPushStream();
      pushStream.close();
      
      const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
      const testRecognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);
      
      return new Promise((resolve) => {
        testRecognizer.recognizeOnceAsync(
          () => {
            testRecognizer.close();
            resolve(true);
          },
          (error) => {
            console.error('Speech service test failed:', error);
            testRecognizer.close();
            resolve(false);
          }
        );
      });
    } catch (error) {
      console.error('Speech service test error:', error);
      return false;
    }
  }

  /**
   * Cleanup recognizer resources
   */
  private cleanupRecognizer(): void {
    if (this.recognizer) {
      this.recognizer.close();
      this.recognizer = null;
    }
  }

  /**
   * Get supported languages for speech recognition
   */
  static getSupportedLanguages(): string[] {
    return [
      'en-US', 'en-GB', 'en-AU', 'en-CA', 'en-IN',
      'es-ES', 'es-MX', 'fr-FR', 'de-DE', 'it-IT',
      'pt-BR', 'ja-JP', 'ko-KR', 'zh-CN', 'zh-TW'
    ];
  }

  /**
   * Get service status
   */
  getStatus(): {
    isInitialized: boolean;
    hasConfig: boolean;
    hasRecognizer: boolean;
  } {
    return {
      isInitialized: this.speechConfig !== null,
      hasConfig: this.speechConfig !== null,
      hasRecognizer: this.recognizer !== null
    };
  }

  /**
   * Cleanup resources (alias for dispose)
   */
  async cleanup(): Promise<void> {
    this.dispose();
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.cleanupRecognizer();
    this.speechConfig = null;
  }
}

// Create and configure singleton instance
const createAzureSpeechService = (): AzureSpeechService => {
  const service = new AzureSpeechService();
  
  // Initialize with environment variables if available
  const speechKey = import.meta.env.VITE_AZURE_SPEECH_KEY;
  const speechRegion = import.meta.env.VITE_AZURE_SPEECH_REGION;
  
  if (speechKey && speechRegion) {
    try {
      service.initialize({
        key: speechKey,
        region: speechRegion,
        language: 'en-US'
      });
    } catch (error) {
      console.warn('Failed to auto-initialize Azure Speech Service:', error);
    }
  }
  
  return service;
};

export const azureSpeechService = createAzureSpeechService();
export default azureSpeechService;
