import OpenAI from 'openai';
import { generateFallbackDiagram, validateAndFixMermaidSyntax, extractDiagramContent } from '../../utils/mermaidUtils';

export interface MermaidGenerationOptions {
  diagramType?: 'flowchart' | 'sequence' | 'gantt' | 'class' | 'state' | 'auto';
  direction?: 'TD' | 'LR' | 'RL' | 'BT';
  includeTitle?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface MermaidGenerationResult {
  mermaidCode: string;
  diagramType: string;
  title?: string;
  metadata: {
    tokensUsed: number;
    processingTime: number;
    confidence: number;
  };
}

export interface OpenAIConfig {
  apiKey: string;
  endpoint: string;
  apiVersion: string;
  deploymentName: string;
}

class OpenAIService {
  private client: OpenAI | null = null;
  private config: OpenAIConfig | null = null;
  private isInitialized = false;

  /**
   * Initialize the OpenAI service with configuration
   */
  async initialize(config: OpenAIConfig): Promise<void> {
    try {
      this.config = config;
      
      this.client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: `${config.endpoint}/openai/deployments/${config.deploymentName}`,
        defaultQuery: { 'api-version': config.apiVersion },
        defaultHeaders: {
          'api-key': config.apiKey,
        },
        dangerouslyAllowBrowser: true,
      });

      this.isInitialized = true;
      
      console.log('OpenAI service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize OpenAI service:', error);
      throw new Error('OpenAI service initialization failed');
    }
  }

  /**
   * Generate mermaid diagram from text content
   */
  async generateMermaidDiagram(
    content: string,
    options: MermaidGenerationOptions = {}
  ): Promise<MermaidGenerationResult> {
    return await this.generateMermaidDiagramWithRetry(content, options, 3);
  }

  /**
   * Generate mermaid diagram with retry logic
   */
  private async generateMermaidDiagramWithRetry(
    content: string,
    options: MermaidGenerationOptions = {},
    maxRetries: number = 3
  ): Promise<MermaidGenerationResult> {
    if (!this.isInitialized || !this.client) {
      throw new Error('OpenAI service not initialized');
    }

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const startTime = Date.now();

      try {
        console.log(`🤖 OpenAI API call attempt ${attempt + 1}/${maxRetries}`);
        
        const prompt = this.buildMermaidPrompt(content, options);
        
        const response = await this.client.chat.completions.create({
          model: 'gpt-4', // This will be mapped to the deployment
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt()
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: options.maxTokens || 1000,
          temperature: options.temperature || 0.3,
          top_p: 0.9,
          frequency_penalty: 0,
          presence_penalty: 0
        });

        const assistantMessage = response.choices[0]?.message?.content;
        if (!assistantMessage) {
          throw new Error('No response received from OpenAI');
        }

        const processingTime = Date.now() - startTime;
        const tokensUsed = response.usage?.total_tokens || 0;

        // Extract mermaid code and metadata from response
        const result = this.parseMermaidResponse(assistantMessage);
        
        console.log(`✅ OpenAI API call successful on attempt ${attempt + 1}`);
        
        return {
          ...result,
          metadata: {
            tokensUsed,
            processingTime,
            confidence: this.calculateConfidence(result.mermaidCode)
          }
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ OpenAI API call failed (attempt ${attempt + 1}/${maxRetries}):`, errorMessage);
        
        // Determine if error is retryable
        const isRetryableError = this.isRetryableError(error);
        
        // If this is the last attempt or non-retryable error, try fallback
        if (attempt === maxRetries - 1 || !isRetryableError) {
          console.log('🚨 All OpenAI attempts failed, generating fallback diagram...');
          
          // Generate fallback diagram as last resort
          try {
            const fallbackCode = generateFallbackDiagram(content);
            const contentAnalysis = extractDiagramContent(content);
            
            console.log('✅ Fallback diagram generated successfully');
            
            return {
              mermaidCode: fallbackCode,
              diagramType: 'flowchart',
              title: `Auto-generated from content (${contentAnalysis.type || 'unknown'} type)`,
              metadata: {
                tokensUsed: 0,
                processingTime: Date.now() - startTime,
                confidence: 0.5 // Lower confidence for fallback
              }
            };
          } catch (fallbackError) {
            console.error('❌ Even fallback generation failed:', fallbackError);
          }
          
          const finalError = attempt === maxRetries - 1 
            ? `OpenAI API failed after ${maxRetries} attempts: ${errorMessage}`
            : `OpenAI API error: ${errorMessage}`;
          throw new Error(finalError);
        }
        
        // Calculate exponential backoff delay with jitter
        const baseDelay = Math.min(1000 * Math.pow(2, attempt), 10000);
        const jitterDelay = baseDelay + Math.random() * 1000; // Add up to 1s jitter
        
        console.log(`🔄 Retrying OpenAI API call in ${Math.round(jitterDelay)}ms...`);
        await delay(jitterDelay);
      }
    }
    
    // This should never be reached due to the throw statements above
    throw new Error('OpenAI API failed after all retry attempts');
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    
    const errorMessage = error.message.toLowerCase();
    
    // Network/timeout errors
    if (errorMessage.includes('timeout') || 
        errorMessage.includes('network') ||
        errorMessage.includes('econnreset') ||
        errorMessage.includes('enotfound') ||
        errorMessage.includes('socket hang up')) {
      return true;
    }
    
    // HTTP errors that are retryable
    if (errorMessage.includes('429') ||  // Rate limiting
        errorMessage.includes('503') ||  // Service unavailable
        errorMessage.includes('502') ||  // Bad gateway
        errorMessage.includes('504')) {  // Gateway timeout
      return true;
    }
    
    // Non-retryable errors
    if (errorMessage.includes('401') ||  // Unauthorized
        errorMessage.includes('403') ||  // Forbidden
        errorMessage.includes('400') ||  // Bad request
        errorMessage.includes('invalid') ||
        errorMessage.includes('malformed')) {
      return false;
    }
    
    // Default to retryable for unknown errors
    return true;
  }

  /**
   * Build the prompt for mermaid generation (rest of implementation)
   */
  private buildMermaidPrompt(content: string, options: MermaidGenerationOptions): string {
    const diagramTypeHint = options.diagramType && options.diagramType !== 'auto' 
      ? `Create a ${options.diagramType} diagram.` 
      : 'Determine the most appropriate diagram type based on the content.';

    const directionHint = options.direction 
      ? `Use ${options.direction} direction for the diagram.` 
      : '';

    const titleHint = options.includeTitle 
      ? 'Include a descriptive title for the diagram.' 
      : '';

    return `
${diagramTypeHint} ${directionHint} ${titleHint}

Content to visualize:
"""
${content}
"""

CRITICAL REQUIREMENTS - Follow these rules EXACTLY:

1. SYNTAX VALIDATION: Your output must be VALID Mermaid syntax that will parse without errors
2. NODE IDS: Use only simple IDs like A, B, C, User, System (NO spaces, NO special chars except numbers)
3. NODE LABELS: 
   - Use square brackets [Complete Label Text] or double quotes "Complete Label Text"
   - NEVER use single quotes (') anywhere
   - ALWAYS close brackets completely: A[Start] NOT A[Star
   - Keep labels under 30 characters
   - Use complete words, NOT truncated: [Process] NOT [Proces], [Parking] NOT [Parki]
4. DIAGRAM DECLARATION: Always start with proper type: flowchart TD, sequenceDiagram, stateDiagram-v2
5. ARROWS: Use --> for flowcharts, ->> for sequence diagrams, proper spacing
6. COMPLETE SYNTAX: Every bracket, brace, parenthesis must be properly closed
7. NO FORBIDDEN KEYWORDS: Never use 'arc', 'expecting', or invalid Mermaid syntax

MANDATORY SYNTAX EXAMPLES:

FLOWCHART (most common):
\`\`\`mermaid
flowchart TD
    A[Start Process] --> B{Is Valid}
    B -->|Yes| C[Success State]
    B -->|No| D[Error Handler]
    C --> E[End]
    D --> E
\`\`\`

SEQUENCE (for conversations/interactions):
\`\`\`mermaid
sequenceDiagram
    participant User as User
    participant System as System
    User->>System: Send Request
    System-->>User: Return Response
    Note over User,System: Process Complete
\`\`\`

FORBIDDEN PATTERNS - DO NOT USE:
❌ A[Parki] (truncated words)
❌ B{Proces (unclosed braces)
❌ C['Label'] (single quotes)
❌ arc TD (invalid keywords)
❌ Node with spaces[Label] (invalid node ID)

REQUIRED PATTERNS - ALWAYS USE:
✅ A[Parking] (complete words)
✅ B{Process} (properly closed)
✅ C["Label Text"] (double quotes if needed)
✅ flowchart TD (proper declaration)
✅ SimpleNode[Label] (clean node IDs)

Please provide your response in this EXACT format:
DIAGRAM_TYPE: [type]
TITLE: [title if applicable]
MERMAID_CODE:
\`\`\`mermaid
[your COMPLETE and VALID mermaid code here - every bracket must be closed]
\`\`\`

FINAL CHECK: Before responding, verify:
- All brackets [ ] are properly closed
- All braces { } are properly closed  
- All parentheses ( ) are properly closed
- No truncated words in labels
- Valid node IDs (simple alphanumeric)
- Proper diagram declaration
- No single quotes anywhere
    `.trim();
  }

  /**
   * Get the system prompt for mermaid generation
   */
  private getSystemPrompt(): string {
    return `
You are an expert Mermaid diagram generator. Your ONLY job is to create syntactically perfect Mermaid diagrams that will render without any parsing errors.

CRITICAL SUCCESS CRITERIA:
- Every bracket [ ] must be properly closed - NO exceptions
- Every brace { } must be properly closed - NO exceptions  
- Every parenthesis ( ) must be properly closed - NO exceptions
- NO truncated words in labels (e.g., "Proces" should be "Process", "Parki" should be "Parking")
- Node IDs must be simple alphanumeric (A, B, C, Node1, User) - NO spaces or special characters
- NEVER use single quotes (') - always use double quotes (") or no quotes
- ALWAYS include proper diagram declaration (flowchart TD, sequenceDiagram, etc.)

COMMON FATAL ERRORS TO AVOID:
❌ A[Parki] --> B{Proces (truncated words + unclosed brace)
❌ Node with spaces[Label] (invalid node ID)
❌ A['Label'] (single quotes)
❌ arc TD (invalid keywords)
❌ Missing diagram declaration

REQUIRED VALID PATTERNS:
✅ A[Parking] --> B{Process} (complete words, closed brackets/braces)
✅ User[Complete Label] --> System{Decision Point} (proper node IDs)
✅ flowchart TD (proper declaration)

VALIDATION CHECKLIST - Before sending response:
1. Count opening brackets [ - must equal closing brackets ]
2. Count opening braces { - must equal closing braces }
3. Count opening parentheses ( - must equal closing parentheses )
4. Check all labels for complete words (no truncation)
5. Verify simple node IDs (A, B, User, System, etc.)
6. Confirm proper diagram declaration exists
7. Ensure no single quotes anywhere

DIAGRAM TYPE GUIDELINES:
- FLOWCHART: For processes, decisions, workflows (most common)
- SEQUENCE: For conversations, interactions, time-based flows
- STATE: For status changes, lifecycle diagrams

Example Perfect Flowchart:
\`\`\`mermaid
flowchart TD
    A[Start Process] --> B{Valid Input}
    B -->|Yes| C[Process Data]
    B -->|No| D[Show Error]
    C --> E[Save Results]
    D --> A
    E --> F[End]
\`\`\`

Example Perfect Sequence:
\`\`\`mermaid
sequenceDiagram
    participant User as User
    participant App as Application
    User->>App: Submit Request
    App-->>User: Return Response
    Note over User,App: Transaction Complete
\`\`\`

Your diagrams must be production-ready and error-free. A single syntax error makes the entire diagram fail.
    `.trim();
  }

  /**
   * Parse the mermaid response from OpenAI
   */
  private parseMermaidResponse(response: string): Omit<MermaidGenerationResult, 'metadata'> {
    const lines = response.split('\n');
    
    let diagramType = 'flowchart';
    let title: string | undefined;
    let mermaidCode = '';
    let inCodeBlock = false;

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('DIAGRAM_TYPE:')) {
        diagramType = trimmedLine.replace('DIAGRAM_TYPE:', '').trim();
      } else if (trimmedLine.startsWith('TITLE:')) {
        title = trimmedLine.replace('TITLE:', '').trim();
      } else if (trimmedLine === '```mermaid') {
        inCodeBlock = true;
      } else if (trimmedLine === '```') {
        inCodeBlock = false;
      } else if (inCodeBlock) {
        mermaidCode += line + '\n';
      }
    }

    // Clean up mermaid code
    mermaidCode = mermaidCode.trim();

    // Validate that we have valid mermaid code
    if (!mermaidCode) {
      throw new Error('No mermaid code found in response');
    }

    // CRITICAL: Pre-validate for common issues before attempting to use
    const preValidationIssues = this.preValidateMermaidCode(mermaidCode);
    if (preValidationIssues.length > 0) {
      console.log('🚨 Pre-validation found critical issues:', preValidationIssues);
      console.log('🔧 Original code:', mermaidCode);
      
      // Use advanced validation and cleanup
      const validationResult = validateAndFixMermaidSyntax(mermaidCode);
      console.log('🔧 Fixed code:', validationResult.fixedCode);
      console.log('🔧 All fixes applied:', validationResult.issues);
      
      mermaidCode = validationResult.fixedCode;
    } else {
      // Still run through validation for minor cleanup
      const validationResult = validateAndFixMermaidSyntax(mermaidCode);
      if (validationResult.issues.length > 0) {
        console.log('🔧 Minor fixes applied:', validationResult.issues);
      }
      mermaidCode = validationResult.fixedCode;
    }

    return {
      mermaidCode,
      diagramType,
      title: title || undefined
    };
  }

  /**
   * Pre-validate mermaid code for critical syntax issues
   */
  private preValidateMermaidCode(code: string): string[] {
    const issues: string[] = [];
    
    // Check for truncated words in labels (common AI error)
    const truncatedWords = code.match(/\[[A-Za-z]{1,4}\]|\{[A-Za-z]{1,4}\}/g);
    if (truncatedWords) {
      issues.push(`Detected likely truncated words: ${truncatedWords.join(', ')}`);
    }
    
    // Check for unclosed brackets
    const openSquare = (code.match(/\[/g) || []).length;
    const closeSquare = (code.match(/\]/g) || []).length;
    if (openSquare !== closeSquare) {
      issues.push(`Unmatched square brackets: ${openSquare} open, ${closeSquare} close`);
    }
    
    const openCurly = (code.match(/\{/g) || []).length;
    const closeCurly = (code.match(/\}/g) || []).length;
    if (openCurly !== closeCurly) {
      issues.push(`Unmatched curly braces: ${openCurly} open, ${closeCurly} close`);
    }
    
    const openParen = (code.match(/\(/g) || []).length;
    const closeParen = (code.match(/\)/g) || []).length;
    if (openParen !== closeParen) {
      issues.push(`Unmatched parentheses: ${openParen} open, ${closeParen} close`);
    }
    
    // Check for single quotes (forbidden)
    if (code.includes("'")) {
      issues.push('Contains forbidden single quotes');
    }
    
    // Check for proper diagram declaration
    const lines = code.split('\n');
    const firstLine = lines[0]?.trim() || '';
    const validStarts = ['flowchart', 'sequenceDiagram', 'stateDiagram', 'classDiagram', 'gantt', 'graph'];
    if (!validStarts.some(start => firstLine.startsWith(start))) {
      issues.push('Missing or invalid diagram type declaration');
    }
    
    // Check for problematic keywords
    if (/\barc\s+/i.test(code)) {
      issues.push('Contains problematic "arc" keyword');
    }
    
    return issues;
  }

  /**
   * Calculate confidence score for generated mermaid code
   */
  private calculateConfidence(mermaidCode: string): number {
    let confidence = 0.5; // Base confidence

    // Check for valid mermaid syntax indicators
    const validPatterns = [
      /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|gantt)/m,
      /-->/g,
      /\[[^\]]+\]/g,
      /\([^)]+\)/g
    ];

    validPatterns.forEach(pattern => {
      if (pattern.test(mermaidCode)) {
        confidence += 0.1;
      }
    });

    // Check for common syntax errors
    const errorPatterns = [
      /^\s*$/m, // Empty lines where they shouldn't be
      /[{}]/g,  // Curly braces (often wrong syntax)
    ];

    errorPatterns.forEach(pattern => {
      if (pattern.test(mermaidCode)) {
        confidence -= 0.1;
      }
    });

    // Ensure confidence is between 0 and 1
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Validate mermaid syntax (basic validation)
   */
  async validateMermaidSyntax(mermaidCode: string): Promise<{
    isValid: boolean;
    errors: string[];
    suggestions: string[];
  }> {
    const errors: string[] = [];
    const suggestions: string[] = [];

    // Basic syntax checks
    if (!mermaidCode.trim()) {
      errors.push('Mermaid code is empty');
      return { isValid: false, errors, suggestions };
    }

    // Check for diagram type declaration
    const diagramTypeRegex = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|gantt|gitGraph|journey)/m;
    if (!diagramTypeRegex.test(mermaidCode)) {
      errors.push('Missing diagram type declaration');
      suggestions.push('Start with a diagram type like "flowchart TD" or "sequenceDiagram"');
    }

    // Check for common syntax issues
    const lines = mermaidCode.split('\n');
    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('%') && !trimmedLine.startsWith('%%')) {
        // Check for unmatched brackets
        const openBrackets = (line.match(/\[/g) || []).length;
        const closeBrackets = (line.match(/\]/g) || []).length;
        if (openBrackets !== closeBrackets) {
          errors.push(`Line ${index + 1}: Unmatched brackets`);
        }

        // Check for unmatched parentheses
        const openParens = (line.match(/\(/g) || []).length;
        const closeParens = (line.match(/\)/g) || []).length;
        if (openParens !== closeParens) {
          errors.push(`Line ${index + 1}: Unmatched parentheses`);
        }
      }
    });

    const isValid = errors.length === 0;
    
    if (!isValid) {
      suggestions.push('Check Mermaid documentation for correct syntax');
      suggestions.push('Validate your diagram at https://mermaid.live');
    }

    return { isValid, errors, suggestions };
  }

  /**
   * Get service status
   */
  getStatus(): {
    isInitialized: boolean;
    hasClient: boolean;
    endpoint?: string;
  } {
    return {
      isInitialized: this.isInitialized,
      hasClient: this.client !== null,
      endpoint: this.config?.endpoint
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.client = null;
    this.config = null;
    this.isInitialized = false;
    console.log('OpenAI service cleaned up');
  }
}

// Create singleton instance
export const openAIService = new OpenAIService();
export default openAIService;
