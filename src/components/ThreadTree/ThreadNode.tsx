import React, { useState, useRef, useEffect } from 'react';
import type { Thread } from '../../types/Thread';
import { Icon } from '../common/Icon';

interface ThreadNodeProps {
  thread: Thread;
  level: number;
  isSelected: boolean;
  onToggleCollapse: () => void;
  onClick: () => void;
  onDelete: () => void;
  onRename?: (threadId: string, newTitle: string) => void;
  onCreateChild?: (parentId: string) => void;
  children?: React.ReactNode;
}

export const ThreadNode: React.FC<ThreadNodeProps> = ({
  thread,
  level,
  isSelected,
  onToggleCollapse,
  onClick,
  onDelete,
  onRename,
  onCreateChild,
  children
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(thread.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasChildren = thread.childIds.length > 0;
  const indentLevel = Math.min(level, 5); // Cap at 5 levels for UI

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing) {
      onClick();
    }
  };

  const handleToggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleCollapse();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete thread "${thread.title}"? This action cannot be undone.`)) {
      onDelete();
    }
  };

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditTitle(thread.title);
  };

  const handleSaveEdit = () => {
    if (editTitle.trim() && editTitle !== thread.title && onRename) {
      onRename(thread.id, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditTitle(thread.title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleInputClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div className="thread-node-container">
      <div 
        className={`thread-node ${isSelected ? 'selected' : ''}`}
        style={{ '--level': indentLevel } as React.CSSProperties}
        onClick={handleClick}
      >
        <div className="thread-indent" />
        
        {/* Expand/Collapse Chevron */}
        <div className="thread-chevron-container">
          {hasChildren ? (
            <button
              className={`thread-chevron ${thread.collapsed ? '' : 'expanded'}`}
              onClick={handleToggleCollapse}
              aria-label={thread.collapsed ? 'Expand thread' : 'Collapse thread'}
            >
              <Icon name="chevron-right" size={12} className="icon" />
            </button>
          ) : (
            <div className="thread-chevron-placeholder" />
          )}
        </div>

        {/* Thread Content */}
        <div className="thread-content">
          <div className="thread-main">
            <div className="thread-title">
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onClick={handleInputClick}
                  onBlur={handleSaveEdit}
                  className="thread-title-input"
                />
              ) : (
                <span>{thread.title}</span>
              )}
            </div>
            <div className="thread-metadata">
              {/* Message Type Indicators */}
              <div className="message-type-indicators">
                {thread.messages?.text?.length > 0 && (
                  <span className="message-type-badge text-badge" title={`${thread.messages.text.length} text message${thread.messages.text.length !== 1 ? 's' : ''}`}>
                    📝 {thread.messages.text.length}
                  </span>
                )}
                {thread.messages?.audio?.length > 0 && (
                  <span className="message-type-badge audio-badge" title={`${thread.messages.audio.length} audio message${thread.messages.audio.length !== 1 ? 's' : ''}`}>
                    🎤 {thread.messages.audio.length}
                    {thread.processingStatus?.audioTranscriptionsComplete ? 
                      <span className="processing-indicator complete">✓</span> : 
                      <span className="processing-indicator pending">⋯</span>
                    }
                  </span>
                )}
                {thread.messages?.image?.length > 0 && (
                  <span className="message-type-badge image-badge" title={`${thread.messages.image.length} image${thread.messages.image.length !== 1 ? 's' : ''}`}>
                    🖼️ {thread.messages.image.length}
                  </span>
                )}
                {/* Fallback for legacy threads without organized messages */}
                {(!thread.messages || (!thread.messages.text?.length && !thread.messages.audio?.length && !thread.messages.image?.length)) && 
                 thread.metadata.messageCount > 0 && (
                  <span className="message-count-badge" title={`${thread.metadata.messageCount} message${thread.metadata.messageCount !== 1 ? 's' : ''}`}>
                    {thread.metadata.messageCount}
                  </span>
                )}
              </div>
              <span className="last-activity">
                {formatTimeAgo(thread.metadata.lastActivity)}
              </span>
            </div>
          </div>
          
          {/* Thread Actions */}
          <div className="thread-actions">
            <button
              className="thread-add-child"
              onClick={(e) => {
                e.stopPropagation();
                // We need to pass the onCreateChild function from parent
                if (onCreateChild) {
                  onCreateChild(thread.id);
                }
              }}
              aria-label="Add child thread"
              title="Add child thread"
            >
              <Icon name="add" size={14} className="icon" />
            </button>
            {!isEditing && (
              <button
                className="thread-edit"
                onClick={handleStartEdit}
                aria-label="Edit thread name"
                title="Edit thread name"
              >
                <Icon name="settings" size={14} className="icon" />
              </button>
            )}
            <button
              className="thread-delete"
              onClick={handleDelete}
              aria-label="Delete thread"
              title="Delete thread"
            >
              <Icon name="delete" size={14} className="icon" />
            </button>
          </div>
        </div>
      </div>

      {/* Child Threads */}
      {hasChildren && !thread.collapsed && (
        <div className="thread-children">
          {children}
        </div>
      )}
    </div>
  );
};
