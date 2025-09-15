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
    if (!this.isInitialized || !this.client) {
      throw new Error('OpenAI service not initialized');
    }

    const startTime = Date.now();

    try {
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
      
      return {
        ...result,
        metadata: {
          tokensUsed,
          processingTime,
          confidence: this.calculateConfidence(result.mermaidCode)
        }
      };

    } catch (error) {
      console.error('Failed to generate mermaid diagram:', error);
      throw new Error(`Diagram generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build the prompt for mermaid generation
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

Requirements:
1. Generate valid Mermaid syntax
2. Make the diagram clear and logical
3. Include all important elements from the content
4. Use appropriate colors and styling where beneficial
5. Ensure the diagram flows logically

Please provide your response in the following format:
DIAGRAM_TYPE: [type]
TITLE: [title if applicable]
MERMAID_CODE:
\`\`\`mermaid
[your mermaid code here]
\`\`\`
    `.trim();
  }

  /**
   * Get the system prompt for mermaid generation
   */
  private getSystemPrompt(): string {
    return `
You are an expert at creating Mermaid diagrams. Your task is to convert text content into clear, accurate, and visually appealing Mermaid diagrams.

Guidelines:
- Choose the most appropriate diagram type (flowchart, sequence, class, state, gantt, etc.)
- Use clear, concise labels
- Ensure logical flow and hierarchy
- Apply appropriate styling and colors when they enhance clarity
- Follow Mermaid syntax precisely
- Make diagrams that are easy to understand at a glance

Diagram Types:
- Flowchart: For processes, decision trees, workflows
- Sequence: For interactions between entities over time
- Class: For object-oriented relationships
- State: For state machines and transitions
- Gantt: For project timelines and schedules
- Git Graph: For version control flows
- User Journey: For user experience flows

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

    return {
      mermaidCode,
      diagramType,
      title: title || undefined
    };
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
