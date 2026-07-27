import assert from 'node:assert/strict';
import test from 'node:test';

import {
  processSesFeedbackEvent,
  type SesFeedbackDependencies,
  type SuppressSesRecipientInput,
} from '../ses-event-consumer';
import {
  isValidEmailEventSecret,
  SesEventValidationError,
} from '../ses-event';

const OPTIONS = {
  allowedConfigurationSets: new Set([
    'insturix-transactional',
    'insturix-marketing',
  ]),
  region: 'ap-south-1',
};

function envelope(
  detailType: 'Email Bounced' | 'Email Complaint Received',
  detail: Record<string, unknown>
) {
  return {
    version: '0',
    id: 'event-123',
    'detail-type': detailType,
    source: 'aws.ses',
    account: '123456789012',
    time: '2026-07-28T12:00:00.000Z',
    region: 'ap-south-1',
    resources: [],
    detail,
  };
}

function mail(configurationSet = 'insturix-marketing') {
  return {
    timestamp: '2026-07-28T12:00:00.000Z',
    messageId: 'ses-message-123',
    source: 'updates@insturix.com',
    destination: ['user@example.com'],
    tags: {
      'ses:configuration-set': [configurationSet],
      email_stream: ['marketing'],
    },
  };
}

function memoryDependencies() {
  const suppressions: SuppressSesRecipientInput[] = [];
  let connectCount = 0;
  const dependencies: SesFeedbackDependencies = {
    async connect() {
      connectCount += 1;
    },
    async suppressRecipient(input) {
      suppressions.push(input);
    },
  };
  return {
    dependencies,
    suppressions,
    connectCount: () => connectCount,
  };
}

test('processes complaint recipients without exposing recipient data', async () => {
  const memory = memoryDependencies();
  const payload = envelope('Email Complaint Received', {
    eventType: 'Complaint',
    mail: mail(),
    complaint: {
      feedbackId: 'complaint-feedback-1',
      complainedRecipients: [
        { emailAddress: ' User@Example.com ' },
      ],
    },
  });

  const result = await processSesFeedbackEvent(
    payload,
    OPTIONS,
    memory.dependencies
  );

  assert.deepEqual(result, {
    status: 'processed',
    reason: 'complaint',
    recipientCount: 1,
  });
  assert.equal(memory.connectCount(), 1);
  assert.deepEqual(memory.suppressions, [
    {
      normalizedEmail: 'user@example.com',
      reason: 'complaint',
      providerEventId: 'ses:complaint:complaint-feedback-1',
    },
  ]);
});

test('deduplicates recipients in a permanent bounce', async () => {
  const memory = memoryDependencies();
  const payload = envelope('Email Bounced', {
    eventType: 'Bounce',
    mail: mail('insturix-transactional'),
    bounce: {
      bounceType: 'Permanent',
      feedbackId: 'bounce-feedback-1',
      bouncedRecipients: [
        { emailAddress: 'user@example.com' },
        { emailAddress: 'USER@example.com' },
      ],
    },
  });

  const result = await processSesFeedbackEvent(
    payload,
    OPTIONS,
    memory.dependencies
  );

  assert.equal(result.status, 'processed');
  assert.equal(result.recipientCount, 1);
  assert.deepEqual(memory.suppressions, [
    {
      normalizedEmail: 'user@example.com',
      reason: 'hard_bounce',
      providerEventId: 'ses:bounce:bounce-feedback-1',
    },
  ]);
});

test('acknowledges transient bounces without permanent suppression', async () => {
  const memory = memoryDependencies();
  const payload = envelope('Email Bounced', {
    eventType: 'Bounce',
    mail: mail(),
    bounce: {
      bounceType: 'Transient',
      bouncedRecipients: [{ emailAddress: 'user@example.com' }],
    },
  });

  const result = await processSesFeedbackEvent(
    payload,
    OPTIONS,
    memory.dependencies
  );

  assert.deepEqual(result, {
    status: 'ignored',
    reason: 'non_permanent_bounce',
    recipientCount: 0,
  });
  assert.equal(memory.connectCount(), 0);
  assert.deepEqual(memory.suppressions, []);
});

test('rejects events from a foreign configuration set', async () => {
  const memory = memoryDependencies();
  const payload = envelope('Email Complaint Received', {
    eventType: 'Complaint',
    mail: mail('foreign-config-set'),
    complaint: {
      complainedRecipients: [{ emailAddress: 'user@example.com' }],
    },
  });

  await assert.rejects(
    processSesFeedbackEvent(payload, OPTIONS, memory.dependencies),
    SesEventValidationError
  );
  assert.equal(memory.connectCount(), 0);
});

test('rejects mismatched envelope and detail event types', async () => {
  const memory = memoryDependencies();
  const payload = envelope('Email Complaint Received', {
    eventType: 'Bounce',
    mail: mail(),
    complaint: {
      complainedRecipients: [{ emailAddress: 'user@example.com' }],
    },
  });

  await assert.rejects(
    processSesFeedbackEvent(payload, OPTIONS, memory.dependencies),
    /envelope and detail event types do not match/
  );
  assert.equal(memory.connectCount(), 0);
});

test('rejects invalid recipient addresses before database access', async () => {
  const memory = memoryDependencies();
  const payload = envelope('Email Bounced', {
    eventType: 'Bounce',
    mail: mail(),
    bounce: {
      bounceType: 'Permanent',
      bouncedRecipients: [{ emailAddress: 'not-an-email' }],
    },
  });

  await assert.rejects(
    processSesFeedbackEvent(payload, OPTIONS, memory.dependencies),
    /invalid address/
  );
  assert.equal(memory.connectCount(), 0);
});

test('compares ingestion secrets without accepting short configuration', () => {
  const expected = 'a'.repeat(48);
  assert.equal(isValidEmailEventSecret(expected, expected), true);
  assert.equal(isValidEmailEventSecret('b'.repeat(48), expected), false);
  assert.equal(isValidEmailEventSecret('short', 'short'), false);
  assert.equal(isValidEmailEventSecret(undefined, expected), false);
});
