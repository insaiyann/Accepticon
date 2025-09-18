import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import openAIService, { type AIViewerMode } from '../services/azure/OpenAIService';
import { buildSourceText, type BasicMessageLike } from '../utils/sourceAggregation';
import { indexedDBService } from '../services/storage/IndexedDBService';

interface ModeData {
  mermaidCode?: string;
  markdown?: string;
  loading: boolean;
  error?: string;
  updatedAt?: number;
  fromCache?: boolean;
  cacheLevel?: 'memory' | 'persistent' | null;
  inputHash?: string;
}

type ViewerContentState = Record<AIViewerMode, ModeData>;

interface ViewerContentContextValue extends ViewerContentState {
  runMode: (mode: AIViewerMode, opts?: { force?: boolean }) => Promise<void>;
  refreshMode: (mode: AIViewerMode) => Promise<void>;
  hasContent: (mode: AIViewerMode) => boolean;
}

const initialMode: ModeData = { loading: false };
const initialState: ViewerContentState = {
  diagram: { ...initialMode },
  summary: { ...initialMode },
  plan: { ...initialMode },
  technicals: { ...initialMode }
};

const ViewerContentContext = createContext<ViewerContentContextValue | undefined>(undefined);

// Provider now ensures that when modes are triggered (e.g. tab click) the latest
// stored messages are always aggregated into the source text. If no explicit
// messages prop is supplied, it lazily loads all messages from IndexedDB on each
// runMode invocation. This avoids empty source issues when the provider is
// mounted above components that manage message state.
export const ViewerContentProvider: React.FC<{ children: React.ReactNode; messages?: BasicMessageLike[] }> = ({ children, messages }) => {
  const [state, setState] = useState<ViewerContentState>(initialState);
  const inFlight = useRef<Record<AIViewerMode, Promise<void> | null>>({ diagram: null, summary: null, plan: null, technicals: null });

  // Always build source from provided messages if present; otherwise fetch from storage.
  const resolveSourceText = useCallback(async (): Promise<string> => {
    try {
      let workingMessages: BasicMessageLike[];
      if (messages && messages.length > 0) {
        workingMessages = messages;
      } else {
        // Fetch all persisted messages (text, audio w/ transcription, images)
        const all = await indexedDBService.getAllMessages();
        workingMessages = all as unknown as BasicMessageLike[]; // shape compatible
      }
      return buildSourceText(workingMessages);
    } catch (e) {
      console.warn('ViewerContentProvider: failed to assemble source text; proceeding with empty source', e);
      return '';
    }
  }, [messages]);

  const runMode = useCallback(async (mode: AIViewerMode, opts: { force?: boolean } = {}) => {
    if (inFlight.current[mode]) return; // dedupe
    setState(s => ({ ...s, [mode]: { ...s[mode], loading: true, error: undefined } }));
    const task = (async () => {
      try {
        const sourceText = await resolveSourceText();
        const result = await openAIService.generateContent(mode, { sourceText }, { force: opts.force });
        setState(s => ({
          ...s,
          [mode]: {
            ...s[mode],
            loading: false,
            error: undefined,
            mermaidCode: result.mermaidCode,
            markdown: result.markdown,
            fromCache: result.fromCache,
            cacheLevel: result.cacheLevel,
            inputHash: result.inputHash,
            updatedAt: Date.now()
          }
        }));
      } catch (e) {
        setState(s => ({ ...s, [mode]: { ...s[mode], loading: false, error: (e as Error).message } }));
      } finally {
        inFlight.current[mode] = null;
      }
    })();
    inFlight.current[mode] = task;
    await task;
  }, [resolveSourceText]);

  const refreshMode = useCallback((mode: AIViewerMode) => runMode(mode, { force: true }), [runMode]);
  const hasContent = useCallback((mode: AIViewerMode) => !!(state[mode].mermaidCode || state[mode].markdown), [state]);

  return (
    <ViewerContentContext.Provider value={{ ...state, runMode, refreshMode, hasContent }}>
      {children}
    </ViewerContentContext.Provider>
  );
};

export const useViewerContent = () => {
  const ctx = useContext(ViewerContentContext);
  if (!ctx) throw new Error('useViewerContent must be used within a ViewerContentProvider');
  return ctx;
};

export default ViewerContentContext;