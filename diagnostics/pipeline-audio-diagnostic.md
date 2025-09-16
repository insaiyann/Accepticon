# STT Pipeline Audio Diagnostic

Purpose: Quickly validate the Speech-to-Text (STT) pipeline (conversion + recognition + status mapping) independently of the UI and message storage.

## Contents
- [`pipeline-audio-diagnostic.ts`](./pipeline-audio-diagnostic.ts) creates a tiny WAV Blob from embedded base64 and calls the shared speech service: `speechService.transcribeAudio()`.
- Logs a structured result object including:
  - status
  - text length + preview
  - confidence
  - originalFormat / convertedFormat
  - duration (ms)
  - error (if any)
  - timestamp

## Prerequisites
1. Application already initialized (speechService already configured via normal app init).
2. Feature flag `ENABLE_TRANSCRIPTION_STATUS` (in `.env` or `.env.example`) may be on/off; diagnostic still works.

## Running (Browser DevTools)
1. Build / run the app normally (e.g. `npm run dev`).
2. Open DevTools (F12) → Console.
3. Paste (or import via an ESM dynamic import) one of:

Inline quick run:
```js
import('/diagnostics/pipeline-audio-diagnostic.ts')
  .then(m => m.runAudioDiagnostic?.())
  .catch(console.error);
```

If Vite does not serve the diagnostics folder, temporarily move the script into `src/diagnostics/` or copy the function body manually.

## Expected Output
Example (successful recognition):
```
[STT:DIAG] Starting diagnostic...
[STT:DIAG] Created test WAV blob: { size: 17644, type: 'audio/wav' }
[STT:DIAG] Transcription result:
{
  status: 'recognized',
  text: 'hello world',
  confidence: 0.92,
  originalFormat: 'audio/wav',
  convertedFormat: 'audio/wav',
  ...
}
```

Example (no_match):
```
[STT:DIAG] Transcription result: { status: 'no_match', text: '', confidence: 0 }
```

Example (conversion_error):
```
[STT:DIAG] ERROR: Conversion failed ... status=conversion_error
```

## Status Semantics (Reference)
- pending: Not yet processed (never returned in this script).
- processing: In-flight (internal only).
- conversion_error: Audio format conversion failed.
- recognition_error: Downstream service error / cancellation (non-timeout).
- timeout: Recognizer timed out (if surfaced by SDK).
- no_match: Completed but no valid speech.
- recognized: Text returned (non-empty).

## Updating / Extending
- Replace `TEST_WAV_BASE64` with a different short utterance to test phonetic edge cases.
- Add multiple blobs and run sequentially to stress test conversion.

## Safety
- No network calls beyond the normal speech service endpoint.
- Blob built entirely in-memory; no persistent storage writes.

## Troubleshooting
| Symptom | Action |
|---------|--------|
| status always recognition_error | Verify subscription key / region and CORS |
| status conversion_error | Inspect console for conversion stack; check mime |
| recognized but empty text | Should auto-downgrade to no_match; if not, file a bug |
| confidence undefined | Ensure SpeechSDK returns JSON with confidence; else fallback logic may need update |

## Minimal One-Liner
```js
import('/diagnostics/pipeline-audio-diagnostic.ts').then(m => m.runAudioDiagnostic());
```

## Related Scripts
- [`quick-audio-test.js`](../quick-audio-test.js) (UI + IndexedDB inspection)
- This diagnostic focuses solely on the raw STT path, independent of IndexedDB mutations.
