/**
 * MinimalSTTService
 * Bare-minimum speech-to-text: iterate audio messages, convert to PCM16 16k mono, transcribe, log.
 * No complex progress state, only console logging.
 */
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';
import { indexedDBService } from './storage/IndexedDBService';
import { openAIService } from './azure/OpenAIService';
import type { MermaidGenerationOptions } from './azure/OpenAIService';

export interface MinimalSTTResultSummary {
  success: boolean;
  processed: number;
  recognized: number;
  failed: number;
}

class MinimalSTTService {
  private speechConfig: SpeechSDK.SpeechConfig | null = null;
  private initialized = false;
  private openAIInitialized = false;

  async autoInitialize(): Promise<boolean> {
    try {
      if (this.initialized) return true;
      const key = import.meta.env.VITE_AZURE_SPEECH_KEY;
      const region = import.meta.env.VITE_AZURE_SPEECH_REGION;
      if (!key || !region) {
        console.warn('[MinimalSTT] Missing speech credentials');
        return false;
      }
      this.speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region);
      this.speechConfig.speechRecognitionLanguage = 'en-US';
      this.initialized = true;
      console.log('[MinimalSTT] Initialized');
      return true;
    } catch (e) {
      console.error('[MinimalSTT] Init failed', e);
      return false;
    }
  }

  getStatus() { return { isInitialized: this.initialized }; }

  /** Initialize both STT and OpenAI using env vars (single call convenience) */
  async initializeAll(): Promise<{ stt:boolean; openai:boolean; }> {
    const stt = await this.autoInitialize();
    let openai = false;
    if (!this.openAIInitialized) {
      const key = import.meta.env.VITE_AZURE_OPENAI_KEY;
      const endpoint = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT;
      const deployment = import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT;
      if (key && endpoint && deployment) {
        try {
          await openAIService.initialize({ apiKey: key, endpoint, deploymentName: deployment, apiVersion: '2024-02-01' });
          openai = true; this.openAIInitialized = true;
        } catch (e) {
          console.warn('[MinimalSTT] OpenAI init failed', e);
        }
      } else {
        console.warn('[MinimalSTT] Missing OpenAI env vars');
      }
    } else openai = true;
    return { stt, openai };
  }

  async transcribeAllAudioMessages(): Promise<{ success: boolean; recognized: number; failed: number; processed: number; }>{
    if (!this.initialized || !this.speechConfig) {
      console.error('[MinimalSTT] Not initialized');
      return { success: false, recognized: 0, failed: 0, processed: 0 };
    }
    const audioMessages = await indexedDBService.getAudioMessages();
    const targets = audioMessages.filter(m => !m.transcription || m.transcriptionStatus !== 'recognized');
    console.log(`[MinimalSTT] Processing ${targets.length} audio messages`);

    let recognized = 0; let failed = 0; let processed = 0;
    for (const msg of targets) {
      processed++;
      const id = msg.id;
      try {
        if (!msg.audioBlob || msg.audioBlob.size === 0) {
          console.warn(`[MinimalSTT] Message ${id} has no audio blob`);
          failed++; continue;
        }
        const pcmBlob = await this.ensurePcmWav(msg.audioBlob);
        const buf = new Uint8Array(await pcmBlob.arrayBuffer());
        if (buf.length <= 44) { throw new Error('WAV too short'); }
        // Diagnostics: parse WAV header BEFORE stripping
        try {
          const dv = new DataView(buf.buffer, 0, 44);
          const sampleRate = dv.getUint32(24, true);
          const channels = dv.getUint16(22, true);
          const bits = dv.getUint16(34, true);
          const byteRate = dv.getUint32(28, true);
          console.log(`[MinimalSTT] ▶️ Using WAV for ${id}: ${sampleRate}Hz, ${channels}ch, ${bits}bit, byteRate=${byteRate}, size=${pcmBlob.size}`);
          if (sampleRate !== 16000 || channels !== 1 || bits !== 16) {
            console.warn(`[MinimalSTT] ⚠️ Non-ideal format AFTER ensurePcmWav for ${id}; expected 16kHz mono 16-bit. Transcription may degrade.`);
          }
          // Simple silence heuristic (inspect first 2000 samples)
          const firstSamples = new DataView(buf.buffer, 44, Math.min(4000, buf.length - 44));
          let sumAmp = 0; let sampleCount = 0;
          for (let o = 0; o < firstSamples.byteLength; o += 2) { sumAmp += Math.abs(firstSamples.getInt16(o, true)); sampleCount++; }
          const avgAmp = sumAmp / (sampleCount || 1) / 0x7FFF;
          if (avgAmp < 0.005) {
            console.warn(`[MinimalSTT] 🔇 Very low amplitude detected for ${id} (avg ~${avgAmp.toFixed(4)}). If recognition fails, input may be silence or gain too low.`);
          }
        } catch (diagErr) {
          console.warn('[MinimalSTT] WAV diagnostics failed:', diagErr);
        }
        // Strip header -> raw PCM
        const pcm = buf.slice(44);
        const format = SpeechSDK.AudioStreamFormat.getWaveFormatPCM(16000,16,1);
        const push = SpeechSDK.AudioInputStream.createPushStream(format);
        push.write(pcm.buffer); push.close();
        const audioCfg = SpeechSDK.AudioConfig.fromStreamInput(push);
        const recognizer = new SpeechSDK.SpeechRecognizer(this.speechConfig, audioCfg);
        const result = await new Promise<SpeechSDK.SpeechRecognitionResult>((resolve, reject)=>{
          recognizer.recognizeOnceAsync(r=>{recognizer.close(); resolve(r);}, err=>{recognizer.close(); reject(new Error(err));});
        });
        if (result.reason === SpeechSDK.ResultReason.RecognizedSpeech && result.text.trim()) {
          recognized++;
          console.log(`[MinimalSTT] ✅ ${id}: "${result.text}"`);
          await indexedDBService.updateMessage(id, { transcription: result.text.trim(), transcriptionStatus: 'recognized', transcriptionConfidence: 0.8 });
        } else if (result.reason === SpeechSDK.ResultReason.NoMatch) {
          failed++; console.log(`[MinimalSTT] ⛔ No speech ${id}`);
          await indexedDBService.updateMessage(id, { transcriptionStatus: 'no_match', transcriptionError: 'No speech detected' });
        } else {
          failed++; console.log(`[MinimalSTT] ❌ Unexpected reason ${id}: ${result.reason}`);
          await indexedDBService.updateMessage(id, { transcriptionStatus: 'recognition_error', transcriptionError: `Reason ${result.reason}` });
        }
      } catch (err) {
        failed++;
        console.error(`[MinimalSTT] ❌ Error ${id}:`, err);
        await indexedDBService.updateMessage(id, { transcriptionStatus: 'recognition_error', transcriptionError: err instanceof Error ? err.message : 'Unknown error' });
      }
    }
    return { success: failed === 0, recognized, failed, processed };
  }

  private async ensurePcmWav(blob: Blob): Promise<Blob> {
    try {
      // Fast path: If WAV header already 16kHz mono 16-bit PCM, reuse as-is
      if (blob.type.includes('wav') && blob.size > 44) {
        const header = new DataView(await blob.slice(0, 44).arrayBuffer());
        const riff = String.fromCharCode(header.getUint8(0), header.getUint8(1), header.getUint8(2), header.getUint8(3));
        const wave = String.fromCharCode(header.getUint8(8), header.getUint8(9), header.getUint8(10), header.getUint8(11));
        const fmtChunk = String.fromCharCode(header.getUint8(12), header.getUint8(13), header.getUint8(14), header.getUint8(15));
        const audioFormat = header.getUint16(20, true); // 1 = PCM
        const numChannels = header.getUint16(22, true);
        const sampleRate = header.getUint32(24, true);
        const bitsPerSample = header.getUint16(34, true);
        const isPcm16Mono16k = riff === 'RIFF' && wave === 'WAVE' && fmtChunk === 'fmt ' && audioFormat === 1 && numChannels === 1 && sampleRate === 16000 && bitsPerSample === 16;
        if (isPcm16Mono16k) {
          // Already in the exact format required
          return blob;
        } else {
          console.log('[MinimalSTT] Resampling WAV (detected', { sampleRate, numChannels, bitsPerSample }, '→ 16kHz mono 16-bit PCM)');
        }
      }

      // Decode & resample / down-mix
      const win = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const AudioContextCls = win.AudioContext || win.webkitAudioContext!;
      const ctx = new AudioContextCls();
      const arr = await blob.arrayBuffer();
      const decoded: AudioBuffer = await ctx.decodeAudioData(arr);
      const targetRate = 16000;
      const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
      // Mix / copy into mono
      if (decoded.numberOfChannels === 1) {
        const src = offline.createBufferSource();
        src.buffer = decoded; src.connect(offline.destination); src.start(0);
      } else {
        // Average channels
        const mixed = offline.createBuffer(1, decoded.length, decoded.sampleRate);
        const out = mixed.getChannelData(0);
        for (let c = 0; c < decoded.numberOfChannels; c++) {
          const ch = decoded.getChannelData(c);
          for (let i = 0; i < ch.length; i++) {
            out[i] += ch[i] / decoded.numberOfChannels;
          }
        }
        const src = offline.createBufferSource();
        src.buffer = mixed; src.connect(offline.destination); src.start(0);
      }
      const rendered = await offline.startRendering();
      ctx.close();
      return this.audioBufferToWav(rendered);
    } catch (e) {
      console.warn('[MinimalSTT] ensurePcmWav fallback – returning original blob due to error:', e);
      return blob; // Fallback – let SDK attempt decode (may still work if format acceptable)
    }
  }

  private audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = 1; const sampleRate = buffer.sampleRate; const samples = buffer.getChannelData(0);
    const bitDepth = 16; const bytesPerSample = bitDepth/8; const blockAlign = numChannels*bytesPerSample;
    const dataSize = samples.length * blockAlign; const header = 44; const total = header + dataSize;
    const ab = new ArrayBuffer(total); const view = new DataView(ab); let off = 0;
    const ws = (s:string)=>{ for(let i=0;i<s.length;i++) view.setUint8(off++, s.charCodeAt(i)); };
    ws('RIFF'); view.setUint32(off, total-8, true); off+=4; ws('WAVE'); ws('fmt '); view.setUint32(off,16,true); off+=4;
    view.setUint16(off,1,true); off+=2; view.setUint16(off,numChannels,true); off+=2; view.setUint32(off,sampleRate,true); off+=4;
    view.setUint32(off,sampleRate*blockAlign,true); off+=4; view.setUint16(off,blockAlign,true); off+=2; view.setUint16(off,bitDepth,true); off+=2;
    ws('data'); view.setUint32(off,dataSize,true); off+=4;
    for (let i=0;i<samples.length;i++, off+=2){ const s = Math.max(-1, Math.min(1, samples[i])); view.setInt16(off, s*0x7FFF, true);}    
    return new Blob([ab], { type: 'audio/wav' });
  }

  /** Collect stored messages (text, transcribed audio, image descriptions) and generate Mermaid diagram */
  async generateDiagramFromStoredMessages(options: MermaidGenerationOptions = {}) {
    if (!this.openAIInitialized) throw new Error('OpenAI not initialized');
    const audioMessages = await indexedDBService.getAudioMessages();
    const allMessages = await indexedDBService.getAllMessages();
    const textParts: string[] = [];
    allMessages.filter(m=>m.type==='text').forEach(m=> textParts.push(m.content));
    audioMessages.filter(m=> m.transcription?.trim()).forEach(m=> textParts.push(`Audio: ${m.transcription}`));
    allMessages.filter(m=> m.type==='image').forEach(m=> {
      const anyMsg = m as unknown as { description?: string };
      if (anyMsg.description && anyMsg.description.trim()) textParts.push(`Image: ${anyMsg.description}`);
    });
    if (textParts.length===0) throw new Error('No content available for diagram generation');
    const content = textParts.join('\n\n').trim();
    return openAIService.generateMermaidDiagram(content, options);
  }
}

export const minimalSTTService = new MinimalSTTService();
export default minimalSTTService;
