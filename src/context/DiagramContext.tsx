import React, { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

export interface DiagramState {
  mermaidCode?: string;
  title?: string;
  updatedAt?: number; // useful for debugging / forcing refresh
}

interface DiagramContextValue extends DiagramState {
  setDiagram: (code: string, title?: string) => void;
  clearDiagram: () => void;
}

const DiagramContext = createContext<DiagramContextValue | undefined>(undefined);

export const DiagramProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<DiagramState>({});

  const setDiagram = useCallback((code: string, title?: string) => {
    setState({ mermaidCode: code, title, updatedAt: Date.now() });
    console.log('🧩 DiagramContext: Diagram updated', { length: code?.length, title });
  }, []);

  const clearDiagram = useCallback(() => {
    setState({});
    console.log('🧹 DiagramContext: Diagram cleared');
  }, []);

  return (
    <DiagramContext.Provider value={{ ...state, setDiagram, clearDiagram }}>
      {children}
    </DiagramContext.Provider>
  );
};

export const useDiagram = () => {
  const ctx = useContext(DiagramContext);
  if (!ctx) throw new Error('useDiagram must be used within a DiagramProvider');
  return ctx;
};

export default DiagramContext;