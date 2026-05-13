import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { applyCommand } from '@/lib/thinkforge/services/command-service';
import * as db from '@/lib/thinkforge/services/db';
import { z } from 'zod';

// V2: Block-level validation — checks kind enum when present, allows extra fields
const ThinkForgeBlockSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(['header', 'action', 'why', 'example', 'paragraph', 'scene', 'editorial']).optional(),
  content: z.array(z.any()).optional(),
}).passthrough();

const SaveScriptSchema = z.object({
  sessionId: z.string().min(1),
  scriptId: z.string().optional(),
  baseVersion: z.number().optional(),
  script: z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    blocks: z.array(ThinkForgeBlockSchema).optional(),
    richText: z.any().optional(),
  }).passthrough().optional(),
}).passthrough();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Save script for a session
 * POST /api/services/thinkforge/script/save
 * 
 * Accepts script object with:
 * - title: Script title
 * - content: Plain text content
 * - blocks: ThinkForgeBlock[] (legacy format)
 * - richText: Tiptap JSON AST (new format)
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SaveScriptSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });
  }
  const { sessionId, scriptId, baseVersion, script } = parsed.data;

  try {
    let effectiveBaseVersion = typeof baseVersion === 'number' ? baseVersion : undefined;
    if (effectiveBaseVersion === undefined) {
      const existing = await db.getScript(sessionId, scriptId || null);
      effectiveBaseVersion = existing?.version ?? 0;
    }
    const result = await applyCommand({
      type: 'ReplaceDocument',
      sessionId,
      baseVersion: effectiveBaseVersion,
      source: 'user',
      payload: {
        scriptId,
        title: script?.title || 'Untitled Script',
        content: script?.content || '',
        blocks: script?.blocks || [],
        richText: script?.richText,
      }
    }, userId);

    if (!result.ok) {
      const status = result.error === 'Version conflict' ? 409 : result.error === 'Session not found' ? 404 : 400;
      return NextResponse.json({ error: result.error, currentVersion: result.currentVersion }, { status });
    }

    return NextResponse.json({
      success: true,
      script: {
        scriptId: result.script.scriptId || scriptId || 'default',
        title: result.script.title,
        content: result.script.content,
        blocks: result.script.blocks || [],
        richText: result.script.richText || null,
        version: result.script.version ?? 1,
      }
    });
  } catch (error: any) {
    console.error('Error saving script:', error);
    return NextResponse.json(
      { error: 'Failed to save script', details: error?.message },
      { status: 500 }
    );
  }
}
