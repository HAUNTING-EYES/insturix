import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  buildScriptShotPlan,
} from '@/lib/thinkforge/production/build-script-shot-plan';
import {
  ProductionCapabilityProfileSchema,
  type ProductionCapabilityProfile,
} from '@/lib/thinkforge/production/production-capability-profile';
import {
  APPROVED_SHOOT_KIT_SNAPSHOT_METADATA_KEY,
  createApprovedShootKitSnapshot,
  ShootKitSettingsSchema,
  verifyApprovedShootKitSnapshot,
  type ShootKitSettings,
} from '@/lib/thinkforge/production/shoot-kit-snapshot';
import {
  requireCurrentPersistedScriptSidecar,
  ThinkForgeScriptSidecarAuthorityError,
  type AuthoritativePersistedScriptSidecar,
} from '@/lib/thinkforge/persistence/script-sidecar-reader';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SaveShotPlanRequestSchema = z.object({
  sessionId: z.string().trim().min(1),
  scriptId: z.string().trim().min(1),
  expectedDocumentVersion: z.number().int().positive(),
  profile: ProductionCapabilityProfileSchema,
  settings: ShootKitSettingsSchema,
}).strict();

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function documentVersion(script: Awaited<ReturnType<typeof db.getScript>>): number {
  return typeof script?.version === 'number' && Number.isInteger(script.version) && script.version > 0
    ? script.version
    : 0;
}

function resolveSidecarAuthority(
  script: Awaited<ReturnType<typeof db.getScript>>,
): { authority: AuthoritativePersistedScriptSidecar; issue?: never } | {
  authority?: never;
  issue: { code: string; message: string; questions: string[] };
} {
  try {
    const authority = requireCurrentPersistedScriptSidecar({
      metadata: script?.metadata,
      documentContent: typeof script?.content === 'string' ? script.content : '',
      documentVersion: documentVersion(script),
    });
    if (authority) return { authority };
    return {
      issue: {
        code: 'missing_script_sidecar',
        message: 'This document has no production-aware script sidecar.',
        questions: ['Generate or revise a video script before opening its Shoot Kit.'],
      },
    };
  } catch (error) {
    if (!(error instanceof ThinkForgeScriptSidecarAuthorityError)) throw error;
    return {
      issue: {
        code: error.code,
        message: error.message,
        questions: ['Regenerate or revise this script to refresh its production contract.'],
      },
    };
  }
}

function previewApproval(reason: string) {
  return { status: 'preview' as const, reason };
}

function buildPlanPayload(input: {
  authority: AuthoritativePersistedScriptSidecar;
  profile: ProductionCapabilityProfile;
  settings: ShootKitSettings;
  documentVersion: number;
  approvalReason: string;
}) {
  const result = buildScriptShotPlan({
    sidecar: input.authority.rawSidecar,
    profile: input.profile,
    aspectRatio: input.settings.aspectRatio,
    tier: input.settings.tier,
  });
  return {
    ...result,
    profile: input.profile,
    settings: input.settings,
    documentVersion: input.documentVersion,
    approval: previewApproval(input.approvalReason),
  };
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
  const canonicalSessionId = String(session._id);
  const script = await db.getScript(canonicalSessionId, scriptId);
  if (!script) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  const currentDocumentVersion = documentVersion(script);
  if (currentDocumentVersion === 0) {
    return NextResponse.json({ error: 'Invalid document version' }, { status: 422 });
  }

  const sidecarResolution = resolveSidecarAuthority(script);
  const metadata = recordOf(script.metadata) ?? {};
  const storedSnapshot = metadata[APPROVED_SHOOT_KIT_SNAPSHOT_METADATA_KEY];
  let approvalReason = 'snapshot_missing';
  if (sidecarResolution.authority) {
    const verification = verifyApprovedShootKitSnapshot({
      snapshot: storedSnapshot,
      sessionId: canonicalSessionId,
      scriptId,
      documentVersion: currentDocumentVersion,
      documentHash: sidecarResolution.authority.binding.documentHash,
      sidecarHash: sidecarResolution.authority.binding.sidecarHash,
    });
    if (verification.current) {
      const snapshot = verification.snapshot;
      return NextResponse.json({
        status: 'ready',
        profile: snapshot.profile,
        settings: snapshot.settings,
        plan: snapshot.plan,
        issues: [],
        documentVersion: currentDocumentVersion,
        approval: {
          status: 'approved',
          snapshotHash: snapshot.snapshotHash,
          approvedAt: snapshot.approvedAt,
          approvedBy: snapshot.approvedBy,
        },
      });
    }
    approvalReason = verification.reason;
  }

  const projectMeta = recordOf(session.projectMeta) ?? {};
  const profileResult = ProductionCapabilityProfileSchema.safeParse(
    projectMeta.productionCapabilityProfile,
  );
  const settingsResult = ShootKitSettingsSchema.safeParse(projectMeta.productionShotSettings);
  if (!profileResult.success) {
    return NextResponse.json({
      status: 'needs-profile',
      profile: null,
      settings: settingsResult.success ? settingsResult.data : null,
      plan: null,
      issues: [],
      documentVersion: currentDocumentVersion,
      approval: previewApproval(approvalReason),
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
      documentVersion: currentDocumentVersion,
      approval: previewApproval(approvalReason),
    });
  }
  if (sidecarResolution.issue) {
    return NextResponse.json({
      status: 'needs-user-input',
      profile: profileResult.data,
      settings: settingsResult.data,
      plan: null,
      issues: [sidecarResolution.issue],
      documentVersion: currentDocumentVersion,
      approval: previewApproval(approvalReason),
    });
  }

  try {
    return NextResponse.json(buildPlanPayload({
      authority: sidecarResolution.authority,
      profile: profileResult.data,
      settings: settingsResult.data,
      documentVersion: currentDocumentVersion,
      approvalReason,
    }));
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

  const { sessionId, scriptId, expectedDocumentVersion, profile, settings } = parsed.data;
  const session = await db.getSession(sessionId, userId, orgId);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  const canonicalSessionId = String(session._id);
  const script = await db.getScript(canonicalSessionId, scriptId);
  if (!script) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  const currentDocumentVersion = documentVersion(script);
  if (currentDocumentVersion !== expectedDocumentVersion) {
    return NextResponse.json({
      error: 'The script changed while the Shoot Kit was open. Reload before approving it.',
      reason: 'document-version-conflict',
      currentVersion: currentDocumentVersion,
    }, { status: 409 });
  }

  const sidecarResolution = resolveSidecarAuthority(script);
  if (sidecarResolution.issue) {
    await db.setSessionProductionConfiguration(canonicalSessionId, {
      capabilityProfile: profile,
      shotSettings: settings,
    });
    return NextResponse.json({
      status: 'needs-user-input',
      profile,
      settings,
      plan: null,
      issues: [sidecarResolution.issue],
      documentVersion: currentDocumentVersion,
      approval: previewApproval('production_contract_unavailable'),
    });
  }

  try {
    const payload = buildPlanPayload({
      authority: sidecarResolution.authority,
      profile,
      settings,
      documentVersion: currentDocumentVersion,
      approvalReason: 'not_approved',
    });
    if (payload.status !== 'ready') {
      await db.setSessionProductionConfiguration(canonicalSessionId, {
        capabilityProfile: profile,
        shotSettings: settings,
      });
      return NextResponse.json(payload);
    }

    const snapshot = createApprovedShootKitSnapshot({
      sessionId: canonicalSessionId,
      scriptId,
      sourceDocument: {
        version: currentDocumentVersion,
        contentHash: sidecarResolution.authority.binding.documentHash,
        sidecarHash: sidecarResolution.authority.binding.sidecarHash,
      },
      profile,
      settings,
      plan: payload.plan,
      approvedBy: userId,
    });
    const saved = await db.saveApprovedShootKitSnapshot({
      sessionId: canonicalSessionId,
      scriptId,
      expectedVersion: currentDocumentVersion,
      expectedContent: script.content,
      expectedSidecarHash: sidecarResolution.authority.binding.sidecarHash,
      snapshot,
    });
    if (!saved.ok) {
      return NextResponse.json({
        error: 'The script or its production contract changed before approval could be saved.',
        reason: 'document-version-conflict',
        currentVersion: saved.currentVersion,
      }, { status: 409 });
    }
    await db.setSessionProductionConfiguration(canonicalSessionId, {
      capabilityProfile: profile,
      shotSettings: settings,
    });
    return NextResponse.json({
      status: 'ready',
      profile: snapshot.profile,
      settings: snapshot.settings,
      plan: snapshot.plan,
      issues: [],
      documentVersion: currentDocumentVersion,
      approval: {
        status: 'approved',
        snapshotHash: snapshot.snapshotHash,
        approvedAt: snapshot.approvedAt,
        approvedBy: snapshot.approvedBy,
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Invalid production contract',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 422 });
  }
}
