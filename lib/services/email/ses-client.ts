/**
 * AWS SES Email Client for Insturix
 * 
 * Production Configuration:
 * - Region: ap-south-1 (Mumbai)
 * - From: no-reply@insturix.com (verified)
 * - Rate Limits: 50,000 emails/day, 14 emails/second
 * 
 * This implementation handles:
 * - Automatic retries with exponential backoff
 * - Rate limiting compliance
 * - Transactional email delivery
 * - Production-ready error handling
 * 
 * Deployment: Compatible with AWS Lambda, EC2, and Node.js servers
 */

import { 
  SESClient, 
  SendEmailCommand, 
  SendEmailCommandInput,
  SESServiceException 
} from '@aws-sdk/client-ses';

/**
 * SES Client Configuration
 * Uses environment variables for credentials and region (IAM best practices)
 */
const sesClient = new SESClient({
  region: process.env.AWS_SES_REGION || 'ap-south-1', // Default to Mumbai region
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  maxAttempts: 3, // Automatic retries on transient failures
});

/**
 * Email configuration constants
 */
export const EMAIL_CONFIG = {
  FROM_ADDRESS: process.env.AWS_SES_FROM_EMAIL || 'no-reply@insturix.com',
  REGION: process.env.AWS_SES_REGION || 'ap-south-1',
  MAX_RATE_PER_SECOND: 14, // SES production limit
  MAX_DAILY_QUOTA: 50000,  // SES production limit
  RETRY_DELAY_MS: 1000,    // Initial retry delay
  MAX_RETRIES: 3,          // Maximum retry attempts
} as const;

/**
 * Email parameters interface
 */
export interface EmailParams {
  to: string | string[];           // Single or multiple recipients
  subject: string;                   // Email subject
  htmlBody?: string;                 // HTML email body
  textBody?: string;                 // Plain text email body (fallback)
  replyTo?: string;                  // Optional reply-to address
  cc?: string[];                     // Optional CC recipients
  bcc?: string[];                    // Optional BCC recipients
}

/**
 * Email sending result
 */
export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  retriesUsed?: number;
}

/**
 * Rate limiter for SES compliance
 * Ensures we don't exceed 14 emails/second
 */
class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastSentTime = 0;
  private readonly minInterval: number;

  constructor(maxPerSecond: number) {
    // Add 10% buffer to stay safely under limit
    this.minInterval = 1000 / (maxPerSecond * 0.9);
  }

  /**
   * Add email to rate-limited queue
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  /**
   * Process queued emails with rate limiting
   */
  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastSend = now - this.lastSentTime;

      if (timeSinceLastSend < this.minInterval) {
        // Wait to comply with rate limit
        await new Promise(resolve => 
          setTimeout(resolve, this.minInterval - timeSinceLastSend)
        );
      }

      const task = this.queue.shift();
      if (task) {
        this.lastSentTime = Date.now();
        await task();
      }
    }

    this.processing = false;
  }
}

// Global rate limiter instance
const rateLimiter = new RateLimiter(EMAIL_CONFIG.MAX_RATE_PER_SECOND);

/**
 * Sleep utility for retry backoff
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Check if error is retryable (throttling, transient failures)
 */
function isRetryableError(error: any): boolean {
  if (error instanceof SESServiceException) {
    // Retry on throttling and transient errors
    const retryableErrors = [
      'Throttling',
      'RequestTimeout',
      'ServiceUnavailable',
      'TooManyRequests',
    ];
    return retryableErrors.some(type => 
      error.name.includes(type) || error.$metadata?.httpStatusCode === 429
    );
  }
  return false;
}

/**
 * Send a single email with automatic retries and rate limiting
 * 
 * Features:
 * - Exponential backoff on retryable errors
 * - Automatic rate limiting to comply with SES limits
 * - Comprehensive error handling
 * - Production-ready logging
 * 
 * @param params - Email parameters
 * @returns Promise<EmailResult> - Send result with message ID or error
 */
export async function sendEmail(params: EmailParams): Promise<EmailResult> {
  const { to, subject, htmlBody, textBody, replyTo, cc, bcc } = params;

  // Validate required fields
  if (!to || !subject || (!htmlBody && !textBody)) {
    return {
      success: false,
      error: 'Missing required email parameters (to, subject, body)',
    };
  }

  // Convert single recipient to array for consistent handling
  const recipients = Array.isArray(to) ? to : [to];

  // Prepare SES command input
  const emailParams: SendEmailCommandInput = {
    Source: EMAIL_CONFIG.FROM_ADDRESS,
    Destination: {
      ToAddresses: recipients,
      ...(cc && cc.length > 0 && { CcAddresses: cc }),
      ...(bcc && bcc.length > 0 && { BccAddresses: bcc }),
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: 'UTF-8',
      },
      Body: {
        ...(htmlBody && {
          Html: {
            Data: htmlBody,
            Charset: 'UTF-8',
          },
        }),
        ...(textBody && {
          Text: {
            Data: textBody,
            Charset: 'UTF-8',
          },
        }),
      },
    },
    ...(replyTo && { ReplyToAddresses: [replyTo] }),
  };

  let retriesUsed = 0;

  // Retry loop with exponential backoff
  for (let attempt = 0; attempt <= EMAIL_CONFIG.MAX_RETRIES; attempt++) {
    try {
      // Use rate limiter to ensure compliance with SES limits
      const response = await rateLimiter.execute(async () => {
        const command = new SendEmailCommand(emailParams);
        return await sesClient.send(command);
      });

      // Success
      console.log(`Email sent successfully to ${recipients.join(', ')}`, {
        messageId: response.MessageId,
        retriesUsed,
      });

      return {
        success: true,
        messageId: response.MessageId,
        retriesUsed,
      };
    } catch (error: any) {
      retriesUsed = attempt;

      // Check if we should retry
      if (attempt < EMAIL_CONFIG.MAX_RETRIES && isRetryableError(error)) {
        // Exponential backoff: 1s, 2s, 4s...
        const backoffDelay = EMAIL_CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt);
        
        console.warn(`Email send failed (attempt ${attempt + 1}), retrying in ${backoffDelay}ms`, {
          error: error.message,
          recipients,
        });

        await sleep(backoffDelay);
        continue;
      }

      // Non-retryable error or max retries exceeded
      console.error('Email send failed permanently', {
        error: error.message,
        recipients,
        retriesUsed,
        errorType: error.name,
      });

      return {
        success: false,
        error: error.message || 'Unknown error occurred',
        retriesUsed,
      };
    }
  }

  // Should never reach here, but TypeScript needs it
  return {
    success: false,
    error: 'Max retries exceeded',
    retriesUsed,
  };
}

/**
 * Send emails to multiple recipients in batches
 * 
 * NOTE: For large-scale sends (newsletters, announcements):
 * - This function sends individual emails (good for transactional emails)
 * - For bulk sends, consider using SES SendBulkTemplatedEmail API
 * - Monitor daily quota (50,000 emails/day)
 * - Consider implementing a job queue (e.g., Bull, AWS SQS) for large batches
 * 
 * @param emails - Array of email parameters
 * @param batchSize - Number of emails to send concurrently (default: 10)
 * @returns Promise<EmailResult[]> - Results for each email
 */
export async function sendBatchEmails(
  emails: EmailParams[],
  batchSize = 10
): Promise<EmailResult[]> {
  const results: EmailResult[] = [];

  console.log(`Starting batch email send: ${emails.length} emails in batches of ${batchSize}`);

  // Process in batches to avoid overwhelming the system
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    
    // Send batch concurrently (rate limiter will handle sequencing)
    const batchResults = await Promise.all(
      batch.map(email => sendEmail(email))
    );

    results.push(...batchResults);

    console.log(`Batch ${Math.floor(i / batchSize) + 1} complete: ${batchResults.filter(r => r.success).length}/${batch.length} successful`);
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`Batch email send complete: ${successCount}/${emails.length} successful`);

  return results;
}

/**
 * Health check: Verify SES client is properly configured
 * 
 * @returns Promise<boolean> - True if configuration is valid
 */
export async function verifySESConfiguration(): Promise<boolean> {
  try {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.error('AWS credentials not found in environment variables');
      return false;
    }

    console.log('SES configuration verified', {
      region: EMAIL_CONFIG.REGION,
      fromAddress: EMAIL_CONFIG.FROM_ADDRESS,
      maxRate: EMAIL_CONFIG.MAX_RATE_PER_SECOND,
    });

    return true;
  } catch (error: any) {
    console.error('SES configuration verification failed', {
      error: error.message,
    });
    return false;
  }
}

export default sesClient;
