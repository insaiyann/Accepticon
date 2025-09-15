// Manual test script for audio message debugging
// Paste this into browser console after the app has loaded

console.log('🧪 Starting Manual Audio Debug Test...');

// Test 1: Check if IndexedDB has audio messages
async function testIndexedDBContents() {
  console.log('\n=== TEST 1: IndexedDB Contents ===');
  
  const request = indexedDB.open('MermaidPWADB', 1); // Fixed database name!
  
  return new Promise((resolve) => {
    request.onsuccess = () => {
      const db = request.result;
      
      // Check audioMessages store (note: store name is 'audioMessages', not 'AUDIO_MESSAGES')
      const audioTransaction = db.transaction(['audioMessages'], 'readonly');
      const audioStore = audioTransaction.objectStore('audioMessages');
      const audioRequest = audioStore.getAll();
      
      audioRequest.onsuccess = () => {
        const audioMessages = audioRequest.result;
        console.log(`📊 Found ${audioMessages.length} audio messages in audioMessages store:`);
        
        audioMessages.forEach((msg, i) => {
          console.log(`  ${i + 1}. ${msg.id} - Size: ${msg.audioBlob?.size || 0} bytes, Type: ${msg.audioBlob?.type || 'unknown'}`);
        });
        
        resolve(audioMessages);
      };
    };
  });
}

// Test 2: Check React state messages
function testReactState() {
  console.log('\n=== TEST 2: React State Messages ===');
  
  // Try to access React DevTools to get component state
  const fiber = document.querySelector('#root')?._reactInternalFiber ||
                document.querySelector('#root')?._reactInternals;
  
  if (fiber) {
    console.log('📊 React Fiber found, trying to find message state...');
  } else {
    console.log('⚠️ Could not access React state directly');
  }
  
  // Check for messages in DOM
  const messageElements = document.querySelectorAll('[data-message-id]');
  console.log(`📋 Found ${messageElements.length} message elements in DOM`);
  
  messageElements.forEach((el, i) => {
    const messageId = el.getAttribute('data-message-id');
    const messageType = el.querySelector('[data-message-type]')?.getAttribute('data-message-type');
    console.log(`  ${i + 1}. ${messageId} - Type: ${messageType}`);
  });
}

// Test 3: Manual diagram generation
async function testDiagramGeneration() {
  console.log('\n=== TEST 3: Manual Diagram Generation ===');
  
  // Get all audio messages from IndexedDB
  const audioMessages = await testIndexedDBContents();
  
  if (audioMessages.length === 0) {
    console.log('❌ No audio messages found - cannot test diagram generation');
    return;
  }
  
  // Try to access the processing pipeline directly
  try {
    // Create a manual test by accessing the IndexedDB service
    const request = indexedDB.open('MermaidPWADB', 1); // Fixed database name!
    
    request.onsuccess = () => {
      const db = request.result;
      
      // Get first audio message
      const transaction = db.transaction(['audioMessages'], 'readonly'); // Fixed store name!
      const store = transaction.objectStore('audioMessages');
      const getRequest = store.getAll();
      
      getRequest.onsuccess = () => {
        const messages = getRequest.result;
        if (messages.length > 0) {
          const firstMessage = messages[0];
          console.log('🎯 Testing with first audio message:', {
            id: firstMessage.id,
            type: firstMessage.type,
            hasAudioBlob: !!firstMessage.audioBlob,
            blobSize: firstMessage.audioBlob?.size || 0,
            hasTranscription: !!firstMessage.transcription
          });
          
          // This would be where we test the processing pipeline
          console.log('💡 To test processing pipeline, you would need to:');
          console.log('   1. Access the processing pipeline service');
          console.log('   2. Call generateDiagramFromMessages with this message ID');
          console.log('   3. Watch for detailed logs in the console');
        }
      };
    };
  } catch (error) {
    console.error('❌ Error in manual diagram generation test:', error);
  }
}

// Test 4: Check audio blob integrity
async function testAudioBlobIntegrity() {
  console.log('\n=== TEST 4: Audio Blob Integrity ===');
  
  const request = indexedDB.open('MermaidPWADB', 1); // Fixed database name!
  
  return new Promise((resolve) => {
    request.onsuccess = () => {
      const db = request.result;
      
      const transaction = db.transaction(['audioMessages'], 'readonly'); // Fixed store name!
      const store = transaction.objectStore('audioMessages');
      const getRequest = store.getAll();
      
      getRequest.onsuccess = () => {
        const messages = getRequest.result;
        
        console.log(`🧪 Testing ${messages.length} audio blobs...`);
        
        messages.forEach(async (msg, i) => {
          if (msg.audioBlob) {
            try {
              // Test if blob can be read
              const arrayBuffer = await msg.audioBlob.arrayBuffer();
              console.log(`  ${i + 1}. ${msg.id}:`, {
                blobValid: true,
                size: msg.audioBlob.size,
                type: msg.audioBlob.type,
                arrayBufferSize: arrayBuffer.byteLength,
                hasTranscription: !!msg.transcription
              });
            } catch (error) {
              console.error(`  ${i + 1}. ${msg.id}: Blob read error:`, error);
            }
          } else {
            console.log(`  ${i + 1}. ${msg.id}: No audio blob`);
          }
        });
        
        resolve();
      };
    };
  });
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Running comprehensive audio debug tests...\n');
  
  try {
    await testIndexedDBContents();
    testReactState();
    await testDiagramGeneration();
    await testAudioBlobIntegrity();
    
    console.log('\n✅ All tests completed!');
    console.log('\n📋 Next steps:');
    console.log('1. Record an audio message using the app');
    console.log('2. Run runAllTests() again to see the results');
    console.log('3. Try generating a diagram and watch console logs');
  } catch (error) {
    console.error('❌ Test suite failed:', error);
  }
}

// Export functions to global scope for manual use
window.audioDebugTests = {
  testIndexedDBContents,
  testReactState,
  testDiagramGeneration,
  testAudioBlobIntegrity,
  runAllTests
};

console.log('🔧 Audio debug test suite loaded!');
console.log('📝 Available functions:');
console.log('- audioDebugTests.runAllTests() - Run all tests');
console.log('- audioDebugTests.testIndexedDBContents() - Check IndexedDB');
console.log('- audioDebugTests.testAudioBlobIntegrity() - Test blob integrity');
console.log('\nRun audioDebugTests.runAllTests() to start testing!');

// Auto-run basic test
runAllTests();
