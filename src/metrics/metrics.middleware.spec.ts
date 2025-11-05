import { Test, TestingModule } from '@nestjs/testing';
import { MetricsMiddleware } from './metrics.middleware';
import { MetricsService } from './metrics.service';
import { Request, Response, NextFunction } from 'express';

describe('MetricsMiddleware', () => {
  let middleware: MetricsMiddleware;
  let metricsService: MetricsService;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(async () => {
    const mockMetricsService = {
      notificationApiRequestMetrics: {
        observe: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsMiddleware,
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    middleware = module.get<MetricsMiddleware>(MetricsMiddleware);
    metricsService = module.get<MetricsService>(MetricsService);

    mockRequest = {
      method: 'GET',
      path: '/test',
      url: '/test?query=value',
    };

    mockResponse = {
      statusCode: 200,
      once: jest.fn((event: string, callback: () => void) => {
        // Simulate event firing
        if (event === 'finish') {
          setTimeout(callback, 10);
        } else if (event === 'close') {
          // Don't fire close by default
        }
        return mockResponse as Response;
      }),
      writableEnded: false,
    };

    nextFunction = jest.fn();
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  it('should record metrics on response finish', (done) => {
    const observeSpy = jest.spyOn(metricsService.notificationApiRequestMetrics, 'observe');

    mockResponse.once = jest.fn((event: string, callback: () => void) => {
      if (event === 'finish') {
        callback();
      }
      return mockResponse as Response;
    });

    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    setTimeout(() => {
      expect(observeSpy).toHaveBeenCalled();
      const callArgs = observeSpy.mock.calls[0];
      expect(callArgs[0]).toEqual({
        method: 'GET',
        url: '/test',
        httpStatus: '200',
      });
      // Duration is the second argument (check using spread to access all arguments)
      const allArgs = observeSpy.mock.calls[0] as any[];
      expect(allArgs.length).toBeGreaterThanOrEqual(2);
      expect(typeof allArgs[1]).toBe('number');
      expect(nextFunction).toHaveBeenCalled();
      done();
    }, 50);
  });

  it('should handle metrics recording when metricsRecorded is already true', (done) => {
    const observeSpy = jest.spyOn(metricsService.notificationApiRequestMetrics, 'observe');
    let finishCallback: (() => void) | undefined;
    let closeCallback: (() => void) | undefined;

    mockResponse.once = jest.fn((event: string, callback: () => void) => {
      if (event === 'finish') {
        finishCallback = callback;
      } else if (event === 'close') {
        closeCallback = callback;
      }
      return mockResponse as Response;
    });

    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    // Fire finish first
    if (finishCallback) {
      finishCallback();
    }

    // Then fire close (should not record again)
    setTimeout(() => {
      if (closeCallback) {
        closeCallback();
      }
      setTimeout(() => {
        expect(observeSpy).toHaveBeenCalledTimes(1);
        done();
      }, 10);
    }, 10);
  });

  it('should use path if available', (done) => {
    const observeSpy = jest.spyOn(metricsService.notificationApiRequestMetrics, 'observe');

    mockRequest.path = '/api/test';
    mockRequest.url = undefined;

    mockResponse.once = jest.fn((event: string, callback: () => void) => {
      if (event === 'finish') {
        callback();
      }
      return mockResponse as Response;
    });

    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    setTimeout(() => {
      expect(observeSpy).toHaveBeenCalled();
      const callArgs = observeSpy.mock.calls[0];
      expect((callArgs[0] as any).url).toBe('/api/test');
      done();
    }, 50);
  });

  it('should use url without query string if path not available', (done) => {
    const observeSpy = jest.spyOn(metricsService.notificationApiRequestMetrics, 'observe');

    mockRequest.path = undefined;
    mockRequest.url = '/test?query=value&other=param';

    mockResponse.once = jest.fn((event: string, callback: () => void) => {
      if (event === 'finish') {
        callback();
      }
      return mockResponse as Response;
    });

    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    setTimeout(() => {
      expect(observeSpy).toHaveBeenCalled();
      const callArgs = observeSpy.mock.calls[0];
      expect((callArgs[0] as any).url).toBe('/test');
      done();
    }, 50);
  });

  it('should use unknown if url is not available', (done) => {
    const observeSpy = jest.spyOn(metricsService.notificationApiRequestMetrics, 'observe');

    mockRequest.path = undefined;
    mockRequest.url = undefined;

    mockResponse.once = jest.fn((event: string, callback: () => void) => {
      if (event === 'finish') {
        callback();
      }
      return mockResponse as Response;
    });

    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    setTimeout(() => {
      expect(observeSpy).toHaveBeenCalled();
      const callArgs = observeSpy.mock.calls[0];
      expect((callArgs[0] as any).url).toBe('unknown');
      done();
    }, 50);
  });

  it('should use status code 500 if not available', (done) => {
    const observeSpy = jest.spyOn(metricsService.notificationApiRequestMetrics, 'observe');

    mockResponse.statusCode = undefined;

    mockResponse.once = jest.fn((event: string, callback: () => void) => {
      if (event === 'finish') {
        callback();
      }
      return mockResponse as Response;
    });

    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    setTimeout(() => {
      expect(observeSpy).toHaveBeenCalled();
      const callArgs = observeSpy.mock.calls[0];
      expect((callArgs[0] as any).httpStatus).toBe('500');
      done();
    }, 50);
  });

  it('should record metrics on close if finish did not fire', (done) => {
    const observeSpy = jest.spyOn(metricsService.notificationApiRequestMetrics, 'observe');

    let finishCallback: (() => void) | undefined;
    let closeCallback: (() => void) | undefined;

    mockResponse.once = jest.fn((event: string, callback: () => void) => {
      if (event === 'finish') {
        finishCallback = callback;
        // Don't fire finish
      } else if (event === 'close') {
        closeCallback = callback;
      }
      return mockResponse as Response;
    });

    mockResponse.writableEnded = false;

    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    // Fire close event
    if (closeCallback) {
      closeCallback();
    }

    setTimeout(() => {
      expect(observeSpy).toHaveBeenCalled();
      done();
    }, 50);
  });

  it('should not record metrics twice', (done) => {
    const observeSpy = jest.spyOn(metricsService.notificationApiRequestMetrics, 'observe');

    let finishCallback: (() => void) | undefined;
    let closeCallback: (() => void) | undefined;

    mockResponse.once = jest.fn((event: string, callback: () => void) => {
      if (event === 'finish') {
        finishCallback = callback;
      } else if (event === 'close') {
        closeCallback = callback;
      }
      return mockResponse as Response;
    });

    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    // Fire finish first
    if (finishCallback) {
      finishCallback();
    }

    // Then fire close (should not record again)
    setTimeout(() => {
      if (closeCallback) {
        closeCallback();
      }
    }, 10);

    setTimeout(() => {
      expect(observeSpy).toHaveBeenCalledTimes(1);
      done();
    }, 50);
  });

  it('should handle errors in metrics recording gracefully', (done) => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const observeSpy = jest.spyOn(metricsService.notificationApiRequestMetrics, 'observe');
    observeSpy.mockImplementation(() => {
      throw new Error('Metrics error');
    });

    mockResponse.once = jest.fn((event: string, callback: () => void) => {
      if (event === 'finish') {
        callback();
      }
      return mockResponse as Response;
    });

    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    setTimeout(() => {
      expect(observeSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(nextFunction).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
      done();
    }, 50);
  });

  it('should not record metrics on close when writableEnded is true', (done) => {
    const observeSpy = jest.spyOn(metricsService.notificationApiRequestMetrics, 'observe');
    let closeCallback: (() => void) | undefined;

    mockResponse.writableEnded = true;
    mockResponse.once = jest.fn((event: string, callback: () => void) => {
      if (event === 'finish') {
        // Don't fire finish
      } else if (event === 'close') {
        closeCallback = callback;
      }
      return mockResponse as Response;
    });

    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    // Fire close event when writableEnded is true (should not record)
    setTimeout(() => {
      if (closeCallback) {
        closeCallback();
      }
      setTimeout(() => {
        // Should not record because writableEnded is true
        expect(observeSpy).not.toHaveBeenCalled();
        done();
      }, 10);
    }, 10);
  });

  it('should not record metrics when metricsRecorded flag is already true', (done) => {
    const observeSpy = jest.spyOn(metricsService.notificationApiRequestMetrics, 'observe');
    let finishCallback: (() => void) | undefined;
    let closeCallback: (() => void) | undefined;

    mockResponse.once = jest.fn((event: string, callback: () => void) => {
      if (event === 'finish') {
        finishCallback = callback;
      } else if (event === 'close') {
        closeCallback = callback;
      }
      return mockResponse as Response;
    });

    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    // Fire finish first
    if (finishCallback) {
      finishCallback();
    }

    // Then fire close (should not record again due to metricsRecorded flag)
    setTimeout(() => {
      if (closeCallback) {
        closeCallback();
      }
      setTimeout(() => {
        expect(observeSpy).toHaveBeenCalledTimes(1);
        done();
      }, 10);
    }, 10);
  });
});

