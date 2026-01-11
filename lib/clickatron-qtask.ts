import { Client } from '@upstash/qstash';

/**
 * Enqueue job with QStash
 */
export async function enqueueClickatronJob(jobData: any) {
  // In development, call the worker directly instead of using QStash
  if (process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development') {
    // Try primary port (3000) first, then fallback to 3001 if needed
    const primaryPort = process.env.PORT || '3000';
    const portsToTry = [primaryPort];

    // If primary is 3000, add 3001 as fallback. If primary is 3001, add 3000.
    if (primaryPort === '3000') portsToTry.push('3001');
    else if (primaryPort === '3001') portsToTry.push('3000');
    else portsToTry.push('3000', '3001'); // Fallback for custom ports, just in case

    let lastError;

    for (const port of portsToTry) {
      try {
        const baseUrl = `http://localhost:${port}`;
        const workerUrl = `${baseUrl}/api/internal/workers/clickatron/variation`;

        console.log(`[Dev] Attempting to dispatch job to ${workerUrl}`);

        // Call worker directly in development
        const response = await fetch(workerUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(jobData),
        });

        if (response.ok) {
          console.log(`[Dev] Successfully dispatched job to ${workerUrl}`);
          return await response.json();
        }

        console.warn(`[Dev] Failed to call worker at ${port}: ${response.status} ${response.statusText}`);
        lastError = new Error(`Worker call failed at ${port}: ${response.status} ${response.statusText}`);

      } catch (error) {
        console.warn(`[Dev] Connection failed to ${port}:`, error);
        lastError = error;
      }
    }

    // If we get here, all ports failed
    throw lastError || new Error('Failed to connect to worker on any attempted port');
  }

  // Production: Use QStash
  const qstashBaseUrl = process.env.QSTASH_URL;
  const qstashClient = new Client({
    token: process.env.QSTASH_TOKEN!,
    baseUrl: qstashBaseUrl,
  });

  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  const workerUrl = `${baseUrl}/api/internal/workers/clickatron/variation`;

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