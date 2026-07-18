import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import {
  MongoChatDeepAnalysisJobStore,
  queueChatDeepAnalysisJob,
  resolveChatDeepAnalysisJobs,
  type ChatDeepAnalysisJob,
  type QueueChatDeepAnalysisResult,
  type ResolveChatDeepAnalysisRequest,
  type ResolveChatDeepAnalysisResult,
} from '@/lib/editron/services/chat-deep-analysis-job';

const LEGACY_CHAT_DEEP_ANALYSIS_TOOLS = new Set([
  'analyze_clip_audio',
  'analyze_clip_video',
]);

const identifierSchema = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9:_-]+$/);
const jobIdsSchema = z.array(identifierSchema).min(1).max(50).superRefine((values, context) => {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'jobIds must not contain duplicates.' });
  }
});

export const resolveClipAnalysisSchema = z.object({
  modality: z.enum(['audio', 'video']),
  targetMode: z.enum(['overlay', 'asset', 'timeline', 'search', 'all']),
  overlayId: z.union([identifierSchema, z.number().int().nonnegative()]).optional(),
  assetId: identifierSchema.optional(),
  target: z.string().trim().min(1).max(500).optional(),
  rangeSpace: z.enum(['timeline', 'source']).optional(),
  startSeconds: z.number().finite().nonnegative().optional(),
  endSeconds: z.number().finite().positive().optional(),
  windowSeconds: z.number().finite().positive().max(120).optional(),
}).strict().superRefine((input, context) => {
  const hasStart = input.startSeconds !== undefined;
  const hasEnd = input.endSeconds !== undefined;
  if (hasStart !== hasEnd) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'startSeconds and endSeconds must be supplied together.' });
  }
  if (hasStart && hasEnd && input.endSeconds! <= input.startSeconds!) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'endSeconds must be greater than startSeconds.' });
  }
  if (input.targetMode === 'overlay' && input.overlayId === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['overlayId'], message: 'overlay targetMode requires overlayId.' });
  }
  if (input.targetMode === 'asset' && !input.assetId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['assetId'], message: 'asset targetMode requires assetId.' });
  }
  if (input.targetMode === 'search' && !input.target) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['target'], message: 'search targetMode requires target.' });
  }
  if (input.targetMode === 'timeline' && (!hasStart || !hasEnd)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'timeline targetMode requires startSeconds and endSeconds.' });
  }
});

const queueResolvedClipAnalysisSchema = z.object({ jobIds: jobIdsSchema }).strict();
const getClipAnalysisResultSchema = z.object({ jobIds: jobIdsSchema }).strict();

type ResolveClipAnalysisInput = z.infer<typeof resolveClipAnalysisSchema>;

export interface ChatDeepAnalysisToolDependencies {
  resolveJobs(request: ResolveChatDeepAnalysisRequest): Promise<ResolveChatDeepAnalysisResult>;
  queueJob(input: { jobId: string; projectId: string; userId: string }): Promise<QueueChatDeepAnalysisResult>;
  findJob(jobId: string, userId: string): Promise<ChatDeepAnalysisJob | null>;
}

interface CreateChatDeepAnalysisToolsOptions {
  userId: string;
  projectId: string;
}

export function filterChatLegacyDeepAnalysisTools<T extends { name: string }>(tools: T[]): T[] {
  return tools.filter((candidate) => !LEGACY_CHAT_DEEP_ANALYSIS_TOOLS.has(candidate.name));
}

export function createChatDeepAnalysisTools(
  { userId, projectId }: CreateChatDeepAnalysisToolsOptions,
  overrides: Partial<ChatDeepAnalysisToolDependencies> = {},
) {
  const dependencies = resolveDependencies(overrides);

  const resolveClipAnalysis = tool(
    async (input: ResolveClipAnalysisInput) => {
      try {
        const result = await dependencies.resolveJobs({ ...input, userId, projectId });
        return envelope(
          'success',
          result,
          null,
          'Call queue_resolved_clip_analysis once with exactly the returned jobIds. Do not claim analysis is complete.',
        );
      } catch (error) {
        return envelope(
          'error',
          null,
          errorMessage(error),
          'Do not guess a clip or time range. Explain the target-resolution failure and ask once for a clearer target.',
        );
      }
    },
    {
      name: 'resolve_clip_analysis',
      description: 'Resolve an explicit audio or video deep-analysis request to durable, revision-bound job IDs. Use overlay for a selected timeline item, asset for an uploaded asset, timeline for an exact edited-time window, search for a named visual/audio target, or all only when the user explicitly asks to inspect every eligible clip. This tool does not call an AI provider and does not edit the project.',
      schema: resolveClipAnalysisSchema,
    },
  );

  const queueResolvedClipAnalysis = tool(
    async ({ jobIds }: z.infer<typeof queueResolvedClipAnalysisSchema>) => {
      const results: QueueChatDeepAnalysisResult[] = [];
      for (const jobId of jobIds) {
        results.push(await dependencies.queueJob({ jobId, projectId, userId }));
      }
      const failed = results.filter((result) => result.status === 'failed' || result.status === 'stale');
      if (failed.length > 0) {
        return envelope(
          'error',
          { jobs: results },
          `${failed.length} of ${results.length} analysis jobs could not be queued.`,
          'Do not claim analysis completed. Report the failed jobs and let the user retry after resolving the stated cause.',
        );
      }
      const allCompleted = results.every((result) => result.status === 'completed');
      return envelope(
        'success',
        { jobs: results },
        null,
        allCompleted
          ? 'Call get_clip_analysis_result with these jobIds to read the completed evidence.'
          : 'Tell the user deep analysis is processing. Do not claim findings are ready; read them later with get_clip_analysis_result.',
      );
    },
    {
      name: 'queue_resolved_clip_analysis',
      description: 'Queue only the exact revision-bound job IDs returned by resolve_clip_analysis. This is the explicit durable batch boundary; never invent IDs, add targets, or expand the batch here.',
      schema: queueResolvedClipAnalysisSchema,
    },
  );

  const getClipAnalysisResult = tool(
    async ({ jobIds }: z.infer<typeof getClipAnalysisResultSchema>) => {
      const jobs: Array<Record<string, unknown>> = [];
      const missing: string[] = [];
      for (const jobId of jobIds) {
        const job = await dependencies.findJob(jobId, userId);
        if (!job || job.projectId !== projectId) {
          missing.push(jobId);
          continue;
        }
        jobs.push(publicJob(job));
      }
      if (missing.length > 0) {
        return envelope(
          'error',
          { jobs, missingJobIds: missing },
          'One or more analysis jobs were not found for this project and user.',
          'Do not use or infer missing results. Resolve and queue a new job for the current project revision.',
        );
      }

      const terminalFailures = jobs.filter((job) => ['failed', 'stale', 'dispatch_failed'].includes(String(job.status)));
      if (terminalFailures.length > 0) {
        return envelope(
          'error',
          { jobs },
          `${terminalFailures.length} analysis jobs ended without usable evidence.`,
          'Report the exact failure. Do not treat an empty or failed result as evidence.',
        );
      }
      const pending = jobs.filter((job) => job.status !== 'completed');
      if (pending.length > 0) {
        return envelope(
          'advisory',
          { jobs },
          null,
          'Analysis is still processing. Do not claim findings or mutate the project from these pending jobs.',
        );
      }
      return envelope(
        'success',
        { jobs },
        null,
        'Use the completed evidence to answer or ground the requested edit. Do not extend findings beyond their target frame ranges.',
      );
    },
    {
      name: 'get_clip_analysis_result',
      description: 'Read durable deep-analysis job status and completed evidence for this project. Use only job IDs returned earlier in the same project conversation. Pending, stale, failed, or missing jobs are not evidence.',
      schema: getClipAnalysisResultSchema,
    },
  );

  return [resolveClipAnalysis, queueResolvedClipAnalysis, getClipAnalysisResult];
}

function resolveDependencies(
  overrides: Partial<ChatDeepAnalysisToolDependencies>,
): ChatDeepAnalysisToolDependencies {
  const store = new MongoChatDeepAnalysisJobStore();
  return {
    resolveJobs: overrides.resolveJobs ?? ((request) => resolveChatDeepAnalysisJobs(request)),
    queueJob: overrides.queueJob ?? ((input) => queueChatDeepAnalysisJob(input)),
    findJob: overrides.findJob ?? ((jobId, userId) => store.find(jobId, userId)),
  };
}

function publicJob(job: ChatDeepAnalysisJob): Record<string, unknown> {
  return {
    jobId: job._id,
    status: job.status,
    modality: job.modality,
    target: job.target,
    attemptCount: job.attemptCount,
    result: job.status === 'completed' ? job.result ?? null : null,
    error: job.error ?? null,
  };
}

function envelope(status: string, data: unknown, error: string | null, nextAction: string) {
  return JSON.stringify({ status, data, error, nextAction });
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
