// Quick test for the new simplified STT pipeline
// Run this in the browser console to test functionality

console.log('🧪 Testing Simplified STT Pipeline...');

// Test 1: Check if service is available
if (window.simplifiedSTTPipelineService) {
  console.log('✅ SimplifiedSTTPipelineService is available');
  
  // Test 2: Check initialization status
  const isReady = window.simplifiedSTTPipelineService.isReady();
  console.log(`🔧 Pipeline ready: ${isReady}`);
  
  // Test 3: Try to get audio messages count
  window.indexedDBService.getAudioMessages().then(audioMessages => {
    console.log(`🎤 Found ${audioMessages.length} audio messages in database`);
    
    audioMessages.forEach((msg, index) => {
      console.log(`   ${index + 1}. ${msg.id} - ${msg.transcriptionStatus || 'no status'} - "${msg.transcription || 'no transcription'}"`);
    });
  });
  
  // Test 4: Check text messages
  window.indexedDBService.getTextMessages().then(textMessages => {
    console.log(`📝 Found ${textMessages.length} text messages in database`);
  });
  
  // Test 5: Check image messages
  window.indexedDBService.getImageMessages().then(imageMessages => {
    console.log(`🖼️ Found ${imageMessages.length} image messages in database`);
  });
  
  console.log('💡 To test full pipeline, record some audio messages and click "Generate Mermaid from All Threads"');
  
} else {
  console.error('❌ SimplifiedSTTPipelineService not available. Make sure you\'re in development mode.');
}

// Test helper function to manually trigger pipeline
window.testSimplifiedPipeline = async function() {
  console.log('🚀 Manually triggering simplified pipeline...');
  
  try {
    const result = await window.simplifiedSTTPipelineService.processAllThreadsAndGenerateMermaid();
    
    if (result.success) {
      console.log('✅ Pipeline succeeded!');
      console.log('📊 Mermaid code length:', result.mermaidCode?.length || 0);
      console.log('📋 Title:', result.title || 'No title');
      console.log('🎨 Mermaid code preview:', result.mermaidCode?.substring(0, 100) + '...');
    } else {
      console.error('❌ Pipeline failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Pipeline error:', error);
  }
};

console.log('💡 Use window.testSimplifiedPipeline() to manually test the pipeline');
