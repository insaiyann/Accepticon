import { DB_NAME, DB_VERSION, STORES } from './StorageConfig';
import type { Message, AudioMessage, TextMessage, ImageMessage, ProcessingQueueItem, DiagramCache, StorageQuota } from '../../types/Message';
import type { Thread, ThreadHierarchy, CreateThreadOptions, UpdateThreadOptions } from '../../types/Thread';

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
        
        // Verify all required stores exist
        try {
          this.verifyDatabaseSchema();
          console.log('✅ IndexedDB: Database schema verified');
          resolve();
        } catch (error) {
          console.warn('⚠️ IndexedDB: Schema verification failed, recreating database...', error);
          this.recreateDatabase().then(resolve).catch(reject);
        }
      };

      request.onupgradeneeded = (event) => {
        console.log('🔄 IndexedDB: Database upgrade needed, creating object stores...');
        const db = (event.target as IDBOpenDBRequest).result;
        this.createObjectStores(db);
      };
    });
  }

  /**
   * Verify that all required object stores exist
   */
  private verifyDatabaseSchema(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const requiredStores = [
      STORES.MESSAGES,
      STORES.AUDIO_MESSAGES,
      STORES.IMAGE_MESSAGES,
      STORES.THREADS,
      STORES.PROCESSING_QUEUE,
      STORES.DIAGRAM_CACHE,
      STORES.APP_SETTINGS
    ];

    const missingStores = requiredStores.filter(store => !this.db!.objectStoreNames.contains(store));
    
    if (missingStores.length > 0) {
      throw new Error(`Missing object stores: ${missingStores.join(', ')}`);
    }
  }

  /**
   * Recreate the database when schema is corrupted
   */
  private async recreateDatabase(): Promise<void> {
    console.log('🔄 IndexedDB: Recreating database due to schema mismatch...');
    
    // Close current connection
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }

    // Delete the existing database
    return new Promise((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
      
      deleteRequest.onsuccess = () => {
        console.log('✅ IndexedDB: Old database deleted, creating new one...');
        // Reinitialize with fresh database
        this.initialize().then(resolve).catch(reject);
      };
      
      deleteRequest.onerror = () => {
        console.error('❌ IndexedDB: Failed to delete corrupted database');
        reject(new Error('Failed to recreate database'));
      };
      
      deleteRequest.onblocked = () => {
        console.warn('⚠️ IndexedDB: Database deletion blocked, please close other tabs');
        reject(new Error('Database deletion blocked - close other tabs and try again'));
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

    // Image messages store
    if (!db.objectStoreNames.contains(STORES.IMAGE_MESSAGES)) {
      const imageStore = db.createObjectStore(STORES.IMAGE_MESSAGES, { keyPath: 'id' });
      imageStore.createIndex('timestamp', 'timestamp', { unique: false });
      imageStore.createIndex('processed', 'processed', { unique: false });
    }

    // Threads store
    if (!db.objectStoreNames.contains(STORES.THREADS)) {
      const threadStore = db.createObjectStore(STORES.THREADS, { keyPath: 'id' });
      threadStore.createIndex('parentId', 'parentId', { unique: false });
      threadStore.createIndex('createdAt', 'createdAt', { unique: false });
      threadStore.createIndex('updatedAt', 'updatedAt', { unique: false });
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
   * Validate that required object stores exist
   */
  private validateObjectStores(storeNames: string[]): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    for (const storeName of storeNames) {
      if (!this.db.objectStoreNames.contains(storeName)) {
        console.error(`❌ IndexedDB: Object store '${storeName}' not found in database`);
        console.log(`📋 IndexedDB: Available stores:`, Array.from(this.db.objectStoreNames));
        throw new Error(`Object store '${storeName}' not found. Database may need to be recreated.`);
      }
    }
  }

  /**
   * Add a text message
   */
  async addTextMessage(message: Omit<TextMessage, 'id'>): Promise<TextMessage> {
    await this.ensureInitialized();
    this.validateObjectStores([STORES.MESSAGES]);
    
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
    this.validateObjectStores([STORES.AUDIO_MESSAGES]);
    
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
   * Add an image message
   */
  async addImageMessage(message: Omit<ImageMessage, 'id'>): Promise<ImageMessage> {
    await this.ensureInitialized();
    
    const imageMessage: ImageMessage = {
      ...message,
      id: `image_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'image'
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.IMAGE_MESSAGES], 'readwrite');
      const store = transaction.objectStore(STORES.IMAGE_MESSAGES);
      const request = store.add(imageMessage);

      request.onsuccess = () => resolve(imageMessage);
      request.onerror = () => reject(new Error('Failed to add image message'));
    });
  }

  /**
   * Get image blob by message ID
   */
  async getImageBlob(messageId: string): Promise<Blob | null> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.IMAGE_MESSAGES], 'readonly');
      const store = transaction.objectStore(STORES.IMAGE_MESSAGES);
      const request = store.get(messageId);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.imageBlob : null);
      };
      request.onerror = () => reject(new Error('Failed to get image blob'));
    });
  }

  /**
   * Get all messages (text, audio, and image) sorted by timestamp
   */
  async getAllMessages(): Promise<(TextMessage | AudioMessage | ImageMessage)[]> {
    await this.ensureInitialized();
    this.validateObjectStores([STORES.MESSAGES, STORES.AUDIO_MESSAGES, STORES.IMAGE_MESSAGES]);

    console.log('🔍 IndexedDB: Getting all messages...');

    const [textMessages, audioMessages, imageMessages] = await Promise.all([
      this.getTextMessages(),
      this.getAudioMessages(),
      this.getImageMessages()
    ]);

    console.log(`📊 IndexedDB: Retrieved ${textMessages.length} text messages, ${audioMessages.length} audio messages, and ${imageMessages.length} image messages`);
    console.log('📝 Text messages IDs:', textMessages.map(m => m.id));
    console.log('🎤 Audio messages details:', audioMessages.map(m => ({
      id: m.id,
      type: m.type,
      hasAudioBlob: !!m.audioBlob,
      audioBlobSize: m.audioBlob?.size || 0,
      hasTranscription: !!m.transcription
    })));
    console.log('🖼️ Image messages details:', imageMessages.map(m => ({
      id: m.id,
      type: m.type,
      fileName: m.fileName,
      fileSize: m.fileSize,
      hasDescription: !!m.description
    })));

    // Combine and sort by timestamp
    const allMessages = [...textMessages, ...audioMessages, ...imageMessages];
    const sortedMessages = allMessages.sort((a, b) => a.timestamp - b.timestamp);
    
    console.log(`📋 IndexedDB: Returning ${sortedMessages.length} total messages:`, sortedMessages.map(m => ({
      id: m.id,
      type: m.type,
      timestamp: new Date(m.timestamp).toLocaleString()
    })));

    return sortedMessages;
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
   * Get a specific message by ID (checks both text and audio stores)
   */
  async getMessage(id: string): Promise<Message | null> {
    await this.ensureInitialized();

    console.log(`🔍 IndexedDB: Getting message with ID: ${id}`);

    // First try text messages store
    const textMessage = await new Promise<Message | null>((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.MESSAGES], 'readonly');
      const store = transaction.objectStore(STORES.MESSAGES);
      const request = store.get(id);

      request.onsuccess = () => {
        const result = request.result || null;
        console.log(`📝 IndexedDB: Text store search for ${id}:`, result ? 'Found' : 'Not found');
        resolve(result);
      };

      request.onerror = () => {
        console.error(`❌ IndexedDB: Failed to get text message ${id}:`, request.error);
        reject(new Error('Failed to get text message'));
      };
    });

    if (textMessage) {
      console.log(`✅ IndexedDB: Found message ${id} in text store`);
      return textMessage;
    }

    // If not found in text messages, try audio messages store
    const audioMessage = await new Promise<Message | null>((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.AUDIO_MESSAGES], 'readonly');
      const store = transaction.objectStore(STORES.AUDIO_MESSAGES);
      const request = store.get(id);

      request.onsuccess = () => {
        const result = request.result || null;
        console.log(`🎤 IndexedDB: Audio store search for ${id}:`, result ? 'Found' : 'Not found');
        if (result) {
          console.log(`🎵 IndexedDB: Audio message details:`, {
            id: result.id,
            type: result.type,
            hasAudioBlob: !!result.audioBlob,
            audioBlobSize: result.audioBlob?.size || 0,
            hasTranscription: !!result.transcription
          });
        }
        resolve(result);
      };

      request.onerror = () => {
        console.error(`❌ IndexedDB: Failed to get audio message ${id}:`, request.error);
        reject(new Error('Failed to get audio message'));
      };
    });

    if (audioMessage) {
      console.log(`✅ IndexedDB: Found message ${id} in audio store`);
      return audioMessage;
    }

    // If not found in audio messages, try image messages store
    const imageMessage = await new Promise<Message | null>((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.IMAGE_MESSAGES], 'readonly');
      const store = transaction.objectStore(STORES.IMAGE_MESSAGES);
      const request = store.get(id);

      request.onsuccess = () => {
        const result = request.result || null;
        console.log(`🖼️ IndexedDB: Image store search for ${id}:`, result ? 'Found' : 'Not found');
        if (result) {
          console.log(`🖼️ IndexedDB: Image message details:`, {
            id: result.id,
            type: result.type,
            fileName: result.fileName,
            fileSize: result.fileSize,
            hasDescription: !!result.description
          });
        }
        resolve(result);
      };

      request.onerror = () => {
        console.error(`❌ IndexedDB: Failed to get image message ${id}:`, request.error);
        reject(new Error('Failed to get image message'));
      };
    });

    if (imageMessage) {
      console.log(`✅ IndexedDB: Found message ${id} in image store`);
    } else {
      console.warn(`⚠️ IndexedDB: Message ${id} not found in any store`);
    }

    return imageMessage;
  }

  /**
   * Update a message with new data (checks both text and audio stores)
   */
  async updateMessage(id: string, updates: Partial<Message>): Promise<void> {
    await this.ensureInitialized();

    // First try to update in text messages store
    const textUpdateResult = await new Promise<boolean>((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.MESSAGES], 'readwrite');
      const store = transaction.objectStore(STORES.MESSAGES);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const message = getRequest.result;
        if (message) {
          const updatedMessage = { ...message, ...updates };
          const putRequest = store.put(updatedMessage);
          putRequest.onsuccess = () => resolve(true);
          putRequest.onerror = () => reject(new Error('Failed to update text message'));
        } else {
          resolve(false); // Message not found in this store
        }
      };

      getRequest.onerror = () => reject(new Error('Failed to get text message for update'));
    });

    if (textUpdateResult) {
      return; // Successfully updated in text store
    }

    // If not found in text store, try audio messages store
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.AUDIO_MESSAGES], 'readwrite');
      const store = transaction.objectStore(STORES.AUDIO_MESSAGES);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const message = getRequest.result;
        if (message) {
          const updatedMessage = { ...message, ...updates };
          const putRequest = store.put(updatedMessage);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(new Error('Failed to update audio message'));
        } else {
          reject(new Error('Message not found in either store'));
        }
      };

      getRequest.onerror = () => reject(new Error('Failed to get audio message for update'));
    });
  }

  /**
   * Delete a message by ID (checks both text and audio stores)
   */
  async deleteMessage(id: string): Promise<boolean> {
    await this.ensureInitialized();

    console.log(`🗑️ IndexedDB: Attempting to delete message with ID: ${id}`);

    // First try to delete from text messages store
    const textDeleteResult = await new Promise<boolean>((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.MESSAGES], 'readwrite');
      const store = transaction.objectStore(STORES.MESSAGES);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const message = getRequest.result;
        if (message) {
          const deleteRequest = store.delete(id);
          deleteRequest.onsuccess = () => {
            console.log(`✅ IndexedDB: Successfully deleted text message: ${id}`);
            resolve(true);
          };
          deleteRequest.onerror = () => {
            console.error(`❌ IndexedDB: Failed to delete text message: ${id}`, deleteRequest.error);
            reject(new Error('Failed to delete text message'));
          };
        } else {
          resolve(false); // Message not found in this store
        }
      };

      getRequest.onerror = () => {
        console.error(`❌ IndexedDB: Failed to get text message for deletion: ${id}`, getRequest.error);
        reject(new Error('Failed to get text message for deletion'));
      };
    });

    if (textDeleteResult) {
      return true; // Successfully deleted from text store
    }

    // If not found in text store, try audio messages store
    const audioDeleteResult = await new Promise<boolean>((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.AUDIO_MESSAGES], 'readwrite');
      const store = transaction.objectStore(STORES.AUDIO_MESSAGES);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const message = getRequest.result;
        if (message) {
          const deleteRequest = store.delete(id);
          deleteRequest.onsuccess = () => {
            console.log(`✅ IndexedDB: Successfully deleted audio message: ${id}`);
            resolve(true);
          };
          deleteRequest.onerror = () => {
            console.error(`❌ IndexedDB: Failed to delete audio message: ${id}`, deleteRequest.error);
            reject(new Error('Failed to delete audio message'));
          };
        } else {
          resolve(false); // Message not found in this store
        }
      };

      getRequest.onerror = () => {
        console.error(`❌ IndexedDB: Failed to get audio message for deletion: ${id}`, getRequest.error);
        reject(new Error('Failed to get audio message for deletion'));
      };
    });

    if (audioDeleteResult) {
      return true; // Successfully deleted from audio store
    }

    console.warn(`⚠️ IndexedDB: Message ${id} not found in either store for deletion`);
    return false; // Message not found in either store
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
   * Get all image messages
   */
  async getImageMessages(): Promise<ImageMessage[]> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.IMAGE_MESSAGES], 'readonly');
      const store = transaction.objectStore(STORES.IMAGE_MESSAGES);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Failed to get image messages'));
    });
  }

  /**
   * Get messages for a specific thread
   */
  async getMessagesForThread(threadId: string): Promise<(TextMessage | AudioMessage)[]> {
    await this.ensureInitialized();

    console.log(`🔍 IndexedDB: Getting messages for thread: ${threadId}`);

    // First get the thread to get its messageIds
    const thread = await this.getThread(threadId);
    if (!thread) {
      console.warn(`⚠️ IndexedDB: Thread ${threadId} not found`);
      return [];
    }

    if (thread.messageIds.length === 0) {
      console.log(`📋 IndexedDB: Thread ${threadId} has no messages`);
      return [];
    }

    console.log(`📋 IndexedDB: Thread ${threadId} has ${thread.messageIds.length} message IDs:`, thread.messageIds);

    // Get all messages for this thread
    const messages: (TextMessage | AudioMessage)[] = [];
    
    for (const messageId of thread.messageIds) {
      try {
        const message = await this.getMessage(messageId);
        if (message) {
          messages.push(message as TextMessage | AudioMessage);
        } else {
          console.warn(`⚠️ IndexedDB: Message ${messageId} not found for thread ${threadId}`);
        }
      } catch (error) {
        console.error(`❌ IndexedDB: Error getting message ${messageId} for thread ${threadId}:`, error);
      }
    }

    // Sort by timestamp
    const sortedMessages = messages.sort((a, b) => a.timestamp - b.timestamp);
    
    console.log(`📋 IndexedDB: Returning ${sortedMessages.length} messages for thread ${threadId}:`, 
      sortedMessages.map(m => ({ id: m.id, type: m.type, timestamp: new Date(m.timestamp).toLocaleString() })));

    return sortedMessages;
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

  // ===== THREAD OPERATIONS =====

  /**
   * Add a new thread
   */
  async addThread(options: CreateThreadOptions): Promise<Thread> {
    await this.ensureInitialized();
    
    const now = Date.now();
    const thread: Thread = {
      id: `thread_${now}_${Math.random().toString(36).substr(2, 9)}`,
      title: options.title,
      parentId: options.parentId,
      childIds: [],
      messageIds: [],
      
      // New: Organized message collections
      messages: {
        text: [],
        audio: [],
        image: []
      },
      
      // Enhanced processing status
      processingStatus: {
        audioTranscriptionsComplete: true,
        totalAudioMessages: 0,
        transcribedAudioMessages: 0,
        lastProcessedAt: undefined
      },
      
      collapsed: false,
      createdAt: now,
      updatedAt: now,
      metadata: {
        messageCount: 0,
        lastActivity: now,
        tags: [],
        hasImages: false,
        hasAudio: false
      }
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.THREADS], 'readwrite');
      const store = transaction.objectStore(STORES.THREADS);
      const request = store.add(thread);

      request.onsuccess = () => {
        console.log(`✅ IndexedDB: Created thread: ${thread.id} - "${thread.title}"`);
        resolve(thread);
      };
      request.onerror = () => {
        console.error(`❌ IndexedDB: Failed to create thread: ${thread.title}`, request.error);
        reject(new Error('Failed to add thread'));
      };
    });
  }

  /**
   * Get a thread by ID
   */
  async getThread(id: string): Promise<Thread | null> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.THREADS], 'readonly');
      const store = transaction.objectStore(STORES.THREADS);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error('Failed to get thread'));
    });
  }

  /**
   * Get all threads
   */
  async getAllThreads(): Promise<Thread[]> {
    await this.ensureInitialized();
    this.validateObjectStores([STORES.THREADS]);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.THREADS], 'readonly');
      const store = transaction.objectStore(STORES.THREADS);
      const request = store.getAll();

      request.onsuccess = () => {
        const threads = request.result;
        console.log(`📋 IndexedDB: Retrieved ${threads.length} threads`);
        resolve(threads);
      };
      request.onerror = () => reject(new Error('Failed to get threads'));
    });
  }

  /**
   * Update a thread
   */
  async updateThread(id: string, updates: UpdateThreadOptions): Promise<Thread | null> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.THREADS], 'readwrite');
      const store = transaction.objectStore(STORES.THREADS);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const thread = getRequest.result;
        if (thread) {
          const updatedThread = {
            ...thread,
            ...updates,
            updatedAt: Date.now()
          };
          
          const putRequest = store.put(updatedThread);
          putRequest.onsuccess = () => {
            console.log(`✅ IndexedDB: Updated thread: ${id}`);
            resolve(updatedThread);
          };
          putRequest.onerror = () => reject(new Error('Failed to update thread'));
        } else {
          resolve(null);
        }
      };

      getRequest.onerror = () => reject(new Error('Failed to get thread for update'));
    });
  }

  /**
   * Delete a thread and all its children
   */
  async deleteThread(id: string): Promise<boolean> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.THREADS], 'readwrite');
      const store = transaction.objectStore(STORES.THREADS);
      
      // First get the thread to check for children
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const thread = getRequest.result;
        if (thread) {
          // TODO: Recursively delete child threads
          const deleteRequest = store.delete(id);
          deleteRequest.onsuccess = () => {
            console.log(`✅ IndexedDB: Deleted thread: ${id}`);
            resolve(true);
          };
          deleteRequest.onerror = () => reject(new Error('Failed to delete thread'));
        } else {
          resolve(false);
        }
      };

      getRequest.onerror = () => reject(new Error('Failed to get thread for deletion'));
    });
  }

  /**
   * Get thread hierarchy
   */
  async getThreadHierarchy(): Promise<ThreadHierarchy> {
    await this.ensureInitialized();

    const threads = await this.getAllThreads();
    const threadMap = new Map<string, Thread>();
    const messageToThreadMap = new Map<string, string>();
    const rootThreads: Thread[] = [];

    // Build thread map and identify root threads
    for (const thread of threads) {
      threadMap.set(thread.id, thread);
      
      // Add message mappings
      for (const messageId of thread.messageIds) {
        messageToThreadMap.set(messageId, thread.id);
      }
      
      // Identify root threads (no parent)
      if (!thread.parentId) {
        rootThreads.push(thread);
      }
    }

    // Sort root threads by creation date
    rootThreads.sort((a, b) => a.createdAt - b.createdAt);

    return {
      rootThreads,
      threadMap,
      messageToThreadMap
    };
  }

  /**
   * Move a message to a thread
   */
  async moveMessageToThread(messageId: string, threadId: string): Promise<void> {
    await this.ensureInitialized();

    // First, get the message to determine its type
    const message = await this.getMessage(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.THREADS], 'readwrite');
      const threadStore = transaction.objectStore(STORES.THREADS);
      
      const getRequest = threadStore.get(threadId);
      
      getRequest.onsuccess = () => {
        const thread = getRequest.result;
        if (thread) {
          // Ensure thread has the new message structure
          if (!thread.messages) {
            thread.messages = {
              text: [],
              audio: [],
              image: []
            };
          }

          // Ensure thread has processing status
          if (!thread.processingStatus) {
            thread.processingStatus = {
              audioTranscriptionsComplete: false,
              totalAudioMessages: 0,
              transcribedAudioMessages: 0
            };
          }

          // Add message to legacy messageIds if not already present
          if (!thread.messageIds.includes(messageId)) {
            thread.messageIds.push(messageId);
          }

          // Add message to appropriate type array
          let messageAdded = false;
          if (message.type === 'text' && !thread.messages.text.includes(messageId)) {
            thread.messages.text.push(messageId);
            messageAdded = true;
          } else if (message.type === 'audio' && !thread.messages.audio.includes(messageId)) {
            thread.messages.audio.push(messageId);
            thread.processingStatus.totalAudioMessages = thread.messages.audio.length;
            // Check if this audio message has transcription
            if (message.transcription) {
              thread.processingStatus.transcribedAudioMessages += 1;
            }
            thread.processingStatus.audioTranscriptionsComplete = 
              thread.processingStatus.transcribedAudioMessages >= thread.processingStatus.totalAudioMessages;
            messageAdded = true;
          } else if (message.type === 'image' && !thread.messages.image.includes(messageId)) {
            thread.messages.image.push(messageId);
            messageAdded = true;
          }

          if (messageAdded) {
            // Update metadata
            thread.metadata.messageCount = thread.messageIds.length;
            thread.metadata.lastActivity = Date.now();
            thread.metadata.hasImages = thread.messages.image.length > 0;
            thread.metadata.hasAudio = thread.messages.audio.length > 0;
            thread.updatedAt = Date.now();
            
            const putRequest = threadStore.put(thread);
            putRequest.onsuccess = () => {
              console.log(`✅ IndexedDB: Moved message ${messageId} to thread ${threadId}`);
              resolve();
            };
            putRequest.onerror = () => reject(new Error('Failed to update thread with message'));
          } else {
            resolve(); // Message already in thread
          }
        } else {
          reject(new Error('Thread not found'));
        }
      };

      getRequest.onerror = () => reject(new Error('Failed to get thread'));
    });
  }

  /**
   * Add a child thread to a parent
   */
  async addChildThread(parentId: string, childThread: Thread): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.THREADS], 'readwrite');
      const store = transaction.objectStore(STORES.THREADS);
      
      const getRequest = store.get(parentId);
      
      getRequest.onsuccess = () => {
        const parent = getRequest.result;
        if (parent) {
          // Add child ID to parent
          if (!parent.childIds.includes(childThread.id)) {
            parent.childIds.push(childThread.id);
            parent.updatedAt = Date.now();
            
            const putRequest = store.put(parent);
            putRequest.onsuccess = () => {
              console.log(`✅ IndexedDB: Added child thread ${childThread.id} to parent ${parentId}`);
              resolve();
            };
            putRequest.onerror = () => reject(new Error('Failed to update parent thread'));
          } else {
            resolve(); // Child already exists
          }
        } else {
          reject(new Error('Parent thread not found'));
        }
      };

      getRequest.onerror = () => reject(new Error('Failed to get parent thread'));
    });
  }

  /**
   * Get database status and information for debugging
   */
  getDatabaseStatus(): {
    isInitialized: boolean;
    hasConnection: boolean;
    version: number | null;
    availableStores: string[];
    requiredStores: string[];
    missingStores: string[];
  } {
    const requiredStores = [
      STORES.MESSAGES,
      STORES.AUDIO_MESSAGES,
      STORES.IMAGE_MESSAGES,
      STORES.THREADS,
      STORES.PROCESSING_QUEUE,
      STORES.DIAGRAM_CACHE,
      STORES.APP_SETTINGS
    ];

    const availableStores = this.db ? Array.from(this.db.objectStoreNames) : [];
    const missingStores = requiredStores.filter(store => !availableStores.includes(store));

    return {
      isInitialized: this.isInitialized,
      hasConnection: this.db !== null,
      version: this.db?.version || null,
      availableStores,
      requiredStores,
      missingStores
    };
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
