import {
  ThinkForgeAuthoringRequestSchema,
  ThinkForgePostControlsSchema,
  buildThinkForgeAuthoringCompatibilityMetadata,
  createThinkForgeAuthoringRequest,
  resolveThinkForgePlatformSurfaceFromLabel,
  type ThinkForgeAuthoringRequest,
} from '../schemas/authoring-request';
import {
  ThinkForgeDocumentContractSchema,
  normalizeThinkForgeDocumentContract,
  thinkForgeDocumentContractMatchesClassification,
  thinkForgeDocumentContractsMatchExactly,
  type ThinkForgeDocumentContract,
} from '../schemas/document-contract';

export const THINKFORGE_AUTHORING_REQUEST_MIGRATION_VERSION = 1;

export interface LegacyThinkForgeAuthoringSessionRecord {
  _id: string;
  projectMeta?: unknown;
}

export type ThinkForgeAuthoringRequestMigrationDecision =
  | {
      sessionId: string;
      status: 'active';
      source: 'existing_authoring_request' | 'explicit_session_fields';
      authoringRequest: ThinkForgeAuthoringRequest;
      update: {
        $set: Record<string, unknown>;
        $unset: Record<string, ''>;
      };
    }
  | {
      sessionId: string;
      status: 'quarantined';
      reason: string;
      update: {
        $set: Record<string, unknown>;
        $unset: Record<string, ''>;
      };
    };

export interface ThinkForgeAuthoringRequestMigrationPlan {
  decisions: ThinkForgeAuthoringRequestMigrationDecision[];
  summary: { scanned: number; active: number; quarantined: number };
}

export interface ThinkForgeAuthoringRequestMigrationSourcePair<TSource> {
  source: TSource;
  decision: ThinkForgeAuthoringRequestMigrationDecision;
}

export function pairThinkForgeAuthoringRequestMigrationSources<TSource extends { _id: unknown }>(
  sources: readonly TSource[],
  plan: ThinkForgeAuthoringRequestMigrationPlan,
): ThinkForgeAuthoringRequestMigrationSourcePair<TSource>[] {
  if (sources.length !== plan.decisions.length) {
    throw new Error(`Authoring request migration source count drift: ${sources.length}/${plan.decisions.length}`);
  }
  return sources.map((source, index) => {
    const decision = plan.decisions[index];
    if (!decision || String(source._id) !== decision.sessionId) {
      throw new Error(`Authoring request migration source order drift at index ${index}`);
    }
    return { source, decision };
  });
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactSessionId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    throw new Error('session ID must be an exact non-empty string');
  }
  return value;
}

function parseContract(value: unknown): ThinkForgeDocumentContract {
  const parsed = ThinkForgeDocumentContractSchema.safeParse(value);
  if (!parsed.success) throw new Error('session contentContract is missing or invalid');
  if (parsed.data.outputKind === 'carousel' && parsed.data.carouselSlideCount === undefined) {
    throw new Error('carousel contract is missing an authoritative slide count');
  }
  return parsed.data;
}

function parseDuration(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('session durationSec must be a positive whole number');
  }
  return value;
}

function parsePlatform(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('session platform is missing or invalid');
  }
  return resolveThinkForgePlatformSurfaceFromLabel(value);
}

function assertLegacyCompatibility(
  projectMeta: Record<string, unknown>,
  request: ThinkForgeAuthoringRequest,
): void {
  if (projectMeta.contentContract !== undefined) {
    const contract = parseContract(projectMeta.contentContract);
    if (!thinkForgeDocumentContractsMatchExactly(contract, request.contentContract)) {
      throw new Error('session contentContract conflicts with authoringRequest');
    }
  }

  if (typeof projectMeta.format === 'string' && projectMeta.format.trim()) {
    const formatContract = normalizeThinkForgeDocumentContract(projectMeta.format);
    if (formatContract
      && !thinkForgeDocumentContractMatchesClassification(request.contentContract, formatContract)) {
      throw new Error('session format conflicts with authoringRequest');
    }
  }

  if (projectMeta.platform !== undefined) {
    const platform = parsePlatform(projectMeta.platform);
    if (JSON.stringify(platform) !== JSON.stringify(request.platformSurface)) {
      throw new Error('session platform conflicts with authoringRequest');
    }
  }

  if (projectMeta.durationSec !== undefined) {
    const duration = parseDuration(projectMeta.durationSec);
    if (duration !== request.targetDurationSec) {
      throw new Error('session durationSec conflicts with authoringRequest');
    }
  }

  if (projectMeta.postControls !== undefined) {
    const controls = ThinkForgePostControlsSchema.safeParse(projectMeta.postControls);
    if (!controls.success || JSON.stringify(controls.data) !== JSON.stringify(request.postControls)) {
      throw new Error('session postControls conflict with authoringRequest');
    }
  }
}

function resolveRequest(projectMeta: Record<string, unknown>): {
  request: ThinkForgeAuthoringRequest;
  source: 'existing_authoring_request' | 'explicit_session_fields';
} {
  if (projectMeta.authoringRequest !== undefined) {
    const parsed = ThinkForgeAuthoringRequestSchema.safeParse(projectMeta.authoringRequest);
    if (!parsed.success) throw new Error('existing authoringRequest is invalid');
    assertLegacyCompatibility(projectMeta, parsed.data);
    return { request: parsed.data, source: 'existing_authoring_request' };
  }

  const contentContract = parseContract(projectMeta.contentContract);
  const platformSurface = parsePlatform(projectMeta.platform);
  const targetDurationSec = parseDuration(projectMeta.durationSec);
  const isScript = contentContract.outputKind === 'video_script';
  if (!isScript && targetDurationSec !== undefined) {
    throw new Error('post session carries a script-only duration');
  }

  let postControls;
  if (isScript) {
    if (projectMeta.postControls !== undefined) {
      throw new Error('script session carries post-only controls');
    }
  } else {
    const parsed = ThinkForgePostControlsSchema.safeParse(projectMeta.postControls);
    if (!parsed.success) throw new Error('post session is missing explicit post controls');
    postControls = parsed.data;
  }

  if (typeof projectMeta.format === 'string' && projectMeta.format.trim()) {
    const formatContract = normalizeThinkForgeDocumentContract(projectMeta.format);
    if (formatContract && !thinkForgeDocumentContractMatchesClassification(contentContract, formatContract)) {
      throw new Error('session format conflicts with contentContract');
    }
  }

  return {
    request: createThinkForgeAuthoringRequest({
      contentContract,
      platformSurface,
      ...(targetDurationSec !== undefined ? { targetDurationSec } : {}),
      ...(postControls ? { postControls } : {}),
    }),
    source: 'explicit_session_fields',
  };
}

function activeDecision(
  sessionId: string,
  request: ThinkForgeAuthoringRequest,
  source: 'existing_authoring_request' | 'explicit_session_fields',
): ThinkForgeAuthoringRequestMigrationDecision {
  const compatibility = buildThinkForgeAuthoringCompatibilityMetadata(request);
  return {
    sessionId,
    status: 'active',
    source,
    authoringRequest: request,
    update: {
      $set: {
        'projectMeta.authoringRequest': compatibility.authoringRequest,
        'projectMeta.contentContract': compatibility.contentContract,
        'projectMeta.format': compatibility.format,
        'projectMeta.platform': compatibility.platform,
        ...(compatibility.durationSec !== undefined
          ? { 'projectMeta.durationSec': compatibility.durationSec }
          : {}),
        'projectMeta.authoringRequestMigration': {
          version: THINKFORGE_AUTHORING_REQUEST_MIGRATION_VERSION,
          status: 'active',
          source,
        },
      },
      $unset: compatibility.durationSec === undefined ? { 'projectMeta.durationSec': '' } : {},
    },
  };
}

function quarantineDecision(sessionId: string, reason: string): ThinkForgeAuthoringRequestMigrationDecision {
  return {
    sessionId,
    status: 'quarantined',
    reason,
    update: {
      $set: {
        'projectMeta.authoringRequestMigration': {
          version: THINKFORGE_AUTHORING_REQUEST_MIGRATION_VERSION,
          status: 'quarantined',
          reason,
        },
      },
      $unset: {},
    },
  };
}

export function planThinkForgeAuthoringRequestMigration(
  sessions: readonly LegacyThinkForgeAuthoringSessionRecord[],
): ThinkForgeAuthoringRequestMigrationPlan {
  const decisions = sessions.map((session) => {
    let sessionId: string;
    try {
      sessionId = exactSessionId(session._id);
    } catch (error) {
      return quarantineDecision(String(session._id), error instanceof Error ? error.message : 'invalid session ID');
    }

    try {
      const projectMeta = asRecord(session.projectMeta, 'projectMeta');
      const { request, source } = resolveRequest(projectMeta);
      return activeDecision(sessionId, request, source);
    } catch (error) {
      return quarantineDecision(
        sessionId,
        error instanceof Error ? error.message : 'authoring request migration failed',
      );
    }
  });
  const active = decisions.filter((decision) => decision.status === 'active').length;
  return {
    decisions,
    summary: { scanned: decisions.length, active, quarantined: decisions.length - active },
  };
}
