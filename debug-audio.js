// Debug script to check audio message processing
// Run this in browser console after recording audio messages

console.log('🔍 Starting Audio Debug Analysis...');

// Function to check IndexedDB contents
async function debugIndexedDB() {
  console.log('📊 Checking IndexedDB contents...');
  
  return new Promise((resolve) => {
    const request = indexedDB.open('MermaidPWADB', 1); // Fixed database name!
    
    request.onsuccess = () => {
      const db = request.result;
      
      // Check MESSAGES store
      const textTransaction = db.transaction(['messages'], 'readonly');
      const textStore = textTransaction.objectStore('messages');
      const textRequest = textStore.getAll();
      
      textRequest.onsuccess = () => {
        console.log('📝 Text Messages:', textRequest.result);
      };
      
      // Check AUDIO_MESSAGES store (note: store name is 'audioMessages')
      const audioTransaction = db.transaction(['audioMessages'], 'readonly');
      const audioStore = audioTransaction.objectStore('audioMessages');
      const audioRequest = audioStore.getAll();
      
      audioRequest.onsuccess = () => {
        console.log('🎤 Audio Messages:', audioRequest.result);
        
        audioRequest.result.forEach((msg, index) => {
          console.log(`🎵 Audio Message ${index + 1}:`, {
            id: msg.id,
            type: msg.type,
            hasAudioBlob: !!msg.audioBlob,
            audioBlobSize: msg.audioBlob?.size || 0,
            duration: msg.duration,
            hasTranscription: !!msg.transcription,
            transcription: msg.transcription,
            timestamp: new Date(msg.timestamp).toLocaleString()
          });
        });
        
        resolve();
      };
    };
  });
}

// Function to test audio message retrieval
async function testMessageRetrieval() {
  console.log('🔄 Testing message retrieval...');
  
  // Get all messages from React app
  if (window.indexedDBService) {
    try {
      const allMessages = await window.indexedDBService.getAllMessages();
      console.log('📋 All messages from service:', allMessages);
      
      const audioMessages = allMessages.filter(m => m.type === 'audio');
      console.log(`🎤 Found ${audioMessages.length} audio messages in getAllMessages`);
      
      // Test individual message retrieval
      for (const msg of audioMessages) {
        const retrieved = await window.indexedDBService.getMessage(msg.id);
        console.log(`🔍 Retrieved message ${msg.id}:`, {
          found: !!retrieved,
          type: retrieved?.type,
          hasAudioBlob: !!(retrieved?.audioBlob),
          audioBlobSize: retrieved?.audioBlob?.size || 0,
          hasTranscription: !!(retrieved?.transcription)
        });
      }
    } catch (error) {
      console.error('❌ Error testing message retrieval:', error);
    }
  } else {
    console.warn('⚠️ indexedDBService not available on window');
  }
}

// Function to simulate diagram generation
async function testDiagramGeneration() {
  console.log('🎨 Testing diagram generation...');
  
  if (window.processingPipelineService) {
    try {
      // Get all message IDs
      const allMessages = await window.indexedDBService.getAllMessages();
      const messageIds = allMessages.map(m => m.id);
      
      console.log('🚀 Calling generateDiagramFromMessages with IDs:', messageIds);
      
      const result = await window.processingPipelineService.generateDiagramFromMessages(messageIds);
      console.log('📊 Diagram generation result:', result);
    } catch (error) {
      console.error('❌ Error in diagram generation:', error);
    }
  } else {
    console.warn('⚠️ processingPipelineService not available on window');
  }
}

// Make services available on window for debugging
if (typeof window !== 'undefined') {
  // Try to access services from the React app
  setTimeout(() => {
    // Services should be available after app initialization
    console.log('🔧 Attempting to access services...');
    
    // Try to get services from React context or modules
    const indexedDBService = window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers?.get(1)?.findFiberByHostInstance;
    
    if (!indexedDBService) {
      console.warn('⚠️ Could not access services directly. Please run individual functions manually.');
    }
  }, 2000);
}

// Run the debug analysis
async function runDebugAnalysis() {
  console.log('🚀 Running complete debug analysis...');
  
  try {
    await debugIndexedDB();
    await testMessageRetrieval();
    await testDiagramGeneration();
    
    console.log('✅ Debug analysis complete!');
  } catch (error) {
    console.error('❌ Debug analysis failed:', error);
  }
}

// Auto-run after a delay
setTimeout(runDebugAnalysis, 1000);

console.log('🔧 Debug script loaded. You can also run these functions manually:');
console.log('- debugIndexedDB()');
console.log('- testMessageRetrieval()');
console.log('- testDiagramGeneration()');
console.log('- runDebugAnalysis()');
