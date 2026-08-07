import {
  parseSesFeedbackEvent,
  type SesEventConsumerOptions,
  type SesSuppressionReason,
} from './ses-event';

type JsonRecord = Record<string, unknown>;

export interface SuppressSesRecipientInput {
  normalizedEmail: string;
  reason: SesSuppressionReason;
  providerEventId: string;
}

export interface SesFeedbackDependencies {
  connect(): Promise<void>;
  suppressRecipient(input: SuppressSesRecipientInput): Promise<void>;
}

export type SesFeedbackResult =
  | {
      status: 'processed';
      reason: SesSuppressionReason;
      recipientCount: number;
    }
  | {
      status: 'ignored';
      reason: 'non_permanent_bounce';
      recipientCount: 0;
    };

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    !Array.isArray(error) &&
    (error as JsonRecord).code === 11000
  );
}

function createDefaultDependencies(): SesFeedbackDependencies {
  let modelsPromise:
    | Promise<{
        connect: () => Promise<unknown>;
        EmailContact: typeof import('@/schemas/EmailContactSchema').default;
        EmailSuppression: typeof import('@/schemas/EmailSuppressionSchema').default;
      }>
    | undefined;

  const loadModels = () => {
    modelsPromise ??= Promise.all([
      import('@/schemas/ConnectToDatabase'),
      import('@/schemas/EmailContactSchema'),
      import('@/schemas/EmailSuppressionSchema'),
    ]).then(([database, contact, suppression]) => ({
      connect: database.default,
      EmailContact: contact.default,
      EmailSuppression: suppression.default,
    }));
    return modelsPromise;
  };

  return {
    async connect() {
      const models = await loadModels();
      await models.connect();
    },
    async suppressRecipient(input) {
      const { EmailContact, EmailSuppression } = await loadModels();
      const filter = {
        normalizedEmail: input.normalizedEmail,
        scope: 'global' as const,
        active: true,
      };

      try {
        await EmailSuppression.findOneAndUpdate(
          filter,
          {
            $setOnInsert: {
              ...filter,
              reason: input.reason,
              source: 'ses',
              providerEventId: input.providerEventId,
            },
          },
          { upsert: true, runValidators: true }
        ).exec();
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        const existing = await EmailSuppression.exists(filter);
        if (!existing) throw error;
      }

      await EmailContact.updateOne(
        {
          normalizedEmail: input.normalizedEmail,
          status: { $ne: 'suppressed' },
        },
        { $set: { status: 'suppressed' } }
      ).exec();
    },
  };
}

export async function processSesFeedbackEvent(
  payload: unknown,
  options: SesEventConsumerOptions = {},
  dependencies: SesFeedbackDependencies = createDefaultDependencies()
): Promise<SesFeedbackResult> {
  const event = parseSesFeedbackEvent(payload, options);
  if (event.disposition === 'ignore') {
    return {
      status: 'ignored',
      reason: event.reason,
      recipientCount: 0,
    };
  }

  await dependencies.connect();
  for (const normalizedEmail of event.recipients) {
    await dependencies.suppressRecipient({
      normalizedEmail,
      reason: event.reason,
      providerEventId: event.providerEventId,
    });
  }

  return {
    status: 'processed',
    reason: event.reason,
    recipientCount: event.recipients.length,
  };
}
