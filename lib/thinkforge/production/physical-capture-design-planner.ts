import { buildIsolatedPromptParts } from '@/lib/thinkforge/agents/prompt-boundary';
import { hashJsonArtifact } from '@/lib/thinkforge/persistence/script-sidecar-binding';
import {
  CaptureAcquisitionSourceDocumentSchema,
} from '@/lib/thinkforge/production/capture-acquisition-decisions';
import {
  materializePhysicalCaptureDesign,
  PhysicalCaptureDesignModelOutputSchema,
  resolveEffectivePhysicalCaptureRequirements,
  type PhysicalCaptureDesign,
  type PhysicalCaptureDesignModelOutput,
} from '@/lib/thinkforge/schemas/physical-capture-design';
import { parseVideoTreatment, type VideoTreatment } from '@/lib/thinkforge/schemas/video-treatment';
import { generateStructuredWithWritingContextCache } from '@/lib/thinkforge/services/gemini-writing-context-cache';

import {
  resolvePhysicalCaptureKnowledge,
  type PhysicalCaptureKnowledgeDependencies,
} from './physical-capture-knowledge';

const PHYSICAL_CAPTURE_DESIGN_MODEL = 'gemini-3.6-flash';
const PHYSICAL_CAPTURE_DESIGN_TEMPERATURE = 0.25;
const PHYSICAL_CAPTURE_DESIGN_MAX_TOKENS = 20_480;
const PHYSICAL_CAPTURE_DESIGN_THINKING_TOKENS = 3_072;
const PHYSICAL_CAPTURE_DESIGN_RECOVERY_THINKING_TOKENS = 1_024;

export type PhysicalCaptureDesignGenerator = (input: {
  prompt: string;
  cacheSystemInstruction: string;
  systemInstruction: string;
  schema: typeof PhysicalCaptureDesignModelOutputSchema;
  modelName: string;
  temperature: number;
  maxTokens: number;
  thinkingBudgetTokens: number;
  thinkingLevel: 'low' | 'medium' | 'high';
  abortSignal?: AbortSignal;
}) => Promise<{
  result: PhysicalCaptureDesignModelOutput;
  cacheStatus: 'hit' | 'created' | 'inline';
  modelName: string;
}>;

export interface PlanPhysicalCaptureDesignInput {
  treatment: unknown;
  sourceDocument: unknown;
  acquisitionDecisions?: unknown;
  abortSignal?: AbortSignal;
}

export interface PhysicalCaptureDesignPlannerDependencies {
  generate?: PhysicalCaptureDesignGenerator;
  knowledge?: PhysicalCaptureKnowledgeDependencies;
}

export type PhysicalCaptureDesignPlanResult = {
  design: PhysicalCaptureDesign;
  inputFingerprint: string;
  modelName: string;
  latencyMs: number;
  cacheStatus: 'hit' | 'created' | 'inline';
  recoveryAttempted: boolean;
};

export class PhysicalCaptureDesignPlannerError extends Error {
  constructor(
    readonly code: 'no_physical_capture' | 'prompt_boundary_truncated' | 'response_truncated',
    message: string,
  ) {
    super(message);
    this.name = 'PhysicalCaptureDesignPlannerError';
  }
}

export async function planPhysicalCaptureDesign(
  input: PlanPhysicalCaptureDesignInput,
  dependencies: PhysicalCaptureDesignPlannerDependencies = {},
): Promise<PhysicalCaptureDesignPlanResult> {
  const treatment = parseVideoTreatment(input.treatment);
  const sourceDocument = CaptureAcquisitionSourceDocumentSchema.parse(input.sourceDocument);
  const physicalRequirements = resolveEffectivePhysicalCaptureRequirements({
    treatment,
    sourceDocument,
    acquisitionDecisions: input.acquisitionDecisions,
  });
  if (physicalRequirements.length === 0) {
    throw new PhysicalCaptureDesignPlannerError(
      'no_physical_capture',
      'This treatment has no approved physical-camera requirement to plan.',
    );
  }
  const knowledge = resolvePhysicalCaptureKnowledge({
    treatment,
    physicalRequirements,
  }, dependencies.knowledge);
  const physicalRequirementIds = new Set(physicalRequirements.map((requirement) => requirement.id));
  const physicalEvents = treatment.visualEvents.filter((event) => (
    event.captureRequirementIds.some((requirementId) => physicalRequirementIds.has(requirementId))
  ));
  const inputFingerprint = hashJsonArtifact({
    treatment: {
      treatmentId: treatment.treatmentId,
      treatmentVersion: treatment.version,
      inputFingerprint: treatment.decisionTrace.inputFingerprint,
      physicalRequirements,
      physicalEvents,
    },
    sourceDocument,
    acquisitionDecisions: input.acquisitionDecisions,
    knowledge,
  });
  const promptParts = buildIsolatedPromptParts({
    systemInstruction: buildSystemInstruction(knowledge.evidence),
    data: {
      task: 'Design semantic physical coverage for every approved physical capture requirement.',
      treatment: projectTreatment(treatment, physicalRequirements, physicalEvents),
      sourceDocument,
      allowedKnowledgeEvidence: knowledge.evidence,
      outputIdentity: {
        inputFingerprint,
        note: 'The server owns artifact identity and validates all treatment and provenance references.',
      },
    },
    fieldLimits: {
      treatment: 64_000,
      allowedKnowledgeEvidence: 18_000,
    },
    totalLimit: 88_000,
  });
  assertNoProtectedTruncation(promptParts.truncatedFields);

  const generationInput = {
    prompt: promptParts.prompt,
    cacheSystemInstruction: PHYSICAL_CAPTURE_DESIGN_CONTRACT,
    systemInstruction: promptParts.systemInstruction,
    schema: PhysicalCaptureDesignModelOutputSchema,
    modelName: PHYSICAL_CAPTURE_DESIGN_MODEL,
    temperature: PHYSICAL_CAPTURE_DESIGN_TEMPERATURE,
    maxTokens: PHYSICAL_CAPTURE_DESIGN_MAX_TOKENS,
    thinkingBudgetTokens: PHYSICAL_CAPTURE_DESIGN_THINKING_TOKENS,
    thinkingLevel: 'medium',
    abortSignal: input.abortSignal,
  } satisfies Parameters<PhysicalCaptureDesignGenerator>[0];
  const generate = dependencies.generate ?? generatePhysicalCaptureDesign;
  const startedAt = Date.now();
  let recoveryAttempted = false;
  let generation: Awaited<ReturnType<PhysicalCaptureDesignGenerator>>;
  try {
    generation = await generate(generationInput);
  } catch (error) {
    if (!isLengthLimitedStructuredOutput(error)) throw error;
    recoveryAttempted = true;
    try {
      generation = await generate({
        ...generationInput,
        prompt: `${promptParts.prompt}\n\n<length_recovery>Return the complete schema using one concise sentence per field. Preserve every physical requirement, linked event, provenance reference, continuity constraint, and unresolved question. Do not omit coverage to save space.</length_recovery>`,
        thinkingBudgetTokens: PHYSICAL_CAPTURE_DESIGN_RECOVERY_THINKING_TOKENS,
        thinkingLevel: 'low',
      });
    } catch (recoveryError) {
      if (!isLengthLimitedStructuredOutput(recoveryError)) throw recoveryError;
      throw new PhysicalCaptureDesignPlannerError(
        'response_truncated',
        'ThinkForge could not complete the physical capture design after a bounded retry.',
      );
    }
  }

  const design = materializePhysicalCaptureDesign({
    treatment,
    sourceDocument,
    acquisitionDecisions: input.acquisitionDecisions,
    modelOutput: generation.result,
    knowledge: {
      adapterVersion: knowledge.adapterVersion,
      graphVersion: knowledge.graphVersion,
      evidenceIds: knowledge.evidence.map((evidence) => evidence.id),
    },
  });
  return {
    design,
    inputFingerprint,
    modelName: generation.modelName,
    latencyMs: Math.max(0, Date.now() - startedAt),
    cacheStatus: generation.cacheStatus,
    recoveryAttempted,
  };
}

function projectTreatment(
  treatment: VideoTreatment,
  physicalRequirements: VideoTreatment['captureRequirements'],
  physicalEvents: VideoTreatment['visualEvents'],
) {
  return {
    treatmentId: treatment.treatmentId,
    audienceOutcome: treatment.audienceOutcome,
    viewerPromise: treatment.viewerPromise,
    narrativeArc: treatment.narrativeArc,
    visualVerbalRelationship: treatment.visualVerbalRelationship,
    visualRhythm: treatment.visualRhythm,
    brandBoundaries: treatment.brandBoundaries,
    referenceSynthesis: treatment.referenceSynthesis,
    continuityStrategy: treatment.continuityStrategy,
    audioVoiceStrategy: treatment.audioVoiceStrategy,
    userConstraints: treatment.userConstraints,
    audiovisualIntent: treatment.audiovisualIntent,
    physicalRequirements,
    physicalEvents,
  };
}

function buildSystemInstruction(evidence: unknown): string {
  return `${PHYSICAL_CAPTURE_DESIGN_CONTRACT}\n<trusted_capture_guardrails>${JSON.stringify(evidence)}</trusted_capture_guardrails>`;
}

const PHYSICAL_CAPTURE_DESIGN_CONTRACT = `<physical_capture_design_contract version="1">
- Plan semantic coverage for the approved physical-camera requirements only. Do not classify the video into a format or genre.
- Treat each visual event as a narrative interval that may coexist with speech, sound, graphics, overlays, supplied material, or other events. Do not flatten it into one shot.
- Cover every supplied physical requirement and every linked physical event exactly through their existing IDs. Never invent or rename IDs.
- Describe why composition, viewpoint, camera behavior, focus, lighting, sound, and performance serve the narrative. Do not choose concrete equipment or final form.
- Never output a lens, focal length, aperture, camera model, phone model, coordinates, distance, angle in degrees, light position, room geometry, exposure value, frame rate, keyframe, layout, asset query, provider prompt, edit, transition, or render instruction.
- A person is neither assumed nor required. Describe performance only when the approved requirement/event actually includes a person.
- Use only sourceRefs and creativeReferenceIds already attached to the relevant requirement or linked event. Use only the supplied trusted guardrail IDs in knowledgeRefs.
- Keep unknown capabilities and calibration needs as explicit unresolvedQuestions. Never fill them with defaults or typical values.
- Return only the structured schema. The server owns IDs, hashes, knowledge versions, and document binding.
</physical_capture_design_contract>`;

function assertNoProtectedTruncation(truncatedFields: readonly string[]): void {
  const protectedFields = truncatedFields.filter((path) => (
    path.startsWith('data.treatment')
    || path.startsWith('data.sourceDocument')
    || path.startsWith('data.allowedKnowledgeEvidence')
  ));
  if (protectedFields.length > 0) {
    throw new PhysicalCaptureDesignPlannerError(
      'prompt_boundary_truncated',
      `Physical capture input exceeded a protected prompt boundary: ${protectedFields.join(', ')}`,
    );
  }
}

function isLengthLimitedStructuredOutput(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { finishReason?: unknown; message?: unknown; name?: unknown };
  if (candidate.finishReason !== 'length') return false;
  return candidate.name === 'AI_NoObjectGeneratedError'
    || (typeof candidate.message === 'string' && candidate.message.startsWith('No object generated:'));
}

async function generatePhysicalCaptureDesign(input: Parameters<PhysicalCaptureDesignGenerator>[0]) {
  return generateStructuredWithWritingContextCache<PhysicalCaptureDesignModelOutput>(input);
}
