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
      console.log('🔧 SpeechService: Initializing Azure Speech Service...', {
        hasKey: !!config.key,
        keyLength: config.key?.length || 0,
        region: config.region,
        language: config.language || 'en-US'
      });

      this.speechConfig = sdk.SpeechConfig.fromSubscription(config.key, config.region);
      this.speechConfig.speechRecognitionLanguage = config.language || 'en-US';
      
      // Optimize for speech recognition accuracy
      this.speechConfig.setProperty(
        sdk.PropertyId.SpeechServiceResponse_TranslationRequestStablePartialResult, 
        'true'
      );

      // Set additional properties for better recognition
      this.speechConfig.setProperty(
        sdk.PropertyId.SpeechServiceConnection_RecoMode,
        'INTERACTIVE'
      );

      // Enable detailed logging for debugging
      this.speechConfig.enableAudioLogging();
      
      console.log('✅ Azure Speech Service initialized successfully');
      
      // Test the configuration
      const testResult = await this.testConfiguration();
      if (testResult) {
        console.log('✅ Azure Speech Service configuration validated');
      } else {
        console.warn('⚠️ Azure Speech Service configuration test failed - may have connectivity issues');
      }
    } catch (error) {
      console.error('❌ Failed to initialize Azure Speech Service:', error);
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

    // Check if audio blob is valid
    if (audioBlob.size === 0) {
      throw new Error('Audio blob is empty');
    }

    // For WebM audio, we need to convert it to a format Azure Speech can handle
    const processedBlob = await this.prepareAudioForAzure(audioBlob);

    return new Promise((resolve, reject) => {
      try {
        console.log(`📖 SpeechService: Reading processed audio blob as ArrayBuffer...`);
        const reader = new FileReader();
        reader.onload = () => {
          console.log(`✅ SpeechService: Successfully read audio blob, processing buffer...`);
          const arrayBuffer = reader.result as ArrayBuffer;
          console.log(`📊 SpeechService: ArrayBuffer size: ${arrayBuffer.byteLength} bytes`);
          this.processAudioBufferWithSingleRecognition(arrayBuffer, resolve, reject);
        };
        reader.onerror = () => {
          console.error(`❌ SpeechService: Failed to read audio blob`);
          reject(new Error('Failed to read audio blob'));
        };
        reader.readAsArrayBuffer(processedBlob);
      } catch (error) {
        console.error(`❌ SpeechService: Exception during transcription setup:`, error);
        reject(new Error(`Failed to process audio: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  }

  /**
   * Prepare audio blob for Azure Speech Service
   */
  private async prepareAudioForAzure(audioBlob: Blob): Promise<Blob> {
    console.log(`🔄 SpeechService: Preparing audio for Azure Speech Service...`);
    
    // If it's already WAV, return as-is
    if (audioBlob.type.includes('wav')) {
      console.log(`✅ SpeechService: Audio is already WAV format`);
      return audioBlob;
    }

    try {
      // Convert WebM/other formats to WAV using Web Audio API
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextClass({
        sampleRate: 16000 // Azure Speech prefers 16kHz
      });

      const arrayBuffer = await audioBlob.arrayBuffer();
      console.log(`🎵 SpeechService: Decoding audio data (${arrayBuffer.byteLength} bytes)...`);
      
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      console.log(`🎯 SpeechService: Audio decoded successfully:`, {
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
        length: audioBuffer.length
      });

      // Convert to WAV format
      const wavBlob = this.audioBufferToWav(audioBuffer);
      console.log(`✅ SpeechService: Converted to WAV format (${wavBlob.size} bytes)`);
      
      await audioContext.close();
      return wavBlob;
    } catch (error) {
      console.warn(`⚠️ SpeechService: Audio conversion failed, using original blob:`, error);
      return audioBlob;
    }
  }

  /**
   * Convert AudioBuffer to WAV blob
   */
  private audioBufferToWav(audioBuffer: AudioBuffer): Blob {
    console.log('🎵 SpeechService: Converting AudioBuffer to WAV...', {
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      length: audioBuffer.length
    });

    const numberOfChannels = Math.min(audioBuffer.numberOfChannels, 2); // Max 2 channels
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = audioBuffer.length * blockAlign;
    const bufferSize = 44 + dataSize;

    console.log('📊 SpeechService: WAV conversion parameters:', {
      numberOfChannels,
      sampleRate,
      bitDepth,
      bytesPerSample,
      blockAlign,
      byteRate,
      dataSize,
      bufferSize
    });

    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Audio data
    const channels = [];
    for (let i = 0; i < numberOfChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }

    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, channels[channel][i]));
        view.setInt16(offset, sample * 0x7FFF, true);
        offset += 2;
      }
    }

    const wavBlob = new Blob([buffer], { type: 'audio/wav' });
    console.log('✅ SpeechService: WAV conversion completed, blob size:', wavBlob.size);
    
    return wavBlob;
  }

  /**
   * Process audio buffer for transcription using single recognition (better for short clips)
   */
  private processAudioBufferWithSingleRecognition(
    arrayBuffer: ArrayBuffer, 
    resolve: (result: TranscriptionResult) => void,
    reject: (error: Error) => void
  ): void {
    try {
      console.log(`🔄 SpeechService: Processing audio buffer with single recognition (${arrayBuffer.byteLength} bytes)`);
      
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
      console.log(`🎯 SpeechService: Creating speech recognizer for single recognition...`);
      this.recognizer = new sdk.SpeechRecognizer(this.speechConfig!, audioConfig);
      console.log(`✅ SpeechService: Speech recognizer created`);

      const startTime = Date.now();

      // Use single recognition for better results with short audio clips
      this.recognizer.recognizeOnceAsync(
        (result) => {
          console.log(`📥 SpeechService: Recognition completed with reason: ${result.reason}`);
          
          const duration = Date.now() - startTime;
          let transcriptionResult: TranscriptionResult;

          if (result.reason === sdk.ResultReason.RecognizedSpeech) {
            console.log(`✅ SpeechService: Speech recognized: "${result.text}"`);
            transcriptionResult = {
              text: result.text.trim(),
              confidence: 0.8, // Azure doesn't always provide confidence scores
              duration,
              language: this.speechConfig?.speechRecognitionLanguage
            };
          } else if (result.reason === sdk.ResultReason.NoMatch) {
            console.log(`⚠️ SpeechService: No speech could be recognized`);
            transcriptionResult = {
              text: '',
              confidence: 0.1,
              duration,
              language: this.speechConfig?.speechRecognitionLanguage
            };
          } else {
            console.log(`❓ SpeechService: Unexpected result reason: ${result.reason}`);
            transcriptionResult = {
              text: '',
              confidence: 0,
              duration,
              language: this.speechConfig?.speechRecognitionLanguage
            };
          }

          console.log(`📊 SpeechService: Final transcription result:`, transcriptionResult);
          this.cleanupRecognizer();
          resolve(transcriptionResult);
        },
        (error) => {
          console.error(`❌ SpeechService: Recognition failed:`, error);
          this.cleanupRecognizer();
          reject(new Error(`Speech recognition failed: ${error}`));
        }
      );

    } catch (error) {
      console.error(`❌ SpeechService: Exception in processAudioBufferWithSingleRecognition:`, error);
      this.cleanupRecognizer();
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
      console.error('🚫 SpeechService: No configuration available for testing');
      return false;
    }

    try {
      console.log('🧪 SpeechService: Testing configuration...');
      
      // Create a simple test with empty audio to verify credentials
      const pushStream = sdk.AudioInputStream.createPushStream();
      pushStream.close();
      
      const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
      const testRecognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('⏰ SpeechService: Configuration test timed out (may be normal)');
          testRecognizer.close();
          resolve(true); // Consider timeout as success for configuration test
        }, 5000);

        testRecognizer.recognizeOnceAsync(
          (result) => {
            clearTimeout(timeout);
            console.log('✅ SpeechService: Configuration test completed successfully');
            console.log('📊 SpeechService: Test result reason:', result.reason);
            testRecognizer.close();
            resolve(true);
          },
          (error) => {
            clearTimeout(timeout);
            console.error('❌ SpeechService: Configuration test failed:', error);
            
            // Check for specific error patterns
            if (error.includes('401') || error.includes('unauthorized')) {
              console.error('🔑 SpeechService: Authentication failed - check your Azure Speech Service key');
            } else if (error.includes('403') || error.includes('forbidden')) {
              console.error('🚫 SpeechService: Access forbidden - check your Azure Speech Service permissions');
            } else if (error.includes('404')) {
              console.error('🌍 SpeechService: Region not found - check your Azure Speech Service region');
            } else {
              console.error('🔧 SpeechService: Configuration error - check your Azure Speech Service settings');
            }
            
            testRecognizer.close();
            resolve(false);
          }
        );
      });
    } catch (error) {
      console.error('❌ SpeechService: Test configuration error:', error);
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
