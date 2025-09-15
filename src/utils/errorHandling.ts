/**
 * Centralized error handling and user-friendly error message utilities
 */

export interface ErrorInfo {
  type: 'network' | 'parsing' | 'api' | 'timeout' | 'auth' | 'unknown';
  message: string;
  userMessage: string;
  actionable: boolean;
  retryable: boolean;
  suggestions: string[];
}

export interface RetryInfo {
  attempt: number;
  maxAttempts: number;
  nextRetryIn?: number;
  totalElapsed?: number;
}

/**
 * Categorize and enhance error information
 */
export function analyzeError(error: Error | string): ErrorInfo {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const lowerMessage = errorMessage.toLowerCase();

  // Network errors
  if (lowerMessage.includes('network') || 
      lowerMessage.includes('econnreset') ||
      lowerMessage.includes('enotfound') ||
      lowerMessage.includes('socket hang up') ||
      lowerMessage.includes('connection') ||
      lowerMessage.includes('timeout')) {
    return {
      type: 'network',
      message: errorMessage,
      userMessage: 'Network connection issue detected',
      actionable: true,
      retryable: true,
      suggestions: [
        'Check your internet connection',
        'Try again in a few moments',
        'Contact support if the issue persists'
      ]
    };
  }

  // Parsing errors (Mermaid syntax) - Enhanced detection
  if (lowerMessage.includes('parse error') ||
      lowerMessage.includes('syntax error') ||
      lowerMessage.includes('expecting') ||
      lowerMessage.includes('diagram syntax error') ||
      lowerMessage.includes('mermaid') ||
      lowerMessage.includes('unclosed') ||
      lowerMessage.includes('unmatched') ||
      lowerMessage.includes('truncated') ||
      /\[\w{1,4}\]|\{\w{1,4}[^}]*$/.test(errorMessage)) { // Detect truncated labels
    
    // Enhanced analysis for Mermaid-specific issues
    const isTruncationError = /\[[\w]{1,4}\]|\{[\w]{1,4}[^}]*$/.test(errorMessage);
    const isUnclosedError = lowerMessage.includes('unclosed') || lowerMessage.includes('unmatched');
    const isSyntaxError = lowerMessage.includes('expecting') || lowerMessage.includes('parse error');
    
    const specificSuggestions = [
      'The AI will retry with enhanced syntax validation',
      'Smart auto-fixing will attempt to correct common issues',
      'Fallback diagram will be generated if needed'
    ];
    
    if (isTruncationError) {
      specificSuggestions.unshift('Detected truncated node labels - will use complete words');
    }
    if (isUnclosedError) {
      specificSuggestions.unshift('Detected unclosed brackets/braces - will auto-complete');
    }
    if (isSyntaxError) {
      specificSuggestions.unshift('Detected syntax errors - will use stricter validation');
    }
    
    return {
      type: 'parsing',
      message: errorMessage,
      userMessage: isTruncationError ? 'Diagram generation issues with incomplete labels' :
                   isUnclosedError ? 'Diagram syntax has unclosed elements' :
                   'Diagram syntax issue detected',
      actionable: true,
      retryable: true,
      suggestions: specificSuggestions
    };
  }

  // API errors
  if (lowerMessage.includes('429') || lowerMessage.includes('rate limit')) {
    return {
      type: 'api',
      message: errorMessage,
      userMessage: 'Service is temporarily busy',
      actionable: true,
      retryable: true,
      suggestions: [
        'Automatic retry will happen shortly',
        'High demand on AI services',
        'Please wait a moment'
      ]
    };
  }

  if (lowerMessage.includes('503') || lowerMessage.includes('service unavailable')) {
    return {
      type: 'api',
      message: errorMessage,
      userMessage: 'AI service temporarily unavailable',
      actionable: true,
      retryable: true,
      suggestions: [
        'Service will retry automatically',
        'Usually resolves within seconds',
        'Try again if problem persists'
      ]
    };
  }

  // Authentication errors
  if (lowerMessage.includes('401') || 
      lowerMessage.includes('403') ||
      lowerMessage.includes('unauthorized') ||
      lowerMessage.includes('authentication')) {
    return {
      type: 'auth',
      message: errorMessage,
      userMessage: 'Authentication issue',
      actionable: true,
      retryable: false,
      suggestions: [
        'Check your API configuration',
        'Verify your API keys are valid',
        'Contact administrator if needed'
      ]
    };
  }

  // Timeout errors
  if (lowerMessage.includes('timeout') || lowerMessage.includes('504')) {
    return {
      type: 'timeout',
      message: errorMessage,
      userMessage: 'Request took too long to complete',
      actionable: true,
      retryable: true,
      suggestions: [
        'Automatic retry will use shorter timeout',
        'Try again if problem persists',
        'Large diagrams may take longer'
      ]
    };
  }

  // Default unknown error
  return {
    type: 'unknown',
    message: errorMessage,
    userMessage: 'An unexpected error occurred',
    actionable: true,
    retryable: true,
    suggestions: [
      'Automatic retry will attempt recovery',
      'Try again if problem persists',
      'Contact support if issue continues'
    ]
  };
}

/**
 * Generate user-friendly error message with retry information
 */
export function generateErrorMessage(
  error: Error | string,
  retryInfo?: RetryInfo
): {
  title: string;
  message: string;
  details: string;
  suggestions: string[];
  showRetry: boolean;
} {
  const errorInfo = analyzeError(error);
  
  let title = errorInfo.userMessage;
  let message = '';
  let details = '';
  
  if (retryInfo) {
    if (retryInfo.attempt > 0) {
      title = `${title} (Attempt ${retryInfo.attempt}/${retryInfo.maxAttempts})`;
    }
    
    if (retryInfo.nextRetryIn && retryInfo.attempt < retryInfo.maxAttempts) {
      const seconds = Math.ceil(retryInfo.nextRetryIn / 1000);
      message = `Retrying in ${seconds} second${seconds !== 1 ? 's' : ''}...`;
    } else if (retryInfo.attempt >= retryInfo.maxAttempts) {
      message = `Failed after ${retryInfo.maxAttempts} attempts`;
      title = `${errorInfo.userMessage} - Max Retries Reached`;
    }
  }
  
  // Add technical details for debugging
  details = errorInfo.message.length > 100 
    ? errorInfo.message.substring(0, 100) + '...'
    : errorInfo.message;

  return {
    title,
    message,
    details,
    suggestions: errorInfo.suggestions,
    showRetry: errorInfo.retryable && (!retryInfo || retryInfo.attempt < retryInfo.maxAttempts)
  };
}

/**
 * Get appropriate retry delay based on error type and attempt
 */
export function getRetryDelay(error: Error | string, attempt: number): number {
  const errorInfo = analyzeError(error);
  
  // Base delays by error type
  const baseDelays: Record<ErrorInfo['type'], number> = {
    network: 2000,    // 2s for network issues
    parsing: 1000,    // 1s for parsing issues (quick retry)
    api: 3000,        // 3s for API issues
    timeout: 5000,    // 5s for timeout issues
    auth: 0,          // No retry for auth issues
    unknown: 2000     // 2s for unknown issues
  };
  
  if (!errorInfo.retryable) {
    return 0;
  }
  
  const baseDelay = baseDelays[errorInfo.type];
  
  // Exponential backoff with jitter
  const exponentialDelay = baseDelay * Math.pow(1.5, attempt);
  const jitter = Math.random() * 1000; // Up to 1s jitter
  
  return Math.min(exponentialDelay + jitter, 15000); // Cap at 15s
}

/**
 * Check if an error is worth retrying
 */
export function shouldRetryError(error: Error | string, attempt: number, maxAttempts: number): boolean {
  if (attempt >= maxAttempts) {
    return false;
  }
  
  const errorInfo = analyzeError(error);
  return errorInfo.retryable;
}

/**
 * Format retry statistics for user display
 */
export function formatRetryStats(retryInfo: RetryInfo): string {
  const { attempt, maxAttempts, nextRetryIn, totalElapsed } = retryInfo;
  
  let stats = `Attempt ${attempt}/${maxAttempts}`;
  
  if (totalElapsed) {
    const seconds = Math.round(totalElapsed / 1000);
    stats += ` • ${seconds}s elapsed`;
  }
  
  if (nextRetryIn) {
    const nextSeconds = Math.ceil(nextRetryIn / 1000);
    stats += ` • Next retry in ${nextSeconds}s`;
  }
  
  return stats;
}
