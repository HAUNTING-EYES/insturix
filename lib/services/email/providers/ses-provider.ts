import { env } from 'node:process';
import {
  SESv2Client,
  SendEmailCommand,
  type SendEmailCommandInput,
  SESv2ServiceException,
} from '@aws-sdk/client-sesv2';

import { loadMailerConfig, type MailerConfig } from '../config';
import { RateLimiter } from './rate-limiter';
import type { MailMessage, MailProvider, Recipient, SendResult, BatchOptions, BatchResult } from '../types';

const SES_UNSUBSCRIBE_PLACEHOLDER = '{{amazonSESUnsubscribeUrl}}';

function resolveCredentials() {
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      ...(env.AWS_SESSION_TOKEN ? { sessionToken: env.AWS_SESSION_TOKEN } : {}),
    };
  }
  return undefined;
}

function assertHeaderSafe(value: string, field: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`${field} cannot contain line breaks.`);
  }
}

function formatRecipient(recipient: Recipient): string {
  if (typeof recipient === 'string') {
    const value = recipient.trim();
    assertHeaderSafe(value, 'Recipient');
    return value;
  }

  const email = recipient.email.trim();
  assertHeaderSafe(email, 'Recipient email');

  if (recipient.name) {
    const name = recipient.name.trim();
    assertHeaderSafe(name, 'Recipient name');
    return `${name} <${email}>`;
  }

  return email;
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
  if (error instanceof SESv2ServiceException) {
    const retryable = [
      'ThrottlingException',
      'TooManyRequestsException',
      'ServiceUnavailableException',
      'RequestTimeout',
    ];
    return retryable.includes(error.name) || error.$metadata?.httpStatusCode === 429;
  }
  return false;
}

function hasUnsubscribePlaceholder(message: MailMessage): boolean {
  return Boolean(
    message.htmlBody?.includes(SES_UNSUBSCRIBE_PLACEHOLDER) ||
      message.textBody?.includes(SES_UNSUBSCRIBE_PLACEHOLDER)
  );
}

async function delay(ms: number) {
  await new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

export class SESProvider implements MailProvider {
  private readonly config: MailerConfig;
  private readonly client: SESv2Client;
  private readonly rateLimiter: RateLimiter;

  constructor(config: MailerConfig = loadMailerConfig()) {
    this.config = config;
    this.client = new SESv2Client({
      region: config.region,
      credentials: resolveCredentials(),
      maxAttempts: 1,
    });
    this.rateLimiter = new RateLimiter(config.maxRatePerSecond);
  }

  private buildCommandInput(message: MailMessage): SendEmailCommandInput {
    const htmlBody = message.htmlBody;
    const textBody = message.textBody;

    if (!htmlBody && !textBody) {
      throw new Error('Email payload must include htmlBody or textBody.');
    }
    if (!message.subject.trim()) {
      throw new Error('Email payload must include a subject.');
    }
    assertHeaderSafe(message.subject, 'Email subject');

    const destination = {
      ToAddresses: toAddressList(message.to) ?? [],
      CcAddresses: toAddressList(message.cc),
      BccAddresses: toAddressList(message.bcc),
    };

    if (!destination.ToAddresses.length) {
      throw new Error('Email payload must include at least one recipient.');
    }

    const delivery = message.delivery ?? { stream: 'transactional' as const };
    const includesUnsubscribePlaceholder = hasUnsubscribePlaceholder(message);
    let fromAddress = this.config.fromAddress;
    let configurationSetName = this.config.transactionalConfigurationSet;
    let listManagementOptions: SendEmailCommandInput['ListManagementOptions'];

    if (delivery.stream === 'marketing') {
      const recipientCount =
        destination.ToAddresses.length +
        (destination.CcAddresses?.length ?? 0) +
        (destination.BccAddresses?.length ?? 0);
      if (recipientCount !== 1) {
        throw new Error('Marketing email must have exactly one recipient.');
      }

      const topicName = delivery.topicName.trim();
      if (!topicName) {
        throw new Error('Marketing email must include a non-empty topicName.');
      }
      if (!includesUnsubscribePlaceholder) {
        throw new Error(
          `Marketing email must include ${SES_UNSUBSCRIBE_PLACEHOLDER}.`
        );
      }
      if (!this.config.marketingFromAddress) {
        throw new Error('AWS_SES_MARKETING_FROM_EMAIL is not configured.');
      }
      if (!this.config.marketingConfigurationSet) {
        throw new Error(
          'AWS_SES_MARKETING_CONFIGURATION_SET is not configured.'
        );
      }
      if (!this.config.marketingContactListName) {
        throw new Error('AWS_SES_MARKETING_CONTACT_LIST is not configured.');
      }

      fromAddress = this.config.marketingFromAddress;
      configurationSetName = this.config.marketingConfigurationSet;
      listManagementOptions = {
        ContactListName: this.config.marketingContactListName,
        TopicName: topicName,
      };
    } else if (includesUnsubscribePlaceholder) {
      throw new Error(
        `Transactional email cannot include ${SES_UNSUBSCRIBE_PLACEHOLDER}.`
      );
    }

    assertHeaderSafe(fromAddress, 'From address');

    type EmailBody = NonNullable<
      NonNullable<
        NonNullable<SendEmailCommandInput['Content']>['Simple']
      >['Body']
    >;
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
      FromEmailAddress: fromAddress,
      Destination: destination,
      Content: {
        Simple: {
          Subject: {
            Data: message.subject,
            Charset: 'UTF-8',
          },
          Body: body,
        },
      },
      ReplyToAddresses: toAddressList(message.replyTo),
      EmailTags: toTags({
        ...message.tags,
        email_stream: delivery.stream,
      }),
      ConfigurationSetName: configurationSetName,
      ListManagementOptions: listManagementOptions,
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
    if (!this.config.fromAddress.trim() || !this.config.region.trim()) {
      return false;
    }

    try {
      await this.client.config.credentials();
      return true;
    } catch {
      return false;
    }
  }
}

export function createSESProvider(config?: MailerConfig) {
  return new SESProvider(config);
}
