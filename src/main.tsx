import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

// Import services for debugging
import { indexedDBService } from './services/storage/IndexedDBService';
import { azureSpeechService } from './services/azure/SpeechService';
import { audioRecorderService } from './services/audio/AudioRecorder';
import { simplifiedSTTPipelineService } from './services/SimplifiedSTTPipeline';

// Expose services to window for debugging (development only)
if (import.meta.env.DEV) {
  const globalWindow = window as typeof window & {
    indexedDBService: typeof indexedDBService;
    speechService: typeof azureSpeechService;
    audioRecorderService: typeof audioRecorderService;
    simplifiedSTTPipelineService: typeof simplifiedSTTPipelineService;
  };
  
  globalWindow.indexedDBService = indexedDBService;
  globalWindow.speechService = azureSpeechService;
  globalWindow.audioRecorderService = audioRecorderService;
  globalWindow.simplifiedSTTPipelineService = simplifiedSTTPipelineService;
  
  console.log('🔧 Debug mode: Services exposed to window object');
  console.log('💡 Use window.simplifiedSTTPipelineService for testing new pipeline');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
