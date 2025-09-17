import { indexedDBService } from '../storage/IndexedDBService';
import type { AudioMessage } from '../../types/Message';

/**
 * Minimal speech transcription pipeline inspired by patterns in #deepwiki #context7
 * and the Microsoft Docs REST walkthrough for Azure Speech ({@link https://learn.microsoft.com/azure/ai-services/speech-service/rest-speech-to-text}).
 * The goal is to keep the flow tiny: load audio, send to Azure, log the result.
 */
export interface TranscriptionDetail {
  id: string;
  text?: string;
  error?: string;
}

export interface TranscriptionSummary {
  processed: number;
  succeeded: number;
  failed: number;
  details: TranscriptionDetail[];
}

interface SpeechConfig {
  key: string;
  region: string;
  language: string;
}

class SpeechTranscriptionPipeline {
  private readonly targetSampleRate = 16000;

  async transcribeAllAudioMessages(): Promise<TranscriptionSummary> {
    await indexedDBService.initialize();
    const audioMessages = await indexedDBService.getAudioMessages();

    const summary: TranscriptionSummary = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      details: []
    };

    if (audioMessages.length === 0) {
      console.log('[SpeechTranscriptionPipeline] No audio messages available to transcribe.');
      return summary;
    }

    const config = this.getConfig();

    for (const message of audioMessages) {
      summary.processed += 1;

      try {
        const blob = await this.resolveAudioBlob(message);
        if (!blob) {
          throw new Error('Audio blob missing in IndexedDB for this message.');
        }

        console.log('[SpeechTranscriptionPipeline] Processing audio message', { id: message.id, blobSize: blob.size, blobType: blob.type || 'unknown' });

        const { wavBlob, sampleRate } = await this.ensureLinearPcmWav(blob);
        console.log('[SpeechTranscriptionPipeline] Prepared WAV payload', { sampleRate });
        const transcript = await this.sendToAzure(config, { blob: wavBlob, sampleRate });
        const normalized = transcript.trim();

        console.log(`[SpeechTranscriptionPipeline] ${message.id} -> ${normalized || '[empty transcript]'}`);

        await indexedDBService.updateMessage(message.id, {
          transcription: normalized,
          transcriptionStatus: normalized ? 'recognized' : 'no_match',
          transcriptionError: normalized ? null : undefined,
          processed: true
        });

        summary.succeeded += 1;
        summary.details.push({ id: message.id, text: normalized });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown transcription failure';
        console.error(`[SpeechTranscriptionPipeline] ${message.id} failed -> ${errorMessage}`);

        await indexedDBService.updateMessage(message.id, {
          transcriptionStatus: 'recognition_error',
          transcriptionError: errorMessage
        });

        summary.failed += 1;
        summary.details.push({ id: message.id, error: errorMessage });
      }
    }

    return summary;
  }

  private getConfig(): SpeechConfig {
    const key = import.meta.env.VITE_AZURE_SPEECH_KEY;
    const region = import.meta.env.VITE_AZURE_SPEECH_REGION;
    const language = import.meta.env.VITE_AZURE_SPEECH_LANGUAGE || 'en-US';

    if (!key || !region) {
      throw new Error('Azure Speech configuration missing (VITE_AZURE_SPEECH_KEY / VITE_AZURE_SPEECH_REGION).');
    }

    return { key, region, language };
  }

  hasValidConfiguration(): boolean {
    try {
      this.getConfig();
      return true;
    } catch (error) {
      return false;
    }
  }



  private async resolveAudioBlob(message: AudioMessage): Promise<Blob | null> {
    if (message.audioBlob instanceof Blob) {
      return message.audioBlob;
    }

    const fresh = await indexedDBService.getMessage(message.id);
    if (fresh && fresh.type === 'audio') {
      const audio = fresh as AudioMessage;
      if (audio.audioBlob instanceof Blob) {
        return audio.audioBlob;
      }
    }

    return null;
  }

  private async ensureLinearPcmWav(blob: Blob): Promise<{ wavBlob: Blob; sampleRate: number }> {
    const audioBuffer = await this.decodeAudio(blob);
    console.log('[SpeechTranscriptionPipeline] Decoded audio buffer', { sourceSampleRate: audioBuffer.sampleRate });
    const resampled = await this.resampleAudioBuffer(audioBuffer, this.targetSampleRate);
    return {
      wavBlob: this.audioBufferToWav(resampled),
      sampleRate: resampled.sampleRate
    };
  }

  private async resampleAudioBuffer(buffer: AudioBuffer, targetRate: number): Promise<AudioBuffer> {
    if (buffer.sampleRate === targetRate) {
      console.log('[SpeechTranscriptionPipeline] Audio already at target sample rate', { sampleRate: buffer.sampleRate });
      return buffer;
    }

    console.log('[SpeechTranscriptionPipeline] Resampling audio buffer', { from: buffer.sampleRate, to: targetRate });

    const offlineContext = new OfflineAudioContext(
      buffer.numberOfChannels,
      Math.ceil(buffer.duration * targetRate),
      targetRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineContext.destination);
    source.start(0);

    return offlineContext.startRendering();
  }

  private async decodeAudio(blob: Blob): Promise<AudioBuffer> {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new AudioContext();
    try {
      return await audioContext.decodeAudioData(arrayBuffer);
    } finally {
      if (audioContext.state !== 'closed') {
        await audioContext.close();
      }
    }
  }

  private audioBufferToWav(audioBuffer: AudioBuffer): Blob {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataLength = audioBuffer.length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    let offset = 0;
    const writeString = (text: string) => {
      for (let i = 0; i < text.length; i += 1) {
        view.setUint8(offset + i, text.charCodeAt(i));
      }
      offset += text.length;
    };

    writeString('RIFF');
    view.setUint32(offset, 36 + dataLength, true); offset += 4;
    writeString('WAVE');
    writeString('fmt ');
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, format, true); offset += 2;
    view.setUint16(offset, numberOfChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, byteRate, true); offset += 4;
    view.setUint16(offset, blockAlign, true); offset += 2;
    view.setUint16(offset, bitDepth, true); offset += 2;
    writeString('data');
    view.setUint32(offset, dataLength, true); offset += 4;

    const channels: Float32Array[] = [];
    for (let channel = 0; channel < numberOfChannels; channel += 1) {
      channels.push(audioBuffer.getChannelData(channel));
    }

    for (let i = 0; i < audioBuffer.length; i += 1) {
      for (let channel = 0; channel < numberOfChannels; channel += 1) {
        const sample = Math.max(-1, Math.min(1, channels[channel][i]));
        view.setInt16(offset, sample * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  private async sendToAzure(config: SpeechConfig, payload: { blob: Blob; sampleRate: number }): Promise<string> {
    const endpoint = `https://${config.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(config.language)}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': config.key,
        'Ocp-Apim-Subscription-Region': config.region,
        'Content-Type': `audio/wav; codecs=audio/pcm; samplerate=${payload.sampleRate}`,
        Accept: 'application/json'
      },
      body: payload.blob
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure Speech request failed (${response.status}): ${errorText}`);
    }

    const result = await response.json() as {
      RecognitionStatus?: string;
      recognitionStatus?: string;
      DisplayText?: string;
      Text?: string;
      Offset?: number;
      Duration?: number;
      NBest?: Array<{ Display?: string; Lexical?: string }>;
      Message?: string;
    };

    const status = result.RecognitionStatus || result.recognitionStatus;
    console.log('[SpeechTranscriptionPipeline] Azure response summary', { status, hasDisplayText: !!result.DisplayText, nBest: Array.isArray(result.NBest) ? result.NBest.length : 0 });
    if (status && status !== 'Success' && status !== 'Recognized') {
      const message = result.Message || `Recognition status: ${status}`;
      throw new Error(message);
    }

    if (result.DisplayText) {
      return result.DisplayText;
    }

    if (result.Text) {
      return result.Text;
    }

    if (Array.isArray(result.NBest) && result.NBest.length > 0) {
      return result.NBest[0].Display || result.NBest[0].Lexical || '';
    }

    return '';
  }
}

export const speechTranscriptionPipeline = new SpeechTranscriptionPipeline();
export default speechTranscriptionPipeline;

















