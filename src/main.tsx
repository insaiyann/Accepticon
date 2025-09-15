import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

// Import services for debugging
import { indexedDBService } from './services/storage/IndexedDBService';
import { azureSpeechService } from './services/azure/SpeechService';
import { audioRecorderService } from './services/audio/AudioRecorder';
import { processingPipelineService } from './services/ProcessingPipeline';

// Expose services to window for debugging (development only)
if (import.meta.env.DEV) {
  const globalWindow = window as typeof window & {
    indexedDBService: typeof indexedDBService;
    speechService: typeof azureSpeechService;
    audioRecorderService: typeof audioRecorderService;
    processingPipelineService: typeof processingPipelineService;
  };
  
  globalWindow.indexedDBService = indexedDBService;
  globalWindow.speechService = azureSpeechService;
  globalWindow.audioRecorderService = audioRecorderService;
  globalWindow.processingPipelineService = processingPipelineService;
  
  console.log('🔧 Debug mode: Services exposed to window object');
  console.log('💡 Use window.debugSpeech.runAllTests() to test speech pipeline');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
