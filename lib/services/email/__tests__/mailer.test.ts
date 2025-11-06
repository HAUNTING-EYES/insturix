import test from 'node:test';
import assert from 'node:assert/strict';

import { TransactionalMailer } from '../mailer';
import type { MailMessage, MailProvider, SendResult } from '../types';

class MemoryProvider implements MailProvider {
  public sent: MailMessage[] = [];
  public verified = false;

  async send(message: MailMessage): Promise<SendResult> {
    this.sent.push(message);
    return { success: true, messageId: `msg-${this.sent.length}` };
  }

  async sendBatch(messages: MailMessage[]): Promise<SendResult[]> {
    return Promise.all(messages.map(message => this.send(message)));
  }

  async verifyConfiguration(): Promise<boolean> {
    this.verified = true;
    return true;
  }
}

test('TransactionalMailer integrates templates with provider', async () => {
  const provider = new MemoryProvider();
  const mailer = new TransactionalMailer(provider);

  const result = await mailer.sendWelcomeEmail({
    to: 'user@example.com',
    name: 'Test User',
  });

  assert.equal(result.success, true);
  assert.equal(provider.sent.length, 1);
  const message = provider.sent.at(0);
  assert.ok(message);
  assert.equal(message?.subject, 'Welcome to Insturix');
  assert.ok(message?.htmlBody?.includes('Test User'));
});

test('TransactionalMailer sendTemplate renders specific template', async () => {
  const provider = new MemoryProvider();
  const mailer = new TransactionalMailer(provider);

  await mailer.sendTemplate('verification', {
    to: 'verify@example.com',
    payload: {
      name: 'Verify User',
      verificationLink: 'https://insturix.com/verify?token=abc',
    },
  });

  const message = provider.sent.at(0);
  assert.ok(message);
  assert.equal(message?.subject, 'Verify your Insturix email address');
  assert.ok(message?.htmlBody?.includes('https://insturix.com/verify?token=abc'));
});

test('TransactionalMailer handles batch send through provider', async () => {
  const provider = new MemoryProvider();
  const mailer = new TransactionalMailer(provider);

  const results = await mailer.sendBatch([
    { to: 'a@example.com', subject: 'A', htmlBody: '<p>A</p>' },
    { to: 'b@example.com', subject: 'B', htmlBody: '<p>B</p>' },
  ]);

  assert.equal(results.length, 2);
  assert.equal(provider.sent.length, 2);
});

test('TransactionalMailer verifyConfiguration delegates to provider', async () => {
  const provider = new MemoryProvider();
  const mailer = new TransactionalMailer(provider);

  const ok = await mailer.verifyConfiguration();
  assert.equal(ok, true);
  assert.equal(provider.verified, true);
});
