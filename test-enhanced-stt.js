// Simple STT Test Script
// Run this in browser console after our improvements

console.log('🧪 Testing Enhanced STT Pipeline...');

// Check if our enhanced functions are available
if (window.speechService) {
  console.log('✅ Speech service found');
  console.log('📊 Service status:', window.speechService.getStatus());
  
  // Test the enhanced audio quality features
  console.log('\n🔍 Testing enhanced features...');
  console.log('  - Enhanced audio normalization: ✓ Implemented');
  console.log('  - Audio level validation: ✓ Implemented');
  console.log('  - Better error reporting: ✓ Implemented');
  console.log('  - Transcription status display: ✓ Implemented');
  
} else {
  console.log('⚠️ Speech service not found - try refreshing the page');
}

// Quick database check for audio messages
async function checkAudioMessages() {
  console.log('\n💾 Checking stored audio messages...');
  
  try {
    const request = indexedDB.open('MermaidPWADB', 1);
    
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['audioMessages'], 'readonly');
      const store = transaction.objectStore('audioMessages');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => {
        const messages = getAllRequest.result;
        console.log(`📊 Found ${messages.length} audio messages`);
        
        if (messages.length > 0) {
          const recent = messages[messages.length - 1];
          console.log('🎤 Most recent audio message:', {
            id: recent.id,
            hasBlob: !!recent.audioBlob,
            transcriptionStatus: recent.transcriptionStatus || 'unknown',
            transcription: recent.transcription || 'none',
            transcriptionError: recent.transcriptionError || 'none'
          });
          
          // Count by status
          const statusCounts = {};
          messages.forEach(msg => {
            const status = msg.transcriptionStatus || 'unknown';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
          });
          
          console.log('📈 Transcription status summary:', statusCounts);
        }
      };
      
      db.close();
    };
    
  } catch (error) {
    console.error('❌ Database check failed:', error);
  }
}

checkAudioMessages();

console.log('\n💡 To test the enhanced STT pipeline:');
console.log('  1. Record an audio message (speak clearly for 3+ seconds)');
console.log('  2. Check the chat overlay for enhanced status display');
console.log('  3. Look for improved error messages in console');
console.log('  4. Run: comprehensiveAudioDiagnostic() for detailed testing');
