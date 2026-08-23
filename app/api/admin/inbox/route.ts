import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import Contact from '@/schemas/ContactSchema';
import Support from '@/schemas/SupportSchema';

type InboxSource = 'contact' | 'support';

const SUPPORT_ID_PREFIX = 'support:';
const MAX_PAGE_SIZE = 100;
const MAX_PAGE_NUMBER = 10000;
const BULK_ACTIONS = new Set(['read', 'unread', 'delete', 'restore', 'permanent-delete']);

function readPositiveInteger(value: string | null, fallback: number, maximum: number): number {
  if (value === null) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;

  return Math.min(parsed, maximum);
}

function buildInboxFilter(readParam: string | null, deletedParam: string | null): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];

  if (deletedParam === 'true' || deletedParam === 'only') {
    conditions.push({ $or: [{ deleted: true }, { deletedAt: { $ne: null } }] });
  } else {
    conditions.push({
      $and: [
        { $or: [{ deleted: false }, { deleted: { $exists: false } }, { deleted: null }] },
        { $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }] },
      ],
    });
  }

  if (readParam === 'true') conditions.push({ read: true });
  if (readParam === 'false') conditions.push({ read: { $ne: true } });

  return conditions.length > 0 ? { $and: conditions } : {};
}

function parseInboxId(value: unknown): { source: InboxSource; id: string } | null {
  if (typeof value !== 'string') return null;

  const source: InboxSource = value.startsWith(SUPPORT_ID_PREFIX) ? 'support' : 'contact';
  const id = source === 'support' ? value.slice(SUPPORT_ID_PREFIX.length) : value;

  if (!Types.ObjectId.isValid(id)) return null;

  return { source, id };
}

function splitInboxIds(values: unknown): { contactIds: string[]; supportIds: string[] } | null {
  if (!Array.isArray(values) || values.length === 0) return null;

  const contactIds: string[] = [];
  const supportIds: string[] = [];

  for (const value of values) {
    const parsed = parseInboxId(value);
    if (!parsed) return null;

    if (parsed.source === 'support') {
      supportIds.push(parsed.id);
    } else {
      contactIds.push(parsed.id);
    }
  }

  return { contactIds, supportIds };
}

function statusUpdate(body: Record<string, unknown>): Record<string, boolean | Date | null> {
  const update: Record<string, boolean | Date | null> = {};

  if (typeof body.read === 'boolean') {
    update.read = body.read;
    update.readAt = body.read ? new Date() : null;
  }

  if (typeof body.deleted === 'boolean') {
    update.deleted = body.deleted;
    update.deletedAt = body.deleted ? new Date() : null;
  }

  return update;
}

function actionUpdate(action: string): Record<string, boolean | Date | null> {
  switch (action) {
    case 'read':
      return { read: true, readAt: new Date() };
    case 'unread':
      return { read: false, readAt: null };
    case 'delete':
      return { deleted: true, deletedAt: new Date() };
    case 'restore':
      return { deleted: false, deletedAt: null };
    default:
      return {};
  }
}

function modifiedCount(result: { modifiedCount?: number }): number {
  return result.modifiedCount ?? 0;
}

function deletedCount(result: { deletedCount?: number }): number {
  return result.deletedCount ?? 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * GET /api/admin/inbox
 *
 * A read-model and command gateway for message sources that already have their
 * own schemas. It does not own or duplicate Contact or Support persistence.
 */
export async function GET(req: NextRequest) {
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response ?? NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    await connectToDatabase();

    const { searchParams } = new URL(req.url);
    const page = readPositiveInteger(searchParams.get('page'), 1, MAX_PAGE_NUMBER);
    const limit = readPositiveInteger(searchParams.get('limit'), 10, MAX_PAGE_SIZE);
    const filter = buildInboxFilter(searchParams.get('read'), searchParams.get('deleted'));
    const skip = (page - 1) * limit;

    const [result] = await Contact.aggregate<{
      messages: Array<Record<string, unknown>>;
      total: Array<{ count: number }>;
    }>([
      { $match: filter },
      {
        $project: {
          _id: { $toString: '$_id' },
          source: { $literal: 'contact' },
          name: 1,
          email: 1,
          subject: 1,
          message: 1,
          createdAt: 1,
          read: { $ifNull: ['$read', false] },
          deleted: { $ifNull: ['$deleted', false] },
          deletedAt: 1,
          organizationName: { $literal: null },
          telephone: { $literal: null },
          budget: { $literal: null },
        },
      },
      {
        $unionWith: {
          coll: Support.collection.name,
          pipeline: [
            { $match: filter },
            {
              $project: {
                _id: { $concat: [SUPPORT_ID_PREFIX, { $toString: '$_id' }] },
                source: { $literal: 'support' },
                name: '$FullName',
                email: 1,
                subject: { $concat: ['Support request: ', { $ifNull: ['$Help', 'General'] }] },
                message: 1,
                createdAt: 1,
                read: { $ifNull: ['$read', false] },
                deleted: { $ifNull: ['$deleted', false] },
                deletedAt: 1,
                organizationName: '$OrganizationName',
                telephone: 1,
                budget: { $ifNull: ['$budget', null] },
              },
            },
          ],
        },
      },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $facet: {
          messages: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: 'count' }],
        },
      },
    ]);

    const messages = result?.messages ?? [];
    const total = result?.total[0]?.count ?? 0;

    return NextResponse.json({
      ok: true,
      messages,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching admin inbox:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to fetch inbox messages' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/inbox
 *
 * Single-item body: { id, read?: boolean, deleted?: boolean }
 * Bulk body: { ids, action: 'read' | 'unread' | 'delete' | 'restore' | 'permanent-delete' }
 */
export async function PATCH(req: NextRequest) {
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response ?? NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON payload' }, { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ ok: false, message: 'Invalid payload' }, { status: 400 });
  }

  try {
    await connectToDatabase();

    if ('id' in body) {
      const parsed = parseInboxId(body.id);
      const update = statusUpdate(body);

      if (!parsed || Object.keys(update).length === 0) {
        return NextResponse.json({ ok: false, message: 'Invalid payload' }, { status: 400 });
      }

      const updated = parsed.source === 'support'
        ? await Support.findByIdAndUpdate(parsed.id, { $set: update }, { new: true })
        : await Contact.findByIdAndUpdate(parsed.id, { $set: update }, { new: true });

      if (!updated) {
        return NextResponse.json({ ok: false, message: 'Message not found' }, { status: 404 });
      }

      return NextResponse.json({
        ok: true,
        message: {
          _id: parsed.source === 'support' ? `${SUPPORT_ID_PREFIX}${parsed.id}` : parsed.id,
          source: parsed.source,
          read: updated.read ?? false,
          deleted: updated.deleted ?? false,
        },
      });
    }

    const action = body.action;
    const ids = splitInboxIds(body.ids);
    if (typeof action !== 'string' || !BULK_ACTIONS.has(action) || !ids) {
      return NextResponse.json({ ok: false, message: 'Invalid bulk action' }, { status: 400 });
    }

    if (action === 'permanent-delete') {
      const [contactResult, supportResult] = await Promise.all([
        ids.contactIds.length > 0 ? Contact.deleteMany({ _id: { $in: ids.contactIds } }) : Promise.resolve({ deletedCount: 0 }),
        ids.supportIds.length > 0 ? Support.deleteMany({ _id: { $in: ids.supportIds } }) : Promise.resolve({ deletedCount: 0 }),
      ]);

      return NextResponse.json({
        ok: true,
        action,
        deletedCount: deletedCount(contactResult) + deletedCount(supportResult),
      });
    }

    const update = actionUpdate(action);
    const [contactResult, supportResult] = await Promise.all([
      ids.contactIds.length > 0
        ? Contact.updateMany({ _id: { $in: ids.contactIds } }, { $set: update })
        : Promise.resolve({ modifiedCount: 0 }),
      ids.supportIds.length > 0
        ? Support.updateMany({ _id: { $in: ids.supportIds } }, { $set: update })
        : Promise.resolve({ modifiedCount: 0 }),
    ]);

    return NextResponse.json({
      ok: true,
      action,
      modifiedCount: modifiedCount(contactResult) + modifiedCount(supportResult),
    });
  } catch (error) {
    console.error('Error updating admin inbox:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to update inbox messages' },
      { status: 500 },
    );
  }
}
