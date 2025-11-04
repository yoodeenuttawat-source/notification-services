import { CircuitBreakerOpenError } from './CircuitBreakerOpenError';

describe('CircuitBreakerOpenError', () => {
  it('should be an instance of Error', () => {
    const error = new CircuitBreakerOpenError('Test message');
    expect(error).toBeInstanceOf(Error);
  });

  it('should have correct message', () => {
    const message = 'Circuit breaker is OPEN for TestProvider';
    const error = new CircuitBreakerOpenError(message);
    expect(error.message).toBe(message);
  });

  it('should have correct name', () => {
    const error = new CircuitBreakerOpenError('Test message');
    expect(error.name).toBe('CircuitBreakerOpenError');
  });

  it('should be throwable and catchable', () => {
    const error = new CircuitBreakerOpenError('Test message');
    expect(() => {
      throw error;
    }).toThrow(CircuitBreakerOpenError);
    expect(() => {
      throw error;
    }).toThrow('Test message');
  });
});
