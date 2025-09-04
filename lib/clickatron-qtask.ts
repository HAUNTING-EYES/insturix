import { Client } from '@upstash/qstash';

/**
 * Enqueue job with QStash
 */
export async function enqueueQStashJob(jobData: any) {
  const qstashClient = new Client({
    token: process.env.QSTASH_TOKEN!,
    baseUrl: process.env.APP_ENV === 'development' ? 'http://127.0.0.1:8080' : undefined,
  });

  const workerUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/internal/workers/clickatron/variation`;

  const result = await qstashClient.publishJSON({
    url: workerUrl,
    body: jobData,
    retries: 3,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return result;
}