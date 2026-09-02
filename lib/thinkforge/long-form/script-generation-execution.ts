import { applyCommand } from '../services/command-service';
import * as db from '../services/db';
import { ScriptChapterPlanAgent, type ScriptChapterPlanInput } from '../agents/script-chapter-plan-agent';
import { requireThinkForgeEditorialPlanForWriter } from '../agents/editorial-plan';
import { ScriptWriterAgent, assertUsableScriptWriterResult, type ScriptWriterInput } from '../agents/script-writer-agent';
import { thinkForgeBlocksToTiptapJSON } from '../mappers/thinkforge-to-tiptap';
import { parseMarkdownToBlocks } from '../normalization/markdown-parser';
import { hashScriptDocumentContent } from '../persistence/script-sidecar-binding';
import {
  ThinkForgeWriterInvocationTraceV1Schema,
  buildThinkForgeDocumentGenerationTrace,
  hashThinkForgeTraceValue,
  requireThinkForgeWriterInvocationTrace,
  type ThinkForgeWriterInvocationTraceV1,
} from '../provenance/generation-trace';
import { validateThinkForgeBlocks } from '../schemas/thinkforge-block';
import {
  assertNoCriticalContentProfileViolations,
  evaluateContentProfileCompliance,
  formatContentProfileComplianceViolations,
  shouldAutoRepairContentProfileViolations,
} from '../signals/content-profile-compliance';
import { resolveProjectMetaBrandId } from '../state/types';
import {
  assembleLongFormScriptResult,
  createScriptChapterArtifact,
  ScriptChapterAssemblyError,
} from './script-chapter-assembly';
import {
  findScriptChapterWriteCapacityConflicts,
  type ScriptChapterWriteCapacityConflict,
} from './script-chapter-capacity';
import {
  ScriptChapterSemanticValidationInputError,
  validateScriptChapterSemanticExecution,
} from './script-chapter-semantic-validation';
import {
  assertLongFormScriptJobInputIntegrity,
  LongFormScriptJobInputIntegrityError,
  type LongFormScriptCommitReceipt,
  type LongFormScriptGenerationJobSnapshot,
  type LongFormScriptJobNextAction,
  type ScriptChapterArtifact,
} from './script-generation-job-contract';

export type LongFormScriptActionResult =
  | { kind: 'plan'; plan: NonNullable<LongFormScriptGenerationJobSnapshot['plan']> }
  | { kind: 'write_chapter'; artifact: ScriptChapterArtifact }
  | { kind: 'assemble'; result: NonNullable<LongFormScriptGenerationJobSnapshot['assembledResult']> }
  | { kind: 'commit'; receipt: LongFormScriptCommitReceipt }
  | { kind: 'complete' };

export class LongFormScriptNonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LongFormScriptNonRetryableError';
  }
}

export class ScriptChapterCapacityConflictError extends LongFormScriptNonRetryableError {
  readonly code = 'SCRIPT_CHAPTER_CAPACITY_CONFLICT';

  constructor(readonly conflicts: readonly ScriptChapterWriteCapacityConflict[]) {
    super(
      `The approved narrative contains ${conflicts.length} chapter${conflicts.length === 1 ? '' : 's'} `
      + `that cannot fit the current writer response envelope: ${conflicts.map((conflict) => (
        `${conflict.actId}/${conflict.chapterId} (${conflict.targetDurationSeconds}s, `
        + `${conflict.feasibility.requiredVisibleOutputTokens}/${conflict.feasibility.maximumOutputTokens - conflict.feasibility.thinkingBudgetTokens} visible tokens)`
      )).join('; ')}. Replan the chapter semantically before writing it.`,
    );
    this.name = 'ScriptChapterCapacityConflictError';
  }
}

export async function executeLongFormScriptAction(input: {
  job: LongFormScriptGenerationJobSnapshot;
  action: LongFormScriptJobNextAction;
  signal?: AbortSignal;
}): Promise<LongFormScriptActionResult> {
  const { job, action, signal } = input;
  assertLongFormScriptJobInputIntegrity(job);
  await assertGenerationActive(job);
  switch (action.kind) {
    case 'plan': {
      const output = await new ScriptChapterPlanAgent().generatePlan(
        buildChapterPlanInput(job), undefined, signal,
      );
      return { kind: 'plan', plan: output.result };
    }
    case 'write_chapter': {
      if (!job.plan) throw new LongFormScriptNonRetryableError('Chapter generation requires a durable master plan.');
      assertScriptChapterPlanFitsWriter(job, job.plan);
      const chapterExecution = {
        plan: job.plan,
        actId: action.actId,
        chapterId: action.chapterId,
        previousArtifact: previousChapterArtifact(job, action.chapterId),
      };
      const output = await new ScriptWriterAgent().runStructured({
        ...buildChapterPlanInput(job),
        contentSignalProfile: job.input.authoringInput.contentSignalProfile,
        chapterExecution,
      } satisfies ScriptWriterInput, undefined, signal);
      const semanticValidation = await validateScriptChapterSemanticExecution({
        chapterExecution,
        result: output.result,
        abortSignal: signal,
        telemetry: {
          userId: job.input.userId,
          orgId: job.input.orgId ?? undefined,
          projectId: resolveProjectMetaBrandId(job.input.authoringContext.projectMeta),
          taskId: job.sessionId,
        },
      });
      return {
        kind: 'write_chapter',
        artifact: createScriptChapterArtifact({
          plan: job.plan,
          chapterId: action.chapterId,
          result: output.result,
          writerTrace: requireThinkForgeWriterInvocationTrace(output.metadata?.writerTrace),
          semanticValidation,
        }),
      };
    }
    case 'assemble': {
      if (!job.plan) throw new LongFormScriptNonRetryableError('Assembly requires a durable master plan.');
      const result = assembleLongFormScriptResult({
        plan: job.plan,
        artifacts: job.chapterArtifacts,
        videoTreatment: job.input.authoringInput.videoTreatment,
      });
      const approvedPlan = requireThinkForgeEditorialPlanForWriter(
        job.input.authoringInput.editorialPlan,
        'script',
        job.input.authoringInput.authoringRequest,
      );
      assertUsableScriptWriterResult(result, {
        productionBrief: job.input.authoringInput.productionBrief,
        contentSignalProfile: job.input.authoringInput.contentSignalProfile,
        videoTreatment: job.input.authoringInput.videoTreatment,
        editorialPlan: approvedPlan.execution.plan,
      });
      assertFinalProfileCompliance(job, result.content);
      return { kind: 'assemble', result };
    }
    case 'commit': return { kind: 'commit', receipt: await commitAssembledScript(job) };
    case 'complete': return { kind: 'complete' };
    case 'none': throw new LongFormScriptNonRetryableError('A terminal long-form job has no executable action.');
  }
}

function assertScriptChapterPlanFitsWriter(
  job: LongFormScriptGenerationJobSnapshot,
  plan: NonNullable<LongFormScriptGenerationJobSnapshot['plan']>,
): void {
  const conflicts = findScriptChapterWriteCapacityConflicts({
    plan,
    productionBrief: job.input.authoringInput.productionBrief,
    contentSignalProfile: job.input.authoringInput.contentSignalProfile,
  });
  if (conflicts.length > 0) throw new ScriptChapterCapacityConflictError(conflicts);
}

export function isRetryableLongFormScriptActionError(error: unknown): boolean {
  return !(error instanceof LongFormScriptNonRetryableError)
    && !(error instanceof LongFormScriptJobInputIntegrityError)
    && !(error instanceof ScriptChapterAssemblyError)
    && !(error instanceof ScriptChapterSemanticValidationInputError);
}

function buildChapterPlanInput(job: LongFormScriptGenerationJobSnapshot): ScriptChapterPlanInput {
  const { authoringContext, authoringInput } = job.input;
  return {
    ...authoringInput,
    context: { ...authoringInput.context, systemBrief: authoringContext.systemBrief },
    retrievedContext: authoringContext.retrievedContext,
    project: authoringContext.projectMeta,
    sessionId: job.sessionId,
    brandId: resolveProjectMetaBrandId(authoringContext.projectMeta) ?? undefined,
  };
}

function previousChapterArtifact(
  job: LongFormScriptGenerationJobSnapshot,
  chapterId: string,
): ScriptChapterArtifact | null {
  const chapterIds = job.plan!.acts.flatMap((act) => act.chapters.map((chapter) => chapter.id));
  const index = chapterIds.indexOf(chapterId);
  if (index < 0) throw new LongFormScriptNonRetryableError(`Unknown chapter assignment: ${chapterId}`);
  if (index === 0) return null;
  const previousId = chapterIds[index - 1]!;
  const artifact = job.chapterArtifacts[previousId];
  if (!artifact) throw new LongFormScriptNonRetryableError(`Previous chapter artifact is missing: ${previousId}`);
  return artifact;
}

function assertFinalProfileCompliance(
  job: LongFormScriptGenerationJobSnapshot,
  content: string,
): ReturnType<typeof buildQualityGateEvidence> {
  const profile = job.input.authoringInput.contentSignalProfile;
  if (!profile) return buildQualityGateEvidence(job, null);
  const compliance = evaluateContentProfileCompliance(content, profile);
  assertNoCriticalContentProfileViolations(compliance.violations);
  return buildQualityGateEvidence(job, compliance);
}

function buildQualityGateEvidence(
  job: LongFormScriptGenerationJobSnapshot,
  compliance: ReturnType<typeof evaluateContentProfileCompliance> | null,
) {
  return {
    kind: 'long_form_script',
    chapterCount: job.plan?.acts.reduce((total, act) => total + act.chapters.length, 0) ?? 0,
    narrativeContract: 'passed',
    profileCompliance: compliance ? {
      status: 'evaluated',
      score: compliance.score,
      penalty: compliance.penalty,
      hasCritical: shouldAutoRepairContentProfileViolations(compliance.violations),
      violationIds: compliance.violations.map((violation) => violation.id),
      violations: formatContentProfileComplianceViolations(compliance.violations),
    } : { status: 'not_applicable' },
  };
}

async function commitAssembledScript(
  job: LongFormScriptGenerationJobSnapshot,
): Promise<LongFormScriptCommitReceipt> {
  if (!job.plan || !job.assembledResult) {
    throw new LongFormScriptNonRetryableError('Commit requires a durable plan and assembled script.');
  }
  const contract = job.input.authoringInput.authoringRequest.contentContract;
  if (contract.outputKind !== 'video_script') {
    throw new LongFormScriptNonRetryableError('Long-form script jobs require a video-script document contract.');
  }
  const contentHash = hashScriptDocumentContent(job.assembledResult.content);
  const existing = await getAuthorizedScript(job);
  if (existing?.version === job.input.baseVersion + 1) {
    if (hashScriptDocumentContent(existing.content) === contentHash
      && persistedGenerationId(existing.metadata) === job.generationId) {
      return {
        documentVersion: existing.version,
        contentHash,
        committedAt: existing.updatedAt.toISOString(),
      };
    }
    throw new LongFormScriptNonRetryableError('Document version was committed by a different generation.');
  }
  if ((existing?.version ?? 0) !== job.input.baseVersion) {
    throw new LongFormScriptNonRetryableError(
      `Document changed during long-form generation (${existing?.version ?? 0}/${job.input.baseVersion}).`,
    );
  }
  await claimGenerationCommit(job);

  const chapterWriterTraces = orderedChapterTraces(job);
  const writerTrace = aggregateChapterWriterTraces(chapterWriterTraces);
  const qualityGateEvidence = assertFinalProfileCompliance(job, job.assembledResult.content);
  const generationTrace = buildThinkForgeDocumentGenerationTrace({
    operation: { kind: 'create', id: job.generationId },
    document: {
      sessionId: job.sessionId,
      scriptId: job.input.scriptId,
      expectedVersion: job.input.baseVersion + 1,
      writerType: 'script',
    },
    writerTrace,
    authoringContextSnapshot: job.input.authoringContext.snapshot,
    signalTrace: job.input.signalTrace,
    productionBrief: job.input.authoringInput.productionBrief,
    sourceLedger: job.input.authoringInput.sourceLedger,
    outputContent: job.assembledResult.content,
    qualityGateEvidence,
  });
  const blocks = validateThinkForgeBlocks(parseMarkdownToBlocks(job.assembledResult.content));
  const result = await applyCommand({
    type: 'ReplaceDocument',
    sessionId: job.sessionId,
    baseVersion: job.input.baseVersion,
    source: 'ai',
    payload: {
      scriptId: job.input.scriptId,
      title: job.plan.title,
      content: job.assembledResult.content,
      blocks,
      richText: thinkForgeBlocksToTiptapJSON(blocks),
      documentType: contract.outputKind,
      contentContract: contract,
      metadata: {
        workflow: 'create', source: 'ai', documentType: contract.outputKind,
        authoringContextSnapshot: job.input.authoringContext.snapshot,
        signalTrace: job.input.signalTrace,
        briefSnapshot: job.input.authoringInput.productionBrief,
        writerOutput: {
          writerType: 'script',
          contentAnalysis: job.assembledResult.contentAnalysis,
          visualPrompts: job.assembledResult.visualMetadata,
          scriptSidecar: job.assembledResult.sidecar,
          sidecarVersion: job.assembledResult.sidecar.sidecarVersion,
          ...(job.input.authoringInput.videoTreatment
            ? { videoTreatment: job.input.authoringInput.videoTreatment }
            : {}),
          sourceLedger: job.input.authoringInput.sourceLedger,
          writerMetadata: job.assembledResult.metadata,
          ...(job.input.contextMetadata?.trendContext
            ? { trendContext: job.input.contextMetadata.trendContext }
            : {}),
          ...(job.input.contextMetadata?.castingContext
            ? { castingContext: job.input.contextMetadata.castingContext }
            : {}),
          profileCompliance: qualityGateEvidence,
          generationTrace,
          longForm: { version: 1, jobId: job.id, plan: job.plan, chapterWriterTraces },
        },
      },
    },
  }, job.input.userId, job.input.orgId);
  if (!result.ok) throw new LongFormScriptNonRetryableError(result.error);
  if (!result.script.version) throw new LongFormScriptNonRetryableError('Committed script has no version.');
  return { documentVersion: result.script.version, contentHash, committedAt: new Date().toISOString() };
}

async function getAuthorizedScript(job: LongFormScriptGenerationJobSnapshot) {
  const session = await db.getSession(job.sessionId, job.input.userId, job.input.orgId);
  if (!session) throw new LongFormScriptNonRetryableError('Session not found.');
  return db.getScript(session._id, job.input.scriptId);
}

async function assertGenerationActive(job: LongFormScriptGenerationJobSnapshot): Promise<db.GenerationState> {
  const generation = await db.getActiveGeneration(job.sessionId);
  if (
    !generation
    || generation.id !== job.generationId
    || generation.status !== 'running'
    || generation.scriptId !== job.input.scriptId
  ) {
    throw new LongFormScriptNonRetryableError('The canonical generation is no longer active.');
  }
  return generation;
}

async function claimGenerationCommit(job: LongFormScriptGenerationJobSnapshot): Promise<void> {
  if (await db.claimGenerationCommit(job.sessionId, job.generationId)) return;
  const generation = await assertGenerationActive(job);
  if (generation.commitClaimedAt) return;
  throw new LongFormScriptNonRetryableError('Long-form generation lost canonical commit ownership.');
}

function persistedGenerationId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const writerOutput = (metadata as Record<string, unknown>).writerOutput;
  if (!writerOutput || typeof writerOutput !== 'object' || Array.isArray(writerOutput)) return null;
  const trace = (writerOutput as Record<string, unknown>).generationTrace;
  if (!trace || typeof trace !== 'object' || Array.isArray(trace)) return null;
  const operation = (trace as Record<string, unknown>).operation;
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) return null;
  const id = (operation as Record<string, unknown>).id;
  return typeof id === 'string' ? id : null;
}

function orderedChapterTraces(job: LongFormScriptGenerationJobSnapshot): ThinkForgeWriterInvocationTraceV1[] {
  return job.plan!.acts.flatMap((act) => act.chapters.map((chapter) => {
    const artifact = job.chapterArtifacts[chapter.id];
    if (!artifact) throw new LongFormScriptNonRetryableError(`Missing chapter trace: ${chapter.id}`);
    return requireThinkForgeWriterInvocationTrace(artifact.writerTrace);
  }));
}

function aggregateChapterWriterTraces(
  traces: readonly ThinkForgeWriterInvocationTraceV1[],
): ThinkForgeWriterInvocationTraceV1 {
  const first = traces[0];
  if (!first) throw new LongFormScriptNonRetryableError('Long-form commit requires chapter traces.');
  const invariant = (trace: ThinkForgeWriterInvocationTraceV1) => ({
    editorialPlanHash: trace.editorialPlanHash,
    writingKnowledge: trace.writingKnowledge,
    sourceLedgerHash: trace.sourceLedgerHash,
    provider: trace.provider.provider,
    model: trace.provider.model,
  });
  const expected = hashThinkForgeTraceValue(invariant(first));
  if (traces.some((trace) => hashThinkForgeTraceValue(invariant(trace)) !== expected)) {
    throw new LongFormScriptNonRetryableError('Chapter provenance differs across the assembled script.');
  }
  const evidence = new Map<string, ThinkForgeWriterInvocationTraceV1['techniqueEvidence'][number]>();
  traces.flatMap((trace) => trace.techniqueEvidence).forEach((item) => evidence.set(item.id, item));
  const repairFailures = [...new Set(traces.flatMap((trace) => trace.repair.failureCodes))];
  return ThinkForgeWriterInvocationTraceV1Schema.parse({
    ...first,
    generatedAt: traces.map((trace) => trace.generatedAt).sort().at(-1),
    selectedTechniqueIds: [...evidence.keys()],
    techniqueEvidence: [...evidence.values()],
    promptTemplateHash: hashThinkForgeTraceValue(traces.map((trace) => trace.promptTemplateHash)),
    provider: {
      ...first.provider,
      cacheStatus: traces.every((trace) => trace.provider.cacheStatus === first.provider.cacheStatus)
        ? first.provider.cacheStatus
        : 'inline',
    },
    repair: {
      applied: repairFailures.length > 0,
      failureCodes: repairFailures,
      ...(traces.some((trace) => trace.repair.cacheStatus) ? { cacheStatus: 'inline' as const } : {}),
    },
  });
}
