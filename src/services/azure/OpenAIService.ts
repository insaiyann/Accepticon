import OpenAI from 'openai';
import { validateAndFixMermaidSyntax, extractDiagramContent } from '../../utils/mermaidUtils';

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
   * Generate mermaid diagram with progressive retry logic and enhanced validation
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
        
        // Progressive prompt enhancement - stricter requirements for each retry
        const prompt = this.buildProgressiveMermaidPrompt(content, options, attempt);
        
        const response = await this.client.chat.completions.create({
          model: 'gpt-4', // This will be mapped to the deployment
          messages: [
            {
              role: 'system',
              content: this.getProgressiveSystemPrompt(attempt)
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: options.maxTokens || 1000,
          temperature: Math.max(0.1, (options.temperature || 0.3) - (attempt * 0.1)), // Reduce creativity on retries
          top_p: Math.max(0.7, 0.9 - (attempt * 0.1)), // Reduce variability on retries
          frequency_penalty: 0,
          presence_penalty: 0
        });

        const assistantMessage = response.choices[0]?.message?.content;
        if (!assistantMessage) {
          throw new Error('No response received from OpenAI');
        }

        const processingTime = Date.now() - startTime;
        const tokensUsed = response.usage?.total_tokens || 0;

        // Extract mermaid code and metadata from response with enhanced validation
        const result = this.parseMermaidResponseWithValidation(assistantMessage, attempt);
        
        console.log(`✅ OpenAI API call successful on attempt ${attempt + 1}`);
        
        return {
          ...result,
          metadata: {
            tokensUsed,
            processingTime,
            confidence: this.calculateConfidence(result.mermaidCode, attempt)
          }
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ OpenAI API call failed (attempt ${attempt + 1}/${maxRetries}):`, errorMessage);
        
        // Enhanced error analysis for retry decision
        const isRetryableError = this.isRetryableError(error);
        const isSyntaxError = errorMessage.toLowerCase().includes('syntax') || 
                             errorMessage.toLowerCase().includes('parse') ||
                             errorMessage.toLowerCase().includes('expecting');
        
        // If this is the last attempt or non-retryable error, try fallback
        if (attempt === maxRetries - 1 || (!isRetryableError && !isSyntaxError)) {
          console.log('🚨 All OpenAI attempts failed, generating enhanced fallback diagram...');
          
          // Generate enhanced fallback diagram as last resort
          try {
            const fallbackCode = this.generateEnhancedFallback(content, options);
            const contentAnalysis = extractDiagramContent(content);
            
            console.log('✅ Enhanced fallback diagram generated successfully');
            
            return {
              mermaidCode: fallbackCode,
              diagramType: options.diagramType || 'flowchart',
              title: `Auto-generated from content (${contentAnalysis.type || 'unknown'} type)`,
              metadata: {
                tokensUsed: 0,
                processingTime: Date.now() - startTime,
                confidence: 0.6 // Higher confidence for enhanced fallback
              }
            };
          } catch (fallbackError) {
            console.error('❌ Even enhanced fallback generation failed:', fallbackError);
          }
          
          const finalError = attempt === maxRetries - 1 
            ? `OpenAI API failed after ${maxRetries} attempts with progressive enhancement: ${errorMessage}`
            : `OpenAI API error: ${errorMessage}`;
          throw new Error(finalError);
        }
        
        // Calculate smart retry delay based on error type and attempt
        const baseDelay = isSyntaxError ? 500 : Math.min(1000 * Math.pow(2, attempt), 10000);
        const jitterDelay = baseDelay + Math.random() * 1000; // Add up to 1s jitter
        
        console.log(`🔄 Retrying OpenAI API call with enhanced prompt in ${Math.round(jitterDelay)}ms...`);
        await delay(jitterDelay);
      }
    }
    
    // This should never be reached due to the throw statements above
    throw new Error('OpenAI API failed after all progressive retry attempts');
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
   * Build progressive mermaid prompt that gets stricter with each retry
   */
  private buildProgressiveMermaidPrompt(content: string, options: MermaidGenerationOptions, attempt: number): string {
    const diagramTypeHint = options.diagramType && options.diagramType !== 'auto' 
      ? `Create a ${options.diagramType} diagram.` 
      : 'Determine the most appropriate diagram type based on the content.';

    const directionHint = options.direction 
      ? `Use ${options.direction} direction for the diagram.` 
      : '';

    const titleHint = options.includeTitle 
      ? 'Include a descriptive title for the diagram.' 
      : '';

    // Progressive strictness based on attempt
    const strictnessLevel = attempt === 0 ? 'STANDARD' : 
                           attempt === 1 ? 'ENHANCED' : 'MAXIMUM';
    
    const progressiveRequirements = this.getProgressiveRequirements(strictnessLevel);

    return `
${diagramTypeHint} ${directionHint} ${titleHint}

Content to visualize:
"""
${content}
"""

STRICTNESS LEVEL: ${strictnessLevel}

${progressiveRequirements}

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
- No truncated words in labels (e.g., "Proces" should be "Process", "Parki" should be "Parking")
- Valid node IDs (simple alphanumeric)
- Proper diagram declaration
- No single quotes anywhere
    `.trim();
  }

  /**
   * Get progressive requirements based on strictness level
   */
  private getProgressiveRequirements(level: string): string {
    switch (level) {
      case 'STANDARD':
        return `
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
5. ARROWS: Use --> for flowcharts (NOT "- -->" or "-- >"), ->> for sequence diagrams, proper spacing
6. COMPLETE SYNTAX: Every bracket, brace, parenthesis must be properly closed
7. NO FORBIDDEN KEYWORDS: Never use 'arc', 'expecting', or invalid Mermaid syntax
8. NO INVALID ARROWS: Never use "- -->" or "-- >" - always use "-->"
9. NO DOUBLE BRACKETS: Never use "A[Text]]" - always use "A[Text]"`;

      case 'ENHANCED':
        return `
ENHANCED CRITICAL REQUIREMENTS - STRICTER VALIDATION:

1. MANDATORY SYNTAX CHECK: Every character must contribute to valid Mermaid syntax
2. COMPLETE WORD REQUIREMENT: Every label must contain complete, meaningful words
   - "Process" NOT "Proc", "Proces", or "Proce"
   - "Parking" NOT "Park", "Parki", or "Parkin"
   - "Decision" NOT "Deci", "Decis", or "Decisio"
   - "Complete" NOT "Comp", "Compl", or "Complet"
3. BRACKET VALIDATION: Count and verify every opening has a closing
   - [ must have matching ]
   - { must have matching }
   - ( must have matching )
4. DOUBLE-CHECK NODE IDS: Only A-Z, a-z, 0-9, underscore allowed
5. ARROW SYNTAX: Proper spacing around all arrows (A --> B not A-->B)
6. DIAGRAM STRUCTURE: Must have both nodes and connections
7. NO TRUNCATION ANYWHERE: Every word must be complete and recognizable`;

      case 'MAXIMUM':
        return `
MAXIMUM STRICTNESS - PRODUCTION-READY VALIDATION:

⚠️  CRITICAL: This is the final attempt. Diagram MUST be syntactically perfect.

1. PRODUCTION QUALITY: Diagram must render without ANY parsing errors
2. SYNTAX PERFECTION: Every character validated for Mermaid compliance
3. COMPLETE WORDS ONLY: Absolutely NO truncated or partial words
   - Bad: [Parki], {Proces, (Deci)
   - Good: [Parking], {Process}, (Decision)
4. BRACKET COMPLETENESS: Every opening delimiter must have its closing pair
5. SEMANTIC VALIDATION: Node labels must make logical sense
6. STRUCTURE VALIDATION: Proper diagram type declaration + valid nodes + valid connections
7. ZERO TOLERANCE: Any syntax error will cause complete diagram failure

VALIDATION CHECKLIST (verify before responding):
✓ Counted all [ and ] - they match
✓ Counted all { and } - they match  
✓ Counted all ( and ) - they match
✓ All node labels are complete words
✓ No single quotes anywhere
✓ Proper diagram declaration present
✓ Valid arrows with proper spacing
✓ Node IDs are clean (A-Z, 0-9 only)

This is your LAST CHANCE to create a perfect diagram.`;

      default:
        return '';
    }
  }

  /**
   * Get progressive system prompt that gets stricter with each retry
   */
  private getProgressiveSystemPrompt(attempt: number): string {
    const basePrompt = `You are an expert Mermaid diagram generator. Your ONLY job is to create syntactically perfect Mermaid diagrams that will render without any parsing errors.`;
    
    const progressiveElements = attempt === 0 ? '' :
                               attempt === 1 ? '\n\nWARNING: Previous attempt failed. Use enhanced validation and complete words only.' :
                               '\n\n🚨 CRITICAL: This is the FINAL attempt. Diagram must be 100% syntactically perfect or system will fail. Use maximum care and validation.';

    const strictnessGuidance = attempt === 0 ? `

COMMON FATAL ERRORS TO AVOID:
❌ A[Parki] --> B{Proces (truncated words + unclosed brace)
❌ Node with spaces[Label] (invalid node ID)
❌ A['Label'] (single quotes)
❌ arc TD (invalid keywords)
❌ Missing diagram declaration
❌ A[Text] - --> B[Text] (invalid arrow "- -->")
❌ A[User]] --> B[Text] (double closing bracket)

REQUIRED VALID PATTERNS:
✅ A[Parking] --> B{Process} (complete words, closed brackets/braces)
✅ User[Complete Label] --> System{Decision Point} (proper node IDs)
✅ flowchart TD (proper declaration)
✅ A[Start] --> B[Process] (correct arrow syntax)` :

attempt === 1 ? `

ENHANCED ERROR PREVENTION:
❌ ANY truncated words (Parki, Proces, Deci, etc.)
❌ ANY unclosed brackets, braces, or parentheses
❌ ANY single quotes in labels
❌ ANY missing diagram type declarations
❌ ANY invalid node IDs with spaces or special characters

REQUIRED PERFECTION:
✅ Complete words in all labels
✅ Perfectly matched delimiters
✅ Clean, simple node IDs
✅ Proper diagram declarations
✅ Valid arrow syntax with spacing` :

`

🚨 FINAL ATTEMPT - ZERO TOLERANCE FOR ERRORS:
❌ Even ONE truncated word will cause failure
❌ Even ONE unclosed bracket will cause failure
❌ Even ONE syntax error will cause complete system failure

✅ MUST have perfect syntax - every character validated
✅ MUST have complete words - no abbreviations or truncations
✅ MUST have matched delimiters - count before submitting
✅ MUST have proper structure - declaration + nodes + connections

This diagram will be used in production. It MUST be perfect.`;

    return basePrompt + progressiveElements + strictnessGuidance + `

Your diagrams must be production-ready and error-free. A single syntax error makes the entire diagram fail.`;
  }

  /**
   * Parse mermaid response with enhanced validation
   */
  private parseMermaidResponseWithValidation(response: string, attempt: number): Omit<MermaidGenerationResult, 'metadata'> {
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

    console.log(`🔍 Validating Mermaid code (attempt ${attempt + 1})...`);
    console.log('📝 Raw code:', mermaidCode);

    // Minimal validation - only fix if there are actual critical issues
    const criticalIssues = this.detectCriticalIssues(mermaidCode);
    if (criticalIssues.length > 0) {
      console.log(`🚨 Critical issues detected: ${criticalIssues.join(', ')}`);
      
      // On final attempt, be extra strict
      if (attempt >= 2) {
        throw new Error(`Final attempt failed validation: ${criticalIssues.join(', ')}`);
      }
      
      console.log('🔧 Applying minimal fixes for critical issues only...');
      const validationResult = validateAndFixMermaidSyntax(mermaidCode);
      console.log('🔧 Fixed code:', validationResult.fixedCode);
      console.log('🔧 Issues fixed:', validationResult.issues);
      
      mermaidCode = validationResult.fixedCode;
    } else {
      console.log('✅ No critical issues detected, using original code');
    }

    return {
      mermaidCode,
      diagramType,
      title: title || undefined
    };
  }

  /**
   * Detect only critical issues that would prevent Mermaid from rendering
   */
  private detectCriticalIssues(code: string): string[] {
    const issues: string[] = [];
    
    // Only check for issues that definitely break Mermaid rendering
    
    // 1. Check for unmatched brackets (critical)
    const openSquare = (code.match(/\[/g) || []).length;
    const closeSquare = (code.match(/\]/g) || []).length;
    if (openSquare !== closeSquare) {
      issues.push('Unmatched square brackets');
    }
    
    const openCurly = (code.match(/\{/g) || []).length;
    const closeCurly = (code.match(/\}/g) || []).length;
    if (openCurly !== closeCurly) {
      issues.push('Unmatched curly braces');
    }
    
    const openParen = (code.match(/\(/g) || []).length;
    const closeParen = (code.match(/\)/g) || []).length;
    if (openParen !== closeParen) {
      issues.push('Unmatched parentheses');
    }
    
    // 2. Check for invalid arrow syntax (critical)
    if (/\s*-\s*-->\s*/.test(code)) {
      issues.push('Invalid arrow syntax');
    }
    
    // 3. Check for double brackets (critical)
    if (/\w+\[[^\]]+\]\]/.test(code)) {
      issues.push('Double closing brackets');
    }
    
    // 4. Check for missing diagram declaration (critical)
    const lines = code.split('\n');
    const firstLine = lines[0]?.trim() || '';
    const validStarts = ['flowchart', 'sequenceDiagram', 'stateDiagram', 'classDiagram', 'gantt', 'graph'];
    if (!validStarts.some(start => firstLine.startsWith(start))) {
      issues.push('Missing diagram declaration');
    }
    
    // 5. Check for completely empty or malformed content (critical)
    if (!code.trim() || code.trim().split('\n').length < 2) {
      issues.push('Empty or insufficient content');
    }
    
    return issues;
  }

  /**
   * Generate enhanced fallback diagram with better structure
   */
  private generateEnhancedFallback(content: string, options: MermaidGenerationOptions): string {
    const diagramType = options.diagramType || this.analyzeContentForDiagramType(content);
    const cleanContent = content.substring(0, 200).replace(/[^\w\s]/g, ' ').trim();
    const words = cleanContent.split(/\s+/).filter(w => w.length > 2).slice(0, 5);
    
    switch (diagramType) {
      case 'sequence':
        return `sequenceDiagram
    participant User as User
    participant System as System
    User->>System: ${words.slice(0, 3).join(' ')}
    System-->>User: Process Complete
    Note over User,System: Generated from: ${words.join(' ')}`;
      
      case 'state':
        return `stateDiagram-v2
    [*] --> Initial
    Initial --> Processing: ${words[0] || 'Start'}
    Processing --> Validation: ${words[1] || 'Check'}
    Validation --> Complete: ${words[2] || 'Success'}
    Complete --> [*]
    Validation --> Processing: ${words[3] || 'Retry'}`;
      
      default: // flowchart
        {
          const nodeA = words[0] || 'Start';
          const nodeB = words[1] || 'Process';
          const nodeC = words[2] || 'Decision';
          const nodeD = words[3] || 'Complete';
          
          return `flowchart TD
    A[${nodeA}] --> B[${nodeB}]
    B --> C{${nodeC}}
    C -->|Success| D[${nodeD}]
    C -->|Error| B
    D --> E[End]`;
        }
    }
  }

  /**
   * Analyze content to determine best diagram type
   */
  private analyzeContentForDiagramType(content: string): string {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('user') && lowerContent.includes('system') ||
        lowerContent.includes('request') && lowerContent.includes('response') ||
        lowerContent.includes('message') || lowerContent.includes('conversation')) {
      return 'sequence';
    }
    
    if (lowerContent.includes('state') || lowerContent.includes('status') ||
        lowerContent.includes('phase') || lowerContent.includes('stage')) {
      return 'state';
    }
    
    return 'flowchart';
  }

  /**
   * Calculate confidence score with attempt consideration
   */
  private calculateConfidence(mermaidCode: string, attempt: number = 0): number {
    let confidence = 0.5; // Base confidence

    // Higher confidence for successful generation on first attempt
    confidence += (3 - attempt) * 0.1;

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

    // Check for complete words (higher confidence)
    const hasCompleteWords = !/\[[A-Za-z]{1,3}\]|\{[A-Za-z]{1,3}\}/.test(mermaidCode);
    if (hasCompleteWords) {
      confidence += 0.2;
    }

    // Check for common syntax errors
    const errorPatterns = [
      /^\s*$/m, // Empty lines where they shouldn't be
      /'/g,     // Single quotes
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
