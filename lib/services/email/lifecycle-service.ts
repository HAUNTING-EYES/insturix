import type {
  EmailLifecycleDeliveryStatus,
  IEmailLifecycleDelivery,
} from "@/schemas/EmailLifecycleDeliverySchema";

import {
  isValidEmailAddress,
  normalizeEmailAddress,
} from "./contact-policy";
import type { SendResult } from "./types";

const WELCOME_VERSION = 1;
const DELIVERY_LEASE_MS = 2 * 60 * 1000;
const MAX_USER_ID_LENGTH = 255;
const MAX_DISPLAY_NAME_LENGTH = 120;
const MAX_EVENT_ID_LENGTH = 255;
const MAX_ERROR_LENGTH = 2_000;
const DEFAULT_DASHBOARD_URL = "https://www.insturix.com/dashboard";

async function getDeliveryModel() {
  const { default: EmailLifecycleDelivery } = await import(
    "@/schemas/EmailLifecycleDeliverySchema"
  );
  return EmailLifecycleDelivery;
}

interface DeliverySnapshot {
  status: EmailLifecycleDeliveryStatus;
  providerMessageId?: string;
}

interface WelcomeDeliveryRecord {
  idempotencyKey: string;
  userId: string;
  normalizedEmail: string;
  displayName: string;
  sourceEventId?: string;
}

export interface WelcomeLifecycleDependencies {
  connect(): Promise<unknown>;
  ensure(record: WelcomeDeliveryRecord): Promise<void>;
  claim(
    idempotencyKey: string,
    now: Date,
    leaseUntil: Date
  ): Promise<DeliverySnapshot | null>;
  get(idempotencyKey: string): Promise<DeliverySnapshot | null>;
  markSent(
    idempotencyKey: string,
    providerMessageId: string | undefined,
    sentAt: Date
  ): Promise<void>;
  markFailed(idempotencyKey: string, error: string): Promise<void>;
  sendWelcome(input: {
    email: string;
    name: string;
    dashboardUrl: string;
  }): Promise<SendResult>;
  now(): Date;
}

export interface ClerkWelcomeEmailInput {
  clerkUserId: string;
  email: string;
  name?: string;
  sourceEventId?: string;
}

export type ClerkWelcomeEmailResult =
  | { status: "sent"; messageId?: string }
  | { status: "already_sent"; messageId?: string }
  | { status: "in_progress" };

function snapshot(
  delivery: IEmailLifecycleDelivery | null
): DeliverySnapshot | null {
  if (!delivery) {
    return null;
  }

  return {
    status: delivery.status,
    providerMessageId: delivery.providerMessageId,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

const defaultDependencies: WelcomeLifecycleDependencies = {
  async connect() {
    const { default: connectToDatabase } = await import(
      "@/schemas/ConnectToDatabase"
    );
    return connectToDatabase();
  },
  async ensure(record) {
    const EmailLifecycleDelivery = await getDeliveryModel();
    try {
      await EmailLifecycleDelivery.updateOne(
        { idempotencyKey: record.idempotencyKey },
        {
          $setOnInsert: {
            ...record,
            kind: "welcome",
            status: "queued",
            attempts: 0,
          },
        },
        { upsert: true }
      ).exec();
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  },
  async claim(idempotencyKey, now, leaseUntil) {
    const EmailLifecycleDelivery = await getDeliveryModel();
    const delivery = await EmailLifecycleDelivery.findOneAndUpdate(
      {
        idempotencyKey,
        $or: [
          { status: { $in: ["queued", "failed"] } },
          { status: "sending", leaseUntil: { $lte: now } },
        ],
      },
      {
        $set: {
          status: "sending",
          leaseUntil,
        },
        $unset: {
          lastError: 1,
        },
        $inc: {
          attempts: 1,
        },
      },
      { new: true }
    ).exec();

    return snapshot(delivery);
  },
  async get(idempotencyKey) {
    const EmailLifecycleDelivery = await getDeliveryModel();
    const delivery = await EmailLifecycleDelivery.findOne({
      idempotencyKey,
    }).exec();
    return snapshot(delivery);
  },
  async markSent(idempotencyKey, providerMessageId, sentAt) {
    const EmailLifecycleDelivery = await getDeliveryModel();
    await EmailLifecycleDelivery.updateOne(
      { idempotencyKey, status: "sending" },
      {
        $set: {
          status: "sent",
          sentAt,
          ...(providerMessageId ? { providerMessageId } : {}),
        },
        $unset: {
          leaseUntil: 1,
          lastError: 1,
        },
      }
    ).exec();
  },
  async markFailed(idempotencyKey, error) {
    const EmailLifecycleDelivery = await getDeliveryModel();
    await EmailLifecycleDelivery.updateOne(
      { idempotencyKey, status: "sending" },
      {
        $set: {
          status: "failed",
          lastError: error,
        },
        $unset: {
          leaseUntil: 1,
        },
      }
    ).exec();
  },
  async sendWelcome({ email, name, dashboardUrl }) {
    const { sendTemplateEmail } = await import("./helpers");
    return sendTemplateEmail("welcome", {
      to: { email, name },
      payload: { name, dashboardUrl },
      tags: {
        email_type: "welcome",
        lifecycle_source: "clerk_user_created",
      },
      delivery: { stream: "transactional" },
    });
  },
  now: () => new Date(),
};

function boundedRequiredValue(
  value: string,
  fieldName: string,
  maxLength: number
): string {
  const normalizedValue = value.trim();
  if (!normalizedValue || normalizedValue.length > maxLength) {
    throw new Error(`${fieldName} is invalid`);
  }
  return normalizedValue;
}

function resolveDashboardUrl(): string {
  const configuredBaseUrl = process.env.EMAIL_PUBLIC_BASE_URL?.trim();
  if (!configuredBaseUrl) {
    return DEFAULT_DASHBOARD_URL;
  }

  try {
    const baseUrl = new URL(configuredBaseUrl);
    if (
      baseUrl.protocol !== "https:" ||
      baseUrl.username ||
      baseUrl.password
    ) {
      return DEFAULT_DASHBOARD_URL;
    }
    return new URL("/dashboard", baseUrl).toString();
  } catch {
    return DEFAULT_DASHBOARD_URL;
  }
}

function errorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Unknown welcome email error";
  return message.slice(0, MAX_ERROR_LENGTH);
}

export async function deliverClerkWelcomeEmail(
  input: ClerkWelcomeEmailInput,
  dependencies: WelcomeLifecycleDependencies = defaultDependencies
): Promise<ClerkWelcomeEmailResult> {
  const clerkUserId = boundedRequiredValue(
    input.clerkUserId,
    "Clerk user ID",
    MAX_USER_ID_LENGTH
  );
  const normalizedEmail = normalizeEmailAddress(input.email);
  if (!isValidEmailAddress(normalizedEmail)) {
    throw new Error("Welcome email address is invalid");
  }

  const displayName =
    input.name?.trim().slice(0, MAX_DISPLAY_NAME_LENGTH) || "there";
  const sourceEventId = input.sourceEventId
    ?.trim()
    .slice(0, MAX_EVENT_ID_LENGTH);
  const idempotencyKey =
    `clerk:user.created:${clerkUserId}:welcome:v${WELCOME_VERSION}`;

  await dependencies.connect();
  await dependencies.ensure({
    idempotencyKey,
    userId: clerkUserId,
    normalizedEmail,
    displayName,
    sourceEventId: sourceEventId || undefined,
  });

  const now = dependencies.now();
  const claimed = await dependencies.claim(
    idempotencyKey,
    now,
    new Date(now.getTime() + DELIVERY_LEASE_MS)
  );

  if (!claimed) {
    const existing = await dependencies.get(idempotencyKey);
    if (existing?.status === "sent") {
      return {
        status: "already_sent",
        messageId: existing.providerMessageId,
      };
    }
    if (existing?.status === "sending") {
      return { status: "in_progress" };
    }
    throw new Error("Welcome email delivery could not be claimed");
  }

  try {
    const result = await dependencies.sendWelcome({
      email: normalizedEmail,
      name: displayName,
      dashboardUrl: resolveDashboardUrl(),
    });
    if (!result.success) {
      throw new Error(result.error || "Welcome email provider rejected delivery");
    }

    await dependencies.markSent(idempotencyKey, result.messageId, dependencies.now());
    return { status: "sent", messageId: result.messageId };
  } catch (error) {
    await dependencies.markFailed(idempotencyKey, errorMessage(error));
    throw error;
  }
}
