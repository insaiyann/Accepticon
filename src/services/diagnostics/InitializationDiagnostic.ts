/**
 * Initialization Diagnostic Tool
 * Tests each Azure service individually to identify the initialization bottleneck
 */

import { newSTTPipelineService } from '../NewSTTPipeline';
import { openAIService } from '../azure/OpenAIService';

export interface DiagnosticResult {
  service: string;
  status: 'success' | 'failed' | 'pending';
  message: string;
  error?: string;
  duration: number;
}

export class InitializationDiagnostic {
  private results: DiagnosticResult[] = [];

  /**
   * Run comprehensive initialization diagnostics
   */
  async runFullDiagnostic(): Promise<DiagnosticResult[]> {
    console.log('🔧 Starting initialization diagnostic...');
    this.results = [];

    // Test 1: Environment Variables
    await this.testEnvironmentVariables();

    // Test 2: Azure Speech Service
    await this.testSpeechService();

    // Test 3: Azure OpenAI Service
    await this.testOpenAIService();

    // Test 4: Combined Pipeline
    await this.testCombinedPipeline();

    console.log('🔧 Diagnostic complete. Results:', this.results);
    return this.results;
  }

  /**
   * Test environment variables
   */
  private async testEnvironmentVariables(): Promise<void> {
    const startTime = performance.now();
    
    try {
      const speechKey = import.meta.env.VITE_AZURE_SPEECH_KEY;
      const speechRegion = import.meta.env.VITE_AZURE_SPEECH_REGION;
      const openaiKey = import.meta.env.VITE_AZURE_OPENAI_KEY;
      const openaiEndpoint = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT;
      const openaiDeployment = import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT;

      const missing = [];
      if (!speechKey || speechKey.trim().length === 0) missing.push('VITE_AZURE_SPEECH_KEY');
      if (!speechRegion || speechRegion.trim().length === 0) missing.push('VITE_AZURE_SPEECH_REGION');
      if (!openaiKey || openaiKey.trim().length === 0) missing.push('VITE_AZURE_OPENAI_KEY');
      if (!openaiEndpoint || openaiEndpoint.trim().length === 0) missing.push('VITE_AZURE_OPENAI_ENDPOINT');
      if (!openaiDeployment || openaiDeployment.trim().length === 0) missing.push('VITE_AZURE_OPENAI_DEPLOYMENT');

      if (missing.length > 0) {
        this.addResult({
          service: 'Environment Variables',
          status: 'failed',
          message: `Missing variables: ${missing.join(', ')}`,
          duration: performance.now() - startTime
        });
      } else {
        this.addResult({
          service: 'Environment Variables',
          status: 'success',
          message: `All required variables present. Deployment: ${openaiDeployment}`,
          duration: performance.now() - startTime
        });
      }
    } catch (error) {
      this.addResult({
        service: 'Environment Variables',
        status: 'failed',
        message: 'Failed to read environment variables',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: performance.now() - startTime
      });
    }
  }

  /**
   * Test Azure Speech Service initialization
   */
  private async testSpeechService(): Promise<void> {
    const startTime = performance.now();
    
    try {
      console.log('🎤 Testing Speech Service initialization...');
      
      const success = await newSTTPipelineService.autoInitialize();
      
      if (success) {
        // Test configuration
        const configValid = await newSTTPipelineService.testConfiguration();
        
        this.addResult({
          service: 'Azure Speech Service',
          status: configValid ? 'success' : 'failed',
          message: configValid ? 'Successfully initialized and validated' : 'Initialized but configuration test failed',
          duration: performance.now() - startTime
        });
      } else {
        this.addResult({
          service: 'Azure Speech Service',
          status: 'failed',
          message: 'Auto-initialization failed',
          duration: performance.now() - startTime
        });
      }
    } catch (error) {
      this.addResult({
        service: 'Azure Speech Service',
        status: 'failed',
        message: 'Exception during initialization',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: performance.now() - startTime
      });
    }
  }

  /**
   * Test Azure OpenAI Service initialization
   */
  private async testOpenAIService(): Promise<void> {
    const startTime = performance.now();
    
    try {
      console.log('🤖 Testing OpenAI Service initialization...');
      
      const openaiKey = import.meta.env.VITE_AZURE_OPENAI_KEY;
      const openaiEndpoint = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT;
      const openaiDeployment = import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT;

      if (!openaiKey || !openaiEndpoint || !openaiDeployment) {
        this.addResult({
          service: 'Azure OpenAI Service',
          status: 'failed',
          message: 'Missing OpenAI configuration',
          duration: performance.now() - startTime
        });
        return;
      }

      await openAIService.initialize({
        apiKey: openaiKey,
        endpoint: openaiEndpoint,
        deploymentName: openaiDeployment,
        apiVersion: '2024-02-01'
      });

      // Test with a simple request
      try {
        const testResult = await openAIService.generateMermaidDiagram(
          'Test process with two steps',
          { maxTokens: 100, temperature: 0.1 }
        );

        this.addResult({
          service: 'Azure OpenAI Service',
          status: 'success',
          message: `Successfully initialized and tested. Generated ${testResult.mermaidCode.length} chars`,
          duration: performance.now() - startTime
        });
      } catch (testError) {
        this.addResult({
          service: 'Azure OpenAI Service',
          status: 'failed',
          message: 'Initialized but API test failed',
          error: testError instanceof Error ? testError.message : 'Unknown test error',
          duration: performance.now() - startTime
        });
      }
    } catch (error) {
      this.addResult({
        service: 'Azure OpenAI Service',
        status: 'failed',
        message: 'Exception during initialization',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: performance.now() - startTime
      });
    }
  }

  /**
   * Test combined pipeline initialization
   */
  private async testCombinedPipeline(): Promise<void> {
    const startTime = performance.now();
    
    try {
      console.log('🔄 Testing combined pipeline...');
      
      // Check if both services are ready
      const speechStatus = newSTTPipelineService.getStatus();
      const openaiStatus = openAIService.getStatus();

      if (!speechStatus.isInitialized) {
        this.addResult({
          service: 'Combined Pipeline',
          status: 'failed',
          message: 'Speech service not initialized',
          duration: performance.now() - startTime
        });
        return;
      }

      if (!openaiStatus.isInitialized) {
        this.addResult({
          service: 'Combined Pipeline',
          status: 'failed',
          message: 'OpenAI service not initialized',
          duration: performance.now() - startTime
        });
        return;
      }

      this.addResult({
        service: 'Combined Pipeline',
        status: 'success',
        message: 'Both services initialized successfully',
        duration: performance.now() - startTime
      });
    } catch (error) {
      this.addResult({
        service: 'Combined Pipeline',
        status: 'failed',
        message: 'Exception during pipeline test',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: performance.now() - startTime
      });
    }
  }

  /**
   * Add result to the list
   */
  private addResult(result: DiagnosticResult): void {
    this.results.push(result);
    
    const statusEmoji = result.status === 'success' ? '✅' : 
                       result.status === 'failed' ? '❌' : '⏳';
    
    console.log(`${statusEmoji} ${result.service}: ${result.message}${result.error ? ` (${result.error})` : ''} [${Math.round(result.duration)}ms]`);
  }

  /**
   * Get summary of diagnostic results
   */
  getSummary(): {
    total: number;
    successful: number;
    failed: number;
    pending: number;
    criticalFailures: string[];
  } {
    const total = this.results.length;
    const successful = this.results.filter(r => r.status === 'success').length;
    const failed = this.results.filter(r => r.status === 'failed').length;
    const pending = this.results.filter(r => r.status === 'pending').length;
    
    const criticalFailures = this.results
      .filter(r => r.status === 'failed')
      .map(r => `${r.service}: ${r.message}`);

    return {
      total,
      successful,
      failed,
      pending,
      criticalFailures
    };
  }
}

// Export singleton instance
export const initializationDiagnostic = new InitializationDiagnostic();

// Add to window for easy console access
declare global {
  interface Window {
    runInitDiagnostic?: () => Promise<DiagnosticResult[]>;
  }
}

if (typeof window !== 'undefined') {
  window.runInitDiagnostic = () => initializationDiagnostic.runFullDiagnostic();
}
