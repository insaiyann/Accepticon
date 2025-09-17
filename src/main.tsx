import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

// Import services for debugging
import { indexedDBService } from './services/storage/IndexedDBService';
import { audioRecorderService } from './services/audio/AudioRecorder';
import { speechTranscriptionPipeline } from './services/speech/SpeechTranscriptionPipeline';

// Expose services to window for debugging (development only)
if (import.meta.env.DEV) {
  const globalWindow = window as typeof window & {
    indexedDBService: typeof indexedDBService;
    audioRecorderService: typeof audioRecorderService;
    speechTranscriptionPipeline: typeof speechTranscriptionPipeline;
  };
  
  globalWindow.indexedDBService = indexedDBService;
  globalWindow.audioRecorderService = audioRecorderService;
  globalWindow.speechTranscriptionPipeline = speechTranscriptionPipeline;
  
  console.log('[main] Debug mode: services exposed on window');
  console.log('[main] Use window.speechTranscriptionPipeline for manual testing');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)


