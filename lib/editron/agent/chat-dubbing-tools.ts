import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import {
  getChatDubbingJob,
  queueChatDubbingJob,
  resolveChatDubbingJob,
  TerminalDubbingError,
  type ChatDubbingJob,
  type ChatDubbingJobStatus,
  type ResolveChatDubbingRequest,
} from '@/lib/editron/services/chat-dubbing-job';
import {
  listSupportedSpeechLanguages,
  type CanonicalSpeechLanguage,
  type SpeechSynthesisCapability,
} from '@/lib/pipeline/speech-capabilities';

const identifierSchema = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9:_-]+$/);
const supportedDubbingLanguages = listSupportedSpeechLanguages().map((item) => item.displayName);

export const dubSelectedDialogueSchema = z.object({
  overlayId: z.union([identifierSchema, z.number().int().nonnegative()]),
  targetLanguage: z.string().trim().min(1).max(80).default('English'),
  voiceId: identifierSchema.optional(),
}).strict();

export const getDubbingJobResultSchema = z.object({ jobId: identifierSchema }).strict();

type QueueResult = Awaited<ReturnType<typeof queueChatDubbingJob>>;

export interface ChatDubbingToolDependencies {
  resolveJob(request: ResolveChatDubbingRequest): Promise<{
    jobId: string;
    created: boolean;
    status: ChatDubbingJobStatus;
    targetLanguage: CanonicalSpeechLanguage;
    speechCapability: SpeechSynthesisCapability;
  }>;
  queueJob(input: { jobId: string; projectId: string; userId: string }): Promise<QueueResult>;
  findJob(jobId: string, userId: string): Promise<ChatDubbingJob | null>;
}

interface CreateChatDubbingToolsOptions {
  userId: string;
  projectId: string;
  sessionId?: string;
  operationId?: string;
}

export function createChatDubbingTools(
  { userId, projectId, sessionId, operationId }: CreateChatDubbingToolsOptions,
  overrides: Partial<ChatDubbingToolDependencies> = {},
) {
  const dependencies = resolveDependencies(overrides);

  const dubSelectedDialogue = tool(
    async (input: z.infer<typeof dubSelectedDialogueSchema>) => {
      try {
        const resolved = await dependencies.resolveJob({
          ...input,
          userId,
          projectId,
          sessionId,
          operationId,
        });
        const queued = await dependencies.queueJob({ jobId: resolved.jobId, projectId, userId });
        if (queued.status === 'failed' || queued.status === 'stale') {
          return envelope(
            'error',
            { jobId: resolved.jobId, status: queued.status },
            queued.reason ?? `Dubbing job ended as ${queued.status}.`,
            'Do not claim the dialogue changed. Report the exact failure and leave the original audio untouched.',
          );
        }
        return envelope(
          'success',
          {
            jobId: resolved.jobId,
            status: queued.status,
            created: resolved.created,
            targetLanguage: resolved.targetLanguage,
            speechCapability: resolved.speechCapability,
          },
          null,
          queued.status === 'completed'
            ? 'The grounded dubbing job is complete. Call get_dubbing_job_result with this jobId to read the committed result.'
            : 'Dubbing is processing durably. Tell the user it is processing and stop; check it later with get_dubbing_job_result.',
        );
      } catch (error) {
        if (error instanceof TerminalDubbingError && error.code === 'unsupported-target-language') {
          return envelope(
            'declined',
            {
              requestedLanguage: input.targetLanguage,
              supportedLanguages: supportedDubbingLanguages,
            },
            null,
            'Explain that the requested language is not supported by the licensed dubbing lane. Do not queue work, translate to a different language, or substitute a generic voiceover.',
          );
        }
        return envelope(
          'error',
          null,
          errorMessage(error),
          'Do not create a generic voiceover or mute the clip manually. Explain why this selected clip cannot be dubbed.',
        );
      }
    },
    {
      name: 'dub_selected_dialogue',
      description: 'Queue faithful English or Hindi dubbing for one explicitly selected video overlay. The server pins a licensed language/provider/voice contract before queueing. The durable worker reads word timings, preserves non-dialogue background audio through source separation, translates phrase by phrase, aligns generated speech within natural timing bounds, and commits atomically. Unsupported languages decline without substitution. This queues work; it does not mean the project changed yet.',
      schema: dubSelectedDialogueSchema,
    },
  );

  const getDubbingJobResult = tool(
    async ({ jobId }: z.infer<typeof getDubbingJobResultSchema>) => {
      const job = await dependencies.findJob(jobId, userId);
      if (!job || job.projectId !== projectId) {
        return envelope(
          'error',
          null,
          'Dubbing job was not found for this project and user.',
          'Do not infer another project\'s status. Queue a new job from the selected clip if needed.',
        );
      }
      if (job.status === 'failed' || job.status === 'stale' || job.status === 'dispatch_failed') {
        return envelope(
          'error',
          publicJob(job),
          job.error ?? `Dubbing job ended as ${job.status}.`,
          'Report the failure exactly. Do not claim the original dialogue was replaced.',
        );
      }
      if (job.status !== 'completed') {
        return envelope(
          'advisory',
          publicJob(job),
          null,
          'Dubbing is still processing. Do not claim completion or queue a duplicate job.',
        );
      }
      return envelope(
        'success',
        publicJob(job),
        null,
        'The translated dialogue and preserved background stem were committed. The editor should reload this project state.',
      );
    },
    {
      name: 'get_dubbing_job_result',
      description: 'Read a previously queued dubbing job for the current project. Pending work is not completion; failed, stale, missing, or cross-project jobs are not usable results.',
      schema: getDubbingJobResultSchema,
    },
  );

  return [dubSelectedDialogue, getDubbingJobResult];
}

function resolveDependencies(overrides: Partial<ChatDubbingToolDependencies>): ChatDubbingToolDependencies {
  return {
    resolveJob: overrides.resolveJob ?? ((request) => resolveChatDubbingJob(request)),
    queueJob: overrides.queueJob ?? ((input) => queueChatDubbingJob(input)),
    findJob: overrides.findJob ?? ((jobId, userId) => getChatDubbingJob(jobId, userId)),
  };
}

function publicJob(job: ChatDubbingJob) {
  return {
    jobId: job._id,
    status: job.status,
    targetLanguage: job.targetLanguage,
    speechCapability: job.speechCapability ?? null,
    stage: job.progress.stage,
    phraseCount: job.progress.phrases?.length ?? 0,
    completedPhraseCount: job.progress.phrases?.filter((phrase) => phrase.voiceAssetId).length ?? 0,
    result: job.status === 'completed' ? job.result ?? null : null,
    renderVerification: job.renderVerification ?? null,
    error: job.error ?? null,
  };
}

function envelope(status: string, data: unknown, error: string | null, nextAction: string) {
  return JSON.stringify({ status, data, error, nextAction });
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
