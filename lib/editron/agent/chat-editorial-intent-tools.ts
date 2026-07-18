import { randomUUID } from 'node:crypto';

import { tool, type ToolRunnableConfig } from '@langchain/core/tools';
import { z } from 'zod';

import type { ProjectBrief } from '@/lib/editron/data/edit-profile-types';
import {
  normalizeEditorialPreferences,
  type EditorialFamily,
  type EditorialPreferences,
} from '@/lib/editron/production-brief/editorial-preferences';
import type { EditDecision, EditDecisionList } from '@/lib/editron/services/reactive-edit-engine';
import { extractMotionGraphicSemanticFacts } from '@/lib/editron/services/mg-semantic-fact-extractor';
import {
  CHAT_SCRIPT_MAX_CHARS,
  CHAT_SCRIPT_RECOMPOSITION_VERSION,
  queueChatScriptRecomposition,
} from '@/lib/editron/services/chat-script-recomposition';
import {
  queueChatReferenceStyleJob,
  type QueueChatReferenceStyleJobResult,
} from '@/lib/editron/services/chat-reference-style-job';
import type {
  CanonicalChatEvidenceCandidate,
  SearchCanonicalChatEvidenceResult,
} from '@/lib/editron/services/chat-multimodal-evidence';
import {
  chatEditorialIntentWireSchema,
  compileChatEditorialIntentWire,
  normalizeOptionalChatScript,
  type ChatEditorialIntentWireInput,
} from './chat-editorial-intent-wire';

export const CHAT_EDITORIAL_INTENT_VERSION = 'chat-editorial-intent-v1' as const;
export const CHAT_INTENT_AUDIT_COLLECTION = 'editron_chat_intent_audits';

export const CHAT_INTENT_POLICY = {
  version: 'chat-editorial-intent-policy-v1',
  calibrationStatus: 'invented-needs-calibration',
  maximumEvidenceCandidates: 8,
  maximumExecutableOpportunities: 3,
  maximumIntentUncertaintyForMutation: 0.45,
  maximumBoundaryDistanceFrames: 18,
} as const;

export const CHAT_SHADOW_AUTHORITY_TOOLS = new Set([
  'add_motion_graphic',
  'auto_motion_graphics',
  'add_transition',
  'auto_edit_from_script',
  'extract_style',
  'apply_style',
]);

const familyPreferenceSchema = z.object({
  mode: z.enum(['auto', 'off', 'prefer']).default('auto'),
  frequency: z.coerce.number().min(0).max(1).optional(),
  intensity: z.coerce.number().min(0).max(1).optional(),
}).strict();

const scopeSchema = z.object({
  kind: z.enum(['project', 'selection', 'moment']).default('project'),
  startFrame: z.coerce.number().int().min(0).optional(),
  endFrame: z.coerce.number().int().positive().optional(),
  overlayIds: z.array(z.union([z.string(), z.number()])).max(24).optional(),
}).strict();

export const chatReferenceStyleSchema = z.object({
  referenceAssetId: z.string().min(1).max(200).describe('The exact ID of an uploaded video asset owned by this user. Resolve the asset first; never pass a URL.'),
  strength: z.coerce.number().min(0).max(1).default(0.5).describe('How strongly to inherit the reference edit language while preserving target content and brand constraints.'),
}).strict();

export const chatEditorialIntentSchema = z.object({
  goal: z.string().min(1).max(1_200).describe('The editorial outcome the user wants, in ordinary language. Do not include a transition, MG, SFX, caption, or animation preset name unless the user explicitly named it.'),
  scope: scopeSchema.default({ kind: 'project' }),
  targetReference: z.string().min(1).max(600).optional().describe('What spoken, shown, or timeline moment the user means. Timestamps are optional.'),
  constraints: z.array(z.string().min(1).max(300)).max(20).default([]),
  strength: z.coerce.number().min(0).max(1).default(0.5).describe('How restrained or expressive the user wants the outcome. This is context, never execution confidence.'),
  uncertainty: z.coerce.number().min(0).max(1).default(0).describe('How uncertain the interpretation of the user request is. Evidence confidence is calculated separately.'),
  families: z.object({
    captions: familyPreferenceSchema.optional(),
    motionGraphics: familyPreferenceSchema.optional(),
    zoom: familyPreferenceSchema.optional(),
    transitions: familyPreferenceSchema.optional(),
    sfx: familyPreferenceSchema.optional(),
    music: familyPreferenceSchema.optional(),
  }).strict().optional(),
  musicPrompt: z.string().min(1).max(500).optional(),
  notes: z.string().min(1).max(500).optional(),
  script: z.string().min(1).max(CHAT_SCRIPT_MAX_CHARS).optional().describe('Optional authoritative script supplied by the user. Omit this field when no script was provided; never send sentinel text such as "none", "null", or "N/A". When present, the Phase 2 multi-asset script planner owns clip selection and ordering.'),
}).strict();

export type ChatEditorialIntentInput = z.infer<typeof chatEditorialIntentSchema>;

export interface GroundedEditorialIntent {
  version: typeof CHAT_EDITORIAL_INTENT_VERSION;
  intentId: string;
  goal: string;
  scope: ChatEditorialIntentInput['scope'];
  targetReference?: string;
  constraints: string[];
  strength: number;
  uncertainty: number;
  editorialPreferences?: EditorialPreferences;
  script?: string;
  evidenceQuery: string;
}

export interface EditorialOwnerDispatchResult {
  owner: 'director-unified-planner' | 'targeted-unified-planner' | 'phase2-script-planner';
  status: 'executed' | 'advisory' | 'queued' | 'failed';
  mutated: boolean;
  executedDecisions?: number;
  skippedDecisions?: number;
  createdOverlays?: number;
  modifiedOverlays?: number;
  authority?: Record<string, unknown>;
  reasons: string[];
}

export interface ChatEditorialIntentResult {
  status: 'success' | 'advisory' | 'error';
  intent: GroundedEditorialIntent;
  evidence: {
    auditId?: string;
    analyzedDocumentCount: number;
    candidates: CanonicalChatEvidenceCandidate[];
    safeCandidateCount: number;
  };
  dispatch: EditorialOwnerDispatchResult;
}

export interface ChatEditorialIntentDependencies {
  loadProject(userId: string, projectId: string): Promise<any | null>;
  searchEvidence(args: {
    projectId: string;
    userId: string;
    project: unknown;
    query: string;
    overlayId?: string | number;
    limit: number;
  }): Promise<SearchCanonicalChatEvidenceResult>;
  executeProjectIntent(args: {
    projectId: string;
    userId: string;
    intent: GroundedEditorialIntent;
  }): Promise<EditorialOwnerDispatchResult>;
  executeTargetedIntent(args: {
    projectId: string;
    userId: string;
    project: any;
    intent: GroundedEditorialIntent;
    evidence: CanonicalChatEvidenceCandidate[];
  }): Promise<EditorialOwnerDispatchResult>;
  dispatchScriptIntent(args: {
    projectId: string;
    userId: string;
    project: any;
    intent: GroundedEditorialIntent;
  }): Promise<EditorialOwnerDispatchResult>;
  persistAudit(record: Record<string, unknown>): Promise<void>;
  now(): Date;
}

interface CreateChatEditorialIntentToolsOptions {
  userId: string;
  projectId: string;
  sessionId?: string;
  operationId?: string;
}

export interface ChatReferenceStyleToolDependencies {
  queueReferenceStyleJob(
    request: Parameters<typeof queueChatReferenceStyleJob>[0],
  ): Promise<QueueChatReferenceStyleJobResult>;
}

export function filterChatShadowAuthorityTools<T extends { name: string }>(tools: T[]): T[] {
  return tools.filter((candidate) => !CHAT_SHADOW_AUTHORITY_TOOLS.has(candidate.name));
}

export function compileGroundedEditorialIntent(input: ChatEditorialIntentInput): GroundedEditorialIntent {
  const familyPreferences = normalizeEditorialPreferences({
    families: input.families,
    musicPrompt: input.musicPrompt,
    notes: [input.notes, ...input.constraints].filter(Boolean).join('\n'),
  });
  const targetReference = cleanText(input.targetReference);
  const script = normalizeOptionalChatScript(input.script);
  return {
    version: CHAT_EDITORIAL_INTENT_VERSION,
    intentId: `intent_${randomUUID()}`,
    goal: input.goal.trim(),
    scope: normalizeScope(input.scope),
    ...(targetReference ? { targetReference } : {}),
    constraints: input.constraints.map((value) => value.trim()).filter(Boolean),
    strength: clamp01(input.strength),
    uncertainty: clamp01(input.uncertainty),
    ...(familyPreferences ? { editorialPreferences: familyPreferences } : {}),
    ...(script ? { script } : {}),
    evidenceQuery: targetReference ?? input.goal.trim(),
  };
}

export async function applyGroundedEditorialIntent(
  args: { userId: string; projectId: string; input: ChatEditorialIntentInput },
  dependencies?: Partial<ChatEditorialIntentDependencies>,
): Promise<ChatEditorialIntentResult> {
  const deps = await resolveDependencies(dependencies);
  const intent = compileGroundedEditorialIntent(args.input);
  const project = await deps.loadProject(args.userId, args.projectId);
  if (!project) throw new Error('Project not found');

  const overlayId = intent.scope.overlayIds?.[0];
  const retrieval = await deps.searchEvidence({
    projectId: args.projectId,
    userId: args.userId,
    project,
    query: intent.evidenceQuery,
    ...(overlayId !== undefined ? { overlayId } : {}),
    limit: CHAT_INTENT_POLICY.maximumEvidenceCandidates,
  });
  const scopedCandidates = filterCandidatesToScope(retrieval.candidates, intent.scope);
  const safeCandidates = scopedCandidates.filter((candidate) => candidate.safeForAutomaticMutation);

  let dispatch: EditorialOwnerDispatchResult;
  if (intent.script) {
    dispatch = await deps.dispatchScriptIntent({
      projectId: args.projectId,
      userId: args.userId,
      project,
      intent,
    });
  } else if (intent.scope.kind === 'project') {
    dispatch = await deps.executeProjectIntent({
      projectId: args.projectId,
      userId: args.userId,
      intent,
    });
  } else if (
    intent.uncertainty > CHAT_INTENT_POLICY.maximumIntentUncertaintyForMutation
    || safeCandidates.length === 0
  ) {
    dispatch = {
      owner: 'targeted-unified-planner',
      status: 'advisory',
      mutated: false,
      reasons: [
        intent.uncertainty > CHAT_INTENT_POLICY.maximumIntentUncertaintyForMutation
          ? 'intent-uncertainty-too-high'
          : 'no-safe-canonical-evidence',
      ],
    };
  } else {
    dispatch = await deps.executeTargetedIntent({
      projectId: args.projectId,
      userId: args.userId,
      project,
      intent,
      evidence: safeCandidates.slice(0, CHAT_INTENT_POLICY.maximumExecutableOpportunities),
    });
  }

  const result: ChatEditorialIntentResult = {
    status: dispatch.status === 'failed' ? 'error' : dispatch.mutated || dispatch.status === 'queued' ? 'success' : 'advisory',
    intent,
    evidence: {
      auditId: retrieval.auditId,
      analyzedDocumentCount: retrieval.analyzedDocumentCount,
      candidates: scopedCandidates,
      safeCandidateCount: safeCandidates.length,
    },
    dispatch,
  };
  await deps.persistAudit(buildIntentAudit(args, result, deps.now()));
  return result;
}

export function createChatEditorialIntentTools(
  { userId, projectId, sessionId, operationId }: CreateChatEditorialIntentToolsOptions,
  dependencies?: Partial<ChatEditorialIntentDependencies>,
  referenceStyleDependencies?: Partial<ChatReferenceStyleToolDependencies>,
) {
  const applyEditorialIntent = tool(
    async (wireInput: ChatEditorialIntentWireInput, config: ToolRunnableConfig) => {
      const userTurnText = typeof config.configurable?.chatUserTurnText === 'string'
        ? config.configurable.chatUserTurnText
        : undefined;
      const input = chatEditorialIntentSchema.parse(
        compileChatEditorialIntentWire(wireInput, { userTurnText }),
      );
      try {
        const result = await applyGroundedEditorialIntent({ userId, projectId, input }, dependencies);
        return JSON.stringify({
          status: result.status,
          data: result,
          error: result.status === 'error' ? result.dispatch.reasons.join(', ') : null,
          nextAction: result.status === 'advisory'
            ? 'Ask once for a clearer target or narrower constraint. Do not claim an edit was made.'
            : result.dispatch.status === 'queued'
              ? 'Tell the user the script-led re-edit is processing. Do not claim the timeline has changed yet.'
              : 'Reload the project and verify the requested outcome.',
        });
      } catch (error) {
        return JSON.stringify({
          status: 'error',
          data: null,
          error: error instanceof Error ? error.message : 'Editorial intent execution failed',
          nextAction: 'Do not claim success. Explain the failure and ask the user to retry.',
        });
      }
    },
    {
      name: 'apply_editorial_intent',
      description: 'Ground a vague, project-wide, moment-specific, or script-led editing request in canonical transcript/visual/audio evidence, then dispatch semantic jobs to Editron\'s existing unified Director and family planners. This flat wire accepts facts and user preferences only. It never accepts MG forms, transition types, SFX tokens, caption styles, keyframes, or renderer presets. scriptText must be copied from the current user turn or an attachment explicitly marked as script.',
      schema: chatEditorialIntentWireSchema,
    },
  );

  const applyReferenceStyle = tool(
    async (input: z.infer<typeof chatReferenceStyleSchema>) => {
      if (!sessionId || !operationId) {
        return JSON.stringify({
          status: 'error',
          data: null,
          error: 'Durable reference-style context is unavailable for this chat turn.',
          nextAction: 'Do not use the legacy extract_style or apply_style tools. Ask the user to retry from the project chat.',
        });
      }
      try {
        const queue = referenceStyleDependencies?.queueReferenceStyleJob ?? queueChatReferenceStyleJob;
        const result = await queue({
          projectId,
          userId,
          sessionId,
          operationId,
          referenceAssetId: input.referenceAssetId,
          strength: input.strength,
        });
        if (result.status === 'failed') {
          return JSON.stringify({
            status: 'error',
            data: { jobId: result.jobId, queueStatus: result.status },
            error: result.reason ?? 'Reference-style job could not be queued.',
            nextAction: 'Do not claim the style was applied. Explain the failure and let the user retry.',
          });
        }
        if (result.status === 'declined') {
          return JSON.stringify({
            status: 'advisory',
            data: { jobId: result.jobId, queueStatus: result.status },
            error: null,
            nextAction: 'Explain that the reference was inspected but no faithful style transfer was warranted.',
          });
        }
        return JSON.stringify({
          status: 'success',
          data: {
            jobId: result.jobId,
            queueStatus: result.status,
            messageId: result.messageId ?? null,
          },
          error: null,
          nextAction: result.status === 'completed'
            ? 'Tell the user the reference style application completed and reload the project.'
            : 'Tell the user the reference style is processing. Do not claim the timeline has changed yet.',
        });
      } catch (error) {
        return JSON.stringify({
          status: 'error',
          data: null,
          error: error instanceof Error ? error.message : 'Reference-style dispatch failed.',
          nextAction: 'Do not claim success. Explain the failure and let the user retry.',
        });
      }
    },
    {
      name: 'apply_reference_style',
      description: 'Durably analyze an uploaded reference video and apply only its grounded editorial language to the current project through Editron\'s unified planner. Use this for requests such as "edit mine like this reference." The input is an owned uploaded video asset ID, never a URL. This queues an idempotent worker with checkpoint, rollback, and rendered verification; it does not directly choose presets or renderer forms.',
      schema: chatReferenceStyleSchema,
    },
  );

  return [applyEditorialIntent, applyReferenceStyle];
}

async function resolveDependencies(
  overrides?: Partial<ChatEditorialIntentDependencies>,
): Promise<ChatEditorialIntentDependencies> {
  let loadProject = overrides?.loadProject;
  let searchEvidence = overrides?.searchEvidence;
  if (!loadProject) {
    const { projectService } = await import('@/lib/editron/services/project-service');
    loadProject = (userId, projectId) => projectService.loadProject(userId, projectId);
  }
  if (!searchEvidence) {
    const evidenceModule = await import('@/lib/editron/services/chat-multimodal-evidence');
    searchEvidence = async (args) => evidenceModule.searchCanonicalChatEvidence({
      projectId: args.projectId,
      userId: args.userId,
      project: args.project,
      query: args.query,
      intent: 'any',
      overlayId: args.overlayId,
      limit: args.limit,
    });
  }
  return {
    loadProject,
    searchEvidence,
    executeProjectIntent: overrides?.executeProjectIntent ?? defaultExecuteProjectIntent,
    executeTargetedIntent: overrides?.executeTargetedIntent ?? defaultExecuteTargetedIntent,
    dispatchScriptIntent: overrides?.dispatchScriptIntent ?? defaultDispatchScriptIntent,
    persistAudit: overrides?.persistAudit ?? defaultPersistAudit,
    now: overrides?.now ?? (() => new Date()),
  };
}

async function defaultExecuteProjectIntent(args: {
  projectId: string;
  userId: string;
  intent: GroundedEditorialIntent;
}): Promise<EditorialOwnerDispatchResult> {
  const { executeDirectorPlan } = await import('@/lib/editron/agent/director-agent');
  const brief: ProjectBrief = {
    modifiers: [],
    intent: args.intent.goal,
    editorialPreferences: args.intent.editorialPreferences,
  };
  const result = await executeDirectorPlan(args.projectId, args.userId, 'A-01', brief);
  return {
    owner: 'director-unified-planner',
    status: result.success ? 'executed' : 'failed',
    mutated: result.success && result.overlaysModified > 0,
    executedDecisions: result.decisionAuthority?.executedDecisions,
    modifiedOverlays: result.overlaysModified,
    authority: result.decisionAuthority as unknown as Record<string, unknown> | undefined,
    reasons: result.success ? result.warnings : [...result.warnings, ...result.actionsSkipped.map((item) => item.reason)],
  };
}

async function defaultExecuteTargetedIntent(args: {
  projectId: string;
  userId: string;
  project: any;
  intent: GroundedEditorialIntent;
  evidence: CanonicalChatEvidenceCandidate[];
}): Promise<EditorialOwnerDispatchResult> {
  const [{ planUnifiedDecisionBundleFromCandidates }, { executeEDL }, { projectService }] = await Promise.all([
    import('@/lib/editron/services/unified-decision-bundle'),
    import('@/lib/editron/services/edl-executor'),
    import('@/lib/editron/services/project-service'),
  ]);
  const decisions = buildTargetedSignalDecisions(args.project, args.intent, args.evidence);
  const edl = createDecisionList(args.projectId, decisions);
  const bundle = planUnifiedDecisionBundleFromCandidates([{
    source: 'signal-driven',
    edl,
    editorialPreferences: args.intent.editorialPreferences,
  }]);
  if (!bundle || bundle.edl.decisions.length === 0) {
    return {
      owner: 'targeted-unified-planner',
      status: 'advisory',
      mutated: false,
      reasons: ['family-planners-rejected-all-grounded-candidates'],
    };
  }

  const overlays = [...(args.project.overlays ?? [])];
  const canvas = args.project.playerDimensions ?? { width: 1920, height: 1080 };
  const execution = await executeEDL(
    bundle.edl,
    args.projectId,
    args.userId,
    overlays,
    canvas,
    new Map(),
    bundle.graphicsDensity,
  );
  const mutated = execution.overlaysCreated + execution.overlaysModified > 0;
  if (mutated) {
    await projectService.saveProject(args.userId, args.projectId, {
      overlays,
      aspectRatio: args.project.aspectRatio,
      playerDimensions: canvas,
      fps: args.project.fps,
      durationInFrames: args.project.durationInFrames,
    });
  }
  return {
    owner: 'targeted-unified-planner',
    status: mutated ? 'executed' : 'advisory',
    mutated,
    executedDecisions: execution.decisionsExecuted,
    skippedDecisions: execution.decisionsSkipped,
    createdOverlays: execution.overlaysCreated,
    modifiedOverlays: execution.overlaysModified,
    authority: {
      version: bundle.authority.version,
      decisionMode: bundle.authority.decisionMode,
      executableProducer: bundle.authority.executableProducer,
      signalRole: bundle.authority.signalRole,
    },
    reasons: [
      ...execution.errors,
      ...execution.rejectedDecisions.map((decision) => decision.reason),
      ...(mutated ? [] : ['no-executable-family-decision-survived']),
    ],
  };
}

export async function dispatchScriptIntentToPhase2(
  args: {
    projectId: string;
    userId: string;
    project: any;
    intent: GroundedEditorialIntent;
  },
  enqueue: typeof queueChatScriptRecomposition = queueChatScriptRecomposition,
): Promise<EditorialOwnerDispatchResult> {
  const result = await enqueue({
    projectId: args.projectId,
    userId: args.userId,
    intentId: args.intent.intentId,
    script: args.intent.script ?? '',
    goal: args.intent.goal,
    editorialPreferences: args.intent.editorialPreferences,
  });
  const queued = result.status !== 'failed';
  return {
    owner: 'phase2-script-planner',
    status: queued ? 'queued' : 'failed',
    mutated: false,
    authority: {
      orchestrationVersion: CHAT_SCRIPT_RECOMPOSITION_VERSION,
      queueStatus: result.status,
      uploadBatchId: result.uploadBatchId,
      messageId: result.messageId,
    },
    reasons: [
      result.reason
        ?? (result.status === 'already-queued'
          ? 'script-recomposition-already-queued'
          : 'script-recomposition-queued'),
    ],
  };
}

const defaultDispatchScriptIntent = dispatchScriptIntentToPhase2;

async function defaultPersistAudit(record: Record<string, unknown>): Promise<void> {
  const { getDatabase } = await import('@/lib/editron/db/mongodb');
  const db = await getDatabase();
  await db.collection(CHAT_INTENT_AUDIT_COLLECTION).insertOne(record);
}

export function buildTargetedSignalDecisions(
  project: any,
  intent: GroundedEditorialIntent,
  evidence: CanonicalChatEvidenceCandidate[],
): EditDecision[] {
  const requested = requestedFamilies(intent.editorialPreferences);
  const decisions: EditDecision[] = [];
  for (const candidate of evidence) {
    const frame = candidate.startFrame ?? candidate.endFrame;
    if (frame === null) continue;
    const durationFrames = Math.max(1, (candidate.endFrame ?? frame + 1) - frame);
    const baseParams = evidenceParams(candidate, intent);

    if (requested.has('motionGraphics')) {
      const facts = extractLicensedGraphicFacts(candidate);
      const fact = facts[0];
      if (fact) {
        decisions.push(makeDecision('graphic', frame, durationFrames, candidate.score, {
          ...baseParams,
          ...fact.params,
          semanticMgCandidateLedger: fact.ledger,
        }));
      }
    }
    if (requested.has('zoom')) {
      decisions.push(makeDecision('zoom', frame, durationFrames, candidate.score, {
        ...baseParams,
        intensity: intent.strength,
      }));
    }
    if (requested.has('captions') && candidate.transcriptText.trim()) {
      decisions.push(makeDecision('caption-emphasis', frame, durationFrames, candidate.score, {
        ...baseParams,
        text: candidate.transcriptText,
        phrase: candidate.transcriptText,
        emphasisWord: intent.targetReference ?? candidate.transcriptText,
        momentId: candidate.evidenceId,
      }));
    }
    if (requested.has('transitions')) {
      const boundary = nearestVideoBoundary(project.overlays ?? [], frame);
      if (boundary && Math.abs(boundary.frame - frame) <= CHAT_INTENT_POLICY.maximumBoundaryDistanceFrames) {
        decisions.push(makeDecision('transition', boundary.frame, 1, candidate.score, {
          ...baseParams,
          boundaryFrame: boundary.frame,
          clipAId: boundary.clipAId,
          clipBId: boundary.clipBId,
          transitionJob: intent.goal,
          transitionType: 'hard-cut',
        }));
      }
    }
    if (requested.has('sfx')) {
      decisions.push(makeDecision('sfx-trigger', frame, 1, candidate.score, {
        ...baseParams,
        anchorFrame: frame,
        phraseImpact: candidate.scores.importance ?? candidate.score,
        sfxRole: 'editorial-emphasis',
        sfxType: 'none',
      }));
    }
  }
  return decisions;
}

function extractLicensedGraphicFacts(candidate: CanonicalChatEvidenceCandidate) {
  return extractMotionGraphicSemanticFacts({
    textSources: [
      { text: candidate.transcriptText, source: 'canonical-chat-transcript' },
      { text: candidate.visualText, source: 'canonical-chat-visual' },
    ].filter((source) => source.text.trim()),
    maxFacts: 2,
  }).filter((fact) => fact.licensed);
}

function evidenceParams(candidate: CanonicalChatEvidenceCandidate, intent: GroundedEditorialIntent): Record<string, unknown> {
  const bbox = candidate.boundingBox;
  const signals: Record<string, unknown> = {
    wordImportance: candidate.scores.importance ?? candidate.score,
    visualSignificance: candidate.scores.importance ?? candidate.score,
    textOnScreen: candidate.modalityPresence.ocr,
    ...(bbox ? {
      mainSubjectX: bbox.x,
      mainSubjectY: bbox.y,
      mainSubjectWidth: bbox.width,
      mainSubjectHeight: bbox.height,
    } : {}),
  };
  return {
    candidateConfidence: candidate.score,
    executionConfidence: candidate.score,
    momentImportance: candidate.scores.importance ?? candidate.score,
    evidenceStrength: candidate.score,
    userIntentStrength: intent.strength,
    userIntentUncertainty: intent.uncertainty,
    editorialJob: intent.goal,
    targetReference: intent.targetReference,
    evidenceId: candidate.evidenceId,
    evidenceAuditSourcePaths: candidate.sourcePaths,
    signals,
    unifiedMomentEvidence: {
      source: 'canonical-chat-evidence',
      evidenceId: candidate.evidenceId,
      transcriptText: candidate.transcriptText,
      visualText: candidate.visualText,
      score: candidate.score,
      matchType: candidate.matchType,
      missingModalities: candidate.missingModalities,
    },
    calibrationStatus: CHAT_INTENT_POLICY.calibrationStatus,
  };
}

function makeDecision(
  type: EditDecision['type'],
  frame: number,
  durationFrames: number,
  confidence: number,
  params: Record<string, unknown>,
): EditDecision {
  return {
    type,
    frame,
    durationFrames,
    priority: 2,
    source: 'signal-driven-chat-intent',
    signal: 'grounded-editorial-intent',
    reason: 'Canonical chat evidence licensed an editorial job; family resolver owns physical form.',
    params,
    confidence: clamp01(confidence),
  };
}

function createDecisionList(projectId: string, decisions: EditDecision[]): EditDecisionList {
  const counts = (type: EditDecision['type']) => decisions.filter((decision) => decision.type === type).length;
  return {
    projectId,
    generatedAt: new Date(),
    totalDecisions: decisions.length,
    decisions,
    stats: {
      cutsPerMinute: 0,
      transitionCount: counts('transition'),
      graphicCount: counts('graphic'),
      zoomCount: counts('zoom'),
      speedChangeCount: counts('speed-change'),
      averageConfidence: decisions.length
        ? decisions.reduce((sum, decision) => sum + decision.confidence, 0) / decisions.length
        : 0,
    },
  };
}

function requestedFamilies(preferences?: EditorialPreferences): Set<EditorialFamily> {
  const explicit = preferences?.families ?? {};
  const preferred = Object.entries(explicit)
    .filter(([, preference]) => preference?.mode === 'prefer')
    .map(([family]) => family as EditorialFamily);
  const candidates = preferred.length > 0
    ? preferred
    : (['captions', 'motionGraphics', 'zoom', 'transitions', 'sfx'] as EditorialFamily[]);
  return new Set(candidates.filter((family) => explicit[family]?.mode !== 'off'));
}

function nearestVideoBoundary(overlays: any[], frame: number): { frame: number; clipAId: string | number; clipBId: string | number } | null {
  const videos = overlays
    .filter((overlay) => overlay?.type === 'video' || overlay?.type === 'image')
    .sort((a, b) => Number(a.from ?? 0) - Number(b.from ?? 0));
  let best: { frame: number; clipAId: string | number; clipBId: string | number; distance: number } | null = null;
  for (let index = 1; index < videos.length; index++) {
    const boundaryFrame = Number(videos[index].from ?? 0);
    const distance = Math.abs(boundaryFrame - frame);
    if (!best || distance < best.distance) {
      best = { frame: boundaryFrame, clipAId: videos[index - 1].id, clipBId: videos[index].id, distance };
    }
  }
  return best ? { frame: best.frame, clipAId: best.clipAId, clipBId: best.clipBId } : null;
}

function filterCandidatesToScope(
  candidates: CanonicalChatEvidenceCandidate[],
  scope: GroundedEditorialIntent['scope'],
): CanonicalChatEvidenceCandidate[] {
  return candidates.filter((candidate) => {
    if (scope.overlayIds?.length && !scope.overlayIds.some((id) => String(id) === String(candidate.overlayId))) return false;
    if (scope.startFrame !== undefined && (candidate.endFrame ?? candidate.startFrame ?? -1) < scope.startFrame) return false;
    if (scope.endFrame !== undefined && (candidate.startFrame ?? candidate.endFrame ?? Number.MAX_SAFE_INTEGER) > scope.endFrame) return false;
    return true;
  });
}

function normalizeScope(scope: ChatEditorialIntentInput['scope']): ChatEditorialIntentInput['scope'] {
  const startFrame = scope.startFrame;
  const endFrame = scope.endFrame;
  return {
    kind: scope.kind,
    ...(startFrame !== undefined ? { startFrame } : {}),
    ...(endFrame !== undefined ? { endFrame } : {}),
    ...(scope.overlayIds?.length ? { overlayIds: [...scope.overlayIds] } : {}),
  };
}

function buildIntentAudit(
  args: { userId: string; projectId: string },
  result: ChatEditorialIntentResult,
  now: Date,
): Record<string, unknown> {
  return {
    version: CHAT_EDITORIAL_INTENT_VERSION,
    intentId: result.intent.intentId,
    projectId: args.projectId,
    userId: args.userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    policy: CHAT_INTENT_POLICY,
    intent: result.intent,
    evidence: {
      auditId: result.evidence.auditId,
      analyzedDocumentCount: result.evidence.analyzedDocumentCount,
      safeCandidateCount: result.evidence.safeCandidateCount,
      candidates: result.evidence.candidates.slice(0, CHAT_INTENT_POLICY.maximumEvidenceCandidates).map((candidate) => ({
        evidenceId: candidate.evidenceId,
        frame: candidate.startFrame,
        score: candidate.score,
        accepted: candidate.accepted,
        safeForAutomaticMutation: candidate.safeForAutomaticMutation,
        matchType: candidate.matchType,
        missingModalities: candidate.missingModalities,
        rejectionReasons: candidate.rejectionReasons,
      })),
    },
    dispatch: result.dispatch,
    status: result.status,
  };
}

function cleanText(value: unknown, limit = 1_200): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text ? text.slice(0, limit) : undefined;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
