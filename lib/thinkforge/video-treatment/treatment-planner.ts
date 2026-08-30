import { createHash } from 'node:crypto';
import { ZodError } from 'zod';

import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { recordProviderCostEvent } from '@/lib/financials/provider-cost-events';
import {
  requireThinkForgeEditorialPlanForWriter,
  type ThinkForgeEditorialPlan,
  type ThinkForgeScriptEditorialPlanArtifact,
} from '@/lib/thinkforge/agents/editorial-plan';
import { buildIsolatedPromptParts } from '@/lib/thinkforge/agents/prompt-boundary';
import type { ThinkForgeResolvedAuthoringContext } from '@/lib/thinkforge/context/resolved-authoring-context';
import { hashThinkForgeTraceValue } from '@/lib/thinkforge/provenance/generation-trace';
import {
  parseSourceLedger,
  type SourceLedger,
} from '@/lib/thinkforge/provenance/source-ledger';
import type { ThinkForgeAuthoringRequest } from '@/lib/thinkforge/schemas/authoring-request';
import {
  assertVideoTreatmentReferences,
  parseVideoTreatment,
  VIDEO_TREATMENT_VERSION,
  VideoTreatmentModelOutputSchema,
  VideoTreatmentSchema,
  type VideoTreatment,
  type VideoTreatmentModelOutput,
} from '@/lib/thinkforge/schemas/video-treatment';
import type { ThinkForgeContentSignalProfile } from '@/lib/thinkforge/signals';
import {
  generateStructuredWithWritingContextCache,
} from '@/lib/thinkforge/services/gemini-writing-context-cache';

import {
  resolveVideoTreatmentKnowledge,
  type VideoTreatmentKnowledge,
  type VideoTreatmentKnowledgeDependencies,
} from './treatment-knowledge';

const VIDEO_TREATMENT_MODEL = 'gemini-3.6-flash';
const VIDEO_TREATMENT_TEMPERATURE = 0.35;
// Output capacity remains explicit even though Gemini 3 models use thinking levels
// instead of exposing a token budget for its internal reasoning.
const VIDEO_TREATMENT_MAX_TOKENS = 20_480;
const VIDEO_TREATMENT_THINKING_BUDGET_TOKENS = 4_096;
const VIDEO_TREATMENT_LENGTH_RECOVERY_THINKING_BUDGET_TOKENS = 2_048;
// Trusted treatment policy is part of the cache contract. Never replay output
// authored under an older semantic-evidence policy after that policy changes.
const VIDEO_TREATMENT_CACHE_VERSION = 5;
const VIDEO_TREATMENT_CACHE_TTL_SECONDS = 86_400;
const VIDEO_TREATMENT_CACHE_TIMEOUT_MS = 1_500;
const VIDEO_TREATMENT_CACHE_KEY_PREFIX = 'thinkforge:video-treatment:v5';

const TREATMENT_CONTEXT_DECISION_EVIDENCE = {
  authoringRequest: 'context_authoring_request',
  editorialPlan: 'context_editorial_plan',
  productionBrief: 'context_production_brief',
  userBrief: 'context_user_brief',
  brandContext: 'context_brand_context',
  contentSignalProfile: 'context_content_signal_profile',
} as const;

type TreatmentTraceEvidencePolicy = {
  sourceRefs: readonly string[];
  creativeReferenceIds: readonly string[];
  creativeReferenceEvidenceIds: readonly string[];
  graphConstraintIds: readonly string[];
  writingConstraintIds: readonly string[];
  contextDecisionEvidenceIds: readonly string[];
  decisionEvidenceIds: readonly string[];
  allowedSourceRefs: ReadonlySet<string>;
  allowedDecisionEvidenceIds: ReadonlySet<string>;
  allowedConstraintIds: ReadonlySet<string>;
  legacyDecisionEvidenceAliases: ReadonlyMap<string, string>;
};

export type VideoTreatmentPlanCacheStatus = 'hit' | 'miss' | 'unavailable';

export type VideoTreatmentPlanningReceipt = {
  inputFingerprint: string;
  treatmentId: string;
  modelName: string;
  latencyMs: number;
  cacheStatus: VideoTreatmentPlanCacheStatus;
  writingContextCacheStatus?: 'hit' | 'created' | 'inline';
  writingKnowledgeVersion: string;
  editronCreativeGraphVersion: string | null;
  recoveryAttempted?: boolean;
  userId?: string;
  orgId?: string | null;
  sessionId?: string;
  projectId?: string;
};

export type VideoTreatmentPlanningCacheRecord = {
  version: typeof VIDEO_TREATMENT_CACHE_VERSION;
  inputFingerprint: string;
  treatment: VideoTreatment;
  modelName: string;
  latencyMs: number;
  createdAt: string;
};

export type VideoTreatmentPlanningCacheRead =
  | { status: 'hit'; record: VideoTreatmentPlanningCacheRecord }
  | { status: 'miss' }
  | { status: 'unavailable'; reason: string };

export interface VideoTreatmentPlanningCache {
  read(inputFingerprint: string): Promise<VideoTreatmentPlanningCacheRead>;
  write(record: VideoTreatmentPlanningCacheRecord): Promise<{ status: 'stored' } | { status: 'unavailable'; reason: string }>;
}

export type VideoTreatmentPlannerGenerator = (input: {
  prompt: string;
  cacheSystemInstruction: string;
  systemInstruction: string;
  schema: typeof VideoTreatmentModelOutputSchema;
  modelName: string;
  temperature: number;
  maxTokens: number;
  thinkingBudgetTokens: number;
  thinkingLevel: 'low' | 'medium' | 'high';
  abortSignal?: AbortSignal;
}) => Promise<{
  result: VideoTreatmentModelOutput;
  cacheStatus: 'hit' | 'created' | 'inline';
  modelName: string;
}>;

export interface PlanVideoTreatmentInput {
  userPrompt: string;
  authoringRequest: ThinkForgeAuthoringRequest;
  editorialPlan: ThinkForgeEditorialPlan;
  productionBrief: ProductionBrief;
  authoringContext: ThinkForgeResolvedAuthoringContext;
  contentSignalProfile?: ThinkForgeContentSignalProfile | null;
  sourceLedger: SourceLedger;
  userId?: string;
  orgId?: string | null;
  sessionId?: string;
  projectId?: string;
  abortSignal?: AbortSignal;
}

export interface VideoTreatmentPlannerDependencies {
  cache?: VideoTreatmentPlanningCache;
  generate?: VideoTreatmentPlannerGenerator;
  recordReceipt?: (receipt: VideoTreatmentPlanningReceipt) => Promise<void>;
  knowledge?: VideoTreatmentKnowledgeDependencies;
}

export type VideoTreatmentPlanResult = {
  treatment: VideoTreatment;
  inputFingerprint: string;
  source: 'cache' | 'generated';
  cacheStatus: VideoTreatmentPlanCacheStatus;
  modelName: string;
  latencyMs: number;
  writingContextCacheStatus?: 'hit' | 'created' | 'inline';
  knowledge: VideoTreatmentKnowledge;
};

export class VideoTreatmentPlannerError extends Error {
  constructor(
    readonly code:
      | 'unsupported_output'
      | 'editorial_plan_invalid'
      | 'prompt_boundary_truncated'
      | 'provenance_invalid'
      | 'treatment_contract_invalid'
      | 'response_truncated',
    message: string,
  ) {
    super(message);
    this.name = 'VideoTreatmentPlannerError';
  }
}

/**
 * Plans semantic audiovisual intent before prose. It has no write path to
 * Sidecar, Editron, or Shoot Kit; later phases own those projections.
 */
export async function planVideoTreatment(
  input: PlanVideoTreatmentInput,
  dependencies: VideoTreatmentPlannerDependencies = {},
): Promise<VideoTreatmentPlanResult> {
  const editorialPlan = requireScriptEditorialPlan(input.editorialPlan, input.authoringRequest);
  const sourceLedger = parseSourceLedger(input.sourceLedger);
  const knowledge = resolveVideoTreatmentKnowledge({
    userPrompt: input.userPrompt,
    authoringRequest: input.authoringRequest,
    editorialPlan,
    productionBrief: input.productionBrief,
    contentSignalProfile: input.contentSignalProfile,
    creativeReferenceContext: input.authoringContext.creativeReferenceContext,
  }, dependencies.knowledge);
  const provenancePolicy = buildTreatmentTraceEvidencePolicy({
    sourceLedger,
    authoringContext: input.authoringContext,
    contentSignalProfile: input.contentSignalProfile,
    knowledge,
  });
  const inputFingerprint = buildVideoTreatmentInputFingerprint({
    input,
    editorialPlan,
    sourceLedger,
    knowledge,
  });
  const treatmentId = `treatment_${inputFingerprint.slice(0, 24)}`;
  const cache = dependencies.cache ?? new UpstashVideoTreatmentPlanningCache();
  const cacheRead = await cache.read(inputFingerprint);

  if (
    cacheRead.status === 'hit'
    && cacheRead.record.treatment.treatmentId === treatmentId
  ) {
    assertTreatmentProvenance(
      cacheRead.record.treatment,
      input.authoringContext,
      provenancePolicy,
    );
    await (dependencies.recordReceipt ?? recordVideoTreatmentPlanningReceipt)({
      inputFingerprint,
      treatmentId: cacheRead.record.treatment.treatmentId,
      modelName: cacheRead.record.modelName,
      latencyMs: 0,
      cacheStatus: 'hit',
      writingKnowledgeVersion: knowledge.writingKnowledge.version,
      editronCreativeGraphVersion: knowledge.editronGraph.version,
      recoveryAttempted: false,
      userId: input.userId,
      orgId: input.orgId,
      sessionId: input.sessionId,
      projectId: input.projectId,
    });
    return {
      treatment: cacheRead.record.treatment,
      inputFingerprint,
      source: 'cache',
      cacheStatus: 'hit',
      modelName: cacheRead.record.modelName,
      latencyMs: 0,
      knowledge,
    };
  }

  const promptParts = buildTreatmentPromptParts({
    input,
    editorialPlan,
    sourceLedger,
    knowledge,
    provenancePolicy,
    inputFingerprint,
  });
  assertNoCriticalPromptTruncation(promptParts.truncatedFields);
  const startedAt = Date.now();
  const generate = dependencies.generate ?? generateVideoTreatment;
  const generationInput = {
    prompt: promptParts.prompt,
    cacheSystemInstruction: VIDEO_TREATMENT_CACHE_SYSTEM_INSTRUCTION,
    systemInstruction: promptParts.systemInstruction,
    schema: VideoTreatmentModelOutputSchema,
    modelName: VIDEO_TREATMENT_MODEL,
    temperature: VIDEO_TREATMENT_TEMPERATURE,
    maxTokens: VIDEO_TREATMENT_MAX_TOKENS,
    thinkingBudgetTokens: VIDEO_TREATMENT_THINKING_BUDGET_TOKENS,
    thinkingLevel: 'medium',
    abortSignal: input.abortSignal,
  } satisfies Parameters<VideoTreatmentPlannerGenerator>[0];
  let recoveryAttempted = false;
  let generation: Awaited<ReturnType<VideoTreatmentPlannerGenerator>>;
  try {
    generation = await generate(generationInput);
  } catch (error) {
    if (!isLengthLimitedStructuredOutput(error)) throw error;
    recoveryAttempted = true;
    try {
      generation = await generate({
        ...generationInput,
        prompt: buildTreatmentLengthRecoveryPrompt(promptParts.prompt),
        thinkingBudgetTokens: VIDEO_TREATMENT_LENGTH_RECOVERY_THINKING_BUDGET_TOKENS,
        thinkingLevel: 'low',
      });
    } catch (recoveryError) {
      if (!isLengthLimitedStructuredOutput(recoveryError)) throw recoveryError;
      throw new VideoTreatmentPlannerError(
        'response_truncated',
        'ThinkForge could not complete the audiovisual plan after a bounded retry. Please try again.',
      );
    }
  }
  const latencyMs = Math.max(0, Date.now() - startedAt);
  let treatment: VideoTreatment;
  try {
    treatment = materializeVideoTreatment({
      modelOutput: generation.result,
      inputFingerprint,
      treatmentId,
      input,
      editorialPlan,
      knowledge,
      provenancePolicy,
    });
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    const issues = error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join('.')}:${issue.message}`)
      .join(', ');
    throw new VideoTreatmentPlannerError(
      'treatment_contract_invalid',
      `Video treatment contradicted the approved audiovisual contract: ${issues}`,
    );
  }
  assertTreatmentProvenance(treatment, input.authoringContext, provenancePolicy);

  const cacheWrite = await cache.write({
    version: VIDEO_TREATMENT_CACHE_VERSION,
    inputFingerprint,
    treatment,
    modelName: generation.modelName,
    latencyMs,
    createdAt: new Date().toISOString(),
  });
  const cacheStatus: VideoTreatmentPlanCacheStatus = cacheRead.status === 'unavailable'
    || cacheWrite.status === 'unavailable'
    ? 'unavailable'
    : 'miss';

  await (dependencies.recordReceipt ?? recordVideoTreatmentPlanningReceipt)({
    inputFingerprint,
    treatmentId,
    modelName: generation.modelName,
    latencyMs,
    cacheStatus,
    writingContextCacheStatus: generation.cacheStatus,
    writingKnowledgeVersion: knowledge.writingKnowledge.version,
    editronCreativeGraphVersion: knowledge.editronGraph.version,
    recoveryAttempted,
    userId: input.userId,
    orgId: input.orgId,
    sessionId: input.sessionId,
    projectId: input.projectId,
  });

  return {
    treatment,
    inputFingerprint,
    source: 'generated',
    cacheStatus,
    modelName: generation.modelName,
    latencyMs,
    writingContextCacheStatus: generation.cacheStatus,
    knowledge,
  };
}

export function buildVideoTreatmentInputFingerprint(input: {
  input: Omit<PlanVideoTreatmentInput, 'abortSignal'>;
  editorialPlan: ThinkForgeScriptEditorialPlanArtifact;
  sourceLedger: SourceLedger;
  knowledge: VideoTreatmentKnowledge;
}): string {
  const snapshot = input.input.authoringContext.snapshot;
  return hashThinkForgeTraceValue({
    version: VIDEO_TREATMENT_VERSION,
    authoringRequest: input.input.authoringRequest,
    editorialPlan: input.editorialPlan,
    productionBrief: input.input.productionBrief,
    sourceLedger: input.sourceLedger,
    authoringContext: {
      scope: snapshot.scope,
      brand: snapshot.brand,
      authoringRequest: snapshot.version === 3 ? snapshot.authoringRequest : null,
      writingKnowledgeVersion: snapshot.writingKnowledgeVersion,
      retrieval: {
        projectFactIds: snapshot.retrieval.projectFactIds,
        globalFactIds: snapshot.retrieval.globalFactIds,
        interactionPatternTypes: snapshot.retrieval.interactionPatternTypes,
      },
      systemBriefHash: hashThinkForgeTraceValue(input.input.authoringContext.systemBrief),
      creativeReferences: input.input.authoringContext.creativeReferenceContext,
    },
    contentSignals: input.input.contentSignalProfile
      ? {
          profile: input.input.contentSignalProfile.profile,
          intent: input.input.contentSignalProfile.intent,
          warnings: input.input.contentSignalProfile.warnings,
        }
      : null,
    knowledge: {
      adapterVersion: input.knowledge.adapterVersion,
      writingKnowledge: input.knowledge.writingKnowledge,
      editronGraph: input.knowledge.editronGraph,
    },
  });
}

function requireScriptEditorialPlan(
  editorialPlan: ThinkForgeEditorialPlan,
  authoringRequest: ThinkForgeAuthoringRequest,
): ThinkForgeScriptEditorialPlanArtifact {
  if (authoringRequest.contentContract.outputKind !== 'video_script') {
    throw new VideoTreatmentPlannerError(
      'unsupported_output',
      'Video treatment planning is available only for video-script authoring.',
    );
  }
  try {
    return requireThinkForgeEditorialPlanForWriter(editorialPlan, 'script', authoringRequest);
  } catch (error) {
    throw new VideoTreatmentPlannerError(
      'editorial_plan_invalid',
      error instanceof Error ? error.message : 'Video treatment requires a valid script editorial plan.',
    );
  }
}

function buildTreatmentPromptParts(input: {
  input: PlanVideoTreatmentInput;
  editorialPlan: ThinkForgeScriptEditorialPlanArtifact;
  sourceLedger: SourceLedger;
  knowledge: VideoTreatmentKnowledge;
  provenancePolicy: TreatmentTraceEvidencePolicy;
  inputFingerprint: string;
}) {
  return buildIsolatedPromptParts({
    systemInstruction: buildTreatmentSystemInstruction(input.knowledge),
    data: {
      task: 'Create one whole-video semantic treatment before script prose is written.',
      authoringDestination: input.input.authoringRequest,
      productionBrief: input.input.productionBrief,
      editorialPlan: input.editorialPlan,
      userBrief: input.input.userPrompt,
      brandContext: input.input.authoringContext.systemBrief,
      contentSignalProfile: input.input.contentSignalProfile
        ? {
            constraints: input.input.contentSignalProfile.profile.constraints,
            signals: input.input.contentSignalProfile.profile.signals,
            derived: input.input.contentSignalProfile.profile.derived,
            intent: input.input.contentSignalProfile.intent,
          }
        : null,
      sourceLedger: input.sourceLedger,
      creativeReferences: input.input.authoringContext.creativeReferenceContext,
      treatmentIdentity: {
        treatmentId: `treatment_${input.inputFingerprint.slice(0, 24)}`,
        inputFingerprint: input.inputFingerprint,
        note: 'The server owns these values and will attach them after model output validation.',
      },
      allowedTraceEvidence: {
        sourceRefs: input.provenancePolicy.sourceRefs,
        creativeReferenceIds: input.provenancePolicy.creativeReferenceIds,
        creativeReferenceEvidenceIds: input.provenancePolicy.creativeReferenceEvidenceIds,
        graphConstraintIds: input.provenancePolicy.graphConstraintIds,
        writingConstraintIds: input.provenancePolicy.writingConstraintIds,
        contextDecisionEvidenceIds: input.provenancePolicy.contextDecisionEvidenceIds,
        decisionEvidenceIds: input.provenancePolicy.decisionEvidenceIds,
      },
    },
    fieldLimits: {
      userBrief: 16_000,
      brandContext: 24_000,
      sourceLedger: 48_000,
      creativeReferences: 32_000,
      editorialPlan: 28_000,
      productionBrief: 16_000,
      contentSignalProfile: 24_000,
    },
  });
}

function buildTreatmentSystemInstruction(knowledge: VideoTreatmentKnowledge): string {
  return [
    VIDEO_TREATMENT_CACHE_SYSTEM_INSTRUCTION,
    '<selected_creative_content_knowledge>',
    knowledge.writingKnowledge.relevantSections,
    '</selected_creative_content_knowledge>',
    '<selected_editron_semantic_evidence>',
    JSON.stringify({
      version: knowledge.editronGraph.version,
      guardrails: knowledge.editronGraph.evidence,
      unresolvedAssumptions: knowledge.editronGraph.unresolvedAssumptions,
    }),
    '</selected_editron_semantic_evidence>',
  ].join('\n');
}

const VIDEO_TREATMENT_CACHE_SYSTEM_INSTRUCTION = `<video_treatment_planner_contract version="1">
- Plan the entire video's audiovisual meaning before prose. The result is a semantic treatment, not a shot list or render plan.
- Return only the structured model schema. The server owns treatment IDs, input fingerprints, Brand Vault revision provenance, and knowledge versions.
- A visual event may coexist with spoken audio and another visual event inside one narrative moment. Do not flatten mixed media into a single asset recommendation.
- Obey tf_untrusted_data.editorialPlan.execution.plan.audiovisualIntent as four independent hard constraints. It is not a video-type label. "required" must be represented, "forbidden" must be absent, and "unspecified" leaves the creative decision open.
- audibleSpeech covers every spoken line, including voice-over and synchronous dialogue. onCameraSpeech covers only visible synchronous speech. visiblePerson covers speaking and silent people. physicalCapture covers newly filming physical subjects; it does not include screen recording, supplied assets, stock, animation, graphics, or generated imagery.
- Fill resolvedAudiovisualDecision with the actual whole-treatment choice for speech, speech source, on-camera speech, visible people, physical capture, graphics, generated imagery, supplied footage, screen material, and source material. This is the treatment's semantic decision, not a copy of audiovisualIntent.
- For an "unspecified" intake field, choose the option supported by the user brief, approved references, Brand Vault boundaries, narrative need, and production constraints. Use "unresolved" only when a real missing decision prevents a responsible choice, and surface the exact question. Never prefer voice-over merely because speech was unspecified.
- Cite at least one allowed decision evidence ID for every resolvedAudiovisualDecision section. A category label, guessed format, or unsupported convention is not evidence.
- Set every visualEvents[].visiblePerson independently. Under a global visiblePerson prohibition every event must say "forbidden"; under a requirement at least one event must say "required". Do not hide people inside free-text visualThesis while marking the structured field otherwise.
- Genre, style, channel, campaign, and format labels are non-authoritative metadata. Never use a category label alone to decide speech, people, capture, or acquisition form.
- Resolve unconstrained audiovisual choices from semantic evidence: explicit user constraints, approved source and reference evidence, Brand Vault boundaries, and the narrative or audience need. Cite the material evidence in decisionTrace; a label is not sufficient evidence.
- Add a capture requirement only when a visual event needs named evidence or subject matter to be acquired. Set captureKind to physical-camera, screen-recording, source-asset, or unspecified according to how that evidence can actually be obtained. Use physical-camera only when the evidence must be newly recorded with a physical camera, and declare only user-confirmable capabilities from performer, camera, space, audio, and lighting. Capture requirements may be empty. If the evidence does not establish the acquisition mechanism, use unspecified, leave requiredCapabilities empty, and surface the missing decision as an unresolved question.
- Do not prescribe a camera, lens, framing coordinate, room geometry, lighting position, equipment, asset query, visual layout, typography, keyframe, transition implementation, SFX token, render provider, or timeline segmentation. Editron owns final editorial form; Shoot Kit owns physical calibration after user confirmation.
- Treat sourceLedger as the only factual source. Use only listed source reference IDs; no invented claims, proof, dates, statistics, outcomes, people, UI states, or logos.
- Treat creativeReferences as influence only. Use only provided reference IDs and evidence IDs. Do not copy a reference's wording, layout, branded assets, named people, logos, or recognizable execution.
- Treat selected creative-content knowledge and selected Editron semantic evidence as binding guidance. They constrain attention, accessibility, continuity, rhythm, and audiovisual relationships; they do not license final form choices.
- "allowedTraceEvidence" is the server-owned allowlist for trace IDs. Every "decisionTrace.decisions[].evidenceIds" entry must come from "decisionEvidenceIds". Use the supplied "context_*" IDs for server inputs; never use payload field names such as "editorial_plan" or "brandContext". In "decisionTrace.appliedConstraintIds", cite only IDs from "graphConstraintIds" or "writingConstraintIds", and only when they materially informed the treatment. Otherwise return an empty list.
- Put unknown setup or unavailable reference analysis into named unresolved assumptions. Do not invent capabilities or technical certainty.
- Keep the treatment decision-dense and complete: state each top-level strategy once, keep lists to distinct material decisions, and never restate Brand Vault, source-ledger, or reference input verbatim. Visual events represent meaningful audiovisual/narrative turns, never every line, shot, or edit.
</video_treatment_planner_contract>`;

function isLengthLimitedStructuredOutput(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    finishReason?: unknown;
    message?: unknown;
    name?: unknown;
  };
  if (candidate.finishReason !== 'length') return false;
  return candidate.name === 'AI_NoObjectGeneratedError'
    || (typeof candidate.message === 'string'
      && candidate.message.startsWith('No object generated:'));
}

function buildTreatmentLengthRecoveryPrompt(prompt: string): string {
  return `${prompt}\n\n<video_treatment_length_recovery>\nA prior provider response ended before its JSON closed. Return the complete schema now. Preserve every material audiovisual decision, but use one concise sentence per text field, do not paraphrase the input, and include only distinct hierarchy, boundary, reference, continuity, and trace entries. Do not omit resolvedAudiovisualDecision, visualEvents, captureRequirements, or decisionTrace.\n</video_treatment_length_recovery>`;
}

function assertNoCriticalPromptTruncation(truncatedFields: readonly string[]): void {
  const critical = truncatedFields.filter((path) => /^(data\.(brandContext|sourceLedger|creativeReferences|editorialPlan|productionBrief|contentSignalProfile))/.test(path));
  if (critical.length === 0) return;
  throw new VideoTreatmentPlannerError(
    'prompt_boundary_truncated',
    `Video treatment input exceeded a protected prompt boundary: ${critical.join(', ')}`,
  );
}

function materializeVideoTreatment(input: {
  modelOutput: VideoTreatmentModelOutput;
  inputFingerprint: string;
  treatmentId: string;
  input: PlanVideoTreatmentInput;
  editorialPlan: ThinkForgeScriptEditorialPlanArtifact;
  knowledge: VideoTreatmentKnowledge;
  provenancePolicy: TreatmentTraceEvidencePolicy;
}): VideoTreatment {
  const modelDecisionTrace = {
    ...input.modelOutput.decisionTrace,
    decisions: input.modelOutput.decisionTrace.decisions.map((decision) => ({
      ...decision,
      evidenceIds: canonicalizeDecisionEvidenceIds(
        decision.evidenceIds,
        input.provenancePolicy,
      ),
    })),
  };
  const inheritedUnknowns = [
    ...modelDecisionTrace.unresolvedAssumptions,
    ...input.input.authoringContext.creativeReferenceContext.unresolved.map((unknown) => unknown.message),
    ...input.knowledge.editronGraph.unresolvedAssumptions,
  ];
  const snapshotBrand = input.input.authoringContext.snapshot.brand;
  // The authoring-context snapshot carries additional diagnostic fields. The
  // treatment trace deliberately persists only its stable brand provenance.
  const traceBrand = snapshotBrand
    ? {
        brandId: snapshotBrand.brandId,
        recordId: snapshotBrand.recordId,
        profileFingerprint: snapshotBrand.profileFingerprint,
      }
    : undefined;
  const audiovisualIntent = input.editorialPlan.execution.plan.audiovisualIntent;
  const resolvedAudiovisualDecision = canonicalizeResolvedAudiovisualDecision(
    input.modelOutput.resolvedAudiovisualDecision,
    input.provenancePolicy,
  );
  const audioVoiceStrategy = resolvedAudiovisualDecision.audibleSpeech.presence === 'absent'
    ? 'No intelligible speech. Use only non-verbal audio that serves the approved treatment.'
    : input.modelOutput.audioVoiceStrategy;

  return parseVideoTreatment({
    version: VIDEO_TREATMENT_VERSION,
    treatmentId: input.treatmentId,
    ...input.modelOutput,
    audioVoiceStrategy,
    audiovisualIntent,
    resolvedAudiovisualDecision: {
      ...resolvedAudiovisualDecision,
      origin: 'model',
    },
    decisionTrace: {
      ...modelDecisionTrace,
      inputFingerprint: input.inputFingerprint,
      ...(traceBrand ? { brand: traceBrand } : {}),
      contentSignalProfileVersion: input.input.contentSignalProfile
        ? hashThinkForgeTraceValue({
            profile: input.input.contentSignalProfile.profile,
            intent: input.input.contentSignalProfile.intent,
          })
        : undefined,
      writingKnowledgeVersion: input.knowledge.writingKnowledge.version,
      ...(input.knowledge.editronGraph.version
        ? { editronCreativeGraphVersion: input.knowledge.editronGraph.version }
        : {}),
      unresolvedAssumptions: unique(inheritedUnknowns),
    },
  });
}

function buildTreatmentTraceEvidencePolicy(input: {
  sourceLedger: SourceLedger;
  authoringContext: ThinkForgeResolvedAuthoringContext;
  contentSignalProfile?: ThinkForgeContentSignalProfile | null;
  knowledge: VideoTreatmentKnowledge;
}): TreatmentTraceEvidencePolicy {
  const sourceRefs = unique(input.sourceLedger.entries.map((entry) => entry.referenceId));
  const creativeReferenceIds = unique(input.authoringContext.creativeReferenceContext.selectedReferenceIds);
  const creativeReferenceEvidenceIds = unique(
    input.authoringContext.creativeReferenceContext.referenceSet.references.flatMap(
      (reference) => reference.analysis?.evidence.map((evidence) => evidence.id) ?? [],
    ),
  );
  const graphConstraintIds = unique(input.knowledge.editronGraph.evidence.map((evidence) => evidence.id));
  const writingConstraintIds = unique(input.knowledge.writingKnowledge.traceConstraintIds);
  const contextDecisionEvidenceIds = [
    TREATMENT_CONTEXT_DECISION_EVIDENCE.authoringRequest,
    TREATMENT_CONTEXT_DECISION_EVIDENCE.editorialPlan,
    TREATMENT_CONTEXT_DECISION_EVIDENCE.productionBrief,
    TREATMENT_CONTEXT_DECISION_EVIDENCE.userBrief,
    TREATMENT_CONTEXT_DECISION_EVIDENCE.brandContext,
    ...(input.contentSignalProfile
      ? [TREATMENT_CONTEXT_DECISION_EVIDENCE.contentSignalProfile]
      : []),
  ];
  const decisionEvidenceIds = unique([
    ...sourceRefs,
    ...creativeReferenceIds,
    ...creativeReferenceEvidenceIds,
    ...graphConstraintIds,
    ...writingConstraintIds,
    ...contextDecisionEvidenceIds,
  ]);
  const allowedDecisionEvidenceIds = new Set(decisionEvidenceIds);
  const legacyDecisionEvidenceAliases = new Map<string, string>();
  const registerLegacyAliases = (canonicalId: string, aliases: readonly string[]) => {
    if (!allowedDecisionEvidenceIds.has(canonicalId)) return;
    aliases.forEach((alias) => legacyDecisionEvidenceAliases.set(alias, canonicalId));
  };

  registerLegacyAliases(TREATMENT_CONTEXT_DECISION_EVIDENCE.authoringRequest, [
    'authoringDestination',
    'authoring_destination',
  ]);
  registerLegacyAliases(TREATMENT_CONTEXT_DECISION_EVIDENCE.editorialPlan, [
    'editorialPlan',
    'editorial_plan',
  ]);
  registerLegacyAliases(TREATMENT_CONTEXT_DECISION_EVIDENCE.productionBrief, [
    'productionBrief',
    'production_brief',
  ]);
  registerLegacyAliases(TREATMENT_CONTEXT_DECISION_EVIDENCE.userBrief, [
    'userBrief',
    'user_brief',
  ]);
  registerLegacyAliases(TREATMENT_CONTEXT_DECISION_EVIDENCE.brandContext, [
    'brandContext',
    'brand_context',
  ]);
  registerLegacyAliases(TREATMENT_CONTEXT_DECISION_EVIDENCE.contentSignalProfile, [
    'contentSignalProfile',
    'content_signal_profile',
  ]);

  return {
    sourceRefs,
    creativeReferenceIds,
    creativeReferenceEvidenceIds,
    graphConstraintIds,
    writingConstraintIds,
    contextDecisionEvidenceIds,
    decisionEvidenceIds,
    allowedSourceRefs: new Set(sourceRefs),
    allowedDecisionEvidenceIds,
    allowedConstraintIds: new Set([
      ...graphConstraintIds,
      ...writingConstraintIds,
    ]),
    legacyDecisionEvidenceAliases,
  };
}

function canonicalizeDecisionEvidenceIds(
  evidenceIds: readonly string[],
  policy: TreatmentTraceEvidencePolicy,
): string[] {
  return evidenceIds.map((id) => {
    if (policy.allowedDecisionEvidenceIds.has(id)) return id;
    return policy.legacyDecisionEvidenceAliases.get(id) ?? id;
  });
}

function canonicalizeResolvedAudiovisualDecision(
  decision: VideoTreatmentModelOutput['resolvedAudiovisualDecision'],
  policy: TreatmentTraceEvidencePolicy,
): VideoTreatmentModelOutput['resolvedAudiovisualDecision'] {
  const canonicalize = (evidenceIds: readonly string[]) =>
    canonicalizeDecisionEvidenceIds(evidenceIds, policy);
  return {
    ...decision,
    audibleSpeech: {
      ...decision.audibleSpeech,
      evidenceIds: canonicalize(decision.audibleSpeech.evidenceIds),
    },
    onCameraSpeech: {
      ...decision.onCameraSpeech,
      evidenceIds: canonicalize(decision.onCameraSpeech.evidenceIds),
    },
    visiblePeople: {
      ...decision.visiblePeople,
      evidenceIds: canonicalize(decision.visiblePeople.evidenceIds),
    },
    physicalCapture: {
      ...decision.physicalCapture,
      evidenceIds: canonicalize(decision.physicalCapture.evidenceIds),
    },
    materials: {
      ...decision.materials,
      evidenceIds: canonicalize(decision.materials.evidenceIds),
    },
  };
}

function assertTreatmentProvenance(
  treatment: VideoTreatment,
  authoringContext: ThinkForgeResolvedAuthoringContext,
  policy: TreatmentTraceEvidencePolicy,
): void {
  assertVideoTreatmentReferences(treatment, authoringContext.creativeReferenceContext.referenceSet);

  const issues: string[] = [];
  const check = (ids: readonly string[], allowed: ReadonlySet<string>, owner: string) => {
    ids.forEach((id) => {
      if (!allowed.has(id)) issues.push(`${owner}:${id}`);
    });
  };

  check(treatment.decisionTrace.sourceRefs, policy.allowedSourceRefs, 'trace_source_ref');
  check(treatment.decisionTrace.appliedConstraintIds, policy.allowedConstraintIds, 'trace_constraint');
  treatment.decisionTrace.decisions.forEach((decision) => {
    check(decision.evidenceIds, policy.allowedDecisionEvidenceIds, `decision_evidence:${decision.id}`);
  });
  const resolved = treatment.resolvedAudiovisualDecision;
  check(resolved.audibleSpeech.evidenceIds, policy.allowedDecisionEvidenceIds, 'resolved_audible_speech');
  check(resolved.onCameraSpeech.evidenceIds, policy.allowedDecisionEvidenceIds, 'resolved_on_camera_speech');
  check(resolved.visiblePeople.evidenceIds, policy.allowedDecisionEvidenceIds, 'resolved_visible_people');
  check(resolved.physicalCapture.evidenceIds, policy.allowedDecisionEvidenceIds, 'resolved_physical_capture');
  check(resolved.materials.evidenceIds, policy.allowedDecisionEvidenceIds, 'resolved_materials');
  treatment.visualEvents.forEach((event) => check(event.sourceRefs, policy.allowedSourceRefs, `visual_event_source:${event.id}`));
  treatment.captureRequirements.forEach((requirement) => check(
    requirement.sourceRefs,
    policy.allowedSourceRefs,
    `capture_requirement_source:${requirement.id}`,
  ));

  if (issues.length > 0) {
    throw new VideoTreatmentPlannerError(
      'provenance_invalid',
      `Video treatment contains undeclared provenance: ${issues.join(', ')}`,
    );
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

async function generateVideoTreatment(input: Parameters<VideoTreatmentPlannerGenerator>[0]) {
  return generateStructuredWithWritingContextCache<VideoTreatmentModelOutput>(input);
}

async function recordVideoTreatmentPlanningReceipt(input: VideoTreatmentPlanningReceipt): Promise<void> {
  await recordProviderCostEvent({
    status: 'success',
    service: 'thinkforge',
    action: 'video_treatment_planning',
    route: 'lib/thinkforge/video-treatment/treatment-planner',
    provider: 'gemini',
    model: input.modelName,
    // Provider cost itself is recorded by the shared writing-context operation.
    operation: 'treatment_planning_receipt',
    userId: input.userId,
    orgId: input.orgId ?? undefined,
    projectId: input.projectId,
    taskId: input.sessionId,
    units: { requestCount: 0, functionMs: input.latencyMs },
    metadata: {
      inputFingerprint: input.inputFingerprint,
      treatmentId: input.treatmentId,
      cacheStatus: input.cacheStatus,
      writingContextCacheStatus: input.writingContextCacheStatus,
      writingKnowledgeVersion: input.writingKnowledgeVersion,
      editronCreativeGraphVersion: input.editronCreativeGraphVersion,
      recoveryAttempted: input.recoveryAttempted === true,
      upstreamCostOperation: 'writing_context_cache',
    },
  });
}

class UpstashVideoTreatmentPlanningCache implements VideoTreatmentPlanningCache {
  async read(inputFingerprint: string): Promise<VideoTreatmentPlanningCacheRead> {
    const redis = await getTreatmentRedis();
    if (!redis) return { status: 'unavailable', reason: 'redis_not_configured' };

    try {
      const raw = await withCacheDeadline(
        redis.get<unknown>(cacheKey(inputFingerprint)),
        'read',
      );
      const record = parseCacheRecord(raw, inputFingerprint);
      if (record) return { status: 'hit', record };
      if (raw !== null) await withCacheDeadline(redis.del(cacheKey(inputFingerprint)), 'write');
      return { status: 'miss' };
    } catch (error) {
      return { status: 'unavailable', reason: cacheErrorMessage(error) };
    }
  }

  async write(record: VideoTreatmentPlanningCacheRecord): Promise<{ status: 'stored' } | { status: 'unavailable'; reason: string }> {
    const redis = await getTreatmentRedis();
    if (!redis) return { status: 'unavailable', reason: 'redis_not_configured' };

    try {
      await withCacheDeadline(
        redis.set(cacheKey(record.inputFingerprint), record, { ex: VIDEO_TREATMENT_CACHE_TTL_SECONDS }),
        'write',
      );
      return { status: 'stored' };
    } catch (error) {
      return { status: 'unavailable', reason: cacheErrorMessage(error) };
    }
  }
}

type TreatmentRedis = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options: { ex: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

async function getTreatmentRedis(): Promise<TreatmentRedis | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({ url, token }) as unknown as TreatmentRedis;
}

function withCacheDeadline<T>(promise: Promise<T>, operation: 'read' | 'write'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Treatment cache ${operation} timed out`)), VIDEO_TREATMENT_CACHE_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function parseCacheRecord(value: unknown, inputFingerprint: string): VideoTreatmentPlanningCacheRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Partial<VideoTreatmentPlanningCacheRecord>;
  if (
    record.version !== VIDEO_TREATMENT_CACHE_VERSION
    || record.inputFingerprint !== inputFingerprint
    || typeof record.modelName !== 'string'
    || typeof record.latencyMs !== 'number'
    || !Number.isFinite(record.latencyMs)
    || typeof record.createdAt !== 'string'
  ) return null;

  const parsedTreatment = VideoTreatmentSchema.safeParse(record.treatment);
  if (!parsedTreatment.success) return null;
  const treatment = parsedTreatment.data;
  if (treatment.decisionTrace.inputFingerprint !== inputFingerprint) return null;
  return {
    version: VIDEO_TREATMENT_CACHE_VERSION,
    inputFingerprint,
    treatment,
    modelName: record.modelName,
    latencyMs: record.latencyMs,
    createdAt: record.createdAt,
  };
}

function cacheKey(inputFingerprint: string): string {
  return `${VIDEO_TREATMENT_CACHE_KEY_PREFIX}:${createHash('sha256').update(inputFingerprint).digest('hex')}`;
}

function cacheErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 240) : 'cache_unavailable';
}
