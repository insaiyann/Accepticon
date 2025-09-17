import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

// Import services for debugging
import { indexedDBService } from './services/storage/IndexedDBService';
import { audioRecorderService } from './services/audio/AudioRecorder';
import { newSTTPipelineService } from './services/NewSTTPipeline';

// Expose services to window for debugging (development only)
if (import.meta.env.DEV) {
  const globalWindow = window as typeof window & {
    indexedDBService: typeof indexedDBService;
    audioRecorderService: typeof audioRecorderService;
    newSTTPipelineService: typeof newSTTPipelineService;
  };
  
  globalWindow.indexedDBService = indexedDBService;
  globalWindow.audioRecorderService = audioRecorderService;
  globalWindow.newSTTPipelineService = newSTTPipelineService;
  
  console.log('🔧 Debug mode: Services exposed to window object');
  console.log('💡 Use window.newSTTPipelineService for testing new STT pipeline');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
