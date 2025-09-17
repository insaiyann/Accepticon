/**
 * Simple Audio Recorder - Clean implementation for reliable audio capture
 * Built from scratch for clarity and reliability
 */

export interface AudioRecordingResult {
  audioBlob: Blob;           // Always WAV format (audio/wav)
  duration: number;
  format: string;            // Will always be 'audio/wav'
}

export interface RecordingState {
  isRecording: boolean;
  duration: number;
  error: string | null;
}

export class SimpleAudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private audioChunks: Blob[] = [];
  private startTime: number = 0;
  private onStateChange?: (state: RecordingState) => void;

  /**
   * Check if audio recording is supported
   */
  static isSupported(): boolean {
    return !!(
      navigator.mediaDevices && 
      'getUserMedia' in navigator.mediaDevices &&
      window.MediaRecorder
    );
  }

  /**
   * Set callback for state changes
   */
  setStateChangeCallback(callback: (state: RecordingState) => void): void {
    this.onStateChange = callback;
  }

  /**
   * Get current recording state
   */
  getState(): RecordingState {
    return {
      isRecording: this.mediaRecorder?.state === 'recording',
      duration: this.startTime ? Date.now() - this.startTime : 0,
      error: null
    };
  }

  /**
   * Start recording with optimal settings for speech recognition
   */
  async startRecording(): Promise<void> {
    if (!SimpleAudioRecorder.isSupported()) {
      throw new Error('Audio recording not supported in this browser');
    }

    if (this.mediaRecorder?.state === 'recording') {
      throw new Error('Recording already in progress');
    }

    try {
      console.log('🎤 Starting audio recording...');

      // Request microphone with speech-optimized settings
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,          // Mono for speech
          sampleRate: 16000,        // Optimal for speech recognition
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Enforce WAV format - use best available option
      let mimeType = 'audio/wav';
      const mediaRecorderOptions: MediaRecorderOptions = {
        audioBitsPerSecond: 128000,
        mimeType: '' // Will be set below
      };

      // Try different WAV variants
      if (MediaRecorder.isTypeSupported('audio/wav')) {
        mimeType = 'audio/wav';
        console.log('✅ Using native WAV format');
      } else if (MediaRecorder.isTypeSupported('audio/wav;codecs=pcm')) {
        mimeType = 'audio/wav;codecs=pcm';
        console.log('✅ Using WAV with PCM codec');
      } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=pcm')) {
        mimeType = 'audio/webm;codecs=pcm';
        console.log('⚠️ Using WebM with PCM (will convert to WAV)');
      } else {
        // Force WebM as last resort, but we'll convert to WAV
        mimeType = 'audio/webm';
        console.log('⚠️ Using WebM (will convert to WAV for optimal speech recognition)');
      }

      mediaRecorderOptions.mimeType = mimeType;
      this.mediaRecorder = new MediaRecorder(this.mediaStream, mediaRecorderOptions);

      // Reset state
      this.audioChunks = [];
      this.startTime = 0;

      // Set up event handlers
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstart = () => {
        this.startTime = Date.now();
        console.log('✅ Recording started');
        this.emitStateChange();
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('❌ Recording error:', event.error);
        this.emitStateChange(event.error?.message || 'Recording failed');
      };

      // Start recording
      this.mediaRecorder.start(250); // Collect data every 250ms

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start recording';
      console.error('❌ Failed to start recording:', message);
      this.emitStateChange(message);
      throw new Error(message);
    }
  }

  /**
   * Stop recording and return the audio blob
   */
  async stopRecording(): Promise<AudioRecordingResult> {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
      throw new Error('No active recording to stop');
    }

    console.log('🛑 Stopping recording...');

    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No media recorder available'));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        try {
          const duration = Date.now() - this.startTime;
          let audioBlob = new Blob(this.audioChunks, {
            type: this.mediaRecorder?.mimeType || 'audio/webm'
          });

          console.log('📊 Recording completed:', {
            duration: Math.round(duration / 1000 * 100) / 100 + 's',
            size: Math.round(audioBlob.size / 1024) + 'KB',
            format: audioBlob.type,
            chunks: this.audioChunks.length
          });

          // Enforce WAV format - convert if necessary
          const needsExplicitWav = !audioBlob.type.includes('wav');
          if (needsExplicitWav) {
            console.log('🔄 Converting (container not WAV) -> WAV ...');
            try {
              audioBlob = await this.convertToWav(audioBlob);
            } catch (e) {
              console.error('❌ Container conversion failed – carrying on with original blob', e);
            }
          }

          // Validate WAV header & format (expect RIFF/WAVE + 16k mono 16-bit PCM). If mismatch, reconvert via decode path.
          if (audioBlob.type.includes('wav') && audioBlob.size > 44) {
            try {
              const headerBuf = await audioBlob.slice(0, 44).arrayBuffer();
              const dv = new DataView(headerBuf);
              const riff = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
              const wave = String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11));
              const fmt = String.fromCharCode(dv.getUint8(12), dv.getUint8(13), dv.getUint8(14), dv.getUint8(15));
              const audioFormat = dv.getUint16(20, true);
              const numChannels = dv.getUint16(22, true);
              const sampleRate = dv.getUint32(24, true);
              const bitsPerSample = dv.getUint16(34, true);
              const validCore = riff === 'RIFF' && wave === 'WAVE' && fmt === 'fmt ' && audioFormat === 1;
              const isIdeal = validCore && numChannels === 1 && sampleRate === 16000 && bitsPerSample === 16;
              if (!isIdeal) {
                console.log('⚠️ WAV not in ideal format – reconverting', { numChannels, sampleRate, bitsPerSample });
                try { audioBlob = await this.convertToWav(audioBlob); } catch (e) { console.warn('⚠️ Reconversion failed, proceeding with current blob', e); }
              }
            } catch (e) {
              console.warn('⚠️ Failed to parse WAV header for validation', e);
            }
          }

          const result: AudioRecordingResult = {
            audioBlob,
            duration,
            format: audioBlob.type
          };

          this.cleanup();
          resolve(result);

        } catch (error) {
          console.error('❌ Error creating audio result:', error);
          reject(error);
        }
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Convert audio blob to WAV format
   */
  private async convertToWav(audioBlob: Blob): Promise<Blob> {
    console.log('🔄 Converting audio to WAV format...', {
      originalType: audioBlob.type,
      originalSize: audioBlob.size
    });

    try {
      // Create audio context
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextClass();

      // Convert blob to array buffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      console.log('🎵 Audio decoded for conversion:', {
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
        length: audioBuffer.length
      });

      // Convert to mono 16kHz for optimal speech recognition
      const targetSampleRate = 16000;
      const offlineCtx = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration * targetSampleRate), targetSampleRate);
      
      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineCtx.destination);
      source.start(0);
      
      const renderedBuffer = await offlineCtx.startRendering();
      
      // Convert to WAV blob
      const wavBlob = this.audioBufferToWav(renderedBuffer);
      
      console.log('✅ Audio conversion completed:', {
        newType: wavBlob.type,
        newSize: wavBlob.size,
        sampleRate: renderedBuffer.sampleRate,
        channels: renderedBuffer.numberOfChannels
      });

      await audioContext.close();
      return wavBlob;

    } catch (error) {
      console.error('❌ Audio conversion failed:', error);
      throw new Error(`Failed to convert audio to WAV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert AudioBuffer to WAV blob
   */
  private audioBufferToWav(audioBuffer: AudioBuffer): Blob {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = audioBuffer.length * blockAlign;
    const bufferSize = 44 + dataSize;

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

    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * Verify that audio blob is in WAV format
   */
  static isWavFormat(audioBlob: Blob): boolean {
    return audioBlob.type === 'audio/wav' || audioBlob.type.includes('wav');
  }

  /**
   * Get recording format information
   */
  static getRecordingInfo(): { 
    supportsNativeWav: boolean;
    recommendedFormat: string;
    willConvert: boolean;
  } {
    const supportsNativeWav = MediaRecorder.isTypeSupported('audio/wav') || 
                              MediaRecorder.isTypeSupported('audio/wav;codecs=pcm');
    
    let recommendedFormat = 'audio/wav';
    if (!supportsNativeWav) {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=pcm')) {
        recommendedFormat = 'audio/webm;codecs=pcm';
      } else {
        recommendedFormat = 'audio/webm';
      }
    }

    return {
      supportsNativeWav,
      recommendedFormat,
      willConvert: !supportsNativeWav
    };
  }

  /**
   * Cancel recording without returning result
   */
  cancelRecording(): void {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    }
    this.cleanup();
  }

  /**
   * Emit state change to callback
   */
  private emitStateChange(error?: string): void {
    if (this.onStateChange) {
      this.onStateChange({
        ...this.getState(),
        error: error || null
      });
    }
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    this.mediaRecorder = null;
    this.audioChunks = [];
    this.startTime = 0;
    this.emitStateChange();
  }
}

// Export singleton instance
export const simpleAudioRecorder = new SimpleAudioRecorder();
