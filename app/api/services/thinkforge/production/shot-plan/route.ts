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
  ShootKitSettingsSchema,
  type ShootKitSettings,
} from '@/lib/thinkforge/production/shoot-kit-snapshot';
import {
  CAPTURE_ACQUISITION_DECISIONS_METADATA_KEY,
  CaptureAcquisitionDecisionSetSchema,
  CaptureAcquisitionDecisionInputsSchema,
  createCaptureAcquisitionDecisionSet,
  createCaptureAcquisitionSourceDocument,
  mergeCaptureAcquisitionDecisionInputs,
} from '@/lib/thinkforge/production/capture-acquisition-decisions';
import { planPhysicalCaptureDesign } from '@/lib/thinkforge/production/physical-capture-design-planner';
import { resolveTechnicalCapturePlan } from '@/lib/thinkforge/production/technical-capture-plan-resolver';
import {
  resolveThinkForgeShootKitAccess,
  type ThinkForgeShootKitAccessDecision,
} from '@/lib/thinkforge/production/shoot-kit-access-policy';
import {
  requireCurrentPersistedScriptSidecar,
  ThinkForgeScriptSidecarAuthorityError,
  type AuthoritativePersistedScriptSidecar,
} from '@/lib/thinkforge/persistence/script-sidecar-reader';
import { parseVideoTreatment } from '@/lib/thinkforge/schemas/video-treatment';
import {
  PHYSICAL_CAPTURE_DESIGN_METADATA_KEY,
  verifyPhysicalCaptureDesign,
  type PhysicalCaptureDesign,
} from '@/lib/thinkforge/schemas/physical-capture-design';
import {
  TECHNICAL_CAPTURE_PLAN_METADATA_KEY,
  verifyCurrentTechnicalCapturePlan,
  type TechnicalCapturePlan,
} from '@/lib/thinkforge/schemas/technical-capture-plan';
import {
  APPROVED_TECHNICAL_CAPTURE_SNAPSHOT_METADATA_KEY,
  CaptureCalibrationConfirmationsSchema,
  createApprovedTechnicalCaptureSnapshot,
  verifyApprovedTechnicalCaptureSnapshot,
  type ApprovedTechnicalCaptureSnapshot,
} from '@/lib/thinkforge/schemas/capture-calibration-approval';
import * as db from '@/lib/thinkforge/services/db';
import { resolveProjectMetaBrandId } from '@/lib/thinkforge/state/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ProductionDocumentRequestSchema = z.object({
  sessionId: z.string().trim().min(1),
  scriptId: z.string().trim().min(1),
  expectedDocumentVersion: z.number().int().positive(),
});

const SaveShotPlanRequestSchema = ProductionDocumentRequestSchema.extend({
  action: z.literal('save-shot-plan').optional(),
  profile: ProductionCapabilityProfileSchema,
  settings: ShootKitSettingsSchema,
}).strict();

const SaveCaptureAcquisitionRequestSchema = ProductionDocumentRequestSchema.extend({
  action: z.literal('save-capture-acquisition'),
  expectedAcquisitionDecisionSetHash: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  decisions: CaptureAcquisitionDecisionInputsSchema,
}).strict();

const GenerateTechnicalCaptureRequestSchema = ProductionDocumentRequestSchema.extend({
  action: z.literal('generate-technical-capture'),
}).strict();

const ApproveTechnicalCaptureRequestSchema = ProductionDocumentRequestSchema.extend({
  action: z.literal('approve-technical-capture'),
  confirmations: CaptureCalibrationConfirmationsSchema,
}).strict();

const ProductionShotPlanRequestSchema = z.union([
  ApproveTechnicalCaptureRequestSchema,
  GenerateTechnicalCaptureRequestSchema,
  SaveCaptureAcquisitionRequestSchema,
  SaveShotPlanRequestSchema,
]);

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

function longFormChapterPlanFromMetadata(metadata: Record<string, unknown>): unknown | undefined {
  const writerOutput = recordOf(metadata.writerOutput);
  const longForm = writerOutput ? recordOf(writerOutput.longForm) : null;
  if (!longForm) return undefined;
  return Object.prototype.hasOwnProperty.call(longForm, 'plan') ? longForm.plan : null;
}

function videoTreatmentFromMetadata(metadata: Record<string, unknown>): unknown | undefined {
  const writerOutput = recordOf(metadata.writerOutput);
  if (!writerOutput || !Object.prototype.hasOwnProperty.call(writerOutput, 'videoTreatment')) {
    return undefined;
  }
  return writerOutput.videoTreatment;
}

function sourceLedgerFromMetadata(metadata: Record<string, unknown>): unknown | undefined {
  const writerOutput = recordOf(metadata.writerOutput);
  if (!writerOutput || !Object.prototype.hasOwnProperty.call(writerOutput, 'sourceLedger')) {
    return undefined;
  }
  return writerOutput.sourceLedger;
}

function sourceDocumentFromAuthority(
  authority: AuthoritativePersistedScriptSidecar,
  version: number,
  metadata: Record<string, unknown>,
) {
  return createCaptureAcquisitionSourceDocument({
    version,
    contentHash: authority.binding.documentHash,
    sidecarHash: authority.binding.sidecarHash,
    sourceLedger: sourceLedgerFromMetadata(metadata),
  });
}

function captureAcquisitionDecisionsFromMetadata(
  metadata: Record<string, unknown>,
): unknown | undefined {
  return Object.prototype.hasOwnProperty.call(metadata, CAPTURE_ACQUISITION_DECISIONS_METADATA_KEY)
    ? metadata[CAPTURE_ACQUISITION_DECISIONS_METADATA_KEY]
    : undefined;
}

function technicalCaptureState(input: {
  metadata: Record<string, unknown>;
  treatment: unknown;
  sourceDocument: unknown;
  acquisitionDecisions?: unknown;
  profile: ProductionCapabilityProfile | null;
  settings: ShootKitSettings | null;
  sessionId: string;
  scriptId: string;
  physicalCaptureRequired: boolean;
}) {
  if (!input.physicalCaptureRequired) return { status: 'not-required' as const };
  if (!input.profile || !input.settings) return { status: 'needs-profile' as const };
  const designVerification = verifyPhysicalCaptureDesign({
    design: input.metadata[PHYSICAL_CAPTURE_DESIGN_METADATA_KEY],
    treatment: input.treatment,
    sourceDocument: input.sourceDocument,
    acquisitionDecisions: input.acquisitionDecisions,
  });
  if (!designVerification.current) {
    return { status: 'not-generated' as const, staleReason: designVerification.reason };
  }
  const planVerification = verifyCurrentTechnicalCapturePlan({
    plan: input.metadata[TECHNICAL_CAPTURE_PLAN_METADATA_KEY],
    design: designVerification.design,
    profile: input.profile,
    aspectRatio: input.settings.aspectRatio,
  });
  if (!planVerification.current) {
    return {
      status: 'not-generated' as const,
      design: designVerification.design,
      staleReason: planVerification.reason,
    };
  }
  const approval = verifyApprovedTechnicalCaptureSnapshot({
    snapshot: input.metadata[APPROVED_TECHNICAL_CAPTURE_SNAPSHOT_METADATA_KEY],
    sessionId: input.sessionId,
    scriptId: input.scriptId,
    sourceDocument: input.sourceDocument,
    plan: planVerification.plan,
  });
  return approval.current
    ? {
        status: 'approved' as const,
        design: designVerification.design,
        plan: planVerification.plan,
        approval: approval.snapshot,
      }
    : {
        status: 'needs-calibration' as const,
        design: designVerification.design,
        plan: planVerification.plan,
        staleReason: approval.reason,
      };
}

function withTechnicalCaptureState(input: {
  payload: ReturnType<typeof buildPlanPayload> & { status: 'capture-projection' };
  metadata: Record<string, unknown>;
  treatment: unknown;
  sourceDocument: unknown;
  acquisitionDecisions?: unknown;
  profile: ProductionCapabilityProfile | null;
  settings: ShootKitSettings | null;
  sessionId: string;
  scriptId: string;
}) {
  return {
    ...input.payload,
    technicalCapture: technicalCaptureState({
      ...input,
      physicalCaptureRequired: input.payload.capturePlan.physicalCaptureRequirements.length > 0,
    }),
  };
}

function buildPlanPayload(input: {
  authority: AuthoritativePersistedScriptSidecar;
  profile: ProductionCapabilityProfile | null;
  settings: ShootKitSettings | null;
  documentVersion: number;
  approvalReason: string;
  chapterPlan?: unknown;
  videoTreatment?: unknown;
  acquisitionDecisions?: unknown;
  acquisitionDecisionSourceDocument?: unknown;
  sourceLedger?: unknown;
}) {
  const result = buildScriptShotPlan({
    sidecar: input.authority.rawSidecar,
    profile: input.profile,
    videoTreatment: input.videoTreatment,
    aspectRatio: input.settings?.aspectRatio,
    tier: input.settings?.tier,
    chapterPlan: input.chapterPlan,
    acquisitionDecisions: input.acquisitionDecisions,
    acquisitionDecisionSourceDocument: input.acquisitionDecisionSourceDocument,
    sourceLedger: input.sourceLedger,
  });
  const acquisitionDecisionSetHash = input.acquisitionDecisions === undefined
    || input.acquisitionDecisions === null
    ? null
    : CaptureAcquisitionDecisionSetSchema.parse(input.acquisitionDecisions).decisionSetHash;
  return {
    ...result,
    profile: input.profile,
    settings: input.settings,
    documentVersion: input.documentVersion,
    acquisitionDecisionSetHash,
    approval: previewApproval(input.approvalReason),
  };
}

function semanticContractError(payload: ReturnType<typeof buildPlanPayload>) {
  const issue = payload.issues[0];
  return NextResponse.json({
    error: issue?.message ?? 'This script is missing the semantic treatment required for its Shoot Kit.',
    reason: issue?.code ?? 'semantic_capture_contract_unavailable',
    details: payload.issues,
  }, { status: 422 });
}

function shootKitAccessError(
  decision: Exclude<ThinkForgeShootKitAccessDecision, { allowed: true }>,
) {
  return NextResponse.json({
    error: decision.message,
    reason: decision.code,
  }, { status: decision.status });
}

function shootKitRegenerationRequired(
  issue?: { code: string; message: string; questions: string[] },
) {
  return NextResponse.json({
    error: 'This saved video script predates the current semantic production contract. Regenerate or revise it before opening Shoot Kit.',
    reason: 'shoot_kit_regeneration_required',
    ...(issue ? { details: [issue] } : {}),
  }, { status: 422 });
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

  const shootKitAccess = resolveThinkForgeShootKitAccess(script.contentContract);
  if (!shootKitAccess.allowed) return shootKitAccessError(shootKitAccess);
  const sidecarResolution = resolveSidecarAuthority(script);
  if (sidecarResolution.issue) return shootKitRegenerationRequired(sidecarResolution.issue);
  if (sidecarResolution.authority.readResult.sourceVersion !== 3) {
    return shootKitRegenerationRequired();
  }
  const metadata = recordOf(script.metadata) ?? {};

  const projectMeta = recordOf(session.projectMeta) ?? {};
  const profileResult = ProductionCapabilityProfileSchema.safeParse(
    projectMeta.productionCapabilityProfile,
  );
  const settingsResult = ShootKitSettingsSchema.safeParse(projectMeta.productionShotSettings);
  try {
    const payload = buildPlanPayload({
      authority: sidecarResolution.authority,
      profile: profileResult.success ? profileResult.data : null,
      settings: settingsResult.success ? settingsResult.data : null,
      documentVersion: currentDocumentVersion,
      approvalReason: 'semantic_capture_preview',
      chapterPlan: longFormChapterPlanFromMetadata(metadata),
      videoTreatment: videoTreatmentFromMetadata(metadata),
      acquisitionDecisions: captureAcquisitionDecisionsFromMetadata(metadata),
      acquisitionDecisionSourceDocument: sourceDocumentFromAuthority(
        sidecarResolution.authority,
        currentDocumentVersion,
        metadata,
      ),
      sourceLedger: sourceLedgerFromMetadata(metadata),
    });
    if (payload.status !== 'capture-projection') return semanticContractError(payload);
    const sourceDocument = sourceDocumentFromAuthority(
      sidecarResolution.authority,
      currentDocumentVersion,
      metadata,
    );
    return NextResponse.json(withTechnicalCaptureState({
      payload,
      metadata,
      treatment: videoTreatmentFromMetadata(metadata),
      sourceDocument,
      acquisitionDecisions: captureAcquisitionDecisionsFromMetadata(metadata),
      profile: profileResult.success ? profileResult.data : null,
      settings: settingsResult.success ? settingsResult.data : null,
      sessionId: canonicalSessionId,
      scriptId,
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
  const parsed = ProductionShotPlanRequestSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({
      error: 'Invalid production request',
      details: parsed.error.issues,
    }, { status: 400 });
  }

  const { sessionId, scriptId, expectedDocumentVersion } = parsed.data;
  const session = await db.getSession(sessionId, userId, orgId);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  const canonicalSessionId = String(session._id);
  const script = await db.getScript(canonicalSessionId, scriptId);
  if (!script) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  const currentDocumentVersion = documentVersion(script);
  const shootKitAccess = resolveThinkForgeShootKitAccess(script.contentContract);
  if (!shootKitAccess.allowed) return shootKitAccessError(shootKitAccess);
  if (currentDocumentVersion !== expectedDocumentVersion) {
    return NextResponse.json({
      error: 'The script changed while the Shoot Kit was open. Reload before approving it.',
      reason: 'document-version-conflict',
      currentVersion: currentDocumentVersion,
    }, { status: 409 });
  }

  const sidecarResolution = resolveSidecarAuthority(script);
  if (sidecarResolution.issue) return shootKitRegenerationRequired(sidecarResolution.issue);
  if (sidecarResolution.authority.readResult.sourceVersion !== 3) {
    return shootKitRegenerationRequired();
  }
  const metadata = recordOf(script.metadata) ?? {};
  const projectMeta = recordOf(session.projectMeta) ?? {};
  const providerIdentity = {
    userId,
    orgId,
    sessionId: canonicalSessionId,
    projectId: resolveProjectMetaBrandId(session.projectMeta),
  };
  const storedProfile = ProductionCapabilityProfileSchema.safeParse(
    projectMeta.productionCapabilityProfile,
  );
  const storedSettings = ShootKitSettingsSchema.safeParse(projectMeta.productionShotSettings);

  if (
    parsed.data.action === 'generate-technical-capture'
    || parsed.data.action === 'approve-technical-capture'
  ) {
    if (!storedProfile.success || !storedSettings.success) {
      return NextResponse.json({
        error: 'Confirm the available spaces, equipment, people, budget, and output settings before technical planning.',
        reason: 'production-profile-required',
      }, { status: 422 });
    }
    try {
      const treatment = parseVideoTreatment(videoTreatmentFromMetadata(metadata));
      const sourceDocument = sourceDocumentFromAuthority(
        sidecarResolution.authority,
        currentDocumentVersion,
        metadata,
      );
      const acquisitionDecisions = captureAcquisitionDecisionsFromMetadata(metadata);
      const payload = buildPlanPayload({
        authority: sidecarResolution.authority,
        profile: storedProfile.data,
        settings: storedSettings.data,
        documentVersion: currentDocumentVersion,
        approvalReason: parsed.data.action,
        chapterPlan: longFormChapterPlanFromMetadata(metadata),
        videoTreatment: treatment,
        acquisitionDecisions,
        acquisitionDecisionSourceDocument: sourceDocument,
        sourceLedger: sourceLedgerFromMetadata(metadata),
      });
      if (payload.status !== 'capture-projection') return semanticContractError(payload);
      if (payload.capturePlan.decisionRequests.length > 0) {
        return NextResponse.json({
          error: 'Resolve every acquisition choice before building a technical capture setup.',
          reason: 'capture-acquisition-required',
          details: payload.capturePlan.decisionRequests,
        }, { status: 422 });
      }
      if (payload.capturePlan.physicalCaptureRequirements.length === 0) {
        return NextResponse.json(withTechnicalCaptureState({
          payload,
          metadata,
          treatment,
          sourceDocument,
          acquisitionDecisions,
          profile: storedProfile.data,
          settings: storedSettings.data,
          sessionId: canonicalSessionId,
          scriptId,
        }));
      }
      if (payload.capturePlan.status !== 'capture-brief-ready') {
        return NextResponse.json({
          error: 'Resolve every capture calibration input before building or approving a technical setup.',
          reason: 'capture-calibration-required',
          details: payload.capturePlan.calibrationQuestions,
        }, { status: 422 });
      }

      if (parsed.data.action === 'generate-technical-capture') {
        const designResult = await planPhysicalCaptureDesign({
          treatment,
          sourceDocument,
          acquisitionDecisions,
          ...providerIdentity,
          abortSignal: request.signal,
        });
        const technicalResult = await resolveTechnicalCapturePlan({
          design: designResult.design,
          profile: storedProfile.data,
          aspectRatio: storedSettings.data.aspectRatio,
          ...providerIdentity,
          abortSignal: request.signal,
        });
        const saved = await db.saveTechnicalCapturePlanningArtifacts({
          sessionId: canonicalSessionId,
          scriptId,
          expectedVersion: currentDocumentVersion,
          expectedContent: script.content,
          expectedSidecarHash: sidecarResolution.authority.binding.sidecarHash,
          expectedAcquisitionDecisionSetHash:
            designResult.design.acquisitionDecisionSetHash ?? null,
          design: designResult.design,
          plan: technicalResult.plan,
        });
        if (!saved.ok) {
          return NextResponse.json({
            error: 'The script or production contract changed while its technical setup was being built.',
            reason: 'document-version-conflict',
            currentVersion: saved.currentVersion,
          }, { status: 409 });
        }
        return NextResponse.json({
          ...payload,
          technicalCapture: {
            status: 'needs-calibration',
            design: designResult.design,
            plan: technicalResult.plan,
            staleReason: 'calibration_not_approved',
          },
        });
      }

      const designVerification = verifyPhysicalCaptureDesign({
        design: metadata[PHYSICAL_CAPTURE_DESIGN_METADATA_KEY],
        treatment,
        sourceDocument,
        acquisitionDecisions,
      });
      if (!designVerification.current) {
        return NextResponse.json({
          error: 'The physical capture design is missing or stale. Build the technical setup again.',
          reason: designVerification.reason,
        }, { status: 409 });
      }
      const planVerification = verifyCurrentTechnicalCapturePlan({
        plan: metadata[TECHNICAL_CAPTURE_PLAN_METADATA_KEY],
        design: designVerification.design,
        profile: storedProfile.data,
        aspectRatio: storedSettings.data.aspectRatio,
      });
      if (!planVerification.current) {
        return NextResponse.json({
          error: 'The technical setup no longer matches the confirmed production inputs. Build it again.',
          reason: planVerification.reason,
        }, { status: 409 });
      }
      const snapshot = createApprovedTechnicalCaptureSnapshot({
        sessionId: canonicalSessionId,
        scriptId,
        sourceDocument,
        plan: planVerification.plan,
        confirmations: parsed.data.confirmations,
        approvedBy: userId,
      });
      const saved = await db.saveApprovedTechnicalCaptureSnapshot({
        sessionId: canonicalSessionId,
        scriptId,
        expectedVersion: currentDocumentVersion,
        expectedContent: script.content,
        expectedSidecarHash: sidecarResolution.authority.binding.sidecarHash,
        expectedPlanHash: planVerification.plan.planHash,
        snapshot,
      });
      if (!saved.ok) {
        return NextResponse.json({
          error: 'The script or technical plan changed before calibration approval could be saved.',
          reason: 'document-version-conflict',
          currentVersion: saved.currentVersion,
        }, { status: 409 });
      }
      return NextResponse.json({
        ...payload,
        technicalCapture: {
          status: 'approved',
          design: designVerification.design,
          plan: planVerification.plan,
          approval: snapshot,
        },
      });
    } catch (error) {
      return NextResponse.json({
        error: parsed.data.action === 'generate-technical-capture'
          ? 'ThinkForge could not build a complete technical capture setup.'
          : 'The technical capture setup could not be approved.',
        details: error instanceof Error ? error.message : String(error),
      }, { status: 422 });
    }
  }

  if (parsed.data.action === 'save-capture-acquisition') {
    try {
      const treatment = parseVideoTreatment(videoTreatmentFromMetadata(metadata));
      const sourceDocument = sourceDocumentFromAuthority(
        sidecarResolution.authority,
        currentDocumentVersion,
        metadata,
      );
      const mergedDecisions = mergeCaptureAcquisitionDecisionInputs({
        treatment,
        sourceDocument,
        previousDecisionSet: captureAcquisitionDecisionsFromMetadata(metadata),
        decisions: parsed.data.decisions,
      });
      if (
        parsed.data.expectedAcquisitionDecisionSetHash
        !== mergedDecisions.previousDecisionSetHash
      ) {
        return NextResponse.json({
          error: 'The acquisition choices changed while this Shoot Kit was open. Reload before saving.',
          reason: 'capture-acquisition-conflict',
          currentDecisionSetHash: mergedDecisions.previousDecisionSetHash,
        }, { status: 409 });
      }
      const decisionSet = createCaptureAcquisitionDecisionSet({
        treatment,
        sourceDocument,
        decisions: mergedDecisions.decisions,
        sourceLedger: sourceLedgerFromMetadata(metadata),
        decidedBy: userId,
      });
      const payload = buildPlanPayload({
        authority: sidecarResolution.authority,
        profile: storedProfile.success ? storedProfile.data : null,
        settings: storedSettings.success ? storedSettings.data : null,
        documentVersion: currentDocumentVersion,
        approvalReason: 'capture_acquisition_updated',
        chapterPlan: longFormChapterPlanFromMetadata(metadata),
        videoTreatment: treatment,
        acquisitionDecisions: decisionSet,
        acquisitionDecisionSourceDocument: sourceDocument,
        sourceLedger: sourceLedgerFromMetadata(metadata),
      });
      if (payload.status !== 'capture-projection') return semanticContractError(payload);
      const saved = await db.saveCaptureAcquisitionDecisionSet({
        sessionId: canonicalSessionId,
        scriptId,
        expectedVersion: currentDocumentVersion,
        expectedContent: script.content,
        expectedSidecarHash: sidecarResolution.authority.binding.sidecarHash,
        expectedPreviousDecisionSetHash: mergedDecisions.previousDecisionSetHash,
        decisionSet,
      });
      if (!saved.ok) {
        return NextResponse.json({
          error: 'The script or its production contract changed before the acquisition choice could be saved.',
          reason: 'document-version-conflict',
          currentVersion: saved.currentVersion,
        }, { status: 409 });
      }
      return NextResponse.json(withTechnicalCaptureState({
        payload,
        metadata,
        treatment,
        sourceDocument,
        acquisitionDecisions: decisionSet,
        profile: storedProfile.success ? storedProfile.data : null,
        settings: storedSettings.success ? storedSettings.data : null,
        sessionId: canonicalSessionId,
        scriptId,
      }));
    } catch (error) {
      return NextResponse.json({
        error: 'Invalid capture acquisition decision',
        details: error instanceof Error ? error.message : String(error),
      }, { status: 422 });
    }
  }

  const { profile, settings } = parsed.data;
  try {
    const sourceDocument = sourceDocumentFromAuthority(
      sidecarResolution.authority,
      currentDocumentVersion,
      metadata,
    );
    const treatment = videoTreatmentFromMetadata(metadata);
    const acquisitionDecisions = captureAcquisitionDecisionsFromMetadata(metadata);
    const payload = buildPlanPayload({
      authority: sidecarResolution.authority,
      profile,
      settings,
      documentVersion: currentDocumentVersion,
      approvalReason: 'not_approved',
      chapterPlan: longFormChapterPlanFromMetadata(metadata),
      videoTreatment: treatment,
      acquisitionDecisions,
      acquisitionDecisionSourceDocument: sourceDocument,
      sourceLedger: sourceLedgerFromMetadata(metadata),
    });
    if (payload.status !== 'capture-projection') {
      return semanticContractError(payload);
    }
    await db.setSessionProductionConfiguration(canonicalSessionId, {
      capabilityProfile: profile,
      shotSettings: settings,
    });
    return NextResponse.json(withTechnicalCaptureState({
      payload,
      metadata,
      treatment,
      sourceDocument,
      acquisitionDecisions,
      profile,
      settings,
      sessionId: canonicalSessionId,
      scriptId,
    }));
  } catch (error) {
    return NextResponse.json({
      error: 'Invalid production contract',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 422 });
  }
}
