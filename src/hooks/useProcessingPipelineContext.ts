// Deprecated compatibility wrapper
export const useProcessingPipelineContext = () => ({ isInitialized:false });
export default useProcessingPipelineContext;
// Backward compatibility wrapper for the old useProcessingPipelineContext
// This re-exports the new simple pipeline hook to avoid breaking existing imports

export { useSimpleAudioPipeline as useProcessingPipelineContext } from './useSimpleAudioPipeline';
