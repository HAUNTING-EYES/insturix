import {
  buildPostEditorialPlan,
  type PostEditorialPlan,
  type PostTechniqueDirective,
} from './post-editorial-plan';
import {
  buildScriptEditorialPlan,
  type ScriptEditorialPlan,
  type ScriptEditorialPlanInput,
  type ScriptTechniqueDirective,
} from './script-editorial-plan';
import { getWritingKnowledgeIdentity } from '../data/writing-graph-query';
import {
  ThinkForgeAuthoringRequestSchema,
  type ThinkForgeAuthoringRequest,
} from '../schemas/authoring-request';
import type { ThinkForgeContentSignalProfile } from '../signals';

export const THINKFORGE_EDITORIAL_PLAN_VERSION = 1;

export type ThinkForgeEditorialPlanErrorCode =
  | 'EDITORIAL_PLAN_AUTHORING_REQUEST_INVALID'
  | 'EDITORIAL_PLAN_EVIDENCE_INVALID'
  | 'EDITORIAL_PLAN_INPUT_CONFLICT'
  | 'EDITORIAL_PLAN_UNSUPPORTED_OUTPUT';

export class ThinkForgeEditorialPlanError extends Error {
  constructor(
    readonly code: ThinkForgeEditorialPlanErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ThinkForgeEditorialPlanError';
  }
}

export type ThinkForgeEditorialTechniqueRole =
  | 'hook'
  | 'structure'
  | 'cta'
  | 'narration';

export interface ThinkForgeEditorialDoctrineSelection {
  role: ThinkForgeEditorialTechniqueRole;
  techniqueId: string;
  guidance: string;
  avoid: string[];
  source: {
    document: string;
    lines: [number, number];
  };
}

export interface ThinkForgeEditorialEvidencePolicy {
  authorizedFactIds: string[];
  sourceLedgerEntryIds: string[];
  boundary: 'source_only' | 'bounded_implication';
  factualClaimPolicy: 'authorized_sources_only';
  unsupportedClaimPolicy: 'reject';
}

interface ThinkForgeEditorialPlanBase {
  version: typeof THINKFORGE_EDITORIAL_PLAN_VERSION;
  authoringRequest: ThinkForgeAuthoringRequest;
  doctrine: {
    version: string;
    source: string;
    selectedSections: ThinkForgeEditorialDoctrineSelection[];
  };
  evidence: ThinkForgeEditorialEvidencePolicy;
  resolvedProduction: {
    targetDurationSec?: number;
  };
}

export interface ThinkForgePostEditorialPlanArtifact extends ThinkForgeEditorialPlanBase {
  writerKind: 'post';
  execution: {
    kind: 'post';
    plan: PostEditorialPlan;
  };
}

export interface ThinkForgeScriptEditorialPlanArtifact extends ThinkForgeEditorialPlanBase {
  writerKind: 'script';
  execution: {
    kind: 'script';
    plan: ScriptEditorialPlan;
  };
}

export type ThinkForgeEditorialPlan =
  | ThinkForgePostEditorialPlanArtifact
  | ThinkForgeScriptEditorialPlanArtifact;

export interface BuildThinkForgeEditorialPlanInput {
  userPrompt: string;
  authoringRequest: ThinkForgeAuthoringRequest;
  contentSignalProfile?: ThinkForgeContentSignalProfile | null;
  productionBrief?: ScriptEditorialPlanInput['productionBrief'];
  authorizedFactIds?: readonly string[];
  sourceLedgerEntryIds?: readonly string[];
}

function parseAuthoringRequest(input: ThinkForgeAuthoringRequest): ThinkForgeAuthoringRequest {
  const result = ThinkForgeAuthoringRequestSchema.safeParse(input);
  if (!result.success) {
    throw new ThinkForgeEditorialPlanError(
      'EDITORIAL_PLAN_AUTHORING_REQUEST_INVALID',
      `Editorial planning requires a valid authoring request: ${result.error.message}`,
    );
  }
  return result.data;
}

function normalizeEvidenceIds(
  values: readonly string[] | undefined,
  label: string,
): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const id = value.trim();
    if (!id) {
      throw new ThinkForgeEditorialPlanError(
        'EDITORIAL_PLAN_EVIDENCE_INVALID',
        `${label} cannot contain a blank identifier`,
      );
    }
    if (!seen.has(id)) {
      seen.add(id);
      normalized.push(id);
    }
  }
  return normalized;
}

function normalizedBriefDuration(
  brief: ScriptEditorialPlanInput['productionBrief'],
): number | undefined {
  const value = brief?.output.targetDurationSec;
  if (value === undefined || value === null) return undefined;
  if (!Number.isFinite(value) || value <= 0) {
    throw new ThinkForgeEditorialPlanError(
      'EDITORIAL_PLAN_INPUT_CONFLICT',
      'Production brief targetDurationSec must be a finite positive number',
    );
  }
  return value;
}

function resolveTargetDuration(
  request: ThinkForgeAuthoringRequest,
  brief: ScriptEditorialPlanInput['productionBrief'],
): number | undefined {
  const requestDuration = request.targetDurationSec;
  const briefDuration = normalizedBriefDuration(brief);
  if (
    requestDuration !== undefined
    && briefDuration !== undefined
    && requestDuration !== briefDuration
  ) {
    throw new ThinkForgeEditorialPlanError(
      'EDITORIAL_PLAN_INPUT_CONFLICT',
      `Authoring request and production brief disagree on target duration (${requestDuration}s/${briefDuration}s)`,
    );
  }
  return requestDuration ?? briefDuration;
}

function selection(
  role: ThinkForgeEditorialTechniqueRole,
  directive: PostTechniqueDirective | ScriptTechniqueDirective | undefined,
  source: string,
): ThinkForgeEditorialDoctrineSelection | undefined {
  if (!directive) return undefined;
  return {
    role,
    techniqueId: directive.id,
    guidance: directive.guidance,
    avoid: [...directive.avoid],
    source: {
      document: source,
      lines: [...directive.sourceLines],
    },
  };
}

function selectedPostSections(
  plan: PostEditorialPlan,
  source: string,
): ThinkForgeEditorialDoctrineSelection[] {
  return [
    selection('hook', plan.selectedHook, source),
    selection('structure', plan.selectedStructure, source),
    selection('cta', plan.selectedCta, source),
  ].filter((value): value is ThinkForgeEditorialDoctrineSelection => value !== undefined);
}

function selectedScriptSections(
  plan: ScriptEditorialPlan,
  source: string,
): ThinkForgeEditorialDoctrineSelection[] {
  return [
    selection('narration', plan.narration.selectedTechnique, source),
    ...plan.structure.recommendedTechniques.map((directive) => (
      selection('structure', directive, source)
    )),
  ].filter((value): value is ThinkForgeEditorialDoctrineSelection => value !== undefined);
}

/**
 * Build one auditable editorial artifact without duplicating final form logic.
 * Post and script planners remain the respective decision owners.
 */
export function buildThinkForgeEditorialPlan(
  input: BuildThinkForgeEditorialPlanInput,
): ThinkForgeEditorialPlan {
  const authoringRequest = parseAuthoringRequest(input.authoringRequest);
  const identity = getWritingKnowledgeIdentity();
  const authorizedFactIds = normalizeEvidenceIds(input.authorizedFactIds, 'authorizedFactIds');
  const sourceLedgerEntryIds = normalizeEvidenceIds(
    input.sourceLedgerEntryIds,
    'sourceLedgerEntryIds',
  );
  const common: {
    version: typeof THINKFORGE_EDITORIAL_PLAN_VERSION;
    authoringRequest: ThinkForgeAuthoringRequest;
    evidence: Omit<ThinkForgeEditorialEvidencePolicy, 'boundary'>;
  } = {
    version: THINKFORGE_EDITORIAL_PLAN_VERSION,
    authoringRequest,
    evidence: {
      authorizedFactIds,
      sourceLedgerEntryIds,
      factualClaimPolicy: 'authorized_sources_only' as const,
      unsupportedClaimPolicy: 'reject' as const,
    },
  };

  if (
    authoringRequest.contentContract.outputKind === 'social_post'
    || authoringRequest.contentContract.outputKind === 'carousel'
  ) {
    if (input.productionBrief) {
      throw new ThinkForgeEditorialPlanError(
        'EDITORIAL_PLAN_INPUT_CONFLICT',
        'A post editorial plan cannot consume a video production brief',
      );
    }
    const plan = buildPostEditorialPlan({
      userPrompt: input.userPrompt,
      authoringRequest,
      contentSignalProfile: input.contentSignalProfile ?? undefined,
      retrievedFactCount: authorizedFactIds.length,
    });
    return {
      ...common,
      writerKind: 'post',
      doctrine: {
        ...identity,
        selectedSections: selectedPostSections(plan, identity.source),
      },
      evidence: {
        ...common.evidence,
        boundary: plan.sourceBoundary,
      },
      resolvedProduction: {},
      execution: { kind: 'post', plan },
    };
  }

  if (authoringRequest.contentContract.outputKind === 'video_script') {
    const targetDurationSec = resolveTargetDuration(authoringRequest, input.productionBrief);
    const plan = buildScriptEditorialPlan({
      productionBrief: targetDurationSec === undefined
        ? null
        : { output: { targetDurationSec } },
      contentSignalProfile: input.contentSignalProfile ?? undefined,
    });
    return {
      ...common,
      writerKind: 'script',
      doctrine: {
        ...identity,
        selectedSections: selectedScriptSections(plan, identity.source),
      },
      evidence: {
        ...common.evidence,
        boundary: authorizedFactIds.length + sourceLedgerEntryIds.length > 0
          ? 'bounded_implication'
          : 'source_only',
      },
      resolvedProduction: targetDurationSec === undefined ? {} : { targetDurationSec },
      execution: { kind: 'script', plan },
    };
  }

  throw new ThinkForgeEditorialPlanError(
    'EDITORIAL_PLAN_UNSUPPORTED_OUTPUT',
    `Editorial planning does not support ${authoringRequest.contentContract.outputKind}`,
  );
}
