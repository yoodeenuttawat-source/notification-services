import { ErrorClassifier } from './error-classifier';

describe('ErrorClassifier', () => {
  describe('isRetriable', () => {
    it('should return false for non-Error objects', () => {
      expect(ErrorClassifier.isRetriable(null)).toBe(false);
      expect(ErrorClassifier.isRetriable(undefined)).toBe(false);
      expect(ErrorClassifier.isRetriable('string')).toBe(false);
      expect(ErrorClassifier.isRetriable(123)).toBe(false);
      expect(ErrorClassifier.isRetriable({})).toBe(false);
    });

    describe('non-retriable errors', () => {
      it('should return false for JSON parse errors', () => {
        expect(ErrorClassifier.isRetriable(new SyntaxError('Unexpected token'))).toBe(false);
        expect(ErrorClassifier.isRetriable(new Error('Invalid JSON'))).toBe(false);
        expect(ErrorClassifier.isRetriable(new Error('JSON parse error'))).toBe(false);
      });

      it('should return false for validation errors', () => {
        expect(ErrorClassifier.isRetriable(new Error('Missing required field'))).toBe(false);
        expect(ErrorClassifier.isRetriable(new Error('Required field is missing'))).toBe(false);
        expect(ErrorClassifier.isRetriable(new Error('Invalid data'))).toBe(false);
        expect(ErrorClassifier.isRetriable(new Error('Bad request'))).toBe(false);
        expect(ErrorClassifier.isRetriable(new Error('Validation failed'))).toBe(false);
      });

      it('should return false for configuration errors', () => {
        expect(ErrorClassifier.isRetriable(new Error('No providers available'))).toBe(false);
        expect(ErrorClassifier.isRetriable(new Error('No providers found'))).toBe(false);
        expect(ErrorClassifier.isRetriable(new Error('Unknown channel'))).toBe(false);
        expect(ErrorClassifier.isRetriable(new Error('Not found'))).toBe(false);
      });

      it('should return false for email-specific errors', () => {
        expect(ErrorClassifier.isRetriable(new Error('Email subject is required'))).toBe(false);
      });
    });

    describe('retriable errors', () => {
      it('should return true for connection errors', () => {
        expect(ErrorClassifier.isRetriable(new Error('Connection refused'))).toBe(true);
        expect(ErrorClassifier.isRetriable(new Error('ECONNREFUSED'))).toBe(true);
        expect(ErrorClassifier.isRetriable(new Error('Network error'))).toBe(true);
      });

      it('should return true for timeout errors', () => {
        expect(ErrorClassifier.isRetriable(new Error('Timeout'))).toBe(true);
        expect(ErrorClassifier.isRetriable(new Error('ETIMEDOUT'))).toBe(true);
        expect(ErrorClassifier.isRetriable(new Error('Request timeout'))).toBe(true);
      });

      it('should return true for database errors', () => {
        expect(ErrorClassifier.isRetriable(new Error('Database connection failed'))).toBe(true);
        expect(ErrorClassifier.isRetriable(new Error('Database error'))).toBe(true);
      });

      it('should return true for Kafka errors', () => {
        expect(ErrorClassifier.isRetriable(new Error('Kafka connection failed'))).toBe(true);
        expect(ErrorClassifier.isRetriable(new Error('Kafka error'))).toBe(true);
      });

      it('should return true for circuit breaker errors', () => {
        expect(ErrorClassifier.isRetriable(new Error('Circuit breaker is OPEN'))).toBe(true);
      });

      it('should return true for temporary errors', () => {
        expect(ErrorClassifier.isRetriable(new Error('Service temporarily unavailable'))).toBe(true);
        expect(ErrorClassifier.isRetriable(new Error('Temporary failure'))).toBe(true);
      });

      it('should return true for socket errors', () => {
        expect(ErrorClassifier.isRetriable(new Error('Socket error'))).toBe(true);
        expect(ErrorClassifier.isRetriable(new Error('ECONNRESET'))).toBe(true);
      });
    });

    it('should return true for unknown errors (default)', () => {
      expect(ErrorClassifier.isRetriable(new Error('Unknown error message'))).toBe(true);
      expect(ErrorClassifier.isRetriable(new Error('Some random error'))).toBe(true);
    });

    it('should check error name in addition to message', () => {
      class CustomRetriableError extends Error {
        constructor() {
          super('Custom error');
          this.name = 'ConnectionError';
        }
      }
      expect(ErrorClassifier.isRetriable(new CustomRetriableError())).toBe(true);
    });
  });

  describe('isJSONParseError', () => {
    it('should return true for SyntaxError', () => {
      expect(ErrorClassifier.isJSONParseError(new SyntaxError())).toBe(true);
    });

    it('should return true for errors with JSON in message', () => {
      expect(ErrorClassifier.isJSONParseError(new Error('Invalid JSON'))).toBe(true);
      expect(ErrorClassifier.isJSONParseError(new Error('JSON parse error'))).toBe(true);
    });

    it('should return true for errors with parse in message', () => {
      expect(ErrorClassifier.isJSONParseError(new Error('Parse error'))).toBe(true);
    });

    it('should return true for errors with unexpected token', () => {
      expect(ErrorClassifier.isJSONParseError(new Error('Unexpected token'))).toBe(true);
    });

    it('should return false for non-JSON errors', () => {
      expect(ErrorClassifier.isJSONParseError(new Error('Connection failed'))).toBe(false);
      expect(ErrorClassifier.isJSONParseError(new Error('Timeout'))).toBe(false);
    });

    it('should return false for non-Error objects', () => {
      expect(ErrorClassifier.isJSONParseError(null)).toBe(false);
      expect(ErrorClassifier.isJSONParseError('string')).toBe(false);
    });
  });

  describe('isConfigurationError', () => {
    it('should return true for no providers errors', () => {
      expect(ErrorClassifier.isConfigurationError(new Error('No providers available'))).toBe(true);
      expect(ErrorClassifier.isConfigurationError(new Error('No providers found'))).toBe(true);
    });

    it('should return true for missing field errors', () => {
      expect(ErrorClassifier.isConfigurationError(new Error('Missing required field'))).toBe(true);
      expect(ErrorClassifier.isConfigurationError(new Error('Field is missing'))).toBe(true);
    });

    it('should return true for not found errors', () => {
      expect(ErrorClassifier.isConfigurationError(new Error('Not found'))).toBe(true);
      expect(ErrorClassifier.isConfigurationError(new Error('Resource not found'))).toBe(true);
    });

    it('should return true for unknown channel errors', () => {
      expect(ErrorClassifier.isConfigurationError(new Error('Unknown channel'))).toBe(true);
    });

    it('should return false for non-configuration errors', () => {
      expect(ErrorClassifier.isConfigurationError(new Error('Connection failed'))).toBe(false);
      expect(ErrorClassifier.isConfigurationError(new Error('Timeout'))).toBe(false);
    });

    it('should return false for non-Error objects', () => {
      expect(ErrorClassifier.isConfigurationError(null)).toBe(false);
      expect(ErrorClassifier.isConfigurationError('string')).toBe(false);
    });
  });
});

