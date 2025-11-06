import { env } from 'node:process';
import {
  SESClient,
  SendEmailCommand,
  type SendEmailCommandInput,
  SESServiceException,
} from '@aws-sdk/client-ses';

import { loadMailerConfig, type MailerConfig } from '../config';
import { RateLimiter } from './rate-limiter';
import type { MailMessage, MailProvider, Recipient, SendResult, BatchOptions, BatchResult } from '../types';

function resolveCredentials() {
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    };
  }
  return undefined;
}

function formatRecipient(recipient: Recipient): string {
  if (typeof recipient === 'string') {
    return recipient;
  }

  if (recipient.name) {
    return `${recipient.name} <${recipient.email}>`;
  }

  return recipient.email;
}

function toAddressList(value?: Recipient | Recipient[]): string[] | undefined {
  if (!value) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  if (arr.length === 0) return undefined;
  return arr.map(formatRecipient);
}

function toTags(tags?: Record<string, string>) {
  if (!tags) return undefined;
  const entries = Object.entries(tags);
  if (entries.length === 0) return undefined;
  return entries.map(([Name, Value]) => ({ Name, Value }));
}

function isRetryable(error: unknown): boolean {
  if (error instanceof SESServiceException) {
    const retryable = ['Throttling', 'TooManyRequests', 'ServiceUnavailable', 'RequestTimeout'];
    return retryable.includes(error.name) || error.$metadata?.httpStatusCode === 429;
  }
  return false;
}

async function delay(ms: number) {
  await new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

export class SESProvider implements MailProvider {
  private readonly config: MailerConfig;
  private readonly client: SESClient;
  private readonly rateLimiter: RateLimiter;

  constructor(config: MailerConfig = loadMailerConfig()) {
    this.config = config;
    this.client = new SESClient({
      region: config.region,
      credentials: resolveCredentials(),
      maxAttempts: config.maxRetries,
    });
    this.rateLimiter = new RateLimiter(config.maxRatePerSecond);
  }

  private buildCommandInput(message: MailMessage): SendEmailCommandInput {
    const htmlBody = message.htmlBody;
    const textBody = message.textBody;

    if (!htmlBody && !textBody) {
      throw new Error('Email payload must include htmlBody or textBody.');
    }

    const destination = {
      ToAddresses: toAddressList(message.to) ?? [],
      CcAddresses: toAddressList(message.cc),
      BccAddresses: toAddressList(message.bcc),
    };

    if (!destination.ToAddresses.length) {
      throw new Error('Email payload must include at least one recipient.');
    }

  type EmailBody = NonNullable<SendEmailCommandInput['Message']>['Body'];
  const body: EmailBody = {};
    if (htmlBody) {
      body.Html = {
        Data: htmlBody,
        Charset: 'UTF-8',
      };
    }
    if (textBody) {
      body.Text = {
        Data: textBody,
        Charset: 'UTF-8',
      };
    }

    return {
      Source: this.config.fromAddress,
      Destination: destination,
      Message: {
        Subject: {
          Data: message.subject,
          Charset: 'UTF-8',
        },
        Body: body,
      },
      ReplyToAddresses: toAddressList(message.replyTo),
      Tags: toTags(message.tags),
    };
  }

  async send(message: MailMessage): Promise<SendResult> {
    const input = this.buildCommandInput(message);
    let attempt = 0;

    for (;;) {
      try {
        const response = await this.rateLimiter.schedule(() => {
          const command = new SendEmailCommand(input);
          return this.client.send(command);
        });

        return {
          success: true,
          messageId: response.MessageId,
          retriesUsed: attempt,
        };
      } catch (error) {
        if (attempt < this.config.maxRetries && isRetryable(error)) {
          const backoff = this.config.retryDelayMs * Math.pow(2, attempt);
          attempt += 1;
          await delay(backoff);
          continue;
        }

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          retriesUsed: attempt,
        };
      }
    }
  }

  async sendBatch(messages: MailMessage[], options: BatchOptions = {}): Promise<SendResult[]> {
    const batchSize = options.batchSize && options.batchSize > 0 ? options.batchSize : 10;
    const delayBetweenBatches = options.delayBetweenBatches ?? 0;
    const maxConcurrent = options.maxConcurrent ?? 3;
    const results: SendResult[] = [];

    const totalBatches = Math.ceil(messages.length / batchSize);
    
    for (let i = 0; i < messages.length; i += batchSize) {
      const batchNumber = Math.floor(i / batchSize) + 1;
      const chunk = messages.slice(i, i + batchSize);
      
      console.log(`📧 Batch ${batchNumber}/${totalBatches}: Processing ${chunk.length} emails...`);
      
      // Send up to maxConcurrent emails concurrently within the batch
      const chunkResults = await this.sendBatchConcurrent(chunk, maxConcurrent);
      results.push(...chunkResults);
      
      const successCount = chunkResults.filter(r => r.success).length;
      console.log(`✅ Batch ${batchNumber}/${totalBatches}: ${successCount}/${chunk.length} successful`);
      
      // Wait between batches to give AWS SES time to reset quota
      if (i + batchSize < messages.length && delayBetweenBatches > 0) {
        console.log(`⏳ Waiting ${delayBetweenBatches}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    return results;
  }

  async sendBatchConcurrent(
    messages: MailMessage[],
    maxConcurrent: number = 3
  ): Promise<SendResult[]> {
    const results: SendResult[] = [];
    let index = 0;
    let inProgress = 0;

    return new Promise((resolve, reject) => {
      const sendNext = async () => {
        if (index >= messages.length && inProgress === 0) {
          resolve(results);
          return;
        }

        if (index < messages.length && inProgress < maxConcurrent) {
          const currentIndex = index++;
          inProgress++;

          try {
            const result = await this.send(messages[currentIndex]);
            results[currentIndex] = result;
          } catch (error) {
            results[currentIndex] = {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            };
          } finally {
            inProgress--;
            sendNext();
          }
        }
      };

      // Start all concurrent tasks
      for (let i = 0; i < Math.min(maxConcurrent, messages.length); i++) {
        sendNext();
      }
    });
  }

  async sendBatchManaged(
    messages: MailMessage[],
    options: BatchOptions & { onProgress?: (progress: any) => void } = {}
  ): Promise<BatchResult> {
    const startTime = Date.now();
    const results = await this.sendBatch(messages, options);
    const duration = Date.now() - startTime;

    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;

    return {
      results,
      summary: {
        total: results.length,
        successful,
        failed,
        duration,
      },
    };
  }

  async verifyConfiguration(): Promise<boolean> {
    if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
      return false;
    }
    if (!this.config.fromAddress) {
      return false;
    }
    return true;
  }
}

export function createSESProvider(config?: MailerConfig) {
  return new SESProvider(config);
}
