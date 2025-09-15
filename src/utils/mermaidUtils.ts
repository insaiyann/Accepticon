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
  
  // 1. Fix single quotes in labels
  const beforeQuoteFix = fixedCode;
  fixedCode = fixedCode.replace(/\[([^'\]]*)'([^'\]]*)\]/g, '[$1"$2"]');
  if (fixedCode !== beforeQuoteFix) {
    issues.push('Fixed single quotes in labels');
  }
  
  // 2. Remove problematic keywords
  const beforeArcFix = fixedCode;
  fixedCode = fixedCode.replace(/\barc\s+/gi, '');
  if (fixedCode !== beforeArcFix) {
    issues.push('Removed problematic "arc" keywords');
  }
  
  // 3. Fix incomplete/unclosed node definitions - CRITICAL FIX
  const beforeNodeFix = fixedCode;
  
  // Fix unclosed square brackets [
  fixedCode = fixedCode.replace(/(\w+)\[([^\]]*?)(?=\s*-->|\s*$|\s*\|)/g, (_, nodeId, content) => {
    return `${nodeId}[${content}]`;
  });
  
  // Fix unclosed curly braces {
  fixedCode = fixedCode.replace(/(\w+)\{([^}]*?)(?=\s*-->|\s*$|\s*\|)/g, (_, nodeId, content) => {
    return `${nodeId}{${content}}`;
  });
  
  // Fix unclosed parentheses (
  fixedCode = fixedCode.replace(/(\w+)\(([^)]*?)(?=\s*-->|\s*$|\s*\|)/g, (_, nodeId, content) => {
    return `${nodeId}(${content})`;
  });
  
  if (fixedCode !== beforeNodeFix) {
    issues.push('Fixed unclosed node definitions');
  }
  
  // 4. Fix truncated words and clean up labels
  const beforeLabelFix = fixedCode;
  
  // Replace truncated/partial words with complete words
  fixedCode = fixedCode.replace(/\[([^\]]*)\]/g, (_, content) => {
    let cleanContent = content.trim();
    
    // Remove any trailing incomplete characters
    cleanContent = cleanContent.replace(/[^\w\s-.,!?:()]$/, '');
    
    // If content is too short or appears truncated, provide generic labels
    if (cleanContent.length < 2 || /^[A-Za-z]{1,3}$/.test(cleanContent)) {
      // Extract context from surrounding code for better labeling
      if (content.toLowerCase().includes('start') || content.toLowerCase().includes('begin')) {
        cleanContent = 'Start';
      } else if (content.toLowerCase().includes('end') || content.toLowerCase().includes('finish')) {
        cleanContent = 'End';
      } else if (content.toLowerCase().includes('proc') || content.toLowerCase().includes('process')) {
        cleanContent = 'Process';
      } else if (content.toLowerCase().includes('park') || content.toLowerCase().includes('car')) {
        cleanContent = 'Parking';
      } else {
        cleanContent = 'Step';
      }
    }
    
    // Ensure label is reasonable length (max 30 chars)
    if (cleanContent.length > 30) {
      cleanContent = cleanContent.substring(0, 27) + '...';
    }
    
    return `[${cleanContent}]`;
  });
  
  // Similar fix for curly braces
  fixedCode = fixedCode.replace(/\{([^}]*)\}/g, (_, content) => {
    let cleanContent = content.trim();
    cleanContent = cleanContent.replace(/[^\w\s-.,!?:()]$/, '');
    
    if (cleanContent.length < 2 || /^[A-Za-z]{1,3}$/.test(cleanContent)) {
      cleanContent = 'Decision';
    }
    
    if (cleanContent.length > 30) {
      cleanContent = cleanContent.substring(0, 27) + '...';
    }
    
    return `{${cleanContent}}`;
  });
  
  if (fixedCode !== beforeLabelFix) {
    issues.push('Fixed truncated or invalid node labels');
  }
  
  // 5. Fix arrow spacing and syntax
  const beforeArrowFix = fixedCode;
  fixedCode = fixedCode.replace(/-->/g, ' --> ').replace(/\s+-->\s+/g, ' --> ');
  fixedCode = fixedCode.replace(/->/g, ' --> ').replace(/\s+-->\s+/g, ' --> '); // Convert single arrows
  
  if (fixedCode !== beforeArrowFix) {
    issues.push('Fixed arrow syntax and spacing');
  }
  
  // 6. Ensure proper diagram declaration
  const lines = fixedCode.split('\n');
  const firstLine = lines[0]?.trim() || '';
  const validStarts = ['flowchart', 'sequenceDiagram', 'stateDiagram', 'classDiagram', 'gantt', 'graph'];
  
  if (!validStarts.some(start => firstLine.startsWith(start))) {
    fixedCode = 'flowchart TD\n' + fixedCode;
    issues.push('Added missing diagram declaration');
  }
  
  // 7. Validate node IDs are simple and clean
  const beforeIdFix = fixedCode;
  fixedCode = fixedCode.replace(/([^a-zA-Z0-9_])([a-zA-Z0-9_]+)([[{(])/g, (_, prefix, nodeId, bracket) => {
    // Ensure node IDs are clean (only letters, numbers, underscore)
    const cleanId = nodeId.replace(/[^a-zA-Z0-9_]/g, '');
    return `${prefix}${cleanId || 'Node'}${bracket}`;
  });
  
  if (fixedCode !== beforeIdFix) {
    issues.push('Cleaned node IDs');
  }
  
  // 8. Final structure validation
  const hasNodes = /[A-Z]\d*[[{(]/.test(fixedCode) || /participant/.test(fixedCode);
  const hasConnections = /-->|->|-->>|->>/.test(fixedCode);
  
  if (!hasNodes && !hasConnections) {
    issues.push('No valid nodes or connections found');
    return { 
      isValid: false, 
      fixedCode: generateFallbackDiagram('Invalid structure'), 
      issues 
    };
  }
  
  // 9. Check for critical syntax errors that would cause parsing to fail
  const criticalErrors = [];
  
  // Check for unmatched brackets
  const openSquare = (fixedCode.match(/\[/g) || []).length;
  const closeSquare = (fixedCode.match(/\]/g) || []).length;
  if (openSquare !== closeSquare) {
    criticalErrors.push('Unmatched square brackets');
  }
  
  const openCurly = (fixedCode.match(/\{/g) || []).length;
  const closeCurly = (fixedCode.match(/\}/g) || []).length;
  if (openCurly !== closeCurly) {
    criticalErrors.push('Unmatched curly braces');
  }
  
  const openParen = (fixedCode.match(/\(/g) || []).length;
  const closeParen = (fixedCode.match(/\)/g) || []).length;
  if (openParen !== closeParen) {
    criticalErrors.push('Unmatched parentheses');
  }
  
  // If critical errors exist, use fallback
  if (criticalErrors.length > 0) {
    issues.push(...criticalErrors);
    return { 
      isValid: false, 
      fixedCode: generateFallbackDiagram('Syntax errors detected'), 
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
