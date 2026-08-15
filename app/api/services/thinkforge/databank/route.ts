import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
    addGovernedDataBankEntry,
    getDataBankEntries,
    getDataBankEntriesByUser,
    getDataBankEntry,
    getProjectScopedEntries,
    getSession,
    deleteDataBankEntry,
    promoteEntryToGlobal,
    type DataBankEntryType,
    type DataBankScope,
} from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_TYPES: DataBankEntryType[] = [
    'url_brief', 'note', 'reference', 'research',
    'atomic_fact', 'brand_insight', 'rejection_pattern',
];
const PROMOTABLE_TYPES = new Set<DataBankEntryType>(['brand_insight', 'rejection_pattern']);
const DIRECT_GLOBAL_WRITE_ERROR =
    'Direct global DataBank writes are not allowed. Save project-scoped content and promote it from a trusted outcome or explicit owner action.';

/**
 * DataBank API - tiered knowledge storage
 *
 * GET  /api/services/thinkforge/databank?sessionId=xxx[&type=url_brief]
 * GET  /api/services/thinkforge/databank?scope=user[&type=atomic_fact&limit=50]
 * POST /api/services/thinkforge/databank
 * DELETE /api/services/thinkforge/databank?id=xxx
 */

export async function GET(req: Request) {
    const { userId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope');
    const sessionId = searchParams.get('sessionId');
    const type = searchParams.get('type') as DataBankEntryType | null;
    const limit = searchParams.get('limit');
    const tags = searchParams.get('tags');

    const dataScope = searchParams.get('dataScope') as DataBankScope | null;

    try {
        if (dataScope === 'global') {
            const entries = await getDataBankEntriesByUser(userId, {
                type: type || undefined,
                tags: tags ? tags.split(',') : undefined,
                scope: 'global',
                limit: limit ? parseInt(limit, 10) : undefined,
            });
            return NextResponse.json({ entries });
        }

        if (dataScope === 'project' && sessionId) {
            const entries = await getProjectScopedEntries(userId, sessionId, {
                type: type || undefined,
                limit: limit ? parseInt(limit, 10) : undefined,
            });
            return NextResponse.json({ entries });
        }

        if (scope === 'user') {
            const entries = await getDataBankEntriesByUser(userId, {
                type: type || undefined,
                tags: tags ? tags.split(',') : undefined,
                limit: limit ? parseInt(limit, 10) : undefined,
            });
            return NextResponse.json({ entries });
        }

        if (!sessionId) {
            return NextResponse.json({ error: 'Missing sessionId or scope=user' }, { status: 400 });
        }

        const entries = await getDataBankEntries(sessionId, userId, type || undefined);
        return NextResponse.json({ entries });
    } catch (error: any) {
        console.error('Error fetching databank entries:', error);
        return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const { userId, orgId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { type, title, content, sourceUrl, sourceEntryId, tags, scope: bodyScope } = body;
    const sessionId = nonEmptyString(body.sessionId);

    if (!type || !title) {
        return NextResponse.json(
            { error: 'Missing required fields: type, title' },
            { status: 400 },
        );
    }

    if (!VALID_TYPES.includes(type)) {
        return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }

    if (bodyScope === 'global') {
        return NextResponse.json({ error: DIRECT_GLOBAL_WRITE_ERROR }, { status: 400 });
    }

    if (!sessionId) {
        return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    try {
        const session = await getSession(sessionId, userId, orgId);
        if (!session) {
            return NextResponse.json({ error: 'Session not found or unavailable to this actor' }, { status: 404 });
        }

        const entry = await addGovernedDataBankEntry({ userId, orgId }, sessionId, {
            type,
            title,
            content: content || {},
            sourceUrl,
            sourceEntryId,
            tags: normalizeTags(tags),
            projectId: sessionId,
            scope: 'project',
            memoryScope: 'project',
            governance: {
                classification: 'business_confidential',
                consentStatus: 'not_required',
            },
        });
        return NextResponse.json({ entry }, { status: 201 });
    } catch (error: any) {
        console.error('Error creating databank entry:', error);
        return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    const { userId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const { id, action } = body;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    try {
        if (action === 'promote') {
            const entry = await getDataBankEntry(id, userId);
            if (!entry) {
                return NextResponse.json({ error: 'Entry not found or not owned by user' }, { status: 404 });
            }
            if (entry.scope === 'global') {
                return NextResponse.json({ success: true, action: 'already_global' });
            }
            if (!PROMOTABLE_TYPES.has(entry.type)) {
                return NextResponse.json(
                    { error: 'Only brand_insight or rejection_pattern entries can be promoted globally' },
                    { status: 400 },
                );
            }
            await promoteEntryToGlobal(id);
            return NextResponse.json({ success: true });
        }
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (error: any) {
        console.error('Error patching databank entry:', error);
        return NextResponse.json({ error: 'Failed to patch entry' }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    const { userId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    try {
        const deleted = await deleteDataBankEntry(id, userId);
        if (!deleted) {
            return NextResponse.json({ error: 'Entry not found or not owned by user' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting databank entry:', error);
        return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 });
    }
}

function nonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
        ? value.trim()
        : undefined;
}

function normalizeTags(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const tags = value
        .map((tag) => nonEmptyString(tag))
        .filter((tag): tag is string => Boolean(tag));
    return tags.length > 0 ? tags : undefined;
}
