// Comprehensive Audio Processing Diagnostic Tool
// Paste this into browser console to diagnose all issues

console.log('🔧 Starting Comprehensive Audio Processing Diagnostic...');

const DIAGNOSTIC = {
  DATABASE_NAME: 'MermaidPWADB',
  STORES: {
    MESSAGES: 'messages',
    AUDIO_MESSAGES: 'audioMessages'
  }
};

// Test 1: Database Connection and Structure
async function testDatabaseStructure() {
  console.log('\n=== 🗄️ DATABASE STRUCTURE TEST ===');
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DIAGNOSTIC.DATABASE_NAME, 1);
    
    request.onsuccess = () => {
      const db = request.result;
      console.log('✅ Database connected successfully');
      console.log('📊 Available stores:', Array.from(db.objectStoreNames));
      
      const hasMessagesStore = db.objectStoreNames.contains(DIAGNOSTIC.STORES.MESSAGES);
      const hasAudioStore = db.objectStoreNames.contains(DIAGNOSTIC.STORES.AUDIO_MESSAGES);
      
      console.log(`📝 Messages store exists: ${hasMessagesStore}`);
      console.log(`🎤 Audio messages store exists: ${hasAudioStore}`);
      
      if (!hasAudioStore) {
        console.error('❌ CRITICAL: Audio messages store missing!');
      }
      
      db.close();
      resolve({ hasMessagesStore, hasAudioStore });
    };
    
    request.onerror = () => {
      console.error('❌ Database connection failed:', request.error);
      reject(request.error);
    };
  });
}

// Test 2: Audio Message Storage and Retrieval
async function testAudioMessageFlow() {
  console.log('\n=== 🎵 AUDIO MESSAGE FLOW TEST ===');
  
  return new Promise((resolve) => {
    const request = indexedDB.open(DIAGNOSTIC.DATABASE_NAME, 1);
    
    request.onsuccess = () => {
      const db = request.result;
      
      // Get all audio messages
      const transaction = db.transaction([DIAGNOSTIC.STORES.AUDIO_MESSAGES], 'readonly');
      const store = transaction.objectStore('audioMessages');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => {
        const audioMessages = getAllRequest.result;
        console.log(`📊 Found ${audioMessages.length} audio messages in database`);
        
        if (audioMessages.length === 0) {
          console.warn('⚠️ No audio messages found. Record an audio message first!');
          db.close();
          resolve([]);
          return;
        }
        
        // Test each audio message
        audioMessages.forEach((msg, index) => {
          console.log(`\n🎵 Audio Message ${index + 1}:`);
          console.log(`   ID: ${msg.id}`);
          console.log(`   Type: ${msg.type}`);
          console.log(`   Duration: ${msg.duration}ms`);
          console.log(`   Timestamp: ${new Date(msg.timestamp).toLocaleString()}`);
          console.log(`   Has Audio Blob: ${!!msg.audioBlob}`);
          console.log(`   Blob Size: ${msg.audioBlob?.size || 0} bytes`);
          console.log(`   Blob Type: ${msg.audioBlob?.type || 'unknown'}`);
          console.log(`   Has Transcription: ${!!msg.transcription}`);
          console.log(`   Transcription: "${msg.transcription || 'none'}"`);
          console.log(`   Content: "${msg.content || 'none'}"`);
        });
        
        db.close();
        resolve(audioMessages);
      };
      
      getAllRequest.onerror = () => {
        console.error('❌ Failed to retrieve audio messages:', getAllRequest.error);
        db.close();
        resolve([]);
      };
    };
  });
}

// Test 3: Message ID Consistency
async function testMessageIdConsistency() {
  console.log('\n=== 🔗 MESSAGE ID CONSISTENCY TEST ===');
  
  // Get messages from React state (if available)
  const messageElements = document.querySelectorAll('[data-message-id]');
  const uiMessageIds = Array.from(messageElements).map(el => el.getAttribute('data-message-id'));
  
  console.log(`📋 UI shows ${uiMessageIds.length} messages:`, uiMessageIds);
  
  // Get messages from IndexedDB
  const audioMessages = await testAudioMessageFlow();
  const dbMessageIds = audioMessages.map(msg => msg.id);
  
  console.log(`🗄️ Database has ${dbMessageIds.length} audio message IDs:`, dbMessageIds);
  
  // Check for mismatches
  const uiAudioIds = uiMessageIds.filter(id => id && id.startsWith('audio_'));
  const missingInDB = uiAudioIds.filter(id => !dbMessageIds.includes(id));
  const missingInUI = dbMessageIds.filter(id => !uiAudioIds.includes(id));
  
  if (missingInDB.length > 0) {
    console.error('❌ Audio message IDs in UI but not in database:', missingInDB);
  }
  
  if (missingInUI.length > 0) {
    console.error('❌ Audio message IDs in database but not in UI:', missingInUI);
  }
  
  if (missingInDB.length === 0 && missingInUI.length === 0) {
    console.log('✅ Message ID consistency check passed');
  }
  
  return { uiAudioIds, dbMessageIds, missingInDB, missingInUI };
}

// Test 4: Processing Pipeline Test
async function testProcessingPipeline() {
  console.log('\n=== ⚙️ PROCESSING PIPELINE TEST ===');
  
  const audioMessages = await testAudioMessageFlow();
  
  if (audioMessages.length === 0) {
    console.warn('⚠️ No audio messages to test processing pipeline with');
    return;
  }
  
  console.log('🔧 Testing message retrieval in processing pipeline style...');
  
  // Simulate what the processing pipeline does
  const messageIds = audioMessages.map(msg => msg.id);
  console.log('📋 Message IDs to process:', messageIds);
  
  // Test individual message retrieval
  return new Promise((resolve) => {
    const request = indexedDB.open(DIAGNOSTIC.DATABASE_NAME, 1);
    
    request.onsuccess = () => {
      const db = request.result;
      
      const retrievedMessages = [];
      let completed = 0;
      
      messageIds.forEach(async (id, index) => {
        console.log(`🔍 Testing retrieval of message: ${id}`);
        
        // First try audio messages store
        const audioTransaction = db.transaction([DIAGNOSTIC.STORES.AUDIO_MESSAGES], 'readonly');
        const audioStore = audioTransaction.objectStore('audioMessages');
        const audioRequest = audioStore.get(id);
        
        audioRequest.onsuccess = () => {
          const message = audioRequest.result;
          
          if (message) {
            console.log(`✅ Found message ${id} in audio store`);
            console.log(`   Type: ${message.type}, Has Blob: ${!!message.audioBlob}`);
            retrievedMessages.push(message);
          } else {
            console.error(`❌ Message ${id} NOT found in audio store!`);
          }
          
          completed++;
          if (completed === messageIds.length) {
            console.log(`\n📊 Retrieved ${retrievedMessages.length}/${messageIds.length} messages`);
            
            // Test type filtering
            const audioFiltered = retrievedMessages.filter(m => m.type === 'audio');
            console.log(`🎤 Audio messages after type filtering: ${audioFiltered.length}`);
            
            if (audioFiltered.length !== retrievedMessages.length) {
              console.error('❌ Type filtering issue detected!');
            }
            
            db.close();
            resolve(retrievedMessages);
          }
        };
        
        audioRequest.onerror = () => {
          console.error(`❌ Error retrieving message ${id}:`, audioRequest.error);
          completed++;
          if (completed === messageIds.length) {
            db.close();
            resolve(retrievedMessages);
          }
        };
      });
    };
  });
}

// Test 5: Generate Test Diagram
async function testDiagramGeneration() {
  console.log('\n=== 🎨 DIAGRAM GENERATION TEST ===');
  
  const audioMessages = await testAudioMessageFlow();
  
  if (audioMessages.length === 0) {
    console.warn('⚠️ No audio messages available for diagram generation test');
    return;
  }
  
  console.log('🎯 Simulating diagram generation process...');
  
  // Get message IDs
  const messageIds = audioMessages.map(msg => msg.id);
  console.log('📋 Message IDs for diagram generation:', messageIds);
  
  // Check which messages have transcriptions
  const withTranscription = audioMessages.filter(msg => msg.transcription);
  const withoutTranscription = audioMessages.filter(msg => !msg.transcription);
  
  console.log(`📝 Messages with transcription: ${withTranscription.length}`);
  console.log(`❓ Messages without transcription: ${withoutTranscription.length}`);
  
  if (withoutTranscription.length > 0) {
    console.warn('⚠️ Some audio messages lack transcription - they will need to be processed');
    withoutTranscription.forEach(msg => {
      console.log(`   - ${msg.id}: No transcription, blob size: ${msg.audioBlob?.size || 0}`);
    });
  }
  
  // Calculate combined text content
  const textContent = withTranscription.map(msg => msg.transcription).join('\n\n');
  console.log(`📄 Combined text content (${textContent.length} chars):`, textContent || '(empty)');
  
  if (!textContent.trim()) {
    console.error('❌ No text content available for diagram generation!');
    console.log('💡 This is likely why diagrams are not being generated from audio messages');
  } else {
    console.log('✅ Text content available for diagram generation');
  }
}

// Run all diagnostic tests
async function runFullDiagnostic() {
  console.log('🚀 Starting Full Audio Processing Diagnostic...\n');
  
  try {
    const dbResult = await testDatabaseStructure();
    
    if (!dbResult.hasAudioStore) {
      console.error('❌ CRITICAL ERROR: Audio messages store not found. Cannot continue.');
      return;
    }
    
    await testAudioMessageFlow();
    await testMessageIdConsistency();
    await testProcessingPipeline();
    await testDiagramGeneration();
    
    console.log('\n🎉 DIAGNOSTIC COMPLETE!');
    console.log('\n📋 SUMMARY:');
    console.log('1. If no audio messages found: Record an audio message first');
    console.log('2. If audio messages found but no transcription: Check Azure Speech Service');
    console.log('3. If transcriptions exist but no diagram: Check diagram generation logic');
    console.log('4. If message ID mismatches: Check React state management');
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
  }
}

// Export functions for manual use
window.audioDiagnostic = {
  runFullDiagnostic,
  testDatabaseStructure,
  testAudioMessageFlow,
  testMessageIdConsistency,
  testProcessingPipeline,
  testDiagramGeneration
};

console.log('🔧 Audio Processing Diagnostic Tool Loaded!');
console.log('📝 Run: audioDiagnostic.runFullDiagnostic()');

// Auto-run
runFullDiagnostic();
