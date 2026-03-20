import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
    addDataBankEntry,
    getDataBankEntries,
    getDataBankEntriesByUser,
    getProjectScopedEntries,
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
    const { userId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { sessionId, projectId, type, title, content, sourceUrl, sourceEntryId, tags, scope: bodyScope } = body;

    if (!type || !title) {
        return NextResponse.json(
            { error: 'Missing required fields: type, title' },
            { status: 400 },
        );
    }

    if (!VALID_TYPES.includes(type)) {
        return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }

    try {
        const entry = await addDataBankEntry(sessionId || '', userId, {
            type,
            title,
            content: content || {},
            sourceUrl,
            sourceEntryId,
            tags,
            projectId,
            scope: bodyScope === 'global' ? 'global' : 'project',
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
