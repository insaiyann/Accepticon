import { useContext } from 'react';
import { ProcessingPipelineContext } from '../contexts/ProcessingPipelineContext';

export const useProcessingPipelineContext = () => {
  const context = useContext(ProcessingPipelineContext);
  if (!context) {
    throw new Error('useProcessingPipelineContext must be used within a ProcessingPipelineProvider');
  }
  return context;
};
