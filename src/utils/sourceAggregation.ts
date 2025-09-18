// Builds a normalized source text from heterogeneous message objects.
// Truncates to a maximum character length while preserving chronological order.
// This is phase 1 minimal implementation; can be extended for richer metadata.

export interface BasicMessageLike {
  id: string;
  type: 'text' | 'audio' | 'image';
  timestamp: number;
  content?: string;          // text
  transcription?: string;    // audio
  description?: string;      // image alt
}

export function buildSourceText(messages: BasicMessageLike[], maxChars = 8000): string {
  const sorted = [...messages].sort((a,b)=> a.timestamp - b.timestamp);
  const parts: string[] = [];
  for (const m of sorted) {
    let body = '';
    if (m.type === 'text') body = m.content || '';
    else if (m.type === 'audio') body = m.transcription || '[audio: no transcription]';
    else if (m.type === 'image') body = m.description || '[image]';
    const header = `[${m.type}] ${new Date(m.timestamp).toISOString()} (#${m.id})`;
    parts.push(`${header}\n${body}\n`);
    const joined = parts.join('\n').slice(0, maxChars);
    if (joined.length >= maxChars) {
      return joined + '\n[TRUNCATED]';
    }
  }
  const full = parts.join('\n');
  return full.length > maxChars ? full.slice(0, maxChars) + '\n[TRUNCATED]' : full;
}

export default buildSourceText;