import { randomBytes } from "crypto";

export type UploaderXOAuthProvider = "facebook" | "instagram" | "linkedin";

export interface UploaderXOAuthStateRecord {
  state: string;
  userId: string;
  provider: UploaderXOAuthProvider;
  orgId: string | null;
  brandId: string | null;
  workspaceId: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface CreateUploaderXOAuthStateArgs {
  userId: string;
  provider: UploaderXOAuthProvider;
  orgId?: string | null;
  brandId?: string | null;
  workspaceId?: string | null;
  now?: Date;
  nonce?: string;
}

export interface AssertUploaderXOAuthStateArgs {
  userId: string;
  provider: UploaderXOAuthProvider;
  state: string | null | undefined;
  now?: Date;
}

export const UPLOADERX_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const STATE_VALUE_PATTERN = /^(facebook|instagram|linkedin)_[A-Za-z0-9_-]{32,}$/;

export class UploaderXOAuthStateError extends Error {
  readonly status = 400;

  constructor(message = "Invalid OAuth state") {
    super(message);
    this.name = "UploaderXOAuthStateError";
  }
}

export function createUploaderXOAuthStateRecord({
  userId,
  provider,
  orgId = null,
  brandId = null,
  workspaceId = null,
  now = new Date(),
  nonce = randomBytes(32).toString("base64url"),
}: CreateUploaderXOAuthStateArgs): UploaderXOAuthStateRecord {
  if (!userId.trim()) {
    throw new UploaderXOAuthStateError("OAuth state requires a user");
  }

  const state = `${provider}_${nonce}`;
  if (!STATE_VALUE_PATTERN.test(state)) {
    throw new UploaderXOAuthStateError("OAuth state nonce is malformed");
  }

  return {
    state,
    userId,
    provider,
    orgId,
    brandId,
    workspaceId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + UPLOADERX_OAUTH_STATE_TTL_MS),
  };
}

export function assertUploaderXOAuthStateRecord(
  record: Partial<UploaderXOAuthStateRecord> | null | undefined,
  expected: AssertUploaderXOAuthStateArgs,
): UploaderXOAuthStateRecord {
  if (!record || !expected.state || !STATE_VALUE_PATTERN.test(expected.state)) {
    throw new UploaderXOAuthStateError();
  }

  const expiresAt = toDate(record.expiresAt);
  const createdAt = toDate(record.createdAt);
  const now = expected.now ?? new Date();

  if (
    record.state !== expected.state ||
    record.userId !== expected.userId ||
    record.provider !== expected.provider ||
    expiresAt.getTime() <= now.getTime()
  ) {
    throw new UploaderXOAuthStateError();
  }

  return {
    state: record.state,
    userId: record.userId,
    provider: record.provider,
    orgId: record.orgId ?? null,
    brandId: record.brandId ?? null,
    workspaceId: record.workspaceId ?? null,
    createdAt,
    expiresAt,
  };
}

export async function storeUploaderXOAuthState(record: UploaderXOAuthStateRecord) {
  const User = await getUserModel();

  const result = await User.updateOne(
    { clerkUserId: record.userId },
    {
      $set: {
        [`uploaderXOAuthStates.${record.provider}`]: record,
      },
    },
  );

  if (result.matchedCount === 0) {
    throw new UploaderXOAuthStateError("OAuth state requires an existing user");
  }
}

export async function consumeUploaderXOAuthState(args: AssertUploaderXOAuthStateArgs) {
  const User = await getUserModel();
  const user = (await User.findOne({ clerkUserId: args.userId }).lean()) as {
    uploaderXOAuthStates?: Partial<Record<UploaderXOAuthProvider, UploaderXOAuthStateRecord>>;
  } | null;

  const record = assertUploaderXOAuthStateRecord(user?.uploaderXOAuthStates?.[args.provider], args);

  await User.updateOne(
    { clerkUserId: args.userId },
    {
      $unset: {
        [`uploaderXOAuthStates.${args.provider}`]: "",
      },
    },
  );

  return record;
}

async function getUserModel() {
  const { default: connectToDatabase } = await import("@/schemas/ConnectToDatabase");
  await connectToDatabase();
  const { User } = await import("@/schemas/user");
  return User;
}

function toDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new UploaderXOAuthStateError();
  }
  return date;
}
