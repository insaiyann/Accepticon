/**
 * STT Pipeline Audio Diagnostic Script
 * Creates a tiny WAV blob from embedded base64 data and exercises speechService.transcribeAudio()
 * without touching IndexedDB or UI. Intended for manual console invocation.
 *
 * Usage (in running app with Vite dev server):
 *   import('/diagnostics/pipeline-audio-diagnostic.ts').then(m => m.runAudioDiagnostic());
 *
 * Logs are prefixed with [STT:DIAG]
 */

import speechService from '../src/services/azure/SpeechService';

// Extend typing for import.meta.env safely (Vite style)
interface ImportMetaEnvLike {
  ENABLE_TRANSCRIPTION_STATUS?: string;
}
const ENABLE_TRANSCRIPTION_STATUS =
  ((import.meta as ImportMeta & { env?: ImportMetaEnvLike }).env?.ENABLE_TRANSCRIPTION_STATUS) !== 'false';

// Augment Window interface for diagnostic flag
declare global {
  interface Window {
    __STT_DIAG_AUTO_RAN__?: boolean;
  }
}

interface DiagnosticResult {
  status: string;
  text: string;
  confidence: number;
  originalFormat?: string;
  convertedFormat?: string;
  error?: string;
  duration: number;
  timestamp: string;
  textPreview: string;
}

/**
 * Very small PCM WAV saying (example placeholder tone / silence).
 * Replace with another short utterance sample (must remain small for fast tests).
 *
 * This is a 16-bit mono 16kHz PCM WAV header + minimal data (mostly silence).
 */
const TEST_WAV_BASE64 =
  'UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAAA/////wAAAAD///8AAAAA/////wAAAA==';

/**
 * Convert base64 to Blob
 */
function base64ToBlob(base64: string, mime = 'audio/wav'): Blob {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    bytes[i] = byteChars.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/**
 * Core runner
 */
export async function runAudioDiagnostic(): Promise<DiagnosticResult | null> {
  console.log(`[STT:DIAG] Starting diagnostic... (ENABLE_TRANSCRIPTION_STATUS=${ENABLE_TRANSCRIPTION_STATUS})`);

  // Ensure speech service initialized (if the app didn't already)
  try {
    const status = speechService.getStatus?.();
    if (!status?.isInitialized) {
      console.warn('[STT:DIAG] Speech service not initialized. Attempting lazy initialization from env (if available).');
      // If the main app does initialization elsewhere, this may be a no-op.
      // We cannot auto-config because keys/region live in application config.
      // User must have triggered normal initialization path before running this script.
    }
  } catch {
    // Non-fatal
  }

  let blob: Blob;
  try {
    blob = base64ToBlob(TEST_WAV_BASE64, 'audio/wav');
    console.log('[STT:DIAG] Created test WAV blob:', {
      size: blob.size,
      type: blob.type
    });
  } catch (e) {
    console.error('[STT:DIAG] Failed to create test blob:', e);
    return null;
  }

  const start = performance.now();
  try {
    console.log('[STT:DIAG] Invoking speechService.transcribeAudio...');
    const result = await speechService.transcribeAudio(blob);

    // Defensive downgrade if recognized but empty text
    let finalStatus = result.status;
    if (finalStatus === 'recognized' && (!result.text || result.text.trim().length === 0)) {
      console.warn('[STT:DIAG] ⚠️ recognized status with empty text - treating as no_match');
      finalStatus = 'no_match';
    }

    const diag: DiagnosticResult = {
      status: finalStatus,
      text: result.text,
      confidence: result.confidence,
      originalFormat: result.originalFormat,
      convertedFormat: result.convertedFormat,
      error: result.error,
      duration: result.duration,
      timestamp: new Date().toISOString(),
      textPreview: result.text ? result.text.slice(0, 80) : ''
    };

    if (diag.status === 'recognized') {
      console.log('[STT:DIAG] ✅ Transcription SUCCESS:', {
        status: diag.status,
        text: diag.text,
        confidence: diag.confidence
      });
    } else if (diag.status === 'no_match') {
      console.warn('[STT:DIAG] ⚠️ Transcription NO_MATCH (no speech detected).');
    } else if (diag.status === 'conversion_error') {
      console.error('[STT:DIAG] ❌ Conversion Error:', result.error);
    } else if (diag.status === 'timeout') {
      console.error('[STT:DIAG] ⏱️ Timeout during recognition:', result.error);
    } else if (diag.status === 'recognition_error') {
      console.error('[STT:DIAG] ❌ Recognition Error:', result.error);
    } else {
      console.warn('[STT:DIAG] ℹ️ Transcription ended with status:', diag.status);
    }

    console.log('[STT:DIAG] Full result object:', diag);
    console.log('[STT:DIAG] Total wall time (ms):', Math.round(performance.now() - start));
    return diag;
  } catch (error) {
    const isConversionError = error instanceof Error && error.name === 'ConversionError';
    const status = isConversionError ? 'conversion_error' : 'recognition_error';
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[STT:DIAG] ❌ ERROR status=${status}:`, message, error);
    return {
      status,
      text: '',
      confidence: 0,
      originalFormat: 'audio/wav',
      convertedFormat: undefined,
      error: message,
      duration: Math.round(performance.now() - start),
      timestamp: new Date().toISOString(),
      textPreview: ''
    };
  }
}

// Optional auto-run if executed directly (e.g., via dynamic import without manual call)
if (typeof window !== 'undefined') {
  // Avoid duplicate auto-run if user wants manual control
  if (!window.__STT_DIAG_AUTO_RAN__) {
    window.__STT_DIAG_AUTO_RAN__ = true;
    console.log('[STT:DIAG] Auto-running diagnostic (set window.__STT_DIAG_AUTO_RAN__ = false to disable).');
    runAudioDiagnostic();
  }
}