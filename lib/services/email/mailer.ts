import { createSESProvider } from './providers/ses-provider';
import { loadMailerConfig } from './config';
import {
  prepareMarketingMessages,
  type PreparedMailDelivery,
} from './marketing-policy';
import type {
  BatchOptions,
  BatchProgress,
  BatchResult,
  MailMessage,
  MailProvider,
  Recipient,
  SendResult,
  SendTemplateOptions,
} from './types';
import { renderTemplate, type TemplateId, type TemplatePayloads } from './templates';

export type DeliveryPreparer = (
  messages: MailMessage[]
) => Promise<PreparedMailDelivery[]>;

export class TransactionalMailer {
  constructor(
    private readonly provider: MailProvider,
    private readonly prepareDeliveries: DeliveryPreparer =
      prepareMarketingMessages
  ) {}

  async send(message: MailMessage): Promise<SendResult> {
    const [prepared] = await this.prepareDeliveries([message]);
    if (!prepared) {
      throw new Error('Email delivery policy returned no result.');
    }
    if ('result' in prepared) return prepared.result;
    return this.provider.send(prepared.message);
  }

  async sendBatch(messages: MailMessage[], options?: BatchOptions): Promise<SendResult[]> {
    if (messages.length === 0) return [];

    const prepared = await this.prepareDeliveries(messages);
    if (prepared.length !== messages.length) {
      throw new Error('Email delivery policy returned an invalid result count.');
    }

    const sendable = prepared.flatMap(item =>
      'message' in item ? [item.message] : []
    );
    let providerResults: SendResult[];
    if (sendable.length === 0) {
      providerResults = [];
    } else if (typeof this.provider.sendBatch === 'function') {
      providerResults = await this.provider.sendBatch(sendable, options);
    } else {
      providerResults = [];
      for (const sendableMessage of sendable) {
        providerResults.push(await this.provider.send(sendableMessage));
      }
    }

    if (providerResults.length !== sendable.length) {
      throw new Error('Email provider returned an invalid result count.');
    }

    let providerResultIndex = 0;
    return prepared.map(item => {
      if ('result' in item) return item.result;
      const providerResult = providerResults[providerResultIndex++];
      if (!providerResult) {
        throw new Error('Email provider result mapping failed.');
      }
      return providerResult;
    });
  }

  async sendBatchManaged(
    messages: MailMessage[],
    options?: BatchOptions & {
      onProgress?: (progress: BatchProgress) => void;
    }
  ): Promise<BatchResult> {
    const startTime = Date.now();
    const results = await this.sendBatch(messages, options);
    const duration = Date.now() - startTime;
    const successful = results.filter(r => r.success).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.length - successful - skipped;

    options?.onProgress?.({
      total: results.length,
      sent: successful,
      failed,
      skipped,
      inProgress: 0,
    });

    return {
      results,
      summary: {
        total: results.length,
        successful,
        failed,
        skipped,
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
      delivery: options.delivery,
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
