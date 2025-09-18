// Basic unit tests for multi-mode dispatcher (non framework simple assertions)
// This mimics a very lightweight test harness since no test runner configured yet.

import openAIService from '../services/azure/OpenAIService';

async function run() {
  const outputs: Record<string, unknown> = {};
  try {
    // Skip if service uninitialized
    const status = openAIService.getStatus?.();
    if (!status?.isInitialized) {
      console.log('OpenAIService not initialized; skipping live tests.');
      return;
    }
    const sample = 'Test content about a system processing user messages.';
    const diag = await openAIService.generateContent('diagram', { sourceText: sample });
    outputs.diagram = !!diag.mermaidCode;
    const sum = await openAIService.generateContent('summary', { sourceText: sample });
    outputs.summaryHasMarkdown = !!sum.markdown;
    const sum2 = await openAIService.generateContent('summary', { sourceText: sample });
    outputs.summaryCacheHit = sum2.fromCache === true;
    console.log('MODE TEST RESULTS', outputs);
  } catch (e) {
    console.error('Mode tests failed', e);
  }
}

run();