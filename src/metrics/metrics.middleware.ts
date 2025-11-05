import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const method = req.method;
    const url = req.path || req.url?.split('?')[0] || 'unknown';
    const startTime = process.hrtime.bigint();
    let metricsRecorded = false;

    // Function to record metrics (only once per request)
    const recordMetrics = () => {
      if (metricsRecorded) return;
      metricsRecorded = true;

      const httpStatus = res.statusCode?.toString() || '500';
      const duration = Number(process.hrtime.bigint() - startTime) / 1e9; // Convert to seconds

      try {
        this.metricsService.notificationApiRequestMetrics.observe(
          {
            method,
            url,
            httpStatus,
          },
          duration
        );
      } catch (error) {
        // Silently fail metrics recording to avoid breaking the request
        console.error('Failed to record metrics:', error);
      }
    };

    // Record metrics when response finishes (this fires even if exceptions occur)
    res.once('finish', recordMetrics);

    // Also record on 'close' event as a fallback in case 'finish' doesn't fire
    res.once('close', () => {
      if (!metricsRecorded && !res.writableEnded) {
        recordMetrics();
      }
    });

    next();
  }
}

