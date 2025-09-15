/**
 * Debug script for testing speech transcription pipeline
 * Run this in the browser console to test speech recognition
 */

// Test speech service directly
async function testSpeechService() {
  console.log('🧪 Testing Speech Service...');
  
  if (!window.speechService) {
    console.error('❌ Speech service not available on window');
    return;
  }
  
  const status = window.speechService.getStatus();
  console.log('📊 Speech service status:', status);
  
  if (!status.isInitialized) {
    console.error('❌ Speech service not initialized');
    return;
  }
  
  // Test configuration
  try {
    const testResult = await window.speechService.testConfiguration();
    console.log('🔧 Configuration test result:', testResult);
  } catch (error) {
    console.error('❌ Configuration test failed:', error);
  }
}

// Test audio recorder formats
function testAudioFormats() {
  console.log('🎤 Testing Audio Formats...');
  
  const types = [
    'audio/wav',
    'audio/webm;codecs=opus',
    'audio/webm;codecs=pcm',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg;codecs=speex',
    'audio/ogg',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/mpeg',
    'audio/3gpp',
    'audio/3gpp2'
  ];
  
  console.log('📋 Format support test:');
  types.forEach(type => {
    const supported = MediaRecorder.isTypeSupported(type);
    console.log(`${supported ? '✅' : '❌'} ${type}`);
  });
}

// Test Web Audio API
async function testWebAudioAPI() {
  console.log('🔊 Testing Web Audio API...');
  
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      console.error('❌ Web Audio API not supported');
      return;
    }
    
    const audioContext = new AudioContextClass({ sampleRate: 16000 });
    console.log('✅ Web Audio API available:', {
      sampleRate: audioContext.sampleRate,
      state: audioContext.state,
      baseLatency: audioContext.baseLatency,
      outputLatency: audioContext.outputLatency
    });
    
    await audioContext.close();
  } catch (error) {
    console.error('❌ Web Audio API test failed:', error);
  }
}

// Test microphone access
async function testMicrophoneAccess() {
  console.log('🎙️ Testing Microphone Access...');
  
  try {
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 16000,
        sampleSize: 16,
        volume: 1.0
      }
    };
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    const track = stream.getAudioTracks()[0];
    const settings = track.getSettings();
    const capabilities = track.getCapabilities();
    
    console.log('✅ Microphone access granted');
    console.log('🎵 Audio track settings:', settings);
    console.log('🎯 Audio track capabilities:', capabilities);
    
    // Cleanup
    stream.getTracks().forEach(track => track.stop());
    
  } catch (error) {
    console.error('❌ Microphone access failed:', error);
  }
}

// Test complete recording and transcription pipeline
async function testCompleteAudioPipeline() {
  console.log('🔄 Testing Complete Audio Pipeline...');
  
  if (!window.audioRecorderService || !window.speechService) {
    console.error('❌ Required services not available');
    return;
  }
  
  try {
    console.log('🎤 Starting recording for 3 seconds...');
    
    // Start recording
    await window.audioRecorderService.startRecording({
      maxDuration: 3000 // 3 seconds
    });
    
    // Wait for recording to complete
    await new Promise(resolve => setTimeout(resolve, 3500));
    
    // Stop recording
    const result = await window.audioRecorderService.stopRecording();
    console.log('🎵 Recording completed:', {
      size: result.blob.size,
      type: result.blob.type,
      duration: result.duration
    });
    
    // Test transcription
    console.log('📝 Starting transcription...');
    const transcription = await window.speechService.transcribeAudio(result.blob);
    console.log('✅ Transcription completed:', transcription);
    
  } catch (error) {
    console.error('❌ Pipeline test failed:', error);
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Running all speech debug tests...');
  console.log('═'.repeat(50));
  
  await testAudioFormats();
  console.log('─'.repeat(30));
  
  await testWebAudioAPI();
  console.log('─'.repeat(30));
  
  await testMicrophoneAccess();
  console.log('─'.repeat(30));
  
  await testSpeechService();
  console.log('─'.repeat(30));
  
  console.log('💬 Ready to test complete pipeline. Run testCompleteAudioPipeline() when ready.');
  console.log('🎤 Make sure to speak clearly when recording starts!');
}

// Export functions to global scope
window.debugSpeech = {
  testSpeechService,
  testAudioFormats,
  testWebAudioAPI,
  testMicrophoneAccess,
  testCompleteAudioPipeline,
  runAllTests
};

console.log('🔧 Speech debug utilities loaded. Use window.debugSpeech.runAllTests() to start.');
