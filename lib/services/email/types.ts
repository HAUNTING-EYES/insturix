/*
 * Core mailing system types.
 * These primitives are reused across the transactional mailer
 * to keep the provider and template layers decoupled.
 */

export type Recipient = string | {
  email: string;
  name?: string;
};

export type MailDelivery =
  | {
      stream: 'transactional';
    }
  | {
      stream: 'marketing';
      topicName: string;
    };

export interface MailMessage {
  to: Recipient | Recipient[];
  subject: string;
  htmlBody?: string;
  textBody?: string;
  replyTo?: Recipient | Recipient[];
  cc?: Recipient[];
  bcc?: Recipient[];
  tags?: Record<string, string>;
  delivery?: MailDelivery;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  retriesUsed?: number;
}

export interface BatchOptions {
  batchSize?: number;
  delayBetweenBatches?: number;
  rateLimit?: number;
  maxConcurrent?: number;
}

export interface BatchProgress {
  total: number;
  sent: number;
  failed: number;
  inProgress: number;
  remainingTime?: number;
}

export interface BatchResult {
  results: SendResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    duration: number;
  };
}

export interface MailProvider {
  send(message: MailMessage): Promise<SendResult>;
  sendBatch?(messages: MailMessage[], options?: BatchOptions): Promise<SendResult[]>;
  verifyConfiguration?(): Promise<boolean>;
}

export interface TemplateRenderResult {
  subject: string;
  html: string;
  text?: string;
  preheader?: string;
}

export type TemplateRenderer<TPayload> = (payload: TPayload) => TemplateRenderResult;

export interface TemplateDefinition<TKey extends string, TPayload> {
  id: TKey;
  render: TemplateRenderer<TPayload>;
}

export type TemplateMap = Record<string, TemplateDefinition<string, unknown>>;

export interface SendTemplateOptions<TPayload> {
  to: Recipient | Recipient[];
  payload: TPayload;
  replyTo?: Recipient | Recipient[];
  cc?: Recipient[];
  bcc?: Recipient[];
  tags?: Record<string, string>;
}
