import { useState, useEffect, useCallback } from 'react';
import type { Thread, ThreadHierarchy, CreateThreadOptions, UpdateThreadOptions } from '../types/Thread';
import { indexedDBService } from '../services/storage/IndexedDBService';

export interface UseThreadsResult {
  threads: ThreadHierarchy;
  loading: boolean;
  error: string | null;
  createThread: (options: CreateThreadOptions) => Promise<Thread>;
  deleteThread: (id: string) => Promise<void>;
  updateThread: (id: string, updates: UpdateThreadOptions) => Promise<void>;
  toggleCollapsed: (id: string) => Promise<void>;
  moveMessageToThread: (messageId: string, threadId: string) => Promise<void>;
  refreshThreads: () => Promise<void>;
}

export const useThreads = (): UseThreadsResult => {
  const [threads, setThreads] = useState<ThreadHierarchy>({
    rootThreads: [],
    threadMap: new Map(),
    messageToThreadMap: new Map()
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize and load threads
  useEffect(() => {
    const initializeAndLoadThreads = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('🧵 useThreads: Initializing IndexedDB and loading threads...');
        await indexedDBService.initialize();
        
        const threadHierarchy = await indexedDBService.getThreadHierarchy();
        console.log(`📊 useThreads: Loaded ${threadHierarchy.rootThreads.length} root threads`);
        
        setThreads(threadHierarchy);
      } catch (err) {
        console.error('❌ useThreads: Failed to load threads:', err);
        setError(err instanceof Error ? err.message : 'Failed to load threads');
      } finally {
        setLoading(false);
      }
    };

    initializeAndLoadThreads();
  }, []);

  const createThread = useCallback(async (options: CreateThreadOptions): Promise<Thread> => {
    try {
      console.log(`🆕 useThreads: Creating thread "${options.title}"...`);
      
      const newThread = await indexedDBService.addThread(options);
      
      // If this is a child thread, add it to the parent
      if (options.parentId) {
        await indexedDBService.addChildThread(options.parentId, newThread);
      }
      
      // Refresh thread hierarchy
      const updatedHierarchy = await indexedDBService.getThreadHierarchy();
      setThreads(updatedHierarchy);
      
      console.log(`✅ useThreads: Created thread: ${newThread.id}`);
      return newThread;
    } catch (err) {
      console.error('❌ useThreads: Failed to create thread:', err);
      setError(err instanceof Error ? err.message : 'Failed to create thread');
      throw err;
    }
  }, []);

  const deleteThread = useCallback(async (id: string): Promise<void> => {
    try {
      console.log(`🗑️ useThreads: Deleting thread: ${id}`);
      
      const deleted = await indexedDBService.deleteThread(id);
      
      if (deleted) {
        // Refresh thread hierarchy
        const updatedHierarchy = await indexedDBService.getThreadHierarchy();
        setThreads(updatedHierarchy);
        console.log(`✅ useThreads: Deleted thread: ${id}`);
      } else {
        console.warn(`⚠️ useThreads: Thread ${id} not found for deletion`);
      }
    } catch (err) {
      console.error(`❌ useThreads: Failed to delete thread ${id}:`, err);
      setError(err instanceof Error ? err.message : 'Failed to delete thread');
      throw err;
    }
  }, []);

  const updateThread = useCallback(async (id: string, updates: UpdateThreadOptions): Promise<void> => {
    try {
      console.log(`📝 useThreads: Updating thread: ${id}`, updates);
      
      const updatedThread = await indexedDBService.updateThread(id, updates);
      
      if (updatedThread) {
        // Refresh thread hierarchy
        const updatedHierarchy = await indexedDBService.getThreadHierarchy();
        setThreads(updatedHierarchy);
        console.log(`✅ useThreads: Updated thread: ${id}`);
      } else {
        console.warn(`⚠️ useThreads: Thread ${id} not found for update`);
      }
    } catch (err) {
      console.error(`❌ useThreads: Failed to update thread ${id}:`, err);
      setError(err instanceof Error ? err.message : 'Failed to update thread');
      throw err;
    }
  }, []);

  const toggleCollapsed = useCallback(async (id: string): Promise<void> => {
    try {
      const thread = threads.threadMap.get(id);
      if (thread) {
        await updateThread(id, { collapsed: !thread.collapsed });
      }
    } catch (err) {
      console.error(`❌ useThreads: Failed to toggle collapsed state for thread ${id}:`, err);
      throw err;
    }
  }, [threads.threadMap, updateThread]);

  const moveMessageToThread = useCallback(async (messageId: string, threadId: string): Promise<void> => {
    try {
      console.log(`🔄 useThreads: Moving message ${messageId} to thread ${threadId}`);
      
      await indexedDBService.moveMessageToThread(messageId, threadId);
      
      // Refresh thread hierarchy
      const updatedHierarchy = await indexedDBService.getThreadHierarchy();
      setThreads(updatedHierarchy);
      
      console.log(`✅ useThreads: Moved message to thread`);
    } catch (err) {
      console.error('❌ useThreads: Failed to move message to thread:', err);
      setError(err instanceof Error ? err.message : 'Failed to move message to thread');
      throw err;
    }
  }, []);

  const refreshThreads = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const updatedHierarchy = await indexedDBService.getThreadHierarchy();
      setThreads(updatedHierarchy);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh threads');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    threads,
    loading,
    error,
    createThread,
    deleteThread,
    updateThread,
    toggleCollapsed,
    moveMessageToThread,
    refreshThreads
  };
};
