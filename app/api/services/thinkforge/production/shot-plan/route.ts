import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  buildScriptShotPlan,
  SHOOT_KIT_ASPECT_RATIOS,
} from '@/lib/thinkforge/production/build-script-shot-plan';
import {
  ProductionCapabilityProfileSchema,
  type ProductionCapabilityProfile,
} from '@/lib/thinkforge/production/production-capability-profile';
import {
  requireCurrentPersistedScriptSidecar,
  ThinkForgeScriptSidecarAuthorityError,
} from '@/lib/thinkforge/persistence/script-sidecar-reader';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ShotPlanSettingsSchema = z.object({
  aspectRatio: z.enum(SHOOT_KIT_ASPECT_RATIOS),
  tier: z.enum(['no-spend', 'minimum-upgrade', 'enhanced']),
}).strict();

const SaveShotPlanRequestSchema = z.object({
  sessionId: z.string().trim().min(1),
  scriptId: z.string().trim().min(1),
  profile: ProductionCapabilityProfileSchema,
  settings: ShotPlanSettingsSchema,
}).strict();

type ShotPlanSettings = z.infer<typeof ShotPlanSettingsSchema>;

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function buildPlanPayload(
  script: Awaited<ReturnType<typeof db.getScript>>,
  profile: ProductionCapabilityProfile,
  settings: ShotPlanSettings,
) {
  let authority;
  try {
    authority = requireCurrentPersistedScriptSidecar({
      metadata: script?.metadata,
      documentContent: typeof script?.content === 'string' ? script.content : '',
      documentVersion: typeof script?.version === 'number' ? script.version : 0,
    });
  } catch (error) {
    if (!(error instanceof ThinkForgeScriptSidecarAuthorityError)) throw error;
    return {
      status: 'needs-user-input' as const,
      profile,
      settings,
      plan: null,
      issues: [{
        code: error.code,
        message: error.message,
        questions: ['Regenerate or revise this script to refresh its production contract.'],
      }],
    };
  }

  if (!authority) {
    return {
      status: 'needs-user-input' as const,
      profile,
      settings,
      plan: null,
      issues: [{
        code: 'missing_script_sidecar',
        message: 'This document has no production-aware script sidecar.',
        questions: ['Generate or revise a video script before opening its Shoot Kit.'],
      }],
    };
  }

  const result = buildScriptShotPlan({
    sidecar: authority.rawSidecar,
    profile,
    aspectRatio: settings.aspectRatio,
    tier: settings.tier,
  });
  return { ...result, profile, settings };
}

export async function GET(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId')?.trim();
  const scriptId = url.searchParams.get('scriptId')?.trim();
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  if (!scriptId) return NextResponse.json({ error: 'Missing scriptId' }, { status: 400 });

  const session = await db.getSession(sessionId, userId, orgId);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  const script = await db.getScript(session._id, scriptId);
  if (!script) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const projectMeta = recordOf(session.projectMeta) ?? {};
  const profileResult = ProductionCapabilityProfileSchema.safeParse(
    projectMeta.productionCapabilityProfile,
  );
  const settingsResult = ShotPlanSettingsSchema.safeParse(projectMeta.productionShotSettings);
  if (!profileResult.success) {
    return NextResponse.json({
      status: 'needs-profile',
      profile: null,
      settings: settingsResult.success ? settingsResult.data : null,
      plan: null,
      issues: [],
    });
  }
  if (!settingsResult.success) {
    return NextResponse.json({
      status: 'needs-user-input',
      profile: profileResult.data,
      settings: null,
      plan: null,
      issues: [{
        code: 'missing_shot_settings',
        message: 'Choose an aspect ratio and production tier for this Shoot Kit.',
        questions: ['Which aspect ratio and spending tier should this shoot use?'],
      }],
    });
  }

  try {
    return NextResponse.json(buildPlanPayload(
      script,
      profileResult.data,
      settingsResult.data,
    ));
  } catch (error) {
    return NextResponse.json({
      error: 'Invalid production contract',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 422 });
  }
}

export async function POST(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = SaveShotPlanRequestSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({
      error: 'Invalid production request',
      details: parsed.error.issues,
    }, { status: 400 });
  }

  const { sessionId, scriptId, profile, settings } = parsed.data;
  const session = await db.getSession(sessionId, userId, orgId);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  const script = await db.getScript(session._id, scriptId);
  if (!script) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  await db.setSessionProductionConfiguration(String(session._id), {
    capabilityProfile: profile,
    shotSettings: settings,
  });

  try {
    return NextResponse.json(buildPlanPayload(script, profile, settings));
  } catch (error) {
    return NextResponse.json({
      error: 'Invalid production contract',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 422 });
  }
}
