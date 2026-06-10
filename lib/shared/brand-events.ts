/**
 * Cross-Service Brand Event Bus
 *
 * Stores brand-relevant events from all services in a single MongoDB collection.
 * Consumers (brand-learning worker) process events via QStash dispatch.
 */

import { ObjectId } from 'mongodb';
import { getDatabase } from '@/lib/editron/db/mongodb';
import { Client } from '@upstash/qstash';

// ==================== Types ====================

export type BrandEventService =
  | 'thinkforge'
  | 'editron'
  | 'pipeline'
  | 'alyzitron'
  | 'clickatron'
  | 'musitron'
  | 'uploaderx';

export type BrandEventType =
  | 'script_generated'
  | 'script_feedback'
  | 'project_created'
  | 'director_completed'
  | 'video_rendered'
  | 'video_published'
  | 'analysis_complete'
  | 'thumbnail_created'
  | 'music_selected'
  | 'brand_updated'
  | 'user_override'
  | 'quality_reviewed'
  | 'status_changed';

export interface BrandEvent {
  _id?: ObjectId;
  eventId: string;
  userId: string;
  brandId?: string;
  projectId?: string;
  service: BrandEventService;
  type: BrandEventType;
  payload: Record<string, unknown>;
  consumedBy: string[];
  processingLeases?: Record<string, Date | string>;
  createdAt: Date;
}

export type BrandEventClaim =
  | { status: 'claimed'; event: BrandEvent }
  | { status: 'already_consumed'; event: BrandEvent }
  | { status: 'in_progress'; event: BrandEvent }
  | { status: 'missing' };

export interface BrandEventScopeOptions {
  projectId?: string;
  brandId?: string;
  sessionId?: string;
  type?: BrandEventType;
  service?: BrandEventService;
  limit?: number;
  since?: Date;
}

const COLLECTION = 'brand_events';
const DEFAULT_CLAIM_LEASE_MS = 10 * 60 * 1000;

// ==================== Emit ====================

export async function emitBrandEvent(
  event: Omit<BrandEvent, '_id' | 'eventId' | 'consumedBy' | 'createdAt'>,
): Promise<string> {
  const db = await getDatabase();
  const eventId = new ObjectId().toString();

  const doc: BrandEvent = {
    eventId,
    userId: event.userId,
    brandId: event.brandId,
    projectId: event.projectId,
    service: event.service,
    type: event.type,
    payload: event.payload,
    consumedBy: [],
    createdAt: new Date(),
  };

  await db.collection(COLLECTION).insertOne(doc);

  dispatchToWorker(eventId, doc).catch((err) =>
    console.error('[BrandEvents] QStash dispatch failed:', err),
  );

  return eventId;
}

// ==================== Query ====================

export async function getUnconsumedEvents(
  consumer: string,
  limit: number = 50,
): Promise<BrandEvent[]> {
  const db = await getDatabase();
  return db
    .collection<BrandEvent>(COLLECTION)
    .find({ consumedBy: { $ne: consumer } })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();
}

export async function markEventConsumed(
  eventId: string,
  consumer: string,
): Promise<void> {
  const db = await getDatabase();
  const consumerKey = consumerPathSegment(consumer);
  await db
    .collection(COLLECTION)
    .updateOne(
      { eventId },
      {
        $addToSet: { consumedBy: consumer },
        $unset: { [`processingLeases.${consumerKey}`]: '' },
      },
    );
}

export async function claimEventForConsumer(
  eventId: string,
  consumer: string,
  options?: { now?: Date; leaseMs?: number },
): Promise<BrandEventClaim> {
  const db = await getDatabase();
  const col = db.collection<BrandEvent>(COLLECTION);
  const now = options?.now ?? new Date();
  const leaseExpiresAt = new Date(now.getTime() + (options?.leaseMs ?? DEFAULT_CLAIM_LEASE_MS));
  const consumerKey = consumerPathSegment(consumer);
  const leasePath = `processingLeases.${consumerKey}`;

  const claimed = await col.findOneAndUpdate(
    {
      eventId,
      consumedBy: { $ne: consumer },
      $or: [
        { [leasePath]: { $exists: false } },
        { [leasePath]: { $lte: now } },
      ],
    },
    { $set: { [leasePath]: leaseExpiresAt } },
    { returnDocument: 'after' },
  );

  if (claimed) {
    return { status: 'claimed', event: claimed };
  }

  const existing = await col.findOne({ eventId });
  if (!existing) {
    return { status: 'missing' };
  }

  if (existing.consumedBy?.includes(consumer)) {
    return { status: 'already_consumed', event: existing };
  }

  return { status: 'in_progress', event: existing };
}

export async function releaseEventClaim(
  eventId: string,
  consumer: string,
): Promise<void> {
  const db = await getDatabase();
  const consumerKey = consumerPathSegment(consumer);
  await db
    .collection(COLLECTION)
    .updateOne(
      { eventId },
      { $unset: { [`processingLeases.${consumerKey}`]: '' } },
    );
}

export async function getEventsByProject(
  projectId: string,
  limit: number = 100,
): Promise<BrandEvent[]> {
  const db = await getDatabase();
  return db
    .collection<BrandEvent>(COLLECTION)
    .find({ projectId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function getEventsByUser(
  userId: string,
  options?: { type?: BrandEventType; service?: BrandEventService; limit?: number; since?: Date },
): Promise<BrandEvent[]> {
  const db = await getDatabase();
  const filter: Record<string, unknown> = { userId };
  if (options?.type) filter.type = options.type;
  if (options?.service) filter.service = options.service;
  if (options?.since) filter.createdAt = { $gte: options.since };

  return db
    .collection<BrandEvent>(COLLECTION)
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(options?.limit ?? 100)
    .toArray();
}

export async function getEventsByScope(
  userId: string,
  options: BrandEventScopeOptions,
): Promise<BrandEvent[]> {
  const projectId = cleanScopeValue(options.projectId);
  const sessionId = cleanScopeValue(options.sessionId);
  const brandId = cleanScopeValue(options.brandId);
  const scopeClauses = brandEventScopeClauses({ projectId, sessionId, brandId });

  if (scopeClauses.length === 0) {
    return [];
  }

  const db = await getDatabase();
  const filter: Record<string, unknown> = {
    userId,
    $or: scopeClauses,
  };
  if (options.type) filter.type = options.type;
  if (options.service) filter.service = options.service;
  if (options.since) filter.createdAt = { $gte: options.since };

  return db
    .collection<BrandEvent>(COLLECTION)
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(options.limit ?? 100)
    .toArray();
}

// ==================== QStash Dispatch ====================

async function dispatchToWorker(eventId: string, event: BrandEvent): Promise<void> {
  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    console.warn('[BrandEvents] QSTASH_TOKEN not set, skipping dispatch');
    return;
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const client = new Client({ token });
  await client.publishJSON({
    url: `${baseUrl}/api/internal/workers/brand-learning`,
    body: { eventId, event },
    retries: 3,
  });
}

// ==================== Collection Setup ====================

export async function ensureBrandEventsIndexes(): Promise<void> {
  const db = await getDatabase();
  const col = db.collection(COLLECTION);
  await Promise.all([
    col.createIndex({ userId: 1, createdAt: -1 }),
    col.createIndex({ projectId: 1, createdAt: -1 }),
    col.createIndex({ eventId: 1 }, { unique: true }),
    col.createIndex({ type: 1, createdAt: -1 }),
    col.createIndex({ consumedBy: 1 }),
    col.createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }),
  ]);
}

function consumerPathSegment(consumer: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(consumer)) {
    throw new Error(`Invalid brand event consumer id: ${consumer}`);
  }
  return consumer;
}

function brandEventScopeClauses(scope: {
  projectId?: string;
  sessionId?: string;
  brandId?: string;
}): Record<string, string>[] {
  const clauses: Record<string, string>[] = [];

  if (scope.projectId) {
    clauses.push(
      { projectId: scope.projectId },
      { 'payload.projectId': scope.projectId },
      { 'payload.editronProjectId': scope.projectId },
      { 'payload.sourceContext.projectId': scope.projectId },
    );
  }

  if (scope.sessionId) {
    clauses.push(
      { 'payload.sessionId': scope.sessionId },
      { 'payload.sourceSessionId': scope.sessionId },
      { 'payload.sourceContext.sessionId': scope.sessionId },
      { 'payload.sourceContext.sourceSessionId': scope.sessionId },
    );
  }

  if (clauses.length > 0) {
    return clauses;
  }

  if (scope.brandId) {
    return [
      { brandId: scope.brandId },
      { 'payload.brandId': scope.brandId },
      { 'payload.sourceContext.brandId': scope.brandId },
    ];
  }

  return [];
}

function cleanScopeValue(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}
