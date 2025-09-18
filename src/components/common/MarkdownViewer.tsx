import React, { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import './MarkdownViewer.css';

interface Props {
  markdown?: string;
  loading: boolean;
  error?: string;
  onRetry?: () => void;
  title?: string;
}

// Renders markdown (already fence-extracted) into sanitized HTML.
export const MarkdownViewer: React.FC<Props> = ({ markdown, loading, error, onRetry, title }) => {
  const html = useMemo(() => {
    if (!markdown) return '';
    try {
      const rendered = marked.parse(markdown, { async: false });
      return DOMPurify.sanitize(rendered as string, { USE_PROFILES: { html: true } });
    } catch (e) {
      console.warn('Markdown render failed, falling back to plain text', e);
      return `<pre>${markdown.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!) )}</pre>`;
    }
  }, [markdown]);

  if (loading) {
    return (
      <div className="markdown-viewer loading">
        <div className="skeleton-line" style={{ width: '60%' }} />
        <div className="skeleton-line" style={{ width: '90%' }} />
        <div className="skeleton-line" style={{ width: '75%' }} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="markdown-viewer error">
        <p role="alert">{error}</p>
        {onRetry && <button onClick={onRetry}>Retry</button>}
      </div>
    );
  }

  if (!markdown) return <div className="markdown-viewer empty">No content yet.</div>;

  return (
    <div className="markdown-viewer">
      {title && <h3>{title}</h3>}
      <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
};

export default MarkdownViewer;