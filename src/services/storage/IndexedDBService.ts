import { DB_NAME, DB_VERSION, STORES } from './StorageConfig';
import type { Message, AudioMessage, TextMessage, ProcessingQueueItem, DiagramCache, StorageQuota } from '../../types/Message';

class IndexedDBService {
  private db: IDBDatabase | null = null;
  private isInitialized = false;

  /**
   * Initialize the IndexedDB database
   */
  async initialize(): Promise<void> {
    if (this.isInitialized && this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createObjectStores(db);
      };
    });
  }

  /**
   * Create object stores and indexes
   */
  private createObjectStores(db: IDBDatabase): void {
    // Messages store
    if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
      const messageStore = db.createObjectStore(STORES.MESSAGES, { keyPath: 'id' });
      messageStore.createIndex('timestamp', 'timestamp', { unique: false });
      messageStore.createIndex('processed', 'processed', { unique: false });
    }

    // Audio messages store
    if (!db.objectStoreNames.contains(STORES.AUDIO_MESSAGES)) {
      const audioStore = db.createObjectStore(STORES.AUDIO_MESSAGES, { keyPath: 'id' });
      audioStore.createIndex('timestamp', 'timestamp', { unique: false });
      audioStore.createIndex('processed', 'processed', { unique: false });
    }

    // Processing queue store
    if (!db.objectStoreNames.contains(STORES.PROCESSING_QUEUE)) {
      const queueStore = db.createObjectStore(STORES.PROCESSING_QUEUE, { keyPath: 'id' });
      queueStore.createIndex('status', 'status', { unique: false });
      queueStore.createIndex('timestamp', 'timestamp', { unique: false });
    }

    // Diagram cache store
    if (!db.objectStoreNames.contains(STORES.DIAGRAM_CACHE)) {
      const diagramStore = db.createObjectStore(STORES.DIAGRAM_CACHE, { keyPath: 'id' });
      diagramStore.createIndex('inputHash', 'inputHash', { unique: false });
      diagramStore.createIndex('generatedAt', 'generatedAt', { unique: false });
    }

    // App settings store
    if (!db.objectStoreNames.contains(STORES.APP_SETTINGS)) {
      db.createObjectStore(STORES.APP_SETTINGS, { keyPath: 'key' });
    }
  }

  /**
   * Ensure database is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized || !this.db) {
      await this.initialize();
    }
  }

  /**
   * Add a text message
   */
  async addTextMessage(message: Omit<TextMessage, 'id'>): Promise<TextMessage> {
    await this.ensureInitialized();
    
    const textMessage: TextMessage = {
      ...message,
      id: `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'text'
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.MESSAGES], 'readwrite');
      const store = transaction.objectStore(STORES.MESSAGES);
      const request = store.add(textMessage);

      request.onsuccess = () => resolve(textMessage);
      request.onerror = () => reject(new Error('Failed to add text message'));
    });
  }

  /**
   * Add an audio message
   */
  async addAudioMessage(message: Omit<AudioMessage, 'id'>): Promise<AudioMessage> {
    await this.ensureInitialized();
    
    const audioMessage: AudioMessage = {
      ...message,
      id: `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'audio'
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.AUDIO_MESSAGES], 'readwrite');
      const store = transaction.objectStore(STORES.AUDIO_MESSAGES);
      const request = store.add(audioMessage);

      request.onsuccess = () => resolve(audioMessage);
      request.onerror = () => reject(new Error('Failed to add audio message'));
    });
  }

  /**
   * Get all messages (text and audio) sorted by timestamp
   */
  async getAllMessages(): Promise<(TextMessage | AudioMessage)[]> {
    await this.ensureInitialized();

    const [textMessages, audioMessages] = await Promise.all([
      this.getTextMessages(),
      this.getAudioMessages()
    ]);

    // Combine and sort by timestamp
    const allMessages = [...textMessages, ...audioMessages];
    return allMessages.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get all text messages
   */
  async getTextMessages(): Promise<TextMessage[]> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.MESSAGES], 'readonly');
      const store = transaction.objectStore(STORES.MESSAGES);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Failed to get text messages'));
    });
  }

  /**
   * Get a specific message by ID
   */
  async getMessage(id: string): Promise<Message | null> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.MESSAGES], 'readonly');
      const store = transaction.objectStore(STORES.MESSAGES);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error('Failed to get message:', request.error);
        reject(new Error('Failed to get message'));
      };
    });
  }

  /**
   * Update a message with new data
   */
  async updateMessage(id: string, updates: Partial<Message>): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.MESSAGES], 'readwrite');
      const store = transaction.objectStore(STORES.MESSAGES);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const message = getRequest.result;
        if (message) {
          const updatedMessage = { ...message, ...updates };
          const putRequest = store.put(updatedMessage);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(new Error('Failed to update message'));
        } else {
          reject(new Error('Message not found'));
        }
      };

      getRequest.onerror = () => reject(new Error('Failed to get message for update'));
    });
  }

  /**
   * Get all audio messages
   */
  async getAudioMessages(): Promise<AudioMessage[]> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.AUDIO_MESSAGES], 'readonly');
      const store = transaction.objectStore(STORES.AUDIO_MESSAGES);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Failed to get audio messages'));
    });
  }

  /**
   * Add item to processing queue
   */
  async addToProcessingQueue(item: Omit<ProcessingQueueItem, 'id'>): Promise<ProcessingQueueItem> {
    await this.ensureInitialized();
    
    const queueItem: ProcessingQueueItem = {
      ...item,
      id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.PROCESSING_QUEUE], 'readwrite');
      const store = transaction.objectStore(STORES.PROCESSING_QUEUE);
      const request = store.add(queueItem);

      request.onsuccess = () => resolve(queueItem);
      request.onerror = () => reject(new Error('Failed to add to processing queue'));
    });
  }

  /**
   * Get pending processing queue items
   */
  async getPendingQueueItems(): Promise<ProcessingQueueItem[]> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.PROCESSING_QUEUE], 'readonly');
      const store = transaction.objectStore(STORES.PROCESSING_QUEUE);
      const index = store.index('status');
      const request = index.getAll('pending');

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Failed to get pending queue items'));
    });
  }

  /**
   * Update processing queue item status
   */
  async updateQueueItemStatus(id: string, status: ProcessingQueueItem['status'], error?: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.PROCESSING_QUEUE], 'readwrite');
      const store = transaction.objectStore(STORES.PROCESSING_QUEUE);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          item.status = status;
          if (error) item.error = error;
          
          const putRequest = store.put(item);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(new Error('Failed to update queue item status'));
        } else {
          reject(new Error('Queue item not found'));
        }
      };

      getRequest.onerror = () => reject(new Error('Failed to get queue item'));
    });
  }

  /**
   * Update retry count for a queue item
   */
  async updateQueueItemRetryCount(id: string, retryCount: number): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.PROCESSING_QUEUE], 'readwrite');
      const store = transaction.objectStore(STORES.PROCESSING_QUEUE);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          item.retryCount = retryCount;
          
          const putRequest = store.put(item);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(new Error('Failed to update queue item retry count'));
        } else {
          reject(new Error('Queue item not found'));
        }
      };

      getRequest.onerror = () => reject(new Error('Failed to get queue item'));
    });
  }

  /**
   * Cache a generated diagram
   */
  async cacheDiagram(diagram: Omit<DiagramCache, 'id'>): Promise<DiagramCache> {
    await this.ensureInitialized();
    
    const cachedDiagram: DiagramCache = {
      ...diagram,
      id: `diagram_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.DIAGRAM_CACHE], 'readwrite');
      const store = transaction.objectStore(STORES.DIAGRAM_CACHE);
      const request = store.add(cachedDiagram);

      request.onsuccess = () => resolve(cachedDiagram);
      request.onerror = () => reject(new Error('Failed to cache diagram'));
    });
  }

  /**
   * Get cached diagram by input hash
   */
  async getCachedDiagram(inputHash: string): Promise<DiagramCache | null> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.DIAGRAM_CACHE], 'readonly');
      const store = transaction.objectStore(STORES.DIAGRAM_CACHE);
      const index = store.index('inputHash');
      const request = index.get(inputHash);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error('Failed to get cached diagram'));
    });
  }

  /**
   * Get cached diagram by messageIds
   */
  async getCachedDiagramByMessageIds(messageIds: string[]): Promise<DiagramCache | null> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.DIAGRAM_CACHE], 'readonly');
      const store = transaction.objectStore(STORES.DIAGRAM_CACHE);
      const request = store.getAll();

      request.onsuccess = () => {
        const diagrams = request.result as DiagramCache[];
        
        // Find diagram with matching messageIds
        const matchingDiagram = diagrams.find(diagram => {
          if (!diagram.messageIds || diagram.messageIds.length !== messageIds.length) {
            return false;
          }
          
          // Check if all messageIds match (order independent)
          return messageIds.every(id => diagram.messageIds.includes(id)) &&
                 diagram.messageIds.every(id => messageIds.includes(id));
        });

        resolve(matchingDiagram || null);
      };

      request.onerror = () => {
        console.error('Failed to get cached diagram:', request.error);
        reject(new Error('Failed to get cached diagram'));
      };
    });
  }

  /**
   * Get storage quota information
   */
  async getStorageQuota(): Promise<StorageQuota> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      
      return {
        used,
        available: quota - used,
        warning: used / quota > 0.8,
        critical: used / quota > 0.95
      };
    }

    // Fallback for browsers without storage API
    return {
      used: 0,
      available: Infinity,
      warning: false,
      critical: false
    };
  }

  /**
   * Clear old data based on retention policies
   */
  async cleanupOldData(retentionDays = 30): Promise<void> {
    await this.ensureInitialized();
    
    const cutoffDate = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    // Clean up old diagrams
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.DIAGRAM_CACHE], 'readwrite');
      const store = transaction.objectStore(STORES.DIAGRAM_CACHE);
      const index = store.index('generatedAt');
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffDate));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(new Error('Failed to cleanup old data'));
    });
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }
}

// Create singleton instance
export const indexedDBService = new IndexedDBService();
export default indexedDBService;
