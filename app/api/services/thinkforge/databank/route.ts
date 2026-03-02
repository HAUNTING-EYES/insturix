import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
    addDataBankEntry,
    getDataBankEntries,
    deleteDataBankEntry,
} from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DataBank API - per-session research storage
 * 
 * GET  /api/services/thinkforge/databank?sessionId=xxx[&type=url_brief]
 * POST /api/services/thinkforge/databank
 * DELETE /api/services/thinkforge/databank?id=xxx
 */

export async function GET(req: Request) {
    const { userId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    const type = searchParams.get('type') as any;

    if (!sessionId) {
        return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    try {
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

    const { sessionId, type, title, content, sourceUrl, tags } = body;

    if (!sessionId || !type || !title) {
        return NextResponse.json(
            { error: 'Missing required fields: sessionId, type, title' },
            { status: 400 }
        );
    }

    if (!['url_brief', 'note', 'reference', 'research'].includes(type)) {
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    try {
        const entry = await addDataBankEntry(sessionId, userId, {
            type,
            title,
            content: content || {},
            sourceUrl,
            tags,
        });
        return NextResponse.json({ entry }, { status: 201 });
    } catch (error: any) {
        console.error('Error creating databank entry:', error);
        return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 });
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
