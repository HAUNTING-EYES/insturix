import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { LONG_FORM_SCRIPT_GENERATION_INTENT } from '@/lib/thinkforge/long-form/script-generation-job-contract';
import {
  longFormScriptGenerationJobStore,
  type LongFormScriptGenerationJobSnapshot,
} from '@/lib/thinkforge/long-form/script-generation-job-store';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHAT_EXECUTION_BUDGET_MS = 300_000;
const WATCHDOG_GRACE_MS = 30_000;
const STALE_AFTER_MS = CHAT_EXECUTION_BUDGET_MS + WATCHDOG_GRACE_MS;

function longFormProgress(job: LongFormScriptGenerationJobSnapshot): {
  progress: number;
  message: string;
} {
  const chapterTotal = job.plan?.acts.reduce((total, act) => total + act.chapters.length, 0) ?? 0;
  const chapterCompleted = Object.keys(job.chapterArtifacts).length;
  if (job.stage === 'planning') return { progress: 0.05, message: 'Planning the complete narrative' };
  if (job.stage === 'writing') {
    const progress = chapterTotal > 0
      ? 0.1 + (0.75 * Math.min(chapterCompleted, chapterTotal) / chapterTotal)
      : 0.1;
    const message = chapterTotal > 0
      ? `Writing chapter ${Math.min(chapterCompleted + 1, chapterTotal)} of ${chapterTotal}`
      : 'Writing the planned chapters';
    return { progress, message };
  }
  if (job.stage === 'assembling') return { progress: 0.9, message: 'Assembling and validating the complete script' };
  return { progress: 0.97, message: 'Saving the complete script' };
}

async function reconcileLongFormGeneration(
  sessionId: string,
  generation: db.GenerationState,
  job: LongFormScriptGenerationJobSnapshot,
): Promise<db.GenerationState | null> {
  if (job.status === 'queued' || job.status === 'running') {
    const progress = longFormProgress(job);
    return {
      ...generation,
      ...progress,
      updatedAt: new Date(job.updatedAt),
    };
  }

  const terminalUpdate: Partial<db.GenerationState> = job.status === 'completed'
    ? { status: 'completed', progress: 1, message: 'Long-form script ready' }
    : job.status === 'cancelled'
      ? { status: 'cancelled', message: 'Cancelled by user' }
      : {
        status: 'failed',
        message: job.error?.message || 'Long-form script generation failed before it could be saved.',
      };
  try {
    return await db.updateGenerationState(sessionId, generation.id, terminalUpdate);
  } catch (error) {
    if (!(error instanceof db.GenerationStateConflictError)) throw error;
    return db.getActiveGeneration(sessionId);
  }
}

export async function GET(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId')?.trim();

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    const session = await db.getSession(sessionId, userId, orgId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const canonicalSessionId = session._id;
    let generation = await db.getActiveGeneration(canonicalSessionId);
    let script: Awaited<ReturnType<typeof db.getScript>> = null;

    if (generation && generation.status === 'running') {
      const isLongForm = generation.intent === LONG_FORM_SCRIPT_GENERATION_INTENT;
      const longFormJob = isLongForm
        ? await longFormScriptGenerationJobStore.getByGenerationAuthorized(
          canonicalSessionId,
          generation.id,
          userId,
          orgId ?? null,
        )
        : null;
      if (longFormJob) {
        generation = await reconcileLongFormGeneration(canonicalSessionId, generation, longFormJob);
      }
      if (!generation) {
        return NextResponse.json({ generation: null, script: null });
      }

      const updatedAt = generation.updatedAt ? new Date(generation.updatedAt).getTime() : 0;
      const startedAt = generation.startedAt ? new Date(generation.startedAt).getTime() : 0;
      const lastActivity = Math.max(updatedAt, startedAt);
      if (
        generation.status === 'running'
        && !longFormJob
        && lastActivity
        && Date.now() - lastActivity > STALE_AFTER_MS
      ) {
        const message = isLongForm
          ? 'Long-form generation could not recover its durable job. Please try again.'
          : 'Generation timed out before a script could be saved. Please try again.';
        console.error('[ThinkForge] Generation watchdog timed out', {
          generationId: generation.id,
          age: Date.now() - lastActivity,
          type: generation.type,
          intent: generation.intent,
        });
        try {
          generation = await db.updateGenerationState(canonicalSessionId, generation.id, {
            status: 'failed',
            message,
          });
        } catch (error) {
          if (!(error instanceof db.GenerationStateConflictError)) throw error;
          generation = await db.getActiveGeneration(canonicalSessionId);
        }
      }
    }

    if (
      generation &&
      generation.status === 'completed' &&
      (generation.type === 'script_generate' || generation.type === 'script_edit')
    ) {
      const generationScriptId = typeof generation.scriptId === 'string' && generation.scriptId.trim()
        ? generation.scriptId.trim()
        : null;
      if (generationScriptId) {
        script = await db.getScript(canonicalSessionId, generationScriptId);
      }
    }

    return NextResponse.json({ generation: generation || null, script });
  } catch (error) {
    console.error('[ThinkForge] Generation status error:', error);
    return NextResponse.json({ error: 'Failed to fetch generation status' }, { status: 500 });
  }
}
