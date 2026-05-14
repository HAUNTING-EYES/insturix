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
  createdAt: Date;
}

const COLLECTION = 'brand_events';

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
  await db
    .collection(COLLECTION)
    .updateOne({ eventId }, { $addToSet: { consumedBy: consumer } });
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
