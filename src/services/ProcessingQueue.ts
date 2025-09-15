import { indexedDBService } from './storage/IndexedDBService';
import type { ProcessingQueueItem } from '../types/Message';

export interface QueueProcessorOptions {
  maxRetries: number;
  retryDelay: number;
  maxConcurrent: number;
  processingTimeout: number;
}

export interface QueueProcessor {
  type: ProcessingQueueItem['type'];
  process: (item: ProcessingQueueItem) => Promise<void>;
}

class ProcessingQueueService {
  private processors: Map<ProcessingQueueItem['type'], QueueProcessor> = new Map();
  private isProcessing = false;
  private currentlyProcessing: Set<string> = new Set();
  private options: QueueProcessorOptions = {
    maxRetries: 3,
    retryDelay: 1000,
    maxConcurrent: 2,
    processingTimeout: 30000 // 30 seconds
  };

  /**
   * Register a processor for a specific queue item type
   */
  registerProcessor(processor: QueueProcessor): void {
    this.processors.set(processor.type, processor);
    console.log(`Registered processor for type: ${processor.type}`);
  }

  /**
   * Add an item to the processing queue
   */
  async addToQueue(
    type: ProcessingQueueItem['type'],
    messageId: string,
    data: unknown
  ): Promise<ProcessingQueueItem> {
    const queueItem = await indexedDBService.addToProcessingQueue({
      type,
      messageId,
      data,
      retryCount: 0,
      status: 'pending',
      timestamp: Date.now()
    });

    console.log(`Added item to queue: ${queueItem.id} (type: ${type})`);
    
    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }

    return queueItem;
  }

  /**
   * Process all pending items in the queue
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing) {
      console.log('Queue processing already in progress');
      return;
    }

    this.isProcessing = true;
    console.log('Starting queue processing');

    try {
      while (true) {
        // Get pending items
        const pendingItems = await indexedDBService.getPendingQueueItems();
        const availableItems = pendingItems.filter(
          (item: ProcessingQueueItem) => !this.currentlyProcessing.has(item.id)
        );

        if (availableItems.length === 0) {
          console.log('No more pending items to process');
          break;
        }

        // Process items concurrently (up to maxConcurrent)
        const itemsToProcess = availableItems.slice(0, this.options.maxConcurrent);
        const processingPromises = itemsToProcess.map((item: ProcessingQueueItem) => this.processItem(item));

        await Promise.allSettled(processingPromises);

        // Small delay before checking for more items
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error('Error during queue processing:', error);
    } finally {
      this.isProcessing = false;
      console.log('Queue processing completed');
    }
  }

  /**
   * Process a single queue item
   */
  private async processItem(item: ProcessingQueueItem): Promise<void> {
    const processor = this.processors.get(item.type);
    if (!processor) {
      console.error(`No processor found for type: ${item.type}`);
      await indexedDBService.updateQueueItemStatus(
        item.id,
        'failed',
        `No processor available for type: ${item.type}`
      );
      return;
    }

    this.currentlyProcessing.add(item.id);
    console.log(`Processing item: ${item.id} (type: ${item.type})`);

    try {
      // Update status to processing
      await indexedDBService.updateQueueItemStatus(item.id, 'processing');

      // Create timeout for processing
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Processing timeout'));
        }, this.options.processingTimeout);
      });

      // Race between processing and timeout
      await Promise.race([
        processor.process(item),
        timeoutPromise
      ]);

      // Mark as completed
      await indexedDBService.updateQueueItemStatus(item.id, 'completed');
      console.log(`Successfully processed item: ${item.id}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to process item ${item.id}:`, errorMessage);

      // Determine if we should retry
      if (item.retryCount < this.options.maxRetries) {
        // Calculate delay with exponential backoff
        const delay = this.options.retryDelay * Math.pow(2, item.retryCount);
        console.log(`Retrying item ${item.id} in ${delay}ms (attempt ${item.retryCount + 1})`);

        setTimeout(async () => {
          try {
            // Increment retry count and reset to pending
            await indexedDBService.updateQueueItemRetryCount(item.id, item.retryCount + 1);
            await indexedDBService.updateQueueItemStatus(item.id, 'pending');
            
            // Remove from currently processing set and re-add to queue
            this.currentlyProcessing.delete(item.id);
            
            // Restart queue processing if it's not running
            if (!this.isProcessing) {
              this.processQueue();
            }
          } catch (retryError) {
            console.error(`Failed to schedule retry for item ${item.id}:`, retryError);
            await indexedDBService.updateQueueItemStatus(item.id, 'failed', errorMessage);
          }
        }, delay);
      } else {
        // Max retries exceeded, mark as failed
        await indexedDBService.updateQueueItemStatus(item.id, 'failed', errorMessage);
        console.log(`Item ${item.id} failed after ${this.options.maxRetries} retries`);
      }
    } finally {
      this.currentlyProcessing.delete(item.id);
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    currentlyProcessing: number;
  }> {
    try {
      const allItems = await indexedDBService.getPendingQueueItems();
      
      // Note: This is a simplified implementation
      // In a full implementation, we'd get all items and group by status
      return {
        pending: allItems.filter((item: ProcessingQueueItem) => item.status === 'pending').length,
        processing: allItems.filter((item: ProcessingQueueItem) => item.status === 'processing').length,
        completed: 0, // Would need separate query
        failed: 0, // Would need separate query
        currentlyProcessing: this.currentlyProcessing.size
      };
    } catch (error) {
      console.error('Failed to get queue stats:', error);
      return {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        currentlyProcessing: this.currentlyProcessing.size
      };
    }
  }

  /**
   * Clear completed items from the queue
   */
  async clearCompleted(): Promise<void> {
    try {
      // Note: This would need to be implemented in IndexedDBService
      console.log('Clearing completed items from queue');
      // Implementation would delete items with status 'completed' older than a certain age
    } catch (error) {
      console.error('Failed to clear completed items:', error);
    }
  }

  /**
   * Pause queue processing
   */
  pauseProcessing(): void {
    this.isProcessing = false;
    console.log('Queue processing paused');
  }

  /**
   * Resume queue processing
   */
  resumeProcessing(): void {
    if (!this.isProcessing) {
      console.log('Resuming queue processing');
      this.processQueue();
    }
  }

  /**
   * Update processing options
   */
  updateOptions(options: Partial<QueueProcessorOptions>): void {
    this.options = { ...this.options, ...options };
    console.log('Updated queue processing options:', this.options);
  }

  /**
   * Get current processing status
   */
  getStatus(): {
    isProcessing: boolean;
    currentlyProcessing: string[];
    registeredProcessors: string[];
  } {
    return {
      isProcessing: this.isProcessing,
      currentlyProcessing: Array.from(this.currentlyProcessing),
      registeredProcessors: Array.from(this.processors.keys())
    };
  }
}

// Create singleton instance
export const processingQueueService = new ProcessingQueueService();
export default processingQueueService;
