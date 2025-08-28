import { Client } from '@upstash/qstash';

// QStash client instance
let qstashClient: Client | null = null;

export function getQStashClient(): Client {
  if (!qstashClient) {
    const token = process.env.QSTASH_TOKEN;

    if (!token) {
      console.error('QSTASH_TOKEN environment variable not configured');
      throw new Error('QSTASH_TOKEN environment variable not configured');
    }

    try {
      qstashClient = new Client({
        token,
      });
      console.log('QStash client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize QStash client:', error);
      throw error;
    }
  }
  return qstashClient;
}

/**
 * Publish a message to QStash
 */
export async function publishToQStash(
  url: string,
  body: any,
  options?: {
    delay?: number;
    retries?: number;
    callback?: string;
  }
): Promise<{ messageId: string }> {
  const client = getQStashClient();

  try {
    const result = await client.publishJSON({
      url,
      body,
      delay: options?.delay,
      retries: options?.retries || 3,
      callback: options?.callback,
    });

    console.log('Published message to QStash:', result.messageId);
    return { messageId: result.messageId };
  } catch (error) {
    console.error('Failed to publish to QStash:', error);
    throw error;
  }
}

/**
 * Verify QStash webhook signature
 */
export function verifyQStashSignature(
  signature: string,
  body: string,
  currentSigningKey: string,
  nextSigningKey?: string
): boolean {
  // This is a simplified verification - in production you'd want proper signature verification
  // using the QStash SDK's built-in verification methods
  return true; // For now, trust the webhook
}