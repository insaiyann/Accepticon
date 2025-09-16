// Audio Format Fix Test Script
// Run this in the browser console to test the format compatibility fix

console.log('🧪 Testing Audio Format Fix...');

async function testAudioFormatFix() {
  try {
    console.log('\n=== 🎵 AUDIO FORMAT COMPATIBILITY TEST ===');
    
    // Test supported formats
    const formats = [
      'audio/wav',
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
      'audio/mpeg'
    ];
    
    console.log('1. Browser Format Support:');
    formats.forEach(format => {
      try {
        const supported = MediaRecorder.isTypeSupported(format);
        console.log(`${supported ? '✅' : '❌'} ${format}`);
      } catch (e) {
        console.log(`❌ ${format} (error checking)`);
      }
    });
    
    // Test Azure compatibility detection
    if (window.speechService && window.speechService.canUseAudioDirectly) {
      console.log('\n2. Azure Speech Service Compatibility:');
      formats.forEach(format => {
        const compatible = window.speechService.canUseAudioDirectly(format);
        console.log(`${compatible ? '✅' : '❌'} ${format} -> ${compatible ? 'DIRECT' : 'NEEDS_CONVERSION'}`);
      });
    } else {
      console.log('\n2. ⚠️ Speech service not available or updated - refresh page to test');
    }
    
    // Test actual recording
    console.log('\n3. Recording Test (5 seconds with optimal format)...');
    console.log('🗣️ SPEAK NOW - Test the fixed audio processing!');
    
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 16000
      }
    });
    
    // Get the best format for recording
    const bestFormat = formats.find(format => MediaRecorder.isTypeSupported(format)) || 'audio/webm';
    console.log(`🎤 Using format: ${bestFormat}`);
    
    const mediaRecorder = new MediaRecorder(stream, { mimeType: bestFormat });
    const chunks = [];
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      console.log('🎵 Recording completed');
      
      const audioBlob = new Blob(chunks, { type: bestFormat });
      console.log('📊 Audio blob:', {
        size: audioBlob.size,
        type: audioBlob.type,
        sizeKB: Math.round(audioBlob.size / 1024)
      });
      
      // Stop tracks
      stream.getTracks().forEach(track => track.stop());
      
      // Test transcription with the fix
      if (window.speechService) {
        console.log('\n4. Testing Fixed Transcription...');
        
        try {
          const startTime = Date.now();
          const result = await window.speechService.transcribeAudio(audioBlob);
          const processingTime = Date.now() - startTime;
          
          console.log('\n🎯 FIXED TRANSCRIPTION RESULT:');
          console.log('Status:', result.status);
          console.log('Text:', result.text || '(empty)');
          console.log('Confidence:', result.confidence);
          console.log('Processing Time:', processingTime + 'ms');
          console.log('Original Format:', result.originalFormat);
          console.log('Converted Format:', result.convertedFormat || 'none (direct)');
          console.log('Error:', result.error || 'none');
          
          if (result.status === 'recognized' && result.text) {
            console.log('🎉 SUCCESS: Audio format fix working!');
            console.log(`💬 Transcribed: "${result.text}"`);
          } else if (result.status === 'no_match') {
            console.log('⚠️ NO_MATCH: Still getting no match - may need louder/clearer speech');
          } else {
            console.log(`❌ UNEXPECTED: Status ${result.status}`);
          }
          
          // Check if conversion was avoided
          if (!result.convertedFormat) {
            console.log('✅ OPTIMIZATION: No format conversion needed!');
          } else {
            console.log('ℹ️ INFO: Format conversion was performed');
          }
          
        } catch (error) {
          console.error('❌ Transcription failed:', error);
        }
      } else {
        console.log('⚠️ Speech service not available');
      }
    };
    
    mediaRecorder.start();
    console.log('🔴 RECORDING... (5 seconds)');
    
    setTimeout(() => {
      if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    }, 5000);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testAudioFormatFix();

console.log('\n💡 This test checks if the audio format fix resolves the no_match issue');
console.log('   Key improvements:');
console.log('   - Uses Azure-compatible formats directly when possible');
console.log('   - Avoids unnecessary format conversion');
console.log('   - Reduces audio data corruption');
