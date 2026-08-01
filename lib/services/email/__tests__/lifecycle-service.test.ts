import test from "node:test";
import assert from "node:assert/strict";

import {
  deliverClerkWelcomeEmail,
  type WelcomeLifecycleDependencies,
} from "../lifecycle-service";
import { renderTemplate } from "../templates";
import type { SendResult } from "../types";

type MemoryStatus = "queued" | "sending" | "sent" | "failed";

interface MemoryRecord {
  status: MemoryStatus;
  providerMessageId?: string;
  lastError?: string;
}

function createDependencies(
  sendResults: SendResult[] = [{ success: true, messageId: "ses-1" }]
) {
  const records = new Map<string, MemoryRecord>();
  const sent: Array<{ email: string; name: string; dashboardUrl: string }> = [];
  let connectCalls = 0;
  let sendIndex = 0;

  const dependencies: WelcomeLifecycleDependencies = {
    async connect() {
      connectCalls += 1;
    },
    async ensure(record) {
      if (!records.has(record.idempotencyKey)) {
        records.set(record.idempotencyKey, { status: "queued" });
      }
    },
    async claim(idempotencyKey) {
      const record = records.get(idempotencyKey);
      if (!record || !["queued", "failed"].includes(record.status)) {
        return null;
      }
      record.status = "sending";
      return { status: "sending" };
    },
    async get(idempotencyKey) {
      const record = records.get(idempotencyKey);
      return record
        ? {
            status: record.status,
            providerMessageId: record.providerMessageId,
          }
        : null;
    },
    async markSent(idempotencyKey, providerMessageId) {
      const record = records.get(idempotencyKey);
      assert.ok(record);
      record.status = "sent";
      record.providerMessageId = providerMessageId;
      record.lastError = undefined;
    },
    async markFailed(idempotencyKey, error) {
      const record = records.get(idempotencyKey);
      assert.ok(record);
      record.status = "failed";
      record.lastError = error;
    },
    async sendWelcome(input) {
      sent.push(input);
      const result = sendResults[sendIndex];
      sendIndex += 1;
      return result ?? { success: true, messageId: `ses-${sendIndex}` };
    },
    now: () => new Date("2026-07-29T10:00:00.000Z"),
  };

  return {
    dependencies,
    records,
    sent,
    get connectCalls() {
      return connectCalls;
    },
  };
}

test("Clerk welcome normalizes the address and sends only once", async () => {
  const memory = createDependencies();
  const input = {
    clerkUserId: "user_123",
    email: "  PERSON@Example.COM ",
    name: " Priya ",
    sourceEventId: "msg_123",
  };

  const first = await deliverClerkWelcomeEmail(input, memory.dependencies);
  const duplicate = await deliverClerkWelcomeEmail(input, memory.dependencies);

  assert.deepEqual(first, { status: "sent", messageId: "ses-1" });
  assert.deepEqual(duplicate, {
    status: "already_sent",
    messageId: "ses-1",
  });
  assert.equal(memory.sent.length, 1);
  assert.deepEqual(memory.sent[0], {
    email: "person@example.com",
    name: "Priya",
    dashboardUrl: "https://www.insturix.com/dashboard",
  });
  assert.equal(memory.connectCalls, 2);
});

test("Clerk welcome treats an active delivery as in progress", async () => {
  const memory = createDependencies();
  memory.records.set("clerk:user.created:user_busy:welcome:v1", {
    status: "sending",
  });

  const result = await deliverClerkWelcomeEmail(
    {
      clerkUserId: "user_busy",
      email: "busy@example.com",
      name: "Busy",
    },
    memory.dependencies
  );

  assert.deepEqual(result, { status: "in_progress" });
  assert.equal(memory.sent.length, 0);
});

test("Clerk welcome retries a failed provider delivery", async () => {
  const memory = createDependencies([
    { success: false, error: "SES unavailable" },
    { success: true, messageId: "ses-retry" },
  ]);
  const input = {
    clerkUserId: "user_retry",
    email: "retry@example.com",
    name: "Retry",
  };

  await assert.rejects(
    deliverClerkWelcomeEmail(input, memory.dependencies),
    /SES unavailable/
  );
  assert.equal(
    memory.records.get("clerk:user.created:user_retry:welcome:v1")?.status,
    "failed"
  );

  const retry = await deliverClerkWelcomeEmail(input, memory.dependencies);
  assert.deepEqual(retry, { status: "sent", messageId: "ses-retry" });
  assert.equal(memory.sent.length, 2);
});

test("Clerk welcome rejects an invalid address before connecting", async () => {
  const memory = createDependencies();

  await assert.rejects(
    deliverClerkWelcomeEmail(
      {
        clerkUserId: "user_invalid",
        email: "not-an-email",
        name: "Invalid",
      },
      memory.dependencies
    ),
    /invalid/
  );

  assert.equal(memory.connectCalls, 0);
  assert.equal(memory.sent.length, 0);
});

test("Welcome template escapes names and rejects unsafe action URLs", () => {
  const rendered = renderTemplate("welcome", {
    name: '<img src=x onerror="alert(1)">',
    dashboardUrl: "javascript:alert(1)",
  });

  assert.ok(
    rendered.html.includes(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    )
  );
  assert.ok(!rendered.html.includes("<img src=x"));
  assert.ok(!rendered.html.includes("javascript:"));
  assert.ok(
    rendered.html.includes("https://www.insturix.com/dashboard")
  );
});
