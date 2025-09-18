import OpenAI from 'openai';
import { indexedDBService } from '../storage/IndexedDBService';
// Multi‑mode extension with two‑tier caching (memory + IndexedDB persistent).
// This file now implements:
//  - SHA-256 stable input hashing (with fallback)
//  - L1 memory cache (bounded FIFO)
//  - L2 persistent cache (IndexedDB modeCache store)
//  - clearCache API (per-mode or global)
//  - Opportunistic retention cleanup

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

// Supported viewer modes
export type AIViewerMode = 'diagram' | 'summary' | 'plan' | 'technicals';

export interface ModeInput { sourceText: string; }

export interface BaseModeResult {
  mermaidCode?: string; // diagram mode
  markdown?: string;    // non-diagram modes
  raw: string;          // full raw model response
  tokensUsed: number;
  processingTime: number;
  fromCache: boolean;
  cacheLevel: 'memory' | 'persistent' | null;
  inputHash: string;
  mode: AIViewerMode;
}

interface GenerateContentOptions { force?: boolean; maxTokens?: number; temperature?: number; }

// Simple in-memory cache entry (L1)
interface MemoryCacheEntry extends BaseModeResult { cachedAt: number; }

class OpenAIService {
    private client: OpenAI | null = null;
    private config: OpenAIConfig | null = null;
    private isInitialized = false;
    // L1 cache (bounded FIFO later) keyed by inputHash
    private memoryCache = new Map<string, MemoryCacheEntry>();
  private readonly MAX_MEMORY_CACHE_ENTRIES = 40;
  private retentionScheduled = false;

    // Prompt versioning for invalidation
    private promptVersions: Record<AIViewerMode, string> = {
      diagram: 'v1',
      summary: 'v1',
      plan: 'v1',
      technicals: 'v1'
    };

    // Mode specific system prompts
    private modeSystemPrompts: Record<AIViewerMode, string> = {
      diagram: 'You generate ONLY raw mermaid code blocks without commentary.',
      summary: 'You are a senior technical analyst. Provide a clear, concise summary in markdown.',
      plan: 'You are a software solution planner. Produce an implementation plan in markdown.',
      technicals: 'You are a senior architect. Provide technical architecture & considerations in markdown.'
    };

    // Hash helper using SHA-256 (browser crypto). Fallback to simple hash if unavailable.
    private async computeInputHash(mode: AIViewerMode, sourceText: string, promptVersion: string): Promise<string> {
      const payload = JSON.stringify({ m: mode, v: promptVersion, t: sourceText });
      try {
        if (window.crypto?.subtle) {
          const enc = new TextEncoder().encode(payload);
          const digest = await window.crypto.subtle.digest('SHA-256', enc);
          const hashArray = Array.from(new Uint8Array(digest)).slice(0, 16); // shorten
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          return `${mode}_${promptVersion}_${hashHex}`;
        }
      } catch {
        // ignore and fallback
      }
      let h = 0; for (let i = 0; i < payload.length; i++) { h = Math.imul(31, h) + payload.charCodeAt(i) | 0; }
      return `${mode}_${promptVersion}_fallback_${Math.abs(h)}`;
    }

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

    /**
     * Generic multi-mode content generation with basic in-memory caching.
     * (Phase 1 scaffold) - persistent cache & richer extraction added later.
     */
    async generateContent(mode: AIViewerMode, input: ModeInput, opts: GenerateContentOptions = {}): Promise<BaseModeResult> {
      if (!this.isInitialized || !this.client) throw new Error('OpenAI service not initialized');
      const promptVersion = this.promptVersions[mode];
      const hash = await this.computeInputHash(mode, input.sourceText, promptVersion);

      // 1. Memory cache lookup
      if (!opts.force) {
        const l1 = this.memoryCache.get(hash);
        if (l1) return { ...l1, fromCache: true, cacheLevel: 'memory' };
      }

      // 2. Persistent cache lookup
      if (!opts.force) {
        try {
          const l2 = await indexedDBService.getModeCache(hash);
          if (l2 && l2.mode === mode) {
            const result: BaseModeResult = {
              mermaidCode: l2.mermaidCode,
              markdown: l2.markdown,
              raw: l2.raw,
              tokensUsed: l2.tokensUsed,
              processingTime: 0,
              fromCache: true,
              cacheLevel: 'persistent',
              inputHash: hash,
              mode
            };
            this.setMemoryCache(hash, result); // promote to L1
            return result;
          }
        } catch (e) {
          console.warn('Persistent cache lookup failed (continuing):', e);
        }
      }
      const system = this.modeSystemPrompts[mode];
      const user = this.buildUserPrompt(mode, input.sourceText);
      const start = performance.now();
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [ { role: 'system', content: system }, { role: 'user', content: user } ],
        max_tokens: opts.maxTokens ?? 1000,
        temperature: opts.temperature ?? 0.3,
        top_p: 0.9,
      });
      const raw = response.choices[0]?.message?.content || '';
      const tokensUsed = response.usage?.total_tokens || 0;
      const processingTime = performance.now() - start;
      const extracted = this.postProcessMode(mode, raw);
      const result: BaseModeResult = {
        ...extracted,
        raw,
        tokensUsed,
        processingTime,
        fromCache: false,
        cacheLevel: null,
        inputHash: hash,
        mode
      };
      this.setMemoryCache(hash, result);

      // 3. Persist asynchronously (fire & forget)
      void indexedDBService.putModeCache({
        mode,
        inputHash: hash,
        model: 'gpt-4o',
        promptVersion,
        mermaidCode: result.mermaidCode,
        markdown: result.markdown,
        raw: result.raw,
        tokensUsed: result.tokensUsed,
        sourceSize: input.sourceText.length
      });

      // 4. Opportunistic retention cleanup (lightweight probabilistic trigger)
      if (!this.retentionScheduled && Math.random() < 0.02) {
        this.retentionScheduled = true;
        setTimeout(() => {
          void indexedDBService.cleanupOldModeCache().catch(()=>{});
          this.retentionScheduled = false;
        }, 5000);
      }
      return result;
    }

    private setMemoryCache(hash: string, result: BaseModeResult) {
      this.memoryCache.set(hash, { ...result, cachedAt: Date.now() });
      if (this.memoryCache.size > this.MAX_MEMORY_CACHE_ENTRIES) {
        // FIFO eviction: delete oldest insertion
        const firstKey = this.memoryCache.keys().next().value;
        if (firstKey) this.memoryCache.delete(firstKey);
      }
    }

    async clearCache(mode?: AIViewerMode): Promise<void> {
      // Clear memory cache
      if (mode) {
        for (const [k, v] of this.memoryCache.entries()) {
          if (v.mode === mode) this.memoryCache.delete(k);
        }
      } else {
        this.memoryCache.clear();
      }
      // Clear persistent
      try { await indexedDBService.clearModeCache(mode); } catch (e) { console.warn('clearModeCache failed', e); }
    }

    private buildUserPrompt(mode: AIViewerMode, source: string): string {
      if (mode === 'diagram') {
        return `Generate a mermaid diagram. Output ONLY a mermaid fenced code block.\nContent:\n"""\n${source}\n"""`;
      }
      const instruction = {
        summary: 'Return a concise analytical summary with sections: Overview, Key Entities, Flows, Risks.',
        plan: 'Return an implementation plan starting with "# Implementation Plan" and sections: Goal, High-Level Steps, Detailed Steps, Considerations.',
        technicals: 'Return technical architecture details with sections: Architecture, Data Model, Processing Pipeline, Potential Optimizations, Open Questions (omit if none).'
      }[mode];
      return `${instruction}\nReturn ONLY a single fenced markdown code block (\`\`\`markdown). No text outside the fence.\nSource:\n"""\n${source}\n"""`;
    }

    private postProcessMode(mode: AIViewerMode, raw: string): { mermaidCode?: string; markdown?: string } {
      if (mode === 'diagram') {
        return { mermaidCode: this.extractFirstMermaidBlock(raw) };
      }
      const md = this.extractFirstMarkdownFence(raw) || raw.trim();
      return { markdown: md };
    }

    private extractFirstMarkdownFence(resp: string): string | null {
      const fence = /```markdown([\s\S]*?)```/i;
      const match = resp.match(fence);
      if (match) return match[1].trim();
      // Fallback: any fenced block
      const any = /```[a-zA-Z0-9]*\n([\s\S]*?)```/i.exec(resp);
      return any ? any[1].trim() : null;
    }

    // --- Prompt Builders (condensed) ---
    private userPrompt(content: string, options: MermaidGenerationOptions): string {
      const typeHint = options.diagramType && options.diagramType !== 'auto' ? `Use ${options.diagramType} if appropriate.` : 'Choose any suitable diagram type.';
      const dir = options.direction ? `Direction hint: ${options.direction}.` : '';
      return `${typeHint} ${dir}\nGenerate a mermaid diagram for the content below. Output ONLY a mermaid fenced code block.\nContent:\n"""\n${content}\n"""`;
    }
    private systemPrompt(): string {
      return this.modeSystemPrompts.diagram; // legacy call path
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
