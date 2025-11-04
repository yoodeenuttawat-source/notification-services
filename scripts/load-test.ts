import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const ENDPOINT = `${API_URL}/notifications/send`;
const TOTAL_REQUESTS = 100000;
const DURATION_SECONDS = 5;
const REQUESTS_PER_SECOND = TOTAL_REQUESTS / DURATION_SECONDS;
const BATCH_SIZE = 1000; // Process requests in batches to avoid overwhelming the system

interface RequestResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  duration: number;
}

interface LoadTestStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalDuration: number;
  requestsPerSecond: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  statusCodeCounts: Record<number, number>;
  errors: string[];
}

function generatePayload(index: number): any {
  const eventTypes = ['CHAT_MESSAGE', 'PURCHASE', 'PAYMENT_REMINDER', 'SHIPPING_UPDATE'];
  const eventType = eventTypes[index % eventTypes.length];
  const notificationId = `load-test-${Date.now()}-${index}`;

  const basePayload: any = {
    notification_id: notificationId,
    event_type: eventType,
    data: {},
    metadata: {
      source: 'load_test',
      test_id: `test-${index}`,
      timestamp: new Date().toISOString(),
    },
  };

  // Add event-specific data
  switch (eventType) {
    case 'CHAT_MESSAGE':
      basePayload.data = {
        sender_name: `User ${index}`,
        message_preview: `Load test message ${index}`,
        user_id: `user${index}`,
        user_name: `User ${index}`,
        user_email: `user${index}@example.com`,
      };
      break;
    case 'PURCHASE':
      basePayload.data = {
        order_id: `ORD${index}`,
        user_id: `user${index}`,
        user_name: `User ${index}`,
        total_amount: 99.99 + (index % 100),
        user_email: `user${index}@example.com`,
      };
      break;
    case 'PAYMENT_REMINDER':
      basePayload.data = {
        order_id: `ORD${index}`,
        user_id: `user${index}`,
      };
      break;
    case 'SHIPPING_UPDATE':
      basePayload.data = {
        order_id: `ORD${index}`,
        status: 'shipped',
        user_id: `user${index}`,
      };
      break;
  }

  return basePayload;
}

async function sendRequest(index: number): Promise<RequestResult> {
  const startTime = Date.now();
  try {
    const payload = generatePayload(index);
    const response = await axios.post(ENDPOINT, payload, {
      timeout: 10000,
      validateStatus: () => true, // Don't throw on any status code
    });

    const duration = Date.now() - startTime;
    return {
      success: response.status >= 200 && response.status < 300,
      statusCode: response.status,
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      error: error.message || 'Unknown error',
      duration,
    };
  }
}

async function runLoadTest(): Promise<void> {
  console.log('='.repeat(80));
  console.log('LOAD TEST - 100,000 API Calls in 5 Seconds');
  console.log('='.repeat(80));
  console.log(`API URL: ${ENDPOINT}`);
  console.log(`Total Requests: ${TOTAL_REQUESTS.toLocaleString()}`);
  console.log(`Target Duration: ${DURATION_SECONDS} seconds`);
  console.log(`Target Rate: ${REQUESTS_PER_SECOND.toLocaleString()} requests/second`);
  console.log(`Batch Size: ${BATCH_SIZE}`);
  console.log('='.repeat(80));
  console.log('Starting load test...\n');

  const startTime = Date.now();
  const results: RequestResult[] = [];
  const errors: string[] = [];

  // Calculate delay between batches to maintain rate
  const batchDelay = (BATCH_SIZE / REQUESTS_PER_SECOND) * 1000;
  const totalBatches = Math.ceil(TOTAL_REQUESTS / BATCH_SIZE);

  let completedRequests = 0;
  let batchStartTime = Date.now();

  // Process requests in batches
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * BATCH_SIZE;
    const batchEnd = Math.min(batchStart + BATCH_SIZE, TOTAL_REQUESTS);
    const batchSize = batchEnd - batchStart;

    // Create batch of promises
    const batchPromises = Array.from({ length: batchSize }, (_, i) => sendRequest(batchStart + i));

    // Execute batch
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    completedRequests += batchSize;

    // Calculate progress
    const elapsed = (Date.now() - startTime) / 1000;
    const currentRate = completedRequests / elapsed;
    const progress = (completedRequests / TOTAL_REQUESTS) * 100;

    // Log progress every 10 batches
    if (batchIndex % 10 === 0 || batchIndex === totalBatches - 1) {
      console.log(
        `Progress: ${progress.toFixed(1)}% | ` +
          `Completed: ${completedRequests.toLocaleString()}/${TOTAL_REQUESTS.toLocaleString()} | ` +
          `Current Rate: ${currentRate.toFixed(0)} req/s | ` +
          `Elapsed: ${elapsed.toFixed(1)}s`
      );
    }

    // Delay between batches to maintain target rate
    if (batchIndex < totalBatches - 1) {
      const batchDuration = Date.now() - batchStartTime;
      const delayNeeded = Math.max(0, batchDelay - batchDuration);
      if (delayNeeded > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayNeeded));
      }
      batchStartTime = Date.now();
    }
  }

  const totalDuration = (Date.now() - startTime) / 1000;

  // Calculate statistics
  const successfulRequests = results.filter((r) => r.success).length;
  const failedRequests = results.filter((r) => !r.success).length;
  const responseTimes = results.map((r) => r.duration);
  const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  const minResponseTime = Math.min(...responseTimes);
  const maxResponseTime = Math.max(...responseTimes);

  const statusCodeCounts: Record<number, number> = {};
  results.forEach((r) => {
    if (r.statusCode) {
      statusCodeCounts[r.statusCode] = (statusCodeCounts[r.statusCode] || 0) + 1;
    }
    if (r.error && !errors.includes(r.error)) {
      errors.push(r.error);
    }
  });

  const stats: LoadTestStats = {
    totalRequests: TOTAL_REQUESTS,
    successfulRequests,
    failedRequests,
    totalDuration,
    requestsPerSecond: TOTAL_REQUESTS / totalDuration,
    averageResponseTime,
    minResponseTime,
    maxResponseTime,
    statusCodeCounts,
    errors: errors.slice(0, 10), // Limit to first 10 unique errors
  };

  // Print results
  console.log('\n' + '='.repeat(80));
  console.log('LOAD TEST RESULTS');
  console.log('='.repeat(80));
  console.log(`Total Requests:     ${stats.totalRequests.toLocaleString()}`);
  console.log(
    `Successful:         ${stats.successfulRequests.toLocaleString()} (${((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2)}%)`
  );
  console.log(
    `Failed:             ${stats.failedRequests.toLocaleString()} (${((stats.failedRequests / stats.totalRequests) * 100).toFixed(2)}%)`
  );
  console.log(`Total Duration:     ${stats.totalDuration.toFixed(2)} seconds`);
  console.log(`Requests/Second:    ${stats.requestsPerSecond.toFixed(2)}`);
  console.log(`\nResponse Times:`);
  console.log(`  Average:          ${stats.averageResponseTime.toFixed(2)} ms`);
  console.log(`  Min:              ${stats.minResponseTime.toFixed(2)} ms`);
  console.log(`  Max:              ${stats.maxResponseTime.toFixed(2)} ms`);

  if (Object.keys(stats.statusCodeCounts).length > 0) {
    console.log(`\nStatus Code Distribution:`);
    Object.entries(stats.statusCodeCounts)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .forEach(([code, count]) => {
        console.log(
          `  ${code}: ${count.toLocaleString()} (${((count / stats.totalRequests) * 100).toFixed(2)}%)`
        );
      });
  }

  if (stats.errors.length > 0) {
    console.log(`\nSample Errors (first 10):`);
    stats.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error}`);
    });
  }

  console.log('='.repeat(80));
}

// Run the load test
runLoadTest().catch((error) => {
  console.error('Load test failed:', error);
  process.exit(1);
});
