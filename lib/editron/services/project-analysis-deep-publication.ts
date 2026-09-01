import {
  ProjectMutationConflictError,
  projectService,
  type ProjectAnalysisDeepDispatchV1,
  type ProjectRevisionV1,
} from '@/lib/editron/services/project-service';

const MAX_DEEP_DISPATCH_CAS_ATTEMPTS = 3;

export interface ProjectAnalysisDeepPublicationInputV1 {
  projectId: string;
  userId: string;
  analysisRunId: string;
  sourceAssetId: string;
  tribePayload: Record<string, unknown>;
  dispatch: ProjectAnalysisDeepDispatchV1;
  onProviderAccepted?(): void;
}

export interface ProjectAnalysisDeepPublicationResultV1 {
  deduplicationId: string;
  providerMessageId: string;
  httpStatus: number;
}

export class ProjectAnalysisDeepPublicationError extends Error {
  readonly code = 'PROJECT_ANALYSIS_DEEP_PUBLICATION_FAILED';

  constructor(
    message: string,
    readonly providerAccepted: boolean,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'ProjectAnalysisDeepPublicationError';
  }
}

export class ProjectAnalysisDeepActivationError extends Error {
  readonly code = 'PROJECT_ANALYSIS_DEEP_ACTIVATION_FAILED';

  constructor(message: string) {
    super(message);
    this.name = 'ProjectAnalysisDeepActivationError';
  }
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= maxLength;
}

function assertPublicationInputV1(input: ProjectAnalysisDeepPublicationInputV1): void {
  if (
    !isBoundedString(input.projectId, 500)
    || !isBoundedString(input.userId, 500)
    || !isBoundedString(input.analysisRunId, 200)
    || !isBoundedString(input.sourceAssetId, 500)
    || !input.tribePayload
    || typeof input.tribePayload !== 'object'
    || Array.isArray(input.tribePayload)
    || input.dispatch.schemaVersion !== 1
    || input.dispatch.status !== 'pending'
    || !isBoundedString(input.dispatch.deduplicationId, 200)
  ) {
    throw new ProjectAnalysisDeepPublicationError(
      'TRIBE publication requires one exact pending dispatch, analysis run, source and payload.',
      false,
    );
  }
}

async function recordProviderPublicationV1(
  input: ProjectAnalysisDeepPublicationInputV1,
  providerMessageId: string,
): Promise<void> {
  let expectedRevision: ProjectRevisionV1;
  try {
    expectedRevision = (
      await projectService.loadProjectForMutation(input.userId, input.projectId)
    ).revision;
  } catch (error: unknown) {
    throw new ProjectAnalysisDeepPublicationError(
      error instanceof Error ? error.message : String(error),
      true,
    );
  }
  for (let attempt = 1; attempt <= MAX_DEEP_DISPATCH_CAS_ATTEMPTS; attempt += 1) {
    try {
      const recorded = await projectService.recordProjectAnalysisDeepDispatchPublishedV1(
        input.userId,
        input.projectId,
        {
          expectedRevision,
          runId: input.analysisRunId,
          sourceAssetId: input.sourceAssetId,
          deduplicationId: input.dispatch.deduplicationId,
          providerMessageId,
        },
      );
      if (recorded.disposition === 'ADVANCED' || recorded.disposition === 'ALREADY_ADVANCED') return;
      throw new ProjectAnalysisDeepPublicationError(
        `TRIBE publication receipt lost current run ownership (${recorded.disposition}).`,
        true,
      );
    } catch (error: unknown) {
      if (error instanceof ProjectMutationConflictError && attempt < MAX_DEEP_DISPATCH_CAS_ATTEMPTS) {
        expectedRevision = error.currentRevision;
        continue;
      }
      if (error instanceof ProjectAnalysisDeepPublicationError) throw error;
      throw new ProjectAnalysisDeepPublicationError(
        error instanceof Error ? error.message : String(error),
        true,
      );
    }
  }
  throw new ProjectAnalysisDeepPublicationError(
    'TRIBE publication receipt exhausted its bounded revision attempts.',
    true,
  );
}

export async function activateProjectAnalysisDeepInlineV1(input: {
  projectId: string;
  userId: string;
  analysisRunId: string;
  sourceAssetId: string;
  dispatch: ProjectAnalysisDeepDispatchV1;
}): Promise<void> {
  if (
    !isBoundedString(input.projectId, 500)
    || !isBoundedString(input.userId, 500)
    || !isBoundedString(input.analysisRunId, 200)
    || !isBoundedString(input.sourceAssetId, 500)
    || input.dispatch.schemaVersion !== 1
    || (input.dispatch.status !== 'pending' && input.dispatch.status !== 'inline_ready')
    || !isBoundedString(input.dispatch.deduplicationId, 200)
  ) throw new ProjectAnalysisDeepActivationError('Inline TRIBE activation requires one exact prepared dispatch.');

  let expectedRevision: ProjectRevisionV1;
  try {
    expectedRevision = (
      await projectService.loadProjectForMutation(input.userId, input.projectId)
    ).revision;
  } catch (error: unknown) {
    throw new ProjectAnalysisDeepActivationError(error instanceof Error ? error.message : String(error));
  }
  for (let attempt = 1; attempt <= MAX_DEEP_DISPATCH_CAS_ATTEMPTS; attempt += 1) {
    try {
      const activated = await projectService.recordProjectAnalysisDeepDispatchInlineReadyV1(
        input.userId,
        input.projectId,
        {
          expectedRevision,
          runId: input.analysisRunId,
          sourceAssetId: input.sourceAssetId,
          deduplicationId: input.dispatch.deduplicationId,
        },
      );
      if (activated.disposition === 'ADVANCED' || activated.disposition === 'ALREADY_ADVANCED') return;
      throw new ProjectAnalysisDeepActivationError(
        `Inline TRIBE activation lost current run ownership (${activated.disposition}).`,
      );
    } catch (error: unknown) {
      if (error instanceof ProjectMutationConflictError && attempt < MAX_DEEP_DISPATCH_CAS_ATTEMPTS) {
        expectedRevision = error.currentRevision;
        continue;
      }
      if (error instanceof ProjectAnalysisDeepActivationError) throw error;
      throw new ProjectAnalysisDeepActivationError(error instanceof Error ? error.message : String(error));
    }
  }
  throw new ProjectAnalysisDeepActivationError(
    'Inline TRIBE activation exhausted its bounded revision attempts.',
  );
}

export async function publishProjectAnalysisDeepDispatchV1(
  input: ProjectAnalysisDeepPublicationInputV1,
): Promise<ProjectAnalysisDeepPublicationResultV1> {
  assertPublicationInputV1(input);
  const qstashToken = process.env.QSTASH_TOKEN;
  if (!isBoundedString(qstashToken, 4_000)) {
    throw new ProjectAnalysisDeepPublicationError('QStash publication token is not configured.', false);
  }
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
  const tribeUrl = `${baseUrl}/api/internal/workers/tribe-analysis`;
  const qstashUrl = `${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/${tribeUrl}`;
  let body: string;
  try {
    body = JSON.stringify({
      ...input.tribePayload,
      projectId: input.projectId,
      userId: input.userId,
      assetId: input.sourceAssetId,
      analysisRunId: input.analysisRunId,
      deepAnalysisDispatchId: input.dispatch.deduplicationId,
    });
  } catch (error: unknown) {
    throw new ProjectAnalysisDeepPublicationError(
      `TRIBE publication payload is not serializable: ${error instanceof Error ? error.message : String(error)}`,
      false,
    );
  }
  const response = await fetch(qstashUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${qstashToken}`,
      'Content-Type': 'application/json',
      'Upstash-Retries': '3',
      'Upstash-Delay': '2s',
      'Upstash-Timeout': '800s',
      'Upstash-Deduplication-Id': input.dispatch.deduplicationId,
    },
    body,
  });
  if (!response.ok) {
    const responseBody = await response.text().catch(() => 'response unavailable');
    throw new ProjectAnalysisDeepPublicationError(
      `TRIBE QStash dispatch failed: HTTP ${response.status} — ${responseBody}`,
      false,
      response.status,
    );
  }
  input.onProviderAccepted?.();

  let providerMessageId: unknown;
  try {
    providerMessageId = (await response.json() as { messageId?: unknown }).messageId;
  } catch {
    throw new ProjectAnalysisDeepPublicationError(
      'TRIBE QStash dispatch succeeded without a readable provider receipt.',
      true,
      response.status,
    );
  }
  if (!isBoundedString(providerMessageId, 500)) {
    throw new ProjectAnalysisDeepPublicationError(
      'TRIBE QStash dispatch succeeded without a provider message receipt.',
      true,
      response.status,
    );
  }
  await recordProviderPublicationV1(input, providerMessageId);
  return {
    deduplicationId: input.dispatch.deduplicationId,
    providerMessageId,
    httpStatus: response.status,
  };
}
