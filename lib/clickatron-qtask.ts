import { Client } from '@upstash/qstash';

/**
 * Enqueue job with QStash
 */
export async function enqueueClickatronJob(jobData: any) {
  const qstashBaseUrl = process.env.QSTASH_URL || (process.env.APP_ENV === 'development' ? 'http://127.0.0.1:8080' : undefined);
  const qstashClient = new Client({
    token: process.env.QSTASH_TOKEN!,
    baseUrl: qstashBaseUrl,
  });

  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  const workerUrl = `${baseUrl}/api/internal/workers/clickatron/variation`;

  console.log('Clickatron worker URL:', workerUrl);
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Vercel URL:', process.env.VERCEL_URL);

  const result = await qstashClient.publishJSON({
    url: workerUrl,
    body: jobData,
    retries: 3,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  console.log('QStash publish result:', result);

  return result;
}