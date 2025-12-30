import { createSESProvider } from './providers/ses-provider';
import { loadMailerConfig } from './config';
import type { BatchOptions, MailMessage, MailProvider, Recipient, SendResult, SendTemplateOptions, BatchResult } from './types';
import { renderTemplate, type TemplateId, type TemplatePayloads } from './templates';

export class TransactionalMailer {
  constructor(private readonly provider: MailProvider) {}

  async send(message: MailMessage): Promise<SendResult> {
    return this.provider.send(message);
  }

  async sendBatch(messages: MailMessage[], options?: BatchOptions): Promise<SendResult[]> {
    if (typeof this.provider.sendBatch === 'function') {
      return this.provider.sendBatch(messages, options);
    }

    const results: SendResult[] = [];
    for (const message of messages) {
      // Sequential fallback ensures providers without batch support still honour rate limits.
      const result = await this.send(message);
      results.push(result);
    }
    return results;
  }

  async sendBatchManaged(
    messages: MailMessage[],
    options?: BatchOptions & { onProgress?: (progress: any) => void }
  ): Promise<BatchResult> {
    if ('sendBatchManaged' in this.provider && typeof (this.provider as any).sendBatchManaged === 'function') {
      return (this.provider as any).sendBatchManaged(messages, options);
    }

    // Fallback: sequential batch without advanced management
    const startTime = Date.now();
    const results = await this.sendBatch(messages, options);
    const duration = Date.now() - startTime;
    const successful = results.filter(r => r.success).length;

    return {
      results,
      summary: {
        total: results.length,
        successful,
        failed: results.length - successful,
        duration,
      },
    };
  }

  async verifyConfiguration(): Promise<boolean> {
    if (typeof this.provider.verifyConfiguration === 'function') {
      return this.provider.verifyConfiguration();
    }
    return true;
  }

  async sendTemplate<K extends TemplateId>(templateId: K, options: SendTemplateOptions<TemplatePayloads[K]>): Promise<SendResult> {
    const { subject, html, text } = renderTemplate(templateId, options.payload);

    const message: MailMessage = {
      to: options.to,
      subject,
      htmlBody: html,
      textBody: text,
      replyTo: options.replyTo,
      cc: options.cc,
      bcc: options.bcc,
      tags: options.tags,
    };

    return this.send(message);
  }

  async sendWelcomeEmail(params: { to: Recipient | Recipient[]; name: string; dashboardUrl?: string; }) {
    return this.sendTemplate('welcome', {
      to: params.to,
      payload: {
        name: params.name,
        dashboardUrl: params.dashboardUrl,
      },
    });
  }

  async sendVerificationEmail(params: { to: Recipient | Recipient[]; name: string; verificationLink: string; expiresInHours?: number; }) {
    return this.sendTemplate('verification', {
      to: params.to,
      payload: {
        name: params.name,
        verificationLink: params.verificationLink,
        expiresInHours: params.expiresInHours,
      },
    });
  }

  async sendPasswordResetEmail(params: { to: Recipient | Recipient[]; name: string; resetLink: string; expiresInMinutes?: number; }) {
    return this.sendTemplate('password-reset', {
      to: params.to,
      payload: {
        name: params.name,
        resetLink: params.resetLink,
        expiresInMinutes: params.expiresInMinutes,
      },
    });
  }

  async sendOrderConfirmationEmail(params: { to: Recipient | Recipient[]; name: string; orderNumber: string; items: { item: string; price: string; }[]; detailsUrl?: string; }) {
    return this.sendTemplate('order-confirmation', {
      to: params.to,
      payload: {
        name: params.name,
        orderNumber: params.orderNumber,
        items: params.items,
        detailsUrl: params.detailsUrl,
      },
    });
  }

  async sendNotificationEmail(params: { to: Recipient | Recipient[]; name: string; title: string; message: string; actionUrl?: string; actionText?: string; }) {
    return this.sendTemplate('notification', {
      to: params.to,
      payload: {
        name: params.name,
        title: params.title,
        message: params.message,
        actionUrl: params.actionUrl,
        actionText: params.actionText,
      },
    });
  }

  async sendSecurityAlertEmail(params: { to: Recipient | Recipient[]; name: string; alertType: string; details: string; remediationUrl?: string; }) {
    return this.sendTemplate('security-alert', {
      to: params.to,
      payload: {
        name: params.name,
        alertType: params.alertType,
        details: params.details,
        remediationUrl: params.remediationUrl,
      },
    });
  }
}

let defaultMailer: TransactionalMailer | null = null;

export function getDefaultMailer(): TransactionalMailer {
  if (!defaultMailer) {
    const provider = createSESProvider(loadMailerConfig());
    defaultMailer = new TransactionalMailer(provider);
  }
  return defaultMailer;
}

export function createMailer(provider?: MailProvider): TransactionalMailer {
  if (provider) {
    return new TransactionalMailer(provider);
  }
  const config = loadMailerConfig();
  return new TransactionalMailer(createSESProvider(config));
}
