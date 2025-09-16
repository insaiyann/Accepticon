/**
 * Audio Download Service - Utility for downloading audio messages
 * Provides functionality to download audio files with proper naming and format
 */

import type { AudioMessage } from '../../types/Message';
import { SimpleAudioRecorder } from '../audio/SimpleAudioRecorder';

export interface DownloadOptions {
  filename?: string;
  format?: 'wav' | 'original';
  includeMetadata?: boolean;
}

export class AudioDownloadService {
  /**
   * Download an audio message as a file
   */
  static async downloadAudioMessage(audioMessage: AudioMessage, options: DownloadOptions = {}): Promise<void> {
    if (!audioMessage.audioBlob) {
      throw new Error('No audio blob available for download');
    }

    console.log('📥 Starting audio download...', {
      messageId: audioMessage.id,
      originalSize: audioMessage.audioBlob.size,
      originalType: audioMessage.audioBlob.type,
      options
    });

    try {
      // Generate filename if not provided
      const filename = options.filename || this.generateFilename(audioMessage, options.format);
      
      // Get the audio blob (original or ensure WAV format)
      let downloadBlob = audioMessage.audioBlob;
      
      if (options.format === 'wav' && !SimpleAudioRecorder.isWavFormat(audioMessage.audioBlob)) {
        console.log('🔄 Converting to WAV format for download...');
        downloadBlob = await this.convertToWav(audioMessage.audioBlob);
      }

      // Create download link and trigger download
      await this.triggerDownload(downloadBlob, filename);

      console.log('✅ Audio download completed:', {
        filename,
        size: downloadBlob.size,
        type: downloadBlob.type
      });

    } catch (error) {
      console.error('❌ Audio download failed:', error);
      throw error;
    }
  }

  /**
   * Download multiple audio messages as individual files
   * TODO: Implement ZIP functionality with JSZip library
   */
  static async downloadMultipleAudioMessages(audioMessages: AudioMessage[]): Promise<void> {
    console.log(`📦 Starting bulk download of ${audioMessages.length} audio messages...`);

    try {
      // Check if JSZip is available (would need to be installed)
      // For now, download them individually with numbered filenames
      for (let i = 0; i < audioMessages.length; i++) {
        const message = audioMessages[i];
        if (message.audioBlob) {
          const filename = `audio-${i + 1}-${this.generateFilename(message)}`;
          await this.downloadAudioMessage(message, { filename });
          
          // Add a small delay between downloads to avoid browser throttling
          if (i < audioMessages.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }

      console.log('✅ Bulk audio download completed');

    } catch (error) {
      console.error('❌ Bulk audio download failed:', error);
      throw error;
    }
  }

  /**
   * Generate a filename for an audio message
   */
  private static generateFilename(audioMessage: AudioMessage, format?: 'wav' | 'original'): string {
    const date = new Date(audioMessage.timestamp);
    const dateStr = date.toISOString().slice(0, 19).replace(/[:.]/g, '-');
    
    // Get file extension based on format preference
    let extension = 'wav'; // Default to WAV
    
    if (format === 'original' && audioMessage.audioBlob) {
      const mimeType = audioMessage.audioBlob.type;
      if (mimeType.includes('webm')) {
        extension = 'webm';
      } else if (mimeType.includes('mp4')) {
        extension = 'mp4';
      } else if (mimeType.includes('ogg')) {
        extension = 'ogg';
      }
    }

    // Include transcription preview in filename if available
    let namePrefix = 'audio';
    if (audioMessage.transcription && audioMessage.transcription.trim()) {
      // Use first few words of transcription, sanitized for filename
      const transcriptionPreview = audioMessage.transcription
        .trim()
        .split(' ')
        .slice(0, 3)
        .join('-')
        .replace(/[^a-zA-Z0-9-]/g, '')
        .substring(0, 30);
      
      if (transcriptionPreview) {
        namePrefix = transcriptionPreview;
      }
    }

    return `${namePrefix}-${dateStr}.${extension}`;
  }

  /**
   * Trigger browser download
   */
  private static async triggerDownload(blob: Blob, filename: string): Promise<void> {
    // Create object URL
    const url = URL.createObjectURL(blob);
    
    try {
      // Create temporary download link
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      
      // Append to body, click, and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log(`📁 Download triggered: ${filename}`);
      
    } finally {
      // Clean up object URL
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Convert audio blob to WAV format (reuse from SimpleAudioRecorder)
   */
  private static async convertToWav(audioBlob: Blob): Promise<Blob> {
    console.log('🔄 Converting audio to WAV for download...', {
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
      
      // Convert to WAV blob using the same method as SimpleAudioRecorder
      const wavBlob = this.audioBufferToWav(audioBuffer);
      
      await audioContext.close();
      return wavBlob;

    } catch (error) {
      console.error('❌ Audio conversion for download failed:', error);
      throw new Error(`Failed to convert audio for download: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert AudioBuffer to WAV blob (copied from SimpleAudioRecorder)
   */
  private static audioBufferToWav(audioBuffer: AudioBuffer): Blob {
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
   * Get download size estimation
   */
  static getDownloadSize(audioMessage: AudioMessage, format: 'wav' | 'original' = 'original'): string {
    if (!audioMessage.audioBlob) {
      return 'N/A';
    }

    const sizeInBytes = audioMessage.audioBlob.size;
    
    // Estimate WAV size if converting (rough estimation)
    let estimatedSize = sizeInBytes;
    if (format === 'wav' && !SimpleAudioRecorder.isWavFormat(audioMessage.audioBlob)) {
      // WAV is typically larger than compressed formats
      // Rough estimation: duration * sample_rate * 2 bytes (16-bit) * channels
      estimatedSize = Math.ceil(audioMessage.duration / 1000 * 16000 * 2); // Assume mono 16kHz
    }

    if (estimatedSize < 1024) {
      return `${estimatedSize} B`;
    } else if (estimatedSize < 1024 * 1024) {
      return `${Math.round(estimatedSize / 1024)} KB`;
    } else {
      return `${Math.round(estimatedSize / (1024 * 1024) * 100) / 100} MB`;
    }
  }

  /**
   * Check if audio can be downloaded
   */
  static canDownload(audioMessage: AudioMessage): boolean {
    return !!(audioMessage.audioBlob && audioMessage.audioBlob.size > 0);
  }
}

export default AudioDownloadService;
