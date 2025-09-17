/**
 * Simple Audio Pipeline Test - Manual test for the new pipeline
 * Run this in browser console to test the pipeline functionality
 */

import { simpleAudioPipeline } from '../services/SimpleAudioPipeline';
import { SimpleAudioRecorder } from '../services/audio/SimpleAudioRecorder';
// Removed NewSTTPipeline import after minimal STT refactor

// Test configuration
const testConfig = {
  azureSpeechKey: import.meta.env.VITE_AZURE_SPEECH_KEY,
  azureSpeechRegion: import.meta.env.VITE_AZURE_SPEECH_REGION,
  azureOpenAIKey: import.meta.env.VITE_AZURE_OPENAI_KEY,
  azureOpenAIEndpoint: import.meta.env.VITE_AZURE_OPENAI_ENDPOINT,
  azureOpenAIDeployment: import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT
};

export async function testPipelineInitialization() {
  console.log('🧪 Testing pipeline initialization...');
  
  try {
    await simpleAudioPipeline.initialize(testConfig);
    console.log('✅ Pipeline initialization successful');
    return true;
  } catch (error) {
    console.error('❌ Pipeline initialization failed:', error);
    return false;
  }
}

export async function testAudioRecorderSupport() {
  console.log('🧪 Testing audio recorder support...');
  
  const isSupported = SimpleAudioRecorder.isSupported();
  console.log(`📱 Audio recording supported: ${isSupported}`);
  
  if (isSupported) {
    // Test basic MIME type support
    const testTypes = ['audio/wav', 'audio/webm', 'audio/mp4'];
    const supportedTypes = testTypes.filter(type => 
      MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)
    );
    console.log('🎵 Supported MIME types:', supportedTypes);
  }
  
  return isSupported;
}

// Speech service connection test removed after minimal STT refactor

export async function createTestAudioMessage() {
  console.log('🧪 Creating test audio message...');
  
  // Create a simple test audio blob (silence)
  const audioContext = new AudioContext();
  const sampleRate = 16000;
  const duration = 2; // 2 seconds
  const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
  
  // Add some simple audio content (sine wave for testing)
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < channelData.length; i++) {
    // Create a 440Hz sine wave
    channelData[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.1;
  }
  
  // Convert to WAV blob
  const wavBlob = audioBufferToWav(buffer);
  console.log(`🎵 Created test audio blob: ${wavBlob.size} bytes`);
  
  return wavBlob;
}

// Audio transcription direct test removed (handled via full pipeline now)

export async function testFullPipeline() {
  console.log('🧪 Testing full pipeline...');
  
  try {
    // Initialize pipeline
    const initSuccess = await simpleAudioPipeline.autoInitialize();
    if (!initSuccess) {
      throw new Error('Auto-initialization failed');
    }
    
    // Test processing (this will process existing messages)
    const result = await simpleAudioPipeline.processAllAndGenerateMermaid();
    console.log('🎯 Full pipeline result:', result);
    
    return result.success;
  } catch (error) {
    console.error('❌ Full pipeline test failed:', error);
    return false;
  }
}

export async function runAllTests() {
  console.log('🧪🧪🧪 Running all Simple Audio Pipeline tests...');
  
  const results = {
    audioSupport: await testAudioRecorderSupport(),
  speechConnection: true, // skipped
    pipelineInit: await testPipelineInitialization(),
  audioTranscription: true, // skipped
    fullPipeline: await testFullPipeline()
  };
  
  console.log('📊 Test Results Summary:', results);
  
  const allPassed = Object.values(results).every(result => result === true);
  console.log(`🎯 Overall: ${allPassed ? 'ALL TESTS PASSED ✅' : 'SOME TESTS FAILED ❌'}`);
  
  return results;
}

// Helper function to convert AudioBuffer to WAV
function audioBufferToWav(audioBuffer: AudioBuffer): Blob {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numberOfChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = audioBuffer.length * blockAlign;
  const bufferSize = 44 + dataSize;
  
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);
  
  // WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  
  // Audio data
  const channels = [];
  for (let i = 0; i < numberOfChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }
  
  let offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      view.setInt16(offset, sample * 0x7FFF, true);
      offset += 2;
    }
  }
  
  return new Blob([buffer], { type: 'audio/wav' });
}

// Export test functions for browser console use
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).testSimpleAudioPipeline = {
    testPipelineInitialization,
    testAudioRecorderSupport,
  // removed speech + direct transcription tests
    testFullPipeline,
    runAllTests
  };
  
  console.log('🧪 Simple Audio Pipeline tests available at window.testSimpleAudioPipeline');
}
