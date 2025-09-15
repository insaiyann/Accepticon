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
 * Validate and fix only critical Mermaid syntax issues (minimal approach)
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
  
  console.log('🔧 Starting minimal syntax validation and fixing...');
  console.log('📝 Original code:', fixedCode);
  
  // ONLY fix critical issues that prevent rendering
  
  // 1. Fix invalid arrow syntax that breaks parsing (be more precise)
  const beforeArrowFix = fixedCode;
  // Only fix the specific invalid patterns reported in errors
  fixedCode = fixedCode.replace(/\s+-\s+-->\s*/g, ' --> '); // Fix "- -->" to "-->"
  fixedCode = fixedCode.replace(/\s+--\s+>\s*/g, ' --> '); // Fix "-- >" to "-->"
  
  if (fixedCode !== beforeArrowFix) {
    issues.push('Fixed invalid arrow syntax');
  }
  
  // 2. Fix double brackets that cause parse errors
  const beforeBracketFix = fixedCode;
  fixedCode = fixedCode.replace(/(\w+)\[([^\]]+)\]\]/g, '$1[$2]'); // Fix A[Text]] -> A[Text]
  
  if (fixedCode !== beforeBracketFix) {
    issues.push('Fixed double closing brackets');
  }
  
  // 3. Fix unclosed brackets/braces ONLY if they're clearly incomplete
  const beforeNodeFix = fixedCode;
  
  // Only fix if there's an obvious unclosed bracket at end of line
  fixedCode = fixedCode.replace(/(\w+)\[([^\]]*?)(?=\s*$|\s*\n)/gm, (match, nodeId, content) => {
    if (!content.includes(']') && content.length > 0) {
      console.log(`🔧 Fixed unclosed bracket at end of line: ${nodeId}[${content}]`);
      return `${nodeId}[${content}]`;
    }
    return match;
  });
  
  // Only fix if there's an obvious unclosed brace at end of line
  fixedCode = fixedCode.replace(/(\w+)\{([^}]*?)(?=\s*$|\s*\n)/gm, (match, nodeId, content) => {
    if (!content.includes('}') && content.length > 0) {
      console.log(`🔧 Fixed unclosed brace at end of line: ${nodeId}{${content}}`);
      return `${nodeId}{${content}}`;
    }
    return match;
  });
  
  if (fixedCode !== beforeNodeFix) {
    issues.push('Fixed obviously unclosed node definitions');
  }
  
  // 4. Ensure proper diagram declaration (only if missing)
  const lines = fixedCode.split('\n');
  const firstLine = lines[0]?.trim() || '';
  const validStarts = ['flowchart', 'sequenceDiagram', 'stateDiagram', 'classDiagram', 'gantt', 'graph'];
  
  if (!validStarts.some(start => firstLine.startsWith(start))) {
    fixedCode = 'flowchart TD\n' + fixedCode;
    issues.push('Added missing diagram declaration');
  }
  
  // 5. Final critical validation - only check for issues that break rendering
  const criticalErrors = validateCriticalSyntaxOnly(fixedCode);
  
  if (criticalErrors.length > 0) {
    issues.push(...criticalErrors);
    console.warn('🚨 Critical syntax errors detected, using fallback:', criticalErrors);
    return { 
      isValid: false, 
      fixedCode: generateFallbackDiagram('Critical syntax errors detected'), 
      issues 
    };
  }
  
  console.log('✅ Minimal syntax validation complete. Fixed code:', fixedCode);
  console.log('🔧 Issues resolved:', issues);
  
  return {
    isValid: issues.length === 0,
    fixedCode,
    issues
  };
}

/**
 * Validate only syntax that would cause critical rendering failures
 */
function validateCriticalSyntaxOnly(code: string): string[] {
  const errors: string[] = [];
  
  // Only check for issues that definitely break Mermaid rendering
  
  // 1. Check for unmatched brackets (critical)
  const openSquare = (code.match(/\[/g) || []).length;
  const closeSquare = (code.match(/\]/g) || []).length;
  if (openSquare !== closeSquare) {
    errors.push(`Unmatched square brackets: ${openSquare} open, ${closeSquare} close`);
  }
  
  const openCurly = (code.match(/\{/g) || []).length;
  const closeCurly = (code.match(/\}/g) || []).length;
  if (openCurly !== closeCurly) {
    errors.push(`Unmatched curly braces: ${openCurly} open, ${closeCurly} close`);
  }
  
  // 2. Check for empty or malformed content
  if (code.trim().split('\n').length < 2) {
    errors.push('Diagram has insufficient content');
  }
  
  return errors;
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
