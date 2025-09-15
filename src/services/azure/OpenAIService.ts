import OpenAI from 'openai';

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
        
        // If this is the last attempt or non-retryable error, throw
        if (attempt === maxRetries - 1 || !isRetryableError) {
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
1. Generate VALID Mermaid syntax only - test your syntax before responding
2. Use simple node IDs: A, B, C, User, System (no spaces, no special chars except numbers)
3. Use double quotes for labels with spaces: A["User Message"] or square brackets A[User Message]
4. Never use single quotes (') anywhere in the diagram
5. Start with proper diagram declaration: flowchart TD, sequenceDiagram, stateDiagram-v2, etc.
6. Use correct arrows: --> for flowcharts, ->> for sequence diagrams
7. Keep it simple and readable

EXAMPLE VALID SYNTAX:
flowchart TD
    A[Start] --> B{Is Valid}
    B -->|Yes| C[Success]
    B -->|No| D[Error]

Please provide your response in this EXACT format:
DIAGRAM_TYPE: [type]
TITLE: [title if applicable]
MERMAID_CODE:
\`\`\`mermaid
[your valid mermaid code here]
\`\`\`

Remember: The code must be syntactically correct and render without errors.
    `.trim();
  }

  /**
   * Get the system prompt for mermaid generation
   */
  private getSystemPrompt(): string {
    return `
You are an expert at creating Mermaid diagrams. Your task is to convert text content into clear, accurate, and visually appealing Mermaid diagrams.

CRITICAL: Follow Mermaid syntax rules EXACTLY. Common mistakes to avoid:
- Never use single quotes (') in node IDs or labels - use double quotes (") or no quotes
- Node IDs must be simple (A, B, C, or A1, B2, etc.) - no spaces, no special characters except numbers
- Labels go in square brackets [Label] or parentheses (Label) or quotes "Label"
- Arrows: --> for flowcharts, ->> for sequence diagrams
- Always start with proper diagram declaration

VALID Mermaid Examples:

FLOWCHART:
\`\`\`mermaid
flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
\`\`\`

SEQUENCE:
\`\`\`mermaid
sequenceDiagram
    participant A as User
    participant B as System
    A->>B: Request
    B-->>A: Response
\`\`\`

STATE:
\`\`\`mermaid
stateDiagram-v2
    [*] --> State1
    State1 --> State2
    State2 --> [*]
\`\`\`

Guidelines:
- Choose the most appropriate diagram type (flowchart, sequenceDiagram, stateDiagram-v2, classDiagram, etc.)
- Use simple node IDs (A, B, C, User, System, etc.)
- Put descriptive text in brackets [Text] or quotes "Text"
- Ensure logical flow and hierarchy
- Test your syntax mentally before responding
- Make diagrams that are easy to understand at a glance

FORBIDDEN SYNTAX:
- Do NOT use: arc, expecting keywords, complex node IDs with spaces
- Do NOT use single quotes in any context
- Do NOT create invalid connections

Always respond with valid Mermaid syntax that will render properly.
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

    // Clean up common syntax errors
    mermaidCode = this.cleanupMermaidSyntax(mermaidCode);

    return {
      mermaidCode,
      diagramType,
      title: title || undefined
    };
  }

  /**
   * Clean up common Mermaid syntax errors
   */
  private cleanupMermaidSyntax(code: string): string {
    let cleanCode = code;

    // Fix single quotes to double quotes in labels
    cleanCode = cleanCode.replace(/\[([^'\]]*)'([^'\]]*)\]/g, '[$1"$2"]');
    
    // Fix node IDs with spaces (replace with underscores)
    cleanCode = cleanCode.replace(/(\s+)([A-Za-z]+\s+[A-Za-z]+)(\s*-->|\s*\[|\s*\()/g, '$1$2$3'.replace(/\s+/g, '_'));
    
    // Remove any arc or invalid keywords that commonly cause parse errors
    cleanCode = cleanCode.replace(/\barc\s+/gi, '');
    
    // Fix common arrow syntax issues
    cleanCode = cleanCode.replace(/-->/g, ' --> ');
    cleanCode = cleanCode.replace(/-->>/g, ' -->> ');
    cleanCode = cleanCode.replace(/-\|/g, ' -->|');
    
    // Ensure proper spacing around decision nodes
    cleanCode = cleanCode.replace(/\{([^}]+)\}/g, '{ $1 }');
    
    // Remove any stray quotes that aren't properly paired
    const lines = cleanCode.split('\n');
    const fixedLines = lines.map(line => {
      // Count quotes and fix unpaired ones
      const singleQuotes = (line.match(/'/g) || []).length;
      
      // If odd number of single quotes, likely an error
      if (singleQuotes % 2 !== 0) {
        line = line.replace(/'/g, '"');
      }
      
      return line;
    });
    
    cleanCode = fixedLines.join('\n');
    
    // Ensure the code starts with a valid diagram declaration
    const firstLine = cleanCode.split('\n')[0].trim();
    const validStarts = ['flowchart', 'sequenceDiagram', 'stateDiagram', 'classDiagram', 'gantt', 'graph'];
    
    if (!validStarts.some(start => firstLine.startsWith(start))) {
      // Default to flowchart if no valid start is detected
      cleanCode = 'flowchart TD\n' + cleanCode;
    }

    return cleanCode;
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
