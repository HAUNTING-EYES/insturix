import type { ConstraintNode, GraphIndex, TechniqueNode } from '@/lib/editron/services/graph-query';
import { loadGraph } from '@/lib/editron/services/graph-query';
import { buildIsolatedPromptParts } from '@/lib/thinkforge/agents/prompt-boundary';
import { hashJsonArtifact } from '@/lib/thinkforge/persistence/script-sidecar-binding';
import {
  ProductionCapabilityProfileSchema,
  type ProductionCapabilityProfile,
} from '@/lib/thinkforge/production/production-capability-profile';
import {
  PhysicalCaptureDesignSchema,
  type PhysicalCaptureDesign,
} from '@/lib/thinkforge/schemas/physical-capture-design';
import {
  materializeTechnicalCapturePlan,
  TechnicalCapturePlanModelOutputSchema,
  type TechnicalCapturePlan,
  type TechnicalCapturePlanModelOutput,
} from '@/lib/thinkforge/schemas/technical-capture-plan';
import { generateStructuredWithWritingContextCache } from '@/lib/thinkforge/services/gemini-writing-context-cache';

const MODEL = 'gemini-2.5-flash';
const MAX_TOKENS = 20_480;
const TECHNICAL_CAPTURE_KNOWLEDGE_VERSION = 1;
const TECHNIQUE_CATEGORIES = new Set(['camera-movement', 'shot-type', 'sound', 'sound-theory']);
const CONSTRAINT_CATEGORIES = new Set(['accessibility', 'audio', 'continuity', 'sound', 'temporal', 'visual']);

type KnowledgeEvidence = {
  id: string;
  type: 'technique' | 'constraint';
  category: string;
  guidance: string;
  limitations: string[];
};

export type TechnicalCapturePlanGenerator = (input: {
  prompt: string;
  cacheSystemInstruction: string;
  systemInstruction: string;
  schema: typeof TechnicalCapturePlanModelOutputSchema;
  modelName: string;
  temperature: number;
  maxTokens: number;
  thinkingBudgetTokens: number;
  abortSignal?: AbortSignal;
}) => Promise<{
  result: TechnicalCapturePlanModelOutput;
  cacheStatus: 'hit' | 'created' | 'inline';
  modelName: string;
}>;

export interface ResolveTechnicalCapturePlanInput {
  design: unknown;
  profile: unknown;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  abortSignal?: AbortSignal;
}

export interface TechnicalCapturePlanResolverDependencies {
  generate?: TechnicalCapturePlanGenerator;
  loadCreativeGraph?: () => GraphIndex | null;
}

export class TechnicalCapturePlanResolverError extends Error {
  constructor(
    readonly code: 'capability_profile_incomplete' | 'knowledge_unavailable' | 'prompt_boundary_truncated' | 'response_truncated',
    message: string,
  ) {
    super(message);
    this.name = 'TechnicalCapturePlanResolverError';
  }
}

export async function resolveTechnicalCapturePlan(
  input: ResolveTechnicalCapturePlanInput,
  dependencies: TechnicalCapturePlanResolverDependencies = {},
): Promise<{
  plan: TechnicalCapturePlan;
  inputFingerprint: string;
  modelName: string;
  latencyMs: number;
  cacheStatus: 'hit' | 'created' | 'inline';
  recoveryAttempted: boolean;
}> {
  const design = PhysicalCaptureDesignSchema.parse(input.design);
  const profile = ProductionCapabilityProfileSchema.parse(input.profile);
  const capabilityIssues = technicalCapabilityIssues(design, profile, input.aspectRatio);
  if (capabilityIssues.length > 0) {
    throw new TechnicalCapturePlanResolverError(
      'capability_profile_incomplete',
      `The confirmed capability profile cannot satisfy this physical capture design: ${capabilityIssues.join(', ')}.`,
    );
  }
  const graph = (dependencies.loadCreativeGraph ?? loadGraph)();
  if (!graph) {
    throw new TechnicalCapturePlanResolverError(
      'knowledge_unavailable',
      'The canonical creative knowledge graph is unavailable for technical capture planning.',
    );
  }
  const evidence = technicalKnowledge(graph);
  const knowledge = {
    adapterVersion: TECHNICAL_CAPTURE_KNOWLEDGE_VERSION,
    graphVersion: graph.version,
    evidenceIds: evidence.map((item) => item.id),
  };
  const inputFingerprint = hashJsonArtifact({ design, profile, aspectRatio: input.aspectRatio, knowledge });
  const promptParts = buildIsolatedPromptParts({
    systemInstruction: `${TECHNICAL_CAPTURE_CONTRACT}\n<trusted_capture_knowledge>${JSON.stringify(evidence)}</trusted_capture_knowledge>`,
    data: {
      task: 'Resolve a beginner-readable, evidence-backed physical setup for each semantic coverage intent.',
      design,
      capabilityProfile: profile,
      settings: { aspectRatio: input.aspectRatio },
      allowedKnowledgeEvidence: evidence,
      inputFingerprint,
    },
    fieldLimits: { design: 72_000, capabilityProfile: 40_000, allowedKnowledgeEvidence: 36_000 },
    totalLimit: 128_000,
  });
  const protectedTruncation = promptParts.truncatedFields.filter((path) => (
    path.startsWith('data.design')
    || path.startsWith('data.capabilityProfile')
    || path.startsWith('data.allowedKnowledgeEvidence')
  ));
  if (protectedTruncation.length > 0) {
    throw new TechnicalCapturePlanResolverError(
      'prompt_boundary_truncated',
      `Technical capture input exceeded a protected boundary: ${protectedTruncation.join(', ')}`,
    );
  }
  const generationInput = {
    prompt: promptParts.prompt,
    cacheSystemInstruction: TECHNICAL_CAPTURE_CONTRACT,
    systemInstruction: promptParts.systemInstruction,
    schema: TechnicalCapturePlanModelOutputSchema,
    modelName: MODEL,
    temperature: 0.2,
    maxTokens: MAX_TOKENS,
    thinkingBudgetTokens: 3_072,
    abortSignal: input.abortSignal,
  } satisfies Parameters<TechnicalCapturePlanGenerator>[0];
  const generate = dependencies.generate ?? generateTechnicalCapturePlan;
  const startedAt = Date.now();
  let recoveryAttempted = false;
  let generation: Awaited<ReturnType<TechnicalCapturePlanGenerator>>;
  try {
    generation = await generate(generationInput);
  } catch (error) {
    if (!isLengthLimitedStructuredOutput(error)) throw error;
    recoveryAttempted = true;
    try {
      generation = await generate({
        ...generationInput,
        prompt: `${promptParts.prompt}\n<length_recovery>Return the complete schema concisely. Preserve every coverage intent, real resource ID, required calibration category, and unresolved question.</length_recovery>`,
        thinkingBudgetTokens: 1_024,
      });
    } catch (recoveryError) {
      if (!isLengthLimitedStructuredOutput(recoveryError)) throw recoveryError;
      throw new TechnicalCapturePlanResolverError(
        'response_truncated',
        'ThinkForge could not complete the technical capture plan after a bounded retry.',
      );
    }
  }
  const plan = materializeTechnicalCapturePlan({
    design,
    profile,
    aspectRatio: input.aspectRatio,
    knowledge,
    modelOutput: generation.result,
  });
  return {
    plan,
    inputFingerprint,
    modelName: generation.modelName,
    latencyMs: Math.max(0, Date.now() - startedAt),
    cacheStatus: generation.cacheStatus,
    recoveryAttempted,
  };
}

const TECHNICAL_CAPTURE_CONTRACT = `<technical_capture_plan_contract version="1">
- Resolve physical setup only from the approved semantic design and confirmed capability profile. Never classify the video by format or genre.
- Select only supplied camera, space, support, light, modifier, audio, accessory, and natural-light IDs. Do not invent equipment, rooms, people, budget, or availability.
- Group coverage intents only when one confirmed setup can serve all of their narrative, subject, continuity, safety, light, sound, and performance needs.
- Return setups in intended capture order and group same-space setups together whenever the semantic requirements allow it.
- Write beginner-readable observable instructions. Never expose normalized coordinates or ask users to interpret them.
- Do not invent focal lengths, distances, heights, degrees, exposure values, light power, color temperature, setup time, or movement paths. Use a numeric value only when the selected profile explicitly supplies it and it is necessary.
- Choose cameraOperation from actual support/operator evidence. Unknown feasibility becomes an unresolved question, never a typical-value assumption.
- Include framing, focus, stability, continuity, and safety calibration checks for every setup; add movement-safety, lighting, sound, and performance checks whenever applicable.
- A sound check must describe a short test recording. Every passCondition must be observable by a beginner in live preview or playback.
- Cite only supplied knowledge IDs. Return only the structured schema; the server owns identity, hashes, cost calculation, and approval.
</technical_capture_plan_contract>`;

function technicalCapabilityIssues(
  design: PhysicalCaptureDesign,
  profile: ProductionCapabilityProfile,
  aspectRatio: ResolveTechnicalCapturePlanInput['aspectRatio'],
): string[] {
  const required = new Set(design.coverageIntents.flatMap((intent) => intent.requiredCapabilities));
  const expectedOrientation = aspectRatio === '16:9'
    ? 'landscape'
    : aspectRatio === '1:1' ? null : 'portrait';
  const compatibleCamera = profile.equipment.some((item) => item.category === 'camera'
    && (expectedOrientation === null || item.orientations.includes(expectedOrientation)));
  const hasStableSupport = profile.equipment.some((item) => item.category === 'support'
    && ['tripod', 'tabletop-stand'].includes(item.kind));
  const canOperateCamera = hasStableSupport
    || profile.people.cameraOperatorsAvailable > 0
    || profile.people.selfShoot;
  const issues: string[] = [];
  if (profile.spaces.length === 0) issues.push('space_missing');
  if (!compatibleCamera) issues.push('camera_missing_for_orientation');
  if (!canOperateCamera) issues.push('camera_operation_unavailable');
  if (required.has('performer') && profile.people.performersAvailable < 1) {
    issues.push('performer_unavailable');
  }
  if (required.has('audio')
    && !profile.equipment.some((item) => item.category === 'audio')) {
    issues.push('audio_missing');
  }
  if (required.has('lighting')) {
    const hasLighting = profile.equipment.some((item) => item.category === 'light')
      || profile.spaces.some((space) => space.naturalLightSources.length > 0);
    if (!hasLighting) issues.push('lighting_missing');
  }
  return issues;
}

function technicalKnowledge(graph: GraphIndex): KnowledgeEvidence[] {
  const techniques = [...graph.techniques.values()]
    .filter((node) => TECHNIQUE_CATEGORIES.has(node.category))
    .map(techniqueEvidence);
  const constraints = [...graph.constraints.values()]
    .filter((node) => CONSTRAINT_CATEGORIES.has(node.category))
    .map(constraintEvidence);
  return [...techniques, ...constraints]
    .sort((left, right) => left.category.localeCompare(right.category) || left.id.localeCompare(right.id))
    .slice(0, 64);
}

function techniqueEvidence(node: TechniqueNode): KnowledgeEvidence {
  return {
    id: node.id,
    type: 'technique',
    category: node.category,
    guidance: `${node.name}: ${node.summary}`,
    limitations: node.details.neverUseWhen,
  };
}

function constraintEvidence(node: ConstraintNode): KnowledgeEvidence {
  return {
    id: node.id,
    type: 'constraint',
    category: node.category,
    guidance: `${node.name}: ${node.summary}`,
    limitations: [node.details.rule, node.details.rationale],
  };
}

function isLengthLimitedStructuredOutput(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { finishReason?: unknown; message?: unknown; name?: unknown };
  return candidate.finishReason === 'length'
    && (candidate.name === 'AI_NoObjectGeneratedError'
      || (typeof candidate.message === 'string' && candidate.message.startsWith('No object generated:')));
}

async function generateTechnicalCapturePlan(input: Parameters<TechnicalCapturePlanGenerator>[0]) {
  return generateStructuredWithWritingContextCache<TechnicalCapturePlanModelOutput>(input);
}
