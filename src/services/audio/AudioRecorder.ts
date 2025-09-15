export interface AudioRecordingOptions {
  mimeType?: string;
  audioBitsPerSecond?: number;
  maxDuration?: number; // in milliseconds
}

export interface AudioRecordingResult {
  blob: Blob;
  duration: number;
  size: number;
}

export interface AudioRecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  error: string | null;
}

class AudioRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private audioChunks: Blob[] = [];
  private startTime: number = 0;
  private pausedDuration: number = 0;
  private animationFrame: number | null = null;

  // State callbacks
  private onStateChange?: (state: AudioRecordingState) => void;
  private onDataAvailable?: (chunk: Blob) => void;

  /**
   * Check if audio recording is supported
   */
  static isSupported(): boolean {
    return !!(navigator.mediaDevices && 
              'getUserMedia' in navigator.mediaDevices && 
              window.MediaRecorder);
  }

  /**
   * Get supported MIME types for audio recording
   */
  static getSupportedMimeTypes(): string[] {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/wav'
    ];

    return types.filter(type => MediaRecorder.isTypeSupported(type));
  }

  /**
   * Set state change callback
   */
  setStateChangeCallback(callback: (state: AudioRecordingState) => void): void {
    this.onStateChange = callback;
  }

  /**
   * Set data available callback
   */
  setDataAvailableCallback(callback: (chunk: Blob) => void): void {
    this.onDataAvailable = callback;
  }

  /**
   * Get current recording state
   */
  getState(): AudioRecordingState {
    return {
      isRecording: this.mediaRecorder?.state === 'recording',
      isPaused: this.mediaRecorder?.state === 'paused',
      duration: this.getCurrentDuration(),
      error: null
    };
  }

  /**
   * Get current recording duration
   */
  private getCurrentDuration(): number {
    if (!this.startTime) return 0;
    
    if (this.mediaRecorder?.state === 'recording') {
      return Date.now() - this.startTime - this.pausedDuration;
    } else if (this.mediaRecorder?.state === 'paused') {
      return this.startTime ? Date.now() - this.startTime - this.pausedDuration : 0;
    }
    
    return 0;
  }

  /**
   * Emit state change
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
   * Start audio recording
   */
  async startRecording(options: AudioRecordingOptions = {}): Promise<void> {
    if (!AudioRecorderService.isSupported()) {
      throw new Error('Audio recording is not supported in this browser');
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      throw new Error('Recording is already in progress');
    }

    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000 // Optimal for speech recognition
        }
      });

      // Determine best MIME type
      const supportedTypes = AudioRecorderService.getSupportedMimeTypes();
      const mimeType = options.mimeType && supportedTypes.includes(options.mimeType) 
        ? options.mimeType 
        : supportedTypes[0] || 'audio/webm';

      // Create MediaRecorder
      const mediaRecorderOptions: MediaRecorderOptions = {
        mimeType,
        audioBitsPerSecond: options.audioBitsPerSecond || 128000
      };

      this.mediaRecorder = new MediaRecorder(this.mediaStream, mediaRecorderOptions);

      // Reset state
      this.audioChunks = [];
      this.startTime = 0;
      this.pausedDuration = 0;

      // Set up event listeners
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          if (this.onDataAvailable) {
            this.onDataAvailable(event.data);
          }
        }
      };

      this.mediaRecorder.onstart = () => {
        this.startTime = Date.now();
        this.emitStateChange();
        this.startDurationTracking();
      };

      this.mediaRecorder.onpause = () => {
        this.emitStateChange();
        this.stopDurationTracking();
      };

      this.mediaRecorder.onresume = () => {
        this.emitStateChange();
        this.startDurationTracking();
      };

      this.mediaRecorder.onstop = () => {
        this.stopDurationTracking();
        this.emitStateChange();
      };

      this.mediaRecorder.onerror = (event) => {
        const error = event.error?.message || 'Recording error occurred';
        this.emitStateChange(error);
      };

      // Start recording
      this.mediaRecorder.start(100); // Collect data every 100ms

      // Set max duration if specified
      if (options.maxDuration) {
        setTimeout(() => {
          if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.stopRecording();
          }
        }, options.maxDuration);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start recording';
      this.emitStateChange(errorMessage);
      throw new Error(`Failed to start recording: ${errorMessage}`);
    }
  }

  /**
   * Stop audio recording
   */
  async stopRecording(): Promise<AudioRecordingResult> {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      throw new Error('No active recording to stop');
    }

    console.log('🎤 AudioRecorder: Stopping recording...');

    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('MediaRecorder not available'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        try {
          console.log(`🎵 AudioRecorder: Processing ${this.audioChunks.length} audio chunks`);
          
          const blob = new Blob(this.audioChunks, { 
            type: this.mediaRecorder?.mimeType || 'audio/webm' 
          });
          
          const duration = this.getCurrentDuration();
          
          console.log('🎧 AudioRecorder: Created audio blob:', {
            size: blob.size,
            type: blob.type,
            duration: duration,
            chunks: this.audioChunks.length
          });
          
          const result: AudioRecordingResult = {
            blob,
            duration,
            size: blob.size
          };

          this.cleanup();
          console.log('✅ AudioRecorder: Recording stopped successfully');
          resolve(result);
        } catch (error) {
          console.error('❌ AudioRecorder: Error creating audio result:', error);
          reject(error);
        }
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Pause recording
   */
  pauseRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.pausedDuration += Date.now() - this.startTime;
      this.mediaRecorder.pause();
    }
  }

  /**
   * Resume recording
   */
  resumeRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.startTime = Date.now();
      this.mediaRecorder.resume();
    }
  }

  /**
   * Cancel recording
   */
  cancelRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.cleanup();
  }

  /**
   * Start duration tracking animation
   */
  private startDurationTracking(): void {
    const updateDuration = () => {
      if (this.mediaRecorder?.state === 'recording') {
        this.emitStateChange();
        this.animationFrame = requestAnimationFrame(updateDuration);
      }
    };
    this.animationFrame = requestAnimationFrame(updateDuration);
  }

  /**
   * Stop duration tracking animation
   */
  private stopDurationTracking(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.stopDurationTracking();
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    this.mediaRecorder = null;
    this.audioChunks = [];
    this.startTime = 0;
    this.pausedDuration = 0;
    
    this.emitStateChange();
  }

  /**
   * Get permission status for microphone
   */
  async getPermissionStatus(): Promise<PermissionState> {
    if ('permissions' in navigator) {
      const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return permission.state;
    }
    return 'prompt';
  }

  /**
   * Convert blob to base64 for storage
   */
  static async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]); // Remove data:audio/webm;base64, prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Convert base64 to blob
   */
  static base64ToBlob(base64: string, mimeType = 'audio/webm'): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }
}

// Create singleton instance
export const audioRecorderService = new AudioRecorderService();
export default audioRecorderService;
