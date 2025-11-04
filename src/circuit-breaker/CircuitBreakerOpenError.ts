export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    Object.setPrototypeOf(this, CircuitBreakerOpenError.prototype);
  }
}
