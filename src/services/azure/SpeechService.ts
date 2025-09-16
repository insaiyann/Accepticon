import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import type { TranscriptionStatus } from '../../types/Message';

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
  status: TranscriptionStatus;
  error?: string;
  originalFormat?: string;
  convertedFormat?: string;
  metadata?: Record<string, unknown>;
}

export interface SpeechError {
  code: string;
  message: string;
  details?: string;
}

export class ConversionError extends Error {
  name = 'ConversionError';
  originalFormat: string;

  constructor(message: string, originalFormat: string) {
    super(message);
    this.originalFormat = originalFormat;
    Object.setPrototypeOf(this, ConversionError.prototype);
  }
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
      
      // Configure for better WebSocket stability and connection management
      this.speechConfig.setProperty(
        sdk.PropertyId.SpeechServiceConnection_RecoMode,
        'INTERACTIVE'
      );

      // Disable audio logging to prevent WebSocket issues and improve security
      // this.speechConfig.enableAudioLogging(); // Commented out - can cause connection issues

      // Set connection timeout and retry policies
      this.speechConfig.setProperty(
        sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
        '10000'
      );

      this.speechConfig.setProperty(
        sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
        '10000'
      );

      // Configure WebSocket connection properties for better reliability
      // Note: EnableCompression property not available in this SDK version
      
      // Set profanity filter and other recognition settings
      this.speechConfig.setProperty(
        sdk.PropertyId.SpeechServiceResponse_ProfanityOption,
        'Masked'
      );

      // Improve connection stability with proper endpoint configuration
      this.speechConfig.setProperty(
        sdk.PropertyId.SpeechServiceConnection_Url,
        `wss://${config.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`
      );
      
      console.log('✅ Azure Speech Service initialized successfully');
      
      // Test network connectivity first
      const networkOk = await this.checkNetworkConnectivity();
      if (!networkOk) {
        console.warn('⚠️ Network connectivity test failed - WebSocket connections may fail');
      }
      
      // Test the configuration
      const testResult = await this.testConfiguration();
      if (testResult) {
        console.log('✅ Azure Speech Service configuration validated');
      } else {
        console.warn('⚠️ Azure Speech Service configuration test failed - proceeding with caution');
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
   * Now supports direct WebM processing without conversion to avoid data corruption
   * Enhanced with retry logic for WebSocket connection failures
   */
  async transcribeAudio(audioBlob: Blob): Promise<TranscriptionResult> {
    if (!this.speechConfig) {
      throw new Error('Speech service not initialized. Call initialize() first.');
    }

    console.log(`[STT] Starting transcription of audio blob:`, {
      size: audioBlob.size,
      type: audioBlob.type,
      configExists: !!this.speechConfig
    });

    if (audioBlob.size === 0) {
      throw new Error('Audio blob is empty');
    }

    const originalFormat = audioBlob.type;
    
    // Use retry logic for WebSocket connection issues
    return this.transcribeWithRetry(audioBlob, originalFormat, 3);
  }

  /**
   * Transcribe with retry logic to handle WebSocket connection failures
   */
  private async transcribeWithRetry(audioBlob: Blob, originalFormat: string, maxRetries: number): Promise<TranscriptionResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[STT] Transcription attempt ${attempt}/${maxRetries}`);
        
        // Check if we can use the audio directly without conversion
        const canUseDirectly = this.canUseAudioDirectly(audioBlob.type);
        
        if (canUseDirectly) {
          console.log(`[STT] ✅ Using audio directly without conversion (${audioBlob.type})`);
          return await this.transcribeAudioDirect(audioBlob, originalFormat);
        } else {
          console.log(`[STT] 🔄 Converting audio from ${audioBlob.type} to supported format`);
          // Only convert if absolutely necessary
          const convertedBlob = await this.prepareAudioForAzure(audioBlob);
          return await this.transcribeAudioDirect(convertedBlob, originalFormat, convertedBlob.type);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.warn(`[STT] Attempt ${attempt} failed:`, lastError.message);
        
        // Check if this is a WebSocket connection error
        if (this.isWebSocketError(error)) {
          console.log(`[STT] WebSocket connection error detected, retrying...`);
          
          // Clean up any existing recognizer before retry
          this.cleanupRecognizer();
          
          // Wait before retry with exponential backoff
          if (attempt < maxRetries) {
            const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            console.log(`[STT] Waiting ${delayMs}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        } else {
          // Non-WebSocket errors should not be retried
          console.error(`[STT] Non-recoverable error, not retrying:`, error);
          break;
        }
      }
    }
    
    // All retries failed
    console.error(`[STT] All ${maxRetries} transcription attempts failed`);
    throw lastError || new Error('Transcription failed after all retries');
  }

  /**
   * Check if an error is related to WebSocket connectivity issues
   */
  private isWebSocketError(error: unknown): boolean {
    if (!error) return false;
    
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    
    return errorMessage.includes('websocket') ||
           errorMessage.includes('connection') ||
           errorMessage.includes('network') ||
           errorMessage.includes('failed to fetch') ||
           errorMessage.includes('speech recognition failed') ||
           errorMessage.includes('timeout') ||
           errorMessage.includes('1006'); // WebSocket close code for abnormal closure
  }

  /**
   * Check if audio format can be used directly with Azure Speech Service
   * (Public method for external access and debugging)
   */
  canUseAudioDirectly(mimeType: string): boolean {
    // Azure Speech Service supported formats (based on official documentation)
    const supportedFormats = [
      'audio/wav',           // WAV/PCM
      'audio/webm',          // WebM (Opus/Vorbis)
      'audio/ogg',           // OGG (Opus/Vorbis)
      'audio/mp3',           // MP3
      'audio/mpeg',          // MPEG audio
      'audio/flac',          // FLAC
      'audio/aac',           // AAC
      'audio/x-wav',         // Alternative WAV MIME
      'audio/x-ms-wma'       // WMA
    ];
    
    // Check if the MIME type is directly supported
    const isSupported = supportedFormats.some(format => mimeType.includes(format.split('/')[1]));
    
    console.log(`[STT] Format compatibility check: ${mimeType} -> ${isSupported ? 'SUPPORTED' : 'NEEDS_CONVERSION'}`);
    
    return isSupported;
  }

  /**
   * Transcribe audio directly without format conversion
   */
  private async transcribeAudioDirect(
    audioBlob: Blob, 
    originalFormat: string, 
    currentFormat?: string
  ): Promise<TranscriptionResult> {
    console.log(`[STT] Direct transcription starting...`);
    
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => {
          console.log(`[STT] Audio data loaded, sending to Azure...`);
          const arrayBuffer = reader.result as ArrayBuffer;
          console.log(`[STT] ArrayBuffer size: ${arrayBuffer.byteLength} bytes`);
          
          this.processAudioBufferWithSingleRecognition(
            arrayBuffer,
            originalFormat,
            currentFormat,
            resolve,
            reject
          );
        };
        reader.onerror = () => {
          console.error(`[STT] Failed to read audio blob`);
          reject(new Error('Failed to read audio blob'));
        };
        reader.readAsArrayBuffer(audioBlob);
      } catch (error) {
        console.error(`[STT] Exception during direct transcription:`, error);
        reject(new Error(`Failed to process audio: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  }

  /**
   * Prepare audio blob for Azure Speech Service
   */
  private async prepareAudioForAzure(audioBlob: Blob): Promise<Blob> {
    console.debug(`[STT] Starting audio conversion for format: ${audioBlob.type}`);
    
    // If it's already WAV, validate and return
    if (audioBlob.type.includes('wav')) {
      console.log(`[STT] Audio is already WAV format`);
      const validatedBlob = await this.validateAndEnhanceWavAudio(audioBlob);
      return validatedBlob;
    }

    try {
      // Convert WebM/other formats to WAV using Web Audio API (normalize: mono 16k)
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextClass();

      const arrayBuffer = await audioBlob.arrayBuffer();
      console.debug(`[STT] Decoding audio data (${arrayBuffer.byteLength} bytes)...`);
      const decoded = await audioContext.decodeAudioData(arrayBuffer);
      console.log(`[STT] Audio decoded successfully:`, {
        duration: decoded.duration,
        sampleRate: decoded.sampleRate,
        channels: decoded.numberOfChannels,
        length: decoded.length
      });

      // Validate audio has sufficient duration for speech recognition
      if (decoded.duration < 1.0) {
        console.warn(`[STT] ⚠️ Audio duration (${decoded.duration}s) is very short, may cause no_match`);
      }

      // Check for audio content (not just silence)
      const audioLevel = this.calculateAudioLevel(decoded);
      console.log(`[STT] Audio level analysis:`, audioLevel);
      
      if (audioLevel.averageLevel < 0.001) {
        console.warn(`[STT] ⚠️ Very low audio level detected (${audioLevel.averageLevel.toFixed(6)}), likely silence`);
      }

      // Resample + downmix to mono @16k using OfflineAudioContext directly (more stable)
      const targetSampleRate = 16000;
      const offlineCtx = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetSampleRate), targetSampleRate);
      const src = offlineCtx.createBufferSource();
      src.buffer = decoded; // let engine handle channel mix + resample
      src.connect(offlineCtx.destination);
      src.start(0);
      const rendered = await offlineCtx.startRendering();
      console.log(`[STT] 🔄 Resampled audio:`, {
        duration: rendered.duration,
        sampleRate: rendered.sampleRate,
        channels: rendered.numberOfChannels,
        length: rendered.length
      });

      // Enhanced normalization with better peak detection
      const normData = rendered.getChannelData(0);
      let peak = 0;
      let rms = 0;
      
      for (let i = 0; i < normData.length; i++) {
        const v = Math.abs(normData[i]);
        if (v > peak) peak = v;
        rms += v * v;
      }
      
      rms = Math.sqrt(rms / normData.length);
      
      console.log(`[STT] Audio statistics:`, {
        peak: peak.toFixed(4),
        rms: rms.toFixed(4),
        dynamicRange: (peak / Math.max(rms, 0.001)).toFixed(2)
      });

      // Apply intelligent normalization
      if (peak > 0.001) { // Only normalize if there's actual audio content
        let targetPeak = 0.85; // Conservative target to avoid clipping
        
        // For very quiet audio, boost more aggressively
        if (peak < 0.1) {
          targetPeak = 0.9;
          console.log(`[STT] 🔊 Applying aggressive normalization for quiet audio (peak=${peak.toFixed(3)})`);
        } else if (peak < 0.3) {
          targetPeak = 0.87;
          console.log(`[STT] 🔊 Applying moderate normalization (peak=${peak.toFixed(3)})`);
        }
        
        const gain = targetPeak / peak;
        if (gain > 1.1) { // Only boost if significant gain needed
          for (let i = 0; i < normData.length; i++) {
            normData[i] *= gain;
          }
          console.log(`[STT] 🔊 Applied normalization gain=${gain.toFixed(2)} (peak was ${peak.toFixed(3)})`);
        } else {
          console.log(`[STT] ℹ️ Normalization skipped (gain would be ${gain.toFixed(2)})`);
        }
      } else {
        console.warn(`[STT] ⚠️ No audio content detected (peak=${peak.toFixed(6)})`);
      }

      const wavBlob = this.audioBufferToWav(rendered);
      console.log(`[STT] ✅ Successfully converted ${audioBlob.type} -> WAV mono/16k (${wavBlob.size} bytes)`);

      await audioContext.close();
      return wavBlob;
    } catch (error) {
      console.error(`[STT] ❌ Audio conversion failed:`, error);
      throw new ConversionError(
        `Failed to convert audio from ${audioBlob.type} to WAV: ${error instanceof Error ? error.message : 'Unknown error'}`,
        audioBlob.type
      );
    }
  }

  /**
   * Calculate audio level statistics for validation
   */
  private calculateAudioLevel(audioBuffer: AudioBuffer): {
    averageLevel: number;
    peakLevel: number;
    hasSpeechLikeContent: boolean;
  } {
    const channelData = audioBuffer.getChannelData(0);
    let sum = 0;
    let peak = 0;
    let speechLikeSamples = 0;
    
    const threshold = 0.01; // Threshold for speech-like content
    
    for (let i = 0; i < channelData.length; i++) {
      const value = Math.abs(channelData[i]);
      sum += value;
      if (value > peak) peak = value;
      if (value > threshold) speechLikeSamples++;
    }
    
    const averageLevel = sum / channelData.length;
    const speechRatio = speechLikeSamples / channelData.length;
    
    return {
      averageLevel,
      peakLevel: peak,
      hasSpeechLikeContent: speechRatio > 0.05 // At least 5% of samples above threshold
    };
  }

  /**
   * Validate and enhance WAV audio
   */
  private async validateAndEnhanceWavAudio(wavBlob: Blob): Promise<Blob> {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextClass();
      
      const arrayBuffer = await wavBlob.arrayBuffer();
      const decoded = await audioContext.decodeAudioData(arrayBuffer);
      
      // Check audio properties
      const audioLevel = this.calculateAudioLevel(decoded);
      console.log(`[STT] WAV audio validation:`, {
        duration: decoded.duration,
        sampleRate: decoded.sampleRate,
        channels: decoded.numberOfChannels,
        audioLevel: audioLevel
      });
      
      await audioContext.close();
      
      // If audio is very quiet or doesn't have speech-like content, warn about potential issues
      if (!audioLevel.hasSpeechLikeContent) {
        console.warn(`[STT] ⚠️ WAV audio may not contain speech-like content`);
      }
      
      return wavBlob;
    } catch (error) {
      console.warn(`[STT] Could not validate WAV audio:`, error);
      return wavBlob; // Return as-is if validation fails
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

  // Direct WAV recognition path removed (unused); retained pushStream arrayBuffer path for stability

  /**
   * Map SDK SpeechRecognitionResult to TranscriptionResult
   */
  private mapSdkResultToTranscription(
    result: sdk.SpeechRecognitionResult,
    duration: number,
    originalFormat: string,
    convertedFormat?: string
  ): TranscriptionResult {
    let transcriptionResult: TranscriptionResult;
    
    // Enhanced logging for all result types
    console.log(`[STT] 🎯 Azure SDK Result Details:`, {
      reason: result.reason,
      reasonName: this.getReasonName(result.reason),
      text: result.text,
      textLength: result.text?.length || 0,
      duration: duration,
      resultId: result.resultId,
      offset: result.offset,
      properties: result.properties
    });
    
    if (result.reason === sdk.ResultReason.RecognizedSpeech) {
      const text = result.text.trim();
      if (text.length === 0) {
        console.warn(`[STT] ⚠️ RecognizedSpeech but empty text -> treating as no_match`);
        transcriptionResult = {
          text: '',
          confidence: 0.1,
          duration,
          language: this.speechConfig?.speechRecognitionLanguage,
          status: 'no_match',
          originalFormat,
          convertedFormat,
          metadata: {
            azureReason: 'RecognizedSpeech',
            azureReasonCode: result.reason,
            emptyTextResult: true
          }
        };
      } else {
        console.log(`[STT] ✅ Speech recognized successfully: "${text}"`);
        transcriptionResult = {
          text,
          confidence: 0.85,
          duration,
          language: this.speechConfig?.speechRecognitionLanguage,
          status: 'recognized',
          originalFormat,
          convertedFormat,
          metadata: {
            azureReason: 'RecognizedSpeech',
            azureReasonCode: result.reason,
            resultId: result.resultId
          }
        };
      }
    } else if (result.reason === sdk.ResultReason.NoMatch) {
      console.warn(`[STT] ⚠️ Azure NoMatch detected - possible causes:`);
      console.warn(`    - Audio too quiet or low quality`);
      console.warn(`    - Background noise interference`);
      console.warn(`    - No speech detected in audio`);
      console.warn(`    - Audio format conversion issues`);
      
      transcriptionResult = {
        text: '',
        confidence: 0.1,
        duration,
        language: this.speechConfig?.speechRecognitionLanguage,
        status: 'no_match',
        originalFormat,
        convertedFormat,
        metadata: {
          azureReason: 'NoMatch',
          azureReasonCode: result.reason,
          troubleshootingHint: 'Check audio quality, volume, and speech content'
        }
      };
    } else if (result.reason === sdk.ResultReason.Canceled) {
      const cancellation = sdk.CancellationDetails.fromResult(result);
      console.error(`[STT] ❌ Azure cancellation:`, {
        reason: cancellation.reason,
        ErrorCode: cancellation.ErrorCode,
        errorDetails: cancellation.errorDetails
      });
      
      let status: TranscriptionStatus = 'recognition_error';
      if (cancellation.reason === sdk.CancellationReason.Error &&
          cancellation.errorDetails?.toLowerCase().includes('timeout')) {
        status = 'timeout';
      }
      
      transcriptionResult = {
        text: '',
        confidence: 0,
        duration,
        language: this.speechConfig?.speechRecognitionLanguage,
        status,
        error: cancellation.errorDetails || 'Recognition canceled',
        originalFormat,
        convertedFormat,
        metadata: {
          azureReason: 'Canceled',
          azureReasonCode: result.reason,
          cancellationReason: cancellation.reason,
          ErrorCode: cancellation.ErrorCode
        }
      };
    } else {
      console.error(`[STT] ❓ Unexpected Azure result reason: ${result.reason} (${this.getReasonName(result.reason)})`);
      transcriptionResult = {
        text: '',
        confidence: 0,
        duration,
        language: this.speechConfig?.speechRecognitionLanguage,
        status: 'recognition_error',
        error: `Unexpected result reason: ${result.reason}`,
        originalFormat,
        convertedFormat,
        metadata: {
          azureReason: 'Unexpected',
          azureReasonCode: result.reason,
          reasonName: this.getReasonName(result.reason)
        }
      };
    }
    
    return transcriptionResult;
  }

  /**
   * Get human-readable name for Azure result reason
   */
  private getReasonName(reason: sdk.ResultReason): string {
    switch (reason) {
      case sdk.ResultReason.RecognizedSpeech: return 'RecognizedSpeech';
      case sdk.ResultReason.NoMatch: return 'NoMatch';
      case sdk.ResultReason.Canceled: return 'Canceled';
      case sdk.ResultReason.RecognizedKeyword: return 'RecognizedKeyword';
      case sdk.ResultReason.RecognizingSpeech: return 'RecognizingSpeech';
      case sdk.ResultReason.TranslatingSpeech: return 'TranslatingSpeech';
      case sdk.ResultReason.TranslatedSpeech: return 'TranslatedSpeech';
      case sdk.ResultReason.SynthesizingAudio: return 'SynthesizingAudio';
      case sdk.ResultReason.SynthesizingAudioCompleted: return 'SynthesizingAudioCompleted';
      case sdk.ResultReason.SynthesizingAudioStarted: return 'SynthesizingAudioStarted';
      default: return `Unknown(${reason})`;
    }
  }

  /**
   * Process audio buffer for transcription using single recognition (better for short clips)
   */
  private processAudioBufferWithSingleRecognition(
    arrayBuffer: ArrayBuffer,
    originalFormat: string,
    convertedFormat: string | undefined,
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
          const transcriptionResult = this.mapSdkResultToTranscription(
            result,
            duration,
            originalFormat,
            convertedFormat
          );
          console.log(`📊 SpeechService: Final transcription result:`, transcriptionResult);
          this.cleanupRecognizer();
          resolve(transcriptionResult);
        },
        (error) => {
          console.error(`❌ SpeechService: Recognition failed:`, error);
          
          // Provide more specific error information for debugging
          let errorMessage = `Speech recognition failed: ${error}`;
          
          if (this.isWebSocketError(error)) {
            errorMessage = `WebSocket connection failed. This may be due to network issues, firewall restrictions, or Azure service unavailability. Error: ${error}`;
            console.error('🌐 WebSocket Error Details:', {
              error: error,
              region: this.speechConfig?.region,
              speechLanguage: this.speechConfig?.speechRecognitionLanguage,
              suggestions: [
                'Check internet connection',
                'Verify Azure Speech Service is available in your region',
                'Check for firewall or proxy restrictions',
                'Verify Azure subscription key is valid'
              ]
            });
          }
          
          this.cleanupRecognizer();
          reject(new Error(errorMessage));
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
          duration: 0,
          status: 'recognition_error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return results;
  }

  /**
   * Test the speech service configuration
   */
  /**
   * Test Azure Speech Service connectivity
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
          console.warn('⏰ SpeechService: Configuration test timed out');
          testRecognizer.close();
          resolve(false); // Consider timeout as failure for better error detection
        }, 8000); // Reduced timeout for faster failure detection

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
            
            // Check for specific error patterns and provide helpful guidance
            if (error.includes('401') || error.includes('unauthorized')) {
              console.error('🔑 SpeechService: Authentication failed - check your Azure Speech Service key');
            } else if (error.includes('403') || error.includes('forbidden')) {
              console.error('🚫 SpeechService: Access forbidden - check your Azure Speech Service permissions');
            } else if (error.includes('404')) {
              console.error('🌍 SpeechService: Region not found - check your Azure Speech Service region');
            } else if (this.isWebSocketError(error)) {
              console.error('🌐 SpeechService: WebSocket connection failed - check network connectivity');
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
   * Check network connectivity to Azure Speech Service endpoint
   */
  async checkNetworkConnectivity(): Promise<boolean> {
    if (!this.speechConfig) {
      return false;
    }

    try {
      const region = this.speechConfig.region;
      const testUrl = `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
      
      console.log('🌐 Testing network connectivity to Azure Speech Service...');
      
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': 'test',
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      // We expect a 401 (unauthorized) which means the endpoint is reachable
      if (response.status === 401) {
        console.log('✅ Network connectivity to Azure Speech Service confirmed');
        return true;
      } else {
        console.warn(`⚠️ Unexpected response from Azure Speech Service: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Network connectivity test failed:', error);
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
   * Run comprehensive diagnostics for troubleshooting WebSocket issues
   */
  async runDiagnostics(): Promise<{
    configuration: boolean;
    networkConnectivity: boolean;
    webSocketSupport: boolean;
    suggestions: string[];
  }> {
    const results = {
      configuration: false,
      networkConnectivity: false,
      webSocketSupport: false,
      suggestions: [] as string[]
    };

    console.log('🔍 Running Azure Speech Service diagnostics...');

    // Test configuration
    results.configuration = await this.testConfiguration();
    if (!results.configuration) {
      results.suggestions.push('Check Azure Speech Service credentials and region');
    }

    // Test network connectivity
    results.networkConnectivity = await this.checkNetworkConnectivity();
    if (!results.networkConnectivity) {
      results.suggestions.push('Check internet connection and firewall settings');
    }

    // Test WebSocket support
    results.webSocketSupport = typeof WebSocket !== 'undefined';
    if (!results.webSocketSupport) {
      results.suggestions.push('WebSocket not supported in this environment');
    }

    // Check for common issues
    if (typeof window !== 'undefined' && window.location.protocol === 'http:') {
      results.suggestions.push('Use HTTPS for WebSocket connections to Azure');
    }

    console.log('📊 Diagnostics Results:', results);
    return results;
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
