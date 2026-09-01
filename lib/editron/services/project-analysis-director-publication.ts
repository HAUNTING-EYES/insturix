import {
  ProjectMutationConflictError,
  projectService,
  type ProjectAnalysisDirectorDispatchV1,
  type ProjectRevisionV1,
} from '@/lib/editron/services/project-service';

const MAX_PUBLICATION_RECEIPT_CAS_ATTEMPTS = 3;

export interface ProjectAnalysisDirectorPublicationInputV1 {
  projectId: string;
  userId: string;
  analysisRunId: string;
  sourceAssetId: string;
  directorPayload: Record<string, unknown>;
  dispatch: ProjectAnalysisDirectorDispatchV1;
  onProviderAccepted?(): void;
}

export interface ProjectAnalysisDirectorPublicationResultV1 {
  deduplicationId: string;
  providerMessageId: string;
  httpStatus: number;
}

export class ProjectAnalysisDirectorPublicationError extends Error {
  readonly code = 'PROJECT_ANALYSIS_DIRECTOR_PUBLICATION_FAILED';

  constructor(
    message: string,
    readonly providerAccepted: boolean,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'ProjectAnalysisDirectorPublicationError';
  }
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= maxLength;
}

function assertPublicationInputV1(input: ProjectAnalysisDirectorPublicationInputV1): void {
  if (
    !isBoundedString(input.projectId, 500)
    || !isBoundedString(input.userId, 500)
    || !isBoundedString(input.analysisRunId, 200)
    || !isBoundedString(input.sourceAssetId, 500)
    || !input.directorPayload
    || typeof input.directorPayload !== 'object'
    || Array.isArray(input.directorPayload)
    || input.dispatch.schemaVersion !== 1
    || input.dispatch.status !== 'pending'
    || !isBoundedString(input.dispatch.deduplicationId, 200)
  ) {
    throw new ProjectAnalysisDirectorPublicationError(
      'Director publication requires one exact pending dispatch, analysis run, source and payload.',
      false,
    );
  }
}

async function recordProviderPublicationV1(
  input: ProjectAnalysisDirectorPublicationInputV1,
  providerMessageId: string,
): Promise<void> {
  let expectedRevision: ProjectRevisionV1;
  try {
    expectedRevision = (
      await projectService.loadProjectForMutation(input.userId, input.projectId)
    ).revision;
  } catch (error: unknown) {
    throw new ProjectAnalysisDirectorPublicationError(
      error instanceof Error ? error.message : String(error),
      true,
    );
  }
  for (let attempt = 1; attempt <= MAX_PUBLICATION_RECEIPT_CAS_ATTEMPTS; attempt += 1) {
    try {
      const recorded = await projectService.recordProjectAnalysisDirectorDispatchPublishedV1(
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
      throw new ProjectAnalysisDirectorPublicationError(
        `Director publication receipt lost current run ownership (${recorded.disposition}).`,
        true,
      );
    } catch (error: unknown) {
      if (error instanceof ProjectMutationConflictError && attempt < MAX_PUBLICATION_RECEIPT_CAS_ATTEMPTS) {
        expectedRevision = error.currentRevision;
        continue;
      }
      if (error instanceof ProjectAnalysisDirectorPublicationError) throw error;
      throw new ProjectAnalysisDirectorPublicationError(
        error instanceof Error ? error.message : String(error),
        true,
      );
    }
  }
  throw new ProjectAnalysisDirectorPublicationError(
    'Director publication receipt exhausted its bounded revision attempts.',
    true,
  );
}

export async function publishProjectAnalysisDirectorDispatchV1(
  input: ProjectAnalysisDirectorPublicationInputV1,
): Promise<ProjectAnalysisDirectorPublicationResultV1> {
  assertPublicationInputV1(input);
  const qstashToken = process.env.QSTASH_TOKEN;
  if (!isBoundedString(qstashToken, 4_000)) {
    throw new ProjectAnalysisDirectorPublicationError(
      'QStash publication token is not configured.',
      false,
    );
  }
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
  const directorUrl = `${baseUrl}/api/internal/workers/director`;
  const qstashUrl = `${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/${directorUrl}`;
  const response = await fetch(qstashUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${qstashToken}`,
      'Content-Type': 'application/json',
      'Upstash-Retries': '3',
      'Upstash-Delay': '3s',
      'Upstash-Timeout': '800s',
      'Upstash-Deduplication-Id': input.dispatch.deduplicationId,
    },
    body: JSON.stringify({
      ...input.directorPayload,
      projectId: input.projectId,
      userId: input.userId,
      analysisRunId: input.analysisRunId,
      analysisDirectorDispatchId: input.dispatch.deduplicationId,
    }),
  });
  if (!response.ok) {
    const responseBody = await response.text().catch(() => 'response unavailable');
    throw new ProjectAnalysisDirectorPublicationError(
      `Director QStash dispatch failed: HTTP ${response.status} — ${responseBody}`,
      false,
      response.status,
    );
  }
  input.onProviderAccepted?.();

  let providerMessageId: unknown;
  try {
    providerMessageId = (await response.json() as { messageId?: unknown }).messageId;
  } catch {
    throw new ProjectAnalysisDirectorPublicationError(
      'Director QStash dispatch succeeded without a readable provider receipt.',
      true,
      response.status,
    );
  }
  if (!isBoundedString(providerMessageId, 500)) {
    throw new ProjectAnalysisDirectorPublicationError(
      'Director QStash dispatch succeeded without a provider message receipt.',
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
