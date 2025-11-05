import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { Response } from 'express';

describe('MetricsController', () => {
  let controller: MetricsController;
  let metricsService: MetricsService;
  let mockResponse: Partial<Response>;

  const mockMetricsService = {
    getMetrics: jest.fn().mockResolvedValue('prometheus_metrics_string'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
    metricsService = module.get<MetricsService>(MetricsService);

    mockResponse = {
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return metrics as text/plain', async () => {
    await controller.getMetrics(mockResponse as Response);

    expect(metricsService.getMetrics).toHaveBeenCalled();
    expect(mockResponse.set).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(mockResponse.send).toHaveBeenCalledWith('prometheus_metrics_string');
  });

  it('should handle metrics service errors', async () => {
    const error = new Error('Metrics error');
    mockMetricsService.getMetrics.mockRejectedValue(error);

    await expect(controller.getMetrics(mockResponse as Response)).rejects.toThrow(error);
  });

  it('should handle response.send errors gracefully', async () => {
    // Reset mocks to ensure clean state
    jest.clearAllMocks();
    mockMetricsService.getMetrics.mockResolvedValue('prometheus_metrics_string');
    
    const error = new Error('Send error');
    mockResponse.send = jest.fn().mockImplementation(() => {
      throw error;
    });

    await expect(controller.getMetrics(mockResponse as Response)).rejects.toThrow(error);
  });

  it('should handle response.set errors gracefully', async () => {
    // Reset mocks to ensure clean state
    jest.clearAllMocks();
    mockMetricsService.getMetrics.mockResolvedValue('prometheus_metrics_string');
    
    const error = new Error('Set error');
    mockResponse.set = jest.fn().mockImplementation(() => {
      throw error;
    });

    await expect(controller.getMetrics(mockResponse as Response)).rejects.toThrow(error);
  });
});

