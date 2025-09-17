// Deprecated new STT pipeline hook stub
export const useNewSTTPipeline = () => ({
  isInitialized: false,
  isProcessing: false,
  progress: null as null,
  error: 'Deprecated',
  lastResult: null as null,
  processAudioMessages: async () => false
});

export default useNewSTTPipeline;
