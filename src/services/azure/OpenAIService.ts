import OpenAI from 'openai';

export interface MermaidGenerationOptions {
  diagramType?: 'flowchart' | 'sequence' | 'gantt' | 'class' | 'state' | 'auto';
  direction?: 'TD' | 'LR' | 'RL' | 'BT';
  includeTitle?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface MermaidGenerationResult {
  mermaidCode: string; // Raw extracted mermaid code (first mermaid block or entire response)
  rawResponse: string; // Full model response for any future needs
  metadata: { tokensUsed: number; processingTime: number };
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

    async initialize(config: OpenAIConfig): Promise<void> {
      try {
        this.config = config;
        this.client = new OpenAI({
          apiKey: config.apiKey,
          baseURL: `${config.endpoint}/openai/deployments/${config.deploymentName}`,
          defaultQuery: { 'api-version': config.apiVersion },
          defaultHeaders: { 'api-key': config.apiKey },
          dangerouslyAllowBrowser: true,
        });
        this.isInitialized = true;
    } catch {
        throw new Error('OpenAI service initialization failed');
      }
    }

    async generateMermaidDiagram(content: string, options: MermaidGenerationOptions = {}): Promise<MermaidGenerationResult> {
      if (!this.isInitialized || !this.client) throw new Error('OpenAI service not initialized');
      const start = Date.now();
      try {
        const response = await this.client.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: this.systemPrompt() },
            { role: 'user', content: this.userPrompt(content, options) }
          ],
          max_tokens: options.maxTokens ?? 1000,
          temperature: options.temperature ?? 0.3,
          top_p: 0.9,
        });
        const msg = response.choices[0]?.message?.content;
        if (!msg) throw new Error('Empty response');
        const mermaidCode = this.extractFirstMermaidBlock(msg);
        return {
          mermaidCode,
          rawResponse: msg,
          metadata: {
            tokensUsed: response.usage?.total_tokens || 0,
            processingTime: Date.now() - start
          }
        };
      } catch (err) {
        console.error('OpenAI mermaid generation failed:', err);
        throw err instanceof Error ? err : new Error('OpenAI generation failed');
      }
    }

    // --- Prompt Builders (condensed) ---
    private userPrompt(content: string, options: MermaidGenerationOptions): string {
      const typeHint = options.diagramType && options.diagramType !== 'auto' ? `Use ${options.diagramType} if appropriate.` : 'Choose any suitable diagram type.';
      const dir = options.direction ? `Direction hint: ${options.direction}.` : '';
      return `${typeHint} ${dir}\nGenerate a mermaid diagram for the content below. Output ONLY a mermaid fenced code block.\nContent:\n"""\n${content}\n"""`;
    }
    private systemPrompt(): string {
      return 'You generate ONLY raw mermaid code blocks without commentary.';
    }

    private extractFirstMermaidBlock(resp: string): string {
      const fence = /```mermaid([\s\S]*?)```/i;
      const match = resp.match(fence);
      if (match) return match[1].trim();
      // Fallback: return entire response trimmed (consumer trusts model)
      return resp.trim();
    }

    // Removed fallback, confidence, retry logic per simplification request.

    getStatus() { return { isInitialized: this.isInitialized, hasClient: this.client !== null, endpoint: this.config?.endpoint }; }
    async cleanup() { this.client = null; this.config = null; this.isInitialized = false; }
  }

export const openAIService = new OpenAIService();
export default openAIService;
