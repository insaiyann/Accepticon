import React from 'react';
import type { Thread, ThreadHierarchy } from '../../types/Thread';
import { ThreadNode } from './ThreadNode';
import './ThreadTree.css';

interface ThreadTreeProps {
  threads: ThreadHierarchy;
  onThreadClick: (thread: Thread) => void;
  onCreateThread: (parentId?: string) => void;
  onDeleteThread: (threadId: string) => void;
  onToggleCollapse: (threadId: string) => void;
  onRenameThread?: (threadId: string, newTitle: string) => void;
  selectedThreadId?: string;
}

export const ThreadTree: React.FC<ThreadTreeProps> = ({
  threads,
  onThreadClick,
  onCreateThread,
  onDeleteThread,
  onToggleCollapse,
  onRenameThread,
  selectedThreadId
}) => {
  const renderThreadNode = (thread: Thread, level: number = 0): React.ReactNode => {
    const isSelected = selectedThreadId === thread.id;
    
    // Get child threads
    const childThreads = thread.childIds
      .map(childId => threads.threadMap.get(childId))
      .filter((child): child is Thread => child !== undefined)
      .sort((a, b) => a.createdAt - b.createdAt);

    return (
      <ThreadNode
        key={thread.id}
        thread={thread}
        level={level}
        isSelected={isSelected}
        onToggleCollapse={() => onToggleCollapse(thread.id)}
        onClick={() => onThreadClick(thread)}
        onDelete={() => onDeleteThread(thread.id)}
        onRename={onRenameThread}
        onCreateChild={onCreateThread}
      >
        {/* Render child threads */}
        {childThreads.length > 0 && !thread.collapsed && (
          <>
            {childThreads.map(childThread => 
              renderThreadNode(childThread, level + 1)
            )}
          </>
        )}
      </ThreadNode>
    );
  };

  if (threads.rootThreads.length === 0) {
    return (
      <div className="thread-tree-empty">
        <div className="thread-tree-empty-content">
          <div className="thread-tree-empty-icon">💬</div>
          <h3>No threads yet</h3>
          <p>Create your first thread to organize your conversations</p>
          <button 
            className="btn btn-primary"
            onClick={() => onCreateThread()}
          >
            Create Thread
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="thread-tree">
      <div className="thread-tree-header">
        <h3>Threads</h3>
        <button 
          className="create-thread-button"
          onClick={() => onCreateThread()}
          title="Create new thread"
        >
          <span>+</span>
        </button>
      </div>
      
      <div className="thread-tree-content">
        {threads.rootThreads.map(thread => renderThreadNode(thread))}
      </div>
    </div>
  );
};
