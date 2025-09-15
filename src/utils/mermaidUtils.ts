/**
 * Mermaid diagram utilities for generating fallback diagrams and syntax validation
 */

export interface DiagramContent {
  text: string;
  type?: 'conversation' | 'process' | 'decision' | 'unknown';
}

/**
 * Analyze content to determine the best diagram type
 */
export function analyzeDiagramType(content: string): 'flowchart' | 'sequence' | 'state' {
  const lowerContent = content.toLowerCase();
  
  // Look for conversation patterns
  if (lowerContent.includes('user:') || lowerContent.includes('assistant:') || 
      lowerContent.includes('says') || lowerContent.includes('responds') ||
      lowerContent.includes('message') || lowerContent.includes('chat')) {
    return 'sequence';
  }
  
  // Look for state/process patterns
  if (lowerContent.includes('state') || lowerContent.includes('status') ||
      lowerContent.includes('phase') || lowerContent.includes('stage')) {
    return 'state';
  }
  
  // Default to flowchart for most content
  return 'flowchart';
}

/**
 * Generate a simple fallback diagram when AI generation fails
 */
export function generateFallbackDiagram(content: string): string {
  const diagramType = analyzeDiagramType(content);
  const words = content.split(/\s+/).slice(0, 10); // First 10 words
  const summary = words.join(' ').substring(0, 50) + (content.length > 50 ? '...' : '');
  
  switch (diagramType) {
    case 'sequence':
      return `sequenceDiagram
    participant U as User
    participant S as System
    U->>S: ${summary}
    S-->>U: Response
    Note over U,S: Generated from content`;
      
    case 'state':
      return `stateDiagram-v2
    [*] --> Initial
    Initial --> Processing: ${summary.substring(0, 20)}
    Processing --> Complete
    Complete --> [*]`;
      
    default: // flowchart
      return `flowchart TD
    A[Start: ${summary.substring(0, 20)}] --> B{Process}
    B -->|Success| C[Complete]
    B -->|Error| D[Retry]
    D --> B
    C --> E[End]`;
  }
}

/**
 * Validate and fix common Mermaid syntax issues
 */
export function validateAndFixMermaidSyntax(code: string): {
  isValid: boolean;
  fixedCode: string;
  issues: string[];
} {
  const issues: string[] = [];
  let fixedCode = code.trim();
  
  // Check for empty code
  if (!fixedCode) {
    issues.push('Empty diagram code');
    return { isValid: false, fixedCode: generateFallbackDiagram('Empty content'), issues };
  }
  
  // Fix common syntax issues
  const originalCode = fixedCode;
  
  // 1. Fix single quotes in labels
  fixedCode = fixedCode.replace(/\[([^'\]]*)'([^'\]]*)\]/g, '[$1"$2"]');
  if (fixedCode !== originalCode) {
    issues.push('Fixed single quotes in labels');
  }
  
  // 2. Remove problematic keywords
  const beforeArcFix = fixedCode;
  fixedCode = fixedCode.replace(/\barc\s+/gi, '');
  if (fixedCode !== beforeArcFix) {
    issues.push('Removed problematic "arc" keywords');
  }
  
  // 3. Fix arrow spacing
  fixedCode = fixedCode.replace(/-->/g, ' --> ').replace(/\s+-->\s+/g, ' --> ');
  
  // 4. Ensure proper diagram declaration
  const lines = fixedCode.split('\n');
  const firstLine = lines[0]?.trim() || '';
  const validStarts = ['flowchart', 'sequenceDiagram', 'stateDiagram', 'classDiagram', 'gantt', 'graph'];
  
  if (!validStarts.some(start => firstLine.startsWith(start))) {
    fixedCode = 'flowchart TD\n' + fixedCode;
    issues.push('Added missing diagram declaration');
  }
  
  // 5. Basic structure validation
  const hasNodes = /[A-Z]\d*\[/.test(fixedCode) || /[A-Z]\d*\(/.test(fixedCode) || /participant/.test(fixedCode);
  const hasConnections = /-->|->|-->>|->>/.test(fixedCode);
  
  if (!hasNodes && !hasConnections) {
    issues.push('No valid nodes or connections found');
    return { 
      isValid: false, 
      fixedCode: generateFallbackDiagram('Invalid structure'), 
      issues 
    };
  }
  
  return {
    isValid: issues.length === 0,
    fixedCode,
    issues
  };
}

/**
 * Extract meaningful content for diagram generation
 */
export function extractDiagramContent(text: string): DiagramContent {
  // Clean up the text
  const cleanText = text
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 1000); // Limit length
  
  // Determine content type
  let type: DiagramContent['type'] = 'unknown';
  
  if (cleanText.includes('User:') || cleanText.includes('Assistant:')) {
    type = 'conversation';
  } else if (cleanText.includes('step') || cleanText.includes('process') || cleanText.includes('then')) {
    type = 'process';
  } else if (cleanText.includes('if') || cleanText.includes('should') || cleanText.includes('decision')) {
    type = 'decision';
  }
  
  return {
    text: cleanText,
    type
  };
}

/**
 * Generate a template based on content type
 */
export function generateDiagramTemplate(content: DiagramContent): string {
  const { text, type } = content;
  const shortText = text.substring(0, 30);
  
  switch (type) {
    case 'conversation':
      return `sequenceDiagram
    participant User
    participant Assistant
    User->>Assistant: ${shortText}
    Assistant-->>User: Response`;
      
    case 'process':
      return `flowchart TD
    A[Start] --> B[${shortText}]
    B --> C{Decision}
    C -->|Yes| D[Success]
    C -->|No| E[Retry]
    E --> B
    D --> F[End]`;
      
    case 'decision':
      return `flowchart TD
    A[Input] --> B{${shortText}}
    B -->|Option 1| C[Result A]
    B -->|Option 2| D[Result B]
    C --> E[End]
    D --> E`;
      
    default:
      return `flowchart TD
    A[${shortText}] --> B[Process]
    B --> C[Complete]`;
  }
}
