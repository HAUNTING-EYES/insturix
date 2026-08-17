import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import {
    addGovernedDataBankEntry,
    assertDataBankSessionPrincipal,
    deleteAuthorizedDataBankEntry,
    getAuthorizedDataBankEntries,
    getAuthorizedDataBankReviewCandidates,
    getAuthorizedProjectScopedEntries,
    getSession,
    promoteAuthorizedDataBankEntryToGlobal,
    reviewAuthorizedDataBankEntry,
    type DataBankEntryType,
} from '@/lib/thinkforge/services/db';
import { authorizeBrandScope, BrandScopeAuthorizationError } from '@/lib/shared/brand-scope';
import { inspectDataForStorage } from '@/lib/thinkforge/privacy/provider-privacy-gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_TYPES = [
    'url_brief', 'note', 'reference', 'research',
    'atomic_fact', 'brand_insight', 'rejection_pattern',
] as const satisfies readonly DataBankEntryType[];
const MAX_REQUEST_BYTES = 128_000;
const DIRECT_GLOBAL_WRITE_ERROR =
    'Direct global DataBank writes are not allowed. Save project-scoped content and promote it from a trusted outcome or explicit owner action.';

const DataBankPostSchema = z.object({
    sessionId: z.string().trim().min(1).max(200),
    type: z.enum(VALID_TYPES),
    title: z.string().trim().min(1).max(500),
    content: z.record(z.string(), z.unknown()).default({}),
    sourceUrl: z.string().trim().url().max(2_048).optional(),
    sourceEntryId: z.string().trim().min(1).max(200).optional(),
    tags: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
    scope: z.enum(['project', 'global']).optional(),
}).strict();

const DataBankPatchSchema = z.discriminatedUnion('action', [
    z.object({
        id: z.string().trim().min(1).max(200),
        action: z.literal('promote'),
        target: z.discriminatedUnion('memoryScope', [
            z.object({ memoryScope: z.literal('brand'), brandId: z.string().trim().min(1).max(200) }).strict(),
            z.object({ memoryScope: z.literal('universal') }).strict(),
        ]),
    }).strict(),
    z.object({
        id: z.string().trim().min(1).max(200),
        action: z.literal('review'),
        decision: z.enum(['approved', 'rejected']),
    }).strict(),
]);

/**
 * DataBank API - tiered knowledge storage
 *
 * GET  /api/services/thinkforge/databank?sessionId=xxx[&type=url_brief]
 * GET  /api/services/thinkforge/databank?scope=user[&type=atomic_fact&limit=50]
 * POST /api/services/thinkforge/databank
 * DELETE /api/services/thinkforge/databank?id=xxx
 */

export async function GET(req: Request) {
    const { userId, orgId, has } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope');
    const sessionId = searchParams.get('sessionId');
    const rawType = searchParams.get('type');
    const type = isDataBankEntryType(rawType) ? rawType : undefined;
    const limit = parseDataBankLimit(searchParams.get('limit'));
    const tags = parseQueryTags(searchParams.get('tags'));
    const dataScope = searchParams.get('dataScope');
    const reviewStatus = searchParams.get('reviewStatus');
    const principal = { userId, orgId: orgId ?? null };

    if (rawType && !type) {
        return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }
    if (limit === null) {
        return NextResponse.json({ error: 'limit must be an integer between 1 and 500' }, { status: 400 });
    }
    if (tags === null) {
        return NextResponse.json({ error: 'tags must contain at most 50 non-empty values' }, { status: 400 });
    }
    if (scope && scope !== 'user') {
        return NextResponse.json({ error: 'scope must be user when provided' }, { status: 400 });
    }
    if (dataScope && dataScope !== 'global' && dataScope !== 'project') {
        return NextResponse.json({ error: 'dataScope must be global or project' }, { status: 400 });
    }
    if (reviewStatus && reviewStatus !== 'pending') {
        return NextResponse.json({ error: 'reviewStatus must be pending when provided' }, { status: 400 });
    }

    try {
        if (reviewStatus === 'pending') {
            if (orgId && !has({ role: 'org:admin' })) {
                return NextResponse.json({ error: 'Organization memory review requires an administrator' }, { status: 403 });
            }
            const entries = await getAuthorizedDataBankReviewCandidates(principal, { sessionId: sessionId ?? undefined, limit });
            return NextResponse.json({ entries });
        }

        if (dataScope === 'global') {
            const entries = await getAuthorizedDataBankEntries(principal, {
                type,
                tags,
                scope: 'global',
                limit,
            });
            return NextResponse.json({ entries });
        }

        if (dataScope === 'project') {
            if (!sessionId) {
                return NextResponse.json({ error: 'Project reads require sessionId' }, { status: 400 });
            }
            const entries = await getAuthorizedProjectScopedEntries(principal, sessionId, {
                type,
                limit,
            });
            return NextResponse.json({ entries });
        }

        if (scope === 'user') {
            const entries = await getAuthorizedDataBankEntries(principal, {
                type,
                tags,
                limit,
            });
            return NextResponse.json({ entries });
        }

        if (!sessionId) {
            return NextResponse.json({ error: 'Missing sessionId or scope=user' }, { status: 400 });
        }

        const entries = await getAuthorizedProjectScopedEntries(principal, sessionId, { type, limit });
        return NextResponse.json({ entries });
    } catch (error) {
        console.error('Error fetching databank entries:', error);
        return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const { userId, orgId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const parsedBody = await parseBoundedJson(req, DataBankPostSchema);
    if (!parsedBody.ok) return parsedBody.response;
    const { sessionId, type, title, content, sourceUrl, sourceEntryId, tags, scope } = parsedBody.value;
    if (scope === 'global') {
        return NextResponse.json({ error: DIRECT_GLOBAL_WRITE_ERROR }, { status: 400 });
    }
    const storageInspection = inspectDataForStorage({
        text: JSON.stringify({ title, content, sourceUrl: sourceUrl ?? null }),
        declaredPrivacyClass: 'business_confidential',
    });
    if (storageInspection.privacyClass === 'child_data') {
        return NextResponse.json({ error: 'Child data cannot be stored in ThinkForge memory' }, { status: 422 });
    }
    if (storageInspection.containsPersonalData || storageInspection.privacyClass === 'personal') {
        return NextResponse.json({ error: 'Personal data requires an explicit consent flow before storage' }, { status: 422 });
    }

    try {
        const session = await getSession(sessionId, userId, orgId);
        if (!session) {
            return NextResponse.json({ error: 'Session not found or unavailable to this actor' }, { status: 404 });
        }
        try {
            assertDataBankSessionPrincipal({ userId, orgId }, session);
        } catch {
            return NextResponse.json({ error: 'Session not found or unavailable to this actor' }, { status: 404 });
        }
        const brandId = nonEmptyString(session.projectMeta?.brandId);

        const entry = await addGovernedDataBankEntry({ userId, orgId }, sessionId, {
            type,
            title,
            content: content || {},
            sourceUrl,
            sourceEntryId,
            tags,
            projectId: sessionId,
            scope: 'project',
            memoryScope: 'project',
            ...(brandId ? { brandId } : {}),
            governance: {
                classification: 'business_confidential',
                consentStatus: 'not_required',
            },
        });
        return NextResponse.json({ entry }, { status: 201 });
    } catch (error) {
        console.error('Error creating databank entry:', error);
        return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    const { userId, orgId, has } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const parsedBody = await parseBoundedJson(req, DataBankPatchSchema);
    if (!parsedBody.ok) return parsedBody.response;
    const patch = parsedBody.value;
    const principal = { userId, orgId: orgId ?? null };

    try {
        if (patch.action === 'review') {
            if (orgId && !has({ role: 'org:admin' })) {
                return NextResponse.json({ error: 'Organization memory review requires an administrator' }, { status: 403 });
            }
            const result = await reviewAuthorizedDataBankEntry(patch.id, principal, patch.decision);
            if (result === 'approved' || result === 'rejected') {
                return NextResponse.json({ success: true, action: 'reviewed', decision: result });
            }
            if (result === 'not_found') {
                return NextResponse.json({ error: 'Entry not found in this workspace' }, { status: 404 });
            }
            return NextResponse.json({ error: 'Entry is not awaiting review' }, { status: 409 });
        }

        const { id, target } = patch;
        if (target.memoryScope === 'brand') {
            await authorizeBrandScope({
                userId,
                orgId: orgId ?? null,
                isOrgAdmin: Boolean(orgId && has({ role: 'org:admin' })),
                brandId: target.brandId,
            });
        }
        const result = await promoteAuthorizedDataBankEntryToGlobal(id, principal, target);
        if (result === 'promoted') return NextResponse.json({ success: true, action: 'promoted' });
        if (result === 'already_global') return NextResponse.json({ success: true, action: 'already_global' });
        if (result === 'not_found') {
            return NextResponse.json({ error: 'Entry not found in this workspace' }, { status: 404 });
        }
        if (result === 'not_promotable') {
            return NextResponse.json(
                { error: 'Only brand_insight or rejection_pattern entries can be promoted globally' },
                { status: 400 },
            );
        }
        return NextResponse.json({ error: `Promotion rejected: ${result}` }, { status: 409 });
    } catch (error) {
        if (error instanceof BrandScopeAuthorizationError) {
            const status = error.code === 'brand_scope_unavailable' ? 503 : 404;
            return NextResponse.json({ error: error.message, code: error.code }, { status });
        }
        console.error('Error patching databank entry:', error);
        return NextResponse.json({ error: 'Failed to patch entry' }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    const { userId, orgId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = nonEmptyString(searchParams.get('id'));

    if (!id || id.length > 200) {
        return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    try {
        const deleted = await deleteAuthorizedDataBankEntry(id, { userId, orgId: orgId ?? null });
        if (!deleted) {
            return NextResponse.json({ error: 'Entry not found in this workspace' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting databank entry:', error);
        return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 });
    }
}

function nonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
        ? value.trim()
        : undefined;
}

function isDataBankEntryType(value: string | null): value is DataBankEntryType {
    return value !== null && (VALID_TYPES as readonly string[]).includes(value);
}

function parseDataBankLimit(value: string | null): number | undefined | null {
    if (value === null) return undefined;
    if (!/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 500 ? parsed : null;
}

function parseQueryTags(value: string | null): string[] | undefined | null {
    if (value === null) return undefined;
    const tags = [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))];
    return tags.length > 0 && tags.length <= 50 && tags.every((tag) => tag.length <= 100)
        ? tags
        : null;
}

async function parseBoundedJson<T>(
    req: Request,
    schema: z.ZodType<T>,
): Promise<{ ok: true; value: T } | { ok: false; response: NextResponse }> {
    let raw: string;
    try {
        raw = await req.text();
    } catch {
        return { ok: false, response: NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) };
    }
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
        return { ok: false, response: NextResponse.json({ error: 'Request body is too large' }, { status: 413 }) };
    }
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return { ok: false, response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) };
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
        return {
            ok: false,
            response: NextResponse.json({
                error: 'Invalid request body',
                issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
            }, { status: 400 }),
        };
    }
    return { ok: true, value: parsed.data };
}
