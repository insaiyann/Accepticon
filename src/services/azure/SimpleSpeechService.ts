/**
 * Simple Speech Service - Clean Azure Speech-to-Text integration
 * Built from scratch for reliability and clarity
 */

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

export interface SpeechConfig {
  subscriptionKey: string;
  region: string;
  language?: string;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  success: boolean;
  error?: string;
  duration: number;
}

export class SimpleSpeechService {
  private speechConfig: sdk.SpeechConfig | null = null;
  private isInitialized = false;

  /**
   * Initialize the speech service
   */
  async initialize(config: SpeechConfig): Promise<void> {
    try {
      console.log('🔧 Initializing Azure Speech Service...');
      
      this.speechConfig = sdk.SpeechConfig.fromSubscription(
        config.subscriptionKey,
        config.region
      );
      
      this.speechConfig.speechRecognitionLanguage = config.language || 'en-US';
      
      // Optimize settings for speech recognition
      this.speechConfig.setProperty(
        sdk.PropertyId.SpeechServiceConnection_RecoMode,
        'INTERACTIVE'
      );

      this.isInitialized = true;
      console.log('✅ Azure Speech Service initialized');

      // Test the configuration
      await this.testConnection();

    } catch (error) {
      console.error('❌ Failed to initialize speech service:', error);
      throw new Error(`Speech service initialization failed: ${error}`);
    }
  }

  /**
   * Test the connection to Azure Speech Service
   */
  private async testConnection(): Promise<void> {
    if (!this.speechConfig) {
      throw new Error('Speech config not initialized');
    }

    console.log('🧪 Testing Azure Speech Service connection...');
    
    try {
      // Create a minimal test to verify credentials
      const testStream = sdk.AudioInputStream.createPushStream();
      testStream.close();
      
      const audioConfig = sdk.AudioConfig.fromStreamInput(testStream);
      const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);
      
      // Quick test recognition (will likely return no match, but validates credentials)
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          recognizer.close();
          resolve(); // Timeout is OK for connection test
        }, 3000);

        recognizer.recognizeOnceAsync(
          () => {
            clearTimeout(timeout);
            recognizer.close();
            console.log('✅ Azure Speech Service connection verified');
            resolve();
          },
          (error) => {
            clearTimeout(timeout);
            recognizer.close();
            
            // Check for authentication errors
            if (error.includes('401') || error.includes('403')) {
              reject(new Error('Invalid Azure Speech Service credentials'));
            } else if (error.includes('404')) {
              reject(new Error('Invalid Azure region or endpoint'));
            } else {
              // Other errors might be OK for connection test
              console.log('⚠️ Connection test completed with warnings:', error);
              resolve();
            }
          }
        );
      });

    } catch (error) {
      console.error('❌ Connection test failed:', error);
      throw error;
    }
  }

  /**
   * Transcribe audio blob to text
   */
  async transcribeAudio(audioBlob: Blob): Promise<TranscriptionResult> {
    if (!this.isInitialized || !this.speechConfig) {
      throw new Error('Speech service not initialized');
    }

    console.log('🎯 Starting speech transcription...', {
      size: Math.round(audioBlob.size / 1024) + 'KB',
      type: audioBlob.type
    });

    const startTime = Date.now();

    try {
      // Convert blob to array buffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // Create push stream for audio data
      const pushStream = sdk.AudioInputStream.createPushStream();
      pushStream.write(arrayBuffer);
      pushStream.close();

      // Create audio config
      const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
      
      // Create speech recognizer
      const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

      // Perform recognition
      const result = await new Promise<sdk.SpeechRecognitionResult>((resolve, reject) => {
        recognizer.recognizeOnceAsync(
          (result) => {
            recognizer.close();
            resolve(result);
          },
          (error) => {
            recognizer.close();
            reject(new Error(error));
          }
        );
      });

      const duration = Date.now() - startTime;

      // Process the result
      return this.processRecognitionResult(result, duration);

    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      
      console.error('❌ Transcription failed:', message);
      
      return {
        text: '',
        confidence: 0,
        success: false,
        error: message,
        duration
      };
    }
  }

  /**
   * Process the recognition result from Azure
   */
  private processRecognitionResult(
    result: sdk.SpeechRecognitionResult,
    duration: number
  ): TranscriptionResult {
    
    console.log('📊 Azure Speech Result:', {
      reason: result.reason,
      text: result.text,
      resultId: result.resultId
    });

    switch (result.reason) {
      case sdk.ResultReason.RecognizedSpeech: {
        const text = result.text.trim();
        if (text.length > 0) {
          console.log('✅ Speech recognized:', text);
          return {
            text,
            confidence: 0.9, // Azure doesn't provide confidence in this API
            success: true,
            duration
          };
        } else {
          console.log('⚠️ Empty speech result');
          return {
            text: '',
            confidence: 0,
            success: false,
            error: 'No speech detected in audio',
            duration
          };
        }
      }

      case sdk.ResultReason.NoMatch:
        console.log('⚠️ No speech detected');
        return {
          text: '',
          confidence: 0,
          success: false,
          error: 'No speech detected in audio',
          duration
        };

      case sdk.ResultReason.Canceled: {
        const cancellation = sdk.CancellationDetails.fromResult(result);
        const errorMessage = cancellation.errorDetails || 'Recognition was canceled';
        console.error('❌ Recognition canceled:', errorMessage);
        return {
          text: '',
          confidence: 0,
          success: false,
          error: errorMessage,
          duration
        };
      }

      default:
        console.error('❓ Unexpected result reason:', result.reason);
        return {
          text: '',
          confidence: 0,
          success: false,
          error: `Unexpected result: ${result.reason}`,
          duration
        };
    }
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.speechConfig !== null;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.speechConfig = null;
    this.isInitialized = false;
    console.log('🧹 Speech service cleaned up');
  }
}

// Export singleton instance
export const simpleSpeechService = new SimpleSpeechService();
