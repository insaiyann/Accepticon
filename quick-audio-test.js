// Quick Audio Message Test - Paste into browser console

console.log('🧪 Quick Audio Message Test Started');

async function quickAudioTest() {
  console.log('\n=== Quick Audio Message Diagnosis ===');
  
  // Test 1: Check database structure
  console.log('\n1. Testing database connection...');
  try {
    const request = indexedDB.open('MermaidPWADB', 1);
    
    request.onsuccess = () => {
      const db = request.result;
      console.log('✅ Database connected');
      console.log('📊 Available stores:', Array.from(db.objectStoreNames));
      
      // Test 2: Check for audio messages
      console.log('\n2. Checking for audio messages...');
      const audioTransaction = db.transaction(['audioMessages'], 'readonly');
      const audioStore = audioTransaction.objectStore('audioMessages');
      const audioRequest = audioStore.getAll();
      
      audioRequest.onsuccess = () => {
        const audioMessages = audioRequest.result;
        console.log(`📊 Found ${audioMessages.length} audio messages in database`);
        
        if (audioMessages.length > 0) {
          console.log('\n3. Audio message details:');
          audioMessages.forEach((msg, i) => {
            console.log(`   ${i + 1}. ID: ${msg.id}`);
            console.log(`      Type: ${msg.type}`);
            console.log(`      Has Blob: ${!!msg.audioBlob}`);
            console.log(`      Blob Size: ${msg.audioBlob?.size || 0} bytes`);
            console.log(`      Has Transcription: ${!!msg.transcription}`);
            console.log(`      Transcription: "${msg.transcription || 'none'}"`);
          });
          
          // Test 3: Simulate message retrieval
          console.log('\n4. Testing message retrieval (simulating ProcessingPipeline)...');
          const firstMessage = audioMessages[0];
          
          // Try to retrieve it using the same method as ProcessingPipeline
          const retrieveTransaction = db.transaction(['audioMessages'], 'readonly');
          const retrieveStore = retrieveTransaction.objectStore('audioMessages');
          const retrieveRequest = retrieveStore.get(firstMessage.id);
          
          retrieveRequest.onsuccess = () => {
            const retrieved = retrieveRequest.result;
            console.log(`🔍 Retrieved message ${firstMessage.id}:`, {
              found: !!retrieved,
              type: retrieved?.type,
              hasBlob: !!retrieved?.audioBlob,
              hasTranscription: !!retrieved?.transcription
            });
            
            if (retrieved && retrieved.type === 'audio') {
              console.log('✅ Audio message retrieval works correctly');
            } else {
              console.error('❌ Audio message retrieval failed');
            }
          };
        } else {
          console.log('⚠️ No audio messages found. Please:');
          console.log('   1. Click the microphone button');
          console.log('   2. Record a short audio message');
          console.log('   3. Run this test again');
        }
      };
      
      db.close();
    };
    
    request.onerror = () => {
      console.error('❌ Database connection failed:', request.error);
    };
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Test 4: Check current UI state
console.log('\n5. Checking UI state...');
const messageElements = document.querySelectorAll('[data-message-id]');
console.log(`📋 UI shows ${messageElements.length} message elements`);

// Run the test
quickAudioTest();

console.log('\n💡 After recording an audio message, run quickAudioTest() again to check results');
