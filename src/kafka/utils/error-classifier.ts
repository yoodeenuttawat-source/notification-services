/**
 * Error classification utility to determine if errors are retriable
 */
export class ErrorClassifier {
  /**
   * Check if error is retriable (should go to DLQ for replay)
   * Retriable errors are temporary issues that might succeed on retry
   */
  static isRetriable(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const errorMessage = error.message.toLowerCase();
    const errorName = error.constructor.name.toLowerCase();

    // Non-retriable errors (permanent failures - should NOT go to DLQ)
    const nonRetriablePatterns = [
      'syntaxerror',
      'json',
      'parse',
      'invalid json',
      'unexpected token',
      'invalid',
      'missing',
      'required',
      'unknown channel',
      'no providers available',
      'no providers found',
      'not found',
      'email subject is required',
      'malformed',
      'bad request',
      'validation',
    ];

    // Retriable errors (temporary issues - should go to DLQ)
    const retriablePatterns = [
      'connection',
      'timeout',
      'network',
      'econnrefused',
      'etimedout',
      'enotfound',
      'circuit breaker',
      'temporary',
      'unavailable',
      'database',
      'kafka',
      'econnreset',
      'socket',
      'timeout',
      'retry',
    ];

    // Check for non-retriable first (higher priority)
    if (nonRetriablePatterns.some(pattern => 
      errorMessage.includes(pattern) || errorName.includes(pattern)
    )) {
      return false;
    }

    // Check for retriable patterns
    if (retriablePatterns.some(pattern => 
      errorMessage.includes(pattern) || errorName.includes(pattern)
    )) {
      return true;
    }

    // Default: assume retriable for unknown errors (conservative approach)
    // This allows replay of unexpected errors
    return true;
  }

  /**
   * Check if error is a JSON parse error (non-retriable)
   */
  static isJSONParseError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    return error instanceof SyntaxError || 
           error.name === 'SyntaxError' ||
           error.message.toLowerCase().includes('json') ||
           error.message.toLowerCase().includes('parse') ||
           error.message.toLowerCase().includes('unexpected token');
  }

  /**
   * Check if error is a configuration/missing data error (non-retriable)
   */
  static isConfigurationError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const msg = error.message.toLowerCase();
    return msg.includes('no providers') ||
           msg.includes('missing') ||
           msg.includes('required') ||
           msg.includes('not found') ||
           msg.includes('unknown channel');
  }
}

