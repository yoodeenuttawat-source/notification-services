import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';
import * as client from 'prom-client';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have all metrics defined', () => {
    expect(service.notificationApiRequestMetrics).toBeDefined();
    expect(service.workerProcessingMetrics).toBeDefined();
    expect(service.dlqReplayTotal).toBeDefined();
    expect(service.providerApiMetrics).toBeDefined();
    expect(service.circuitBreakerState).toBeDefined();
    expect(service.kafkaPublishMetrics).toBeDefined();
    expect(service.kafkaConsumeMetrics).toBeDefined();
    expect(service.databaseQueryMetrics).toBeDefined();
  });

  it('should return registry', () => {
    const register = service.getRegister();
    expect(register).toBeDefined();
    expect(register).toBeInstanceOf(client.Registry);
  });

  it('should return metrics as string', async () => {
    const metrics = await service.getMetrics();
    expect(typeof metrics).toBe('string');
    expect(metrics.length).toBeGreaterThan(0);
  });

  it('should record notification API request metrics', () => {
    const observeSpy = jest.spyOn(service.notificationApiRequestMetrics, 'observe');
    service.notificationApiRequestMetrics.observe(
      { method: 'GET', url: '/test', httpStatus: '200' },
      0.1
    );
    expect(observeSpy).toHaveBeenCalledWith(
      { method: 'GET', url: '/test', httpStatus: '200' },
      0.1
    );
  });

  it('should record worker processing metrics', () => {
    const observeSpy = jest.spyOn(service.workerProcessingMetrics, 'observe');
    service.workerProcessingMetrics.observe(
      { worker: 'test-worker', topic: 'test-topic', status: 'success' },
      0.2
    );
    expect(observeSpy).toHaveBeenCalledWith(
      { worker: 'test-worker', topic: 'test-topic', status: 'success' },
      0.2
    );
  });

  it('should increment DLQ replay counter', () => {
    const incSpy = jest.spyOn(service.dlqReplayTotal, 'inc');
    service.dlqReplayTotal.inc({ topic: 'test-topic', status: 'success' });
    expect(incSpy).toHaveBeenCalledWith({ topic: 'test-topic', status: 'success' });
  });

  it('should record provider API metrics', () => {
    const observeSpy = jest.spyOn(service.providerApiMetrics, 'observe');
    service.providerApiMetrics.observe(
      { provider: 'TestProvider', channel: 'push', status: 'success' },
      0.3
    );
    expect(observeSpy).toHaveBeenCalledWith(
      { provider: 'TestProvider', channel: 'push', status: 'success' },
      0.3
    );
  });

  it('should set circuit breaker state', () => {
    const setSpy = jest.spyOn(service.circuitBreakerState, 'set');
    service.circuitBreakerState.set({ provider: 'TestProvider' }, 1);
    expect(setSpy).toHaveBeenCalledWith({ provider: 'TestProvider' }, 1);
  });

  it('should record Kafka publish metrics', () => {
    const observeSpy = jest.spyOn(service.kafkaPublishMetrics, 'observe');
    service.kafkaPublishMetrics.observe({ topic: 'test-topic', status: 'success' }, 0.05);
    expect(observeSpy).toHaveBeenCalledWith(
      { topic: 'test-topic', status: 'success' },
      0.05
    );
  });

  it('should record Kafka consume metrics', () => {
    const observeSpy = jest.spyOn(service.kafkaConsumeMetrics, 'observe');
    service.kafkaConsumeMetrics.observe(
      { topic: 'test-topic', consumer_group: 'test-group' },
      0.1
    );
    expect(observeSpy).toHaveBeenCalledWith(
      { topic: 'test-topic', consumer_group: 'test-group' },
      0.1
    );
  });

  it('should record database query metrics', () => {
    const observeSpy = jest.spyOn(service.databaseQueryMetrics, 'observe');
    service.databaseQueryMetrics.observe({ operation: 'select', status: 'success' }, 0.01);
    expect(observeSpy).toHaveBeenCalledWith(
      { operation: 'select', status: 'success' },
      0.01
    );
  });
});

