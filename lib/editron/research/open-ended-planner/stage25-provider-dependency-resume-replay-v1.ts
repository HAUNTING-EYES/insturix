import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildProviderNativeResumedEpisodeReceiptV2R,
  type ProviderNativeEpisodeResumeCheckpointV2R,
} from './provider-native-episode-resume-v2r';
import {
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeInvokeResponseV2R,
} from './provider-native-tool-episode-v2r';
import { buildStage25ProviderDependencyCohortManifestV1 }
  from './stage25-provider-dependency-cohort-v1';
import { Stage25ProviderDependencyOwnerV1 }
  from './stage25-provider-dependency-owner-v1';

type JsonRecord = Record<string, unknown>;

export const STAGE25_PROVIDER_DEPENDENCY_RESUME_REPLAY_VERSION_V1 =
  'EDITRON_STAGE25_PROVIDER_DEPENDENCY_RESUME_REPLAY_V1_1' as const;

export interface Stage25ProviderDependencyReplaySourceV1 {
  manifestSha256: string;
  sourceCommit: string;
  evaluatorSourceSha256: string;
  rowId: string;
  routeId: string;
  model: string;
  presentationOrdinal: number;
  contextSha256: string;
  toolSetSha256: string;
  episodeReceiptSha256: string;
  episodeTranscriptSha256: string;
  selectedOperatorIds: readonly string[];
  terminalDisposition: string;
  ownerBeforeStateSha256: string;
  ownerAfterStateSha256: string;
  ownerFinalProjectRevision: string;
  ownerFinalMutationStages: readonly string[];
  requestHashes: readonly string[];
  rawResponseSha256s: readonly string[];
  prefixTurnCount: number;
}

/**
 * Replays an already-paid provider row through a real interruption boundary.
 * The prefix is executed exactly once, a fresh owner hydrates its validated
 * snapshot, and the suffix consumes captured responses without inference.
 */
export async function runStage25ProviderDependencyResumeReplayV1(input: {
  source: Readonly<Stage25ProviderDependencyReplaySourceV1>;
  rawResponses: readonly unknown[];
}): Promise<Readonly<JsonRecord>> {
  validateSource(input.source, input.rawResponses);
  const manifest = buildStage25ProviderDependencyCohortManifestV1({
    sourceCommit: input.source.sourceCommit,
    evaluatorSourceSha256: input.source.evaluatorSourceSha256,
  });
  requireEqual(manifest.manifestSha256, input.source.manifestSha256, 'MANIFEST');
  requireEqual(manifest.contextSha256, input.source.contextSha256, 'CONTEXT');
  const route = manifest.routes.find(
    ({ route: candidate }) => candidate.routeId === input.source.routeId,
  )?.route ?? fail('ROUTE_NOT_FOUND');
  requireEqual(route.model, input.source.model, 'MODEL');
  const presentation = manifest.presentations.find(
    ({ ordinal }) => ordinal === input.source.presentationOrdinal,
  ) ?? fail('PRESENTATION_NOT_FOUND');

  const prefixOwner = new Stage25ProviderDependencyOwnerV1();
  let checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R> | null = null;
  let prefixCalls = 0;
  try {
    await runProviderNativeToolEpisodeV2R({
      route,
      context: manifest.context,
      eligibleOperatorIds: presentation.operatorOrder,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      invoke: async (request) => {
        const index = prefixCalls;
        if (index >= input.source.prefixTurnCount) fail('PREFIX_INVOKE_OVERFLOW');
        requireEqual(request.requestHash, input.source.requestHashes[index],
          `PREFIX_REQUEST_${index + 1}`);
        prefixCalls += 1;
        return response(input.rawResponses[index]);
      },
      executeIsolated: (call) => prefixOwner.execute(call),
      onTurnCommitted: ({ checkpoint: committed }) => {
        if (committed.nextTurn !== input.source.prefixTurnCount + 1) return;
        checkpoint = committed;
        throw new Error('STAGE25_EXPECTED_REPLAY_INTERRUPTION');
      },
    });
    fail('PREFIX_DID_NOT_INTERRUPT');
  } catch (error) {
    if (!(error instanceof Error)
      || error.message !== 'STAGE25_EXPECTED_REPLAY_INTERRUPTION') throw error;
  }
  const capturedCheckpoint = requireCheckpoint(checkpoint, input.source.prefixTurnCount + 1);
  requireEqual(capturedCheckpoint.toolSetSha256, input.source.toolSetSha256, 'TOOL_SET');
  if (prefixCalls !== input.source.prefixTurnCount) fail('PREFIX_CALL_COUNT_INVALID');
  const prefixSnapshot = prefixOwner.snapshot();
  requireEqual(text(prefixSnapshot.currentProjectRevision), 'R43', 'PREFIX_REVISION');

  const resumedOwner = Stage25ProviderDependencyOwnerV1.restore(prefixSnapshot);
  if (resumedOwner === prefixOwner) fail('OWNER_INSTANCE_REUSED');
  const restoredInitialSnapshot = resumedOwner.snapshot();
  requireEqual(
    text(restoredInitialSnapshot.snapshotSha256),
    text(prefixSnapshot.snapshotSha256),
    'RESTORED_PREFIX',
  );
  let suffixCalls = 0;
  const episode = await runProviderNativeToolEpisodeV2R({
    route,
    context: manifest.context,
    eligibleOperatorIds: presentation.operatorOrder,
    argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
    resumeCheckpoint: capturedCheckpoint,
    resumeCurrentProjectRevision: text(prefixSnapshot.currentProjectRevision),
    invoke: async () => {
      const index = input.source.prefixTurnCount + suffixCalls;
      if (index >= input.rawResponses.length) fail('SUFFIX_INVOKE_OVERFLOW');
      suffixCalls += 1;
      return response(input.rawResponses[index]);
    },
    executeIsolated: (call) => resumedOwner.execute(call),
  });
  if (prefixCalls + suffixCalls !== input.rawResponses.length) {
    fail('TOTAL_CALL_COUNT_INVALID');
  }

  const actualRawResponseHashes = episode.turns.map(
    (turn) => text(record(turn).rawResponseSha256),
  );
  if (!same(actualRawResponseHashes, input.source.rawResponseSha256s)) {
    fail('RAW_RESPONSE_IDENTITY_MISMATCH');
  }
  if (!same(episode.selectedOperatorIds, input.source.selectedOperatorIds)) {
    fail('SELECTED_OPERATORS_MISMATCH');
  }
  requireEqual(episode.terminal.disposition, input.source.terminalDisposition, 'TERMINAL');
  const prefixRequestHashes = episode.turns.slice(0, input.source.prefixTurnCount)
    .map((turn) => text(record(turn).requestHash));
  if (!same(prefixRequestHashes,
    input.source.requestHashes.slice(0, input.source.prefixTurnCount))) {
    fail('PREFIX_REQUEST_IDENTITY_MISMATCH');
  }
  const suffixRequestHashes = episode.turns.slice(input.source.prefixTurnCount)
    .map((turn) => text(record(turn).requestHash));
  const sourceSuffixRequestHashes = input.source.requestHashes.slice(
    input.source.prefixTurnCount,
  );
  if (!suffixRequestHashes.some((hash, index) => hash !== sourceSuffixRequestHashes[index])) {
    fail('RESUME_PROMPT_IDENTITY_DID_NOT_CHANGE');
  }

  const finalSnapshot = resumedOwner.snapshot();
  requireEqual(
    text(finalSnapshot.beforeStateHash),
    input.source.ownerBeforeStateSha256,
    'OWNER_BEFORE_STATE',
  );
  requireEqual(
    text(finalSnapshot.afterStateHash),
    input.source.ownerAfterStateSha256,
    'OWNER_AFTER_STATE',
  );
  requireEqual(
    text(finalSnapshot.currentProjectRevision),
    input.source.ownerFinalProjectRevision,
    'OWNER_FINAL_REVISION',
  );
  if (!same(finalSnapshot.mutationStages, input.source.ownerFinalMutationStages)) {
    fail('OWNER_FINAL_STAGES_MISMATCH');
  }
  const resumedReceipt = buildProviderNativeResumedEpisodeReceiptV2R({
    checkpoint: capturedCheckpoint,
    episodeReceipt: episode,
  });
  const material = {
    version: STAGE25_PROVIDER_DEPENDENCY_RESUME_REPLAY_VERSION_V1,
    authority: 'RESEARCH_ONLY_ZERO_INFERENCE_NO_PROJECT_MUTATION' as const,
    source: {
      rowId: input.source.rowId,
      manifestSha256: input.source.manifestSha256,
      uninterruptedEpisodeReceiptSha256: input.source.episodeReceiptSha256,
      uninterruptedEpisodeTranscriptSha256: input.source.episodeTranscriptSha256,
      rawResponseSha256s: actualRawResponseHashes,
    },
    interruption: {
      afterTurn: input.source.prefixTurnCount,
      checkpointSha256: capturedCheckpoint.checkpointSha256,
      prefixOwnerSnapshotSha256: text(prefixSnapshot.snapshotSha256),
      freshOwnerRestored: true as const,
      prefixMutationsReplayed: false as const,
    },
    replay: {
      prefixProviderCalls: prefixCalls,
      suffixProviderCalls: suffixCalls,
      inferenceCalls: 0 as const,
      selectedOperatorIds: episode.selectedOperatorIds,
      terminalDisposition: episode.terminal.disposition,
      finalProjectRevision: finalSnapshot.currentProjectRevision,
      finalOwnerStateSha256: finalSnapshot.afterStateHash,
      prefixRequestIdentityPreserved: true as const,
      suffixRequestIdentityChangedByCompactResumePrompt: true as const,
      semanticOutcomeMatchesUninterruptedSource: true as const,
    },
    resumedEpisode: {
      receiptSha256: episode.receiptSha256,
      transcriptSha256: episode.transcriptSha256,
      resumedReceipt,
    },
    whatHasNotBeenChecked: [
      'DURABLE_STORAGE', 'REAL_WORKER_RESTART', 'PROJECTSERVICE_MUTATION',
      'AUTHENTICATED_RESULT_STORE', 'PAID_PROVIDER_RESUME', 'RENDERED_ACCEPTANCE',
    ] as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function validateSource(
  source: Readonly<Stage25ProviderDependencyReplaySourceV1>,
  rawResponses: readonly unknown[],
): void {
  for (const [name, value] of Object.entries({
    manifest: source.manifestSha256, context: source.contextSha256,
    toolSet: source.toolSetSha256, episode: source.episodeReceiptSha256,
    transcript: source.episodeTranscriptSha256,
    ownerBefore: source.ownerBeforeStateSha256,
    ownerAfter: source.ownerAfterStateSha256,
  })) if (!isSha256(value)) fail(`SOURCE_${name.toUpperCase()}_SHA_INVALID`);
  if (!/^[a-f0-9]{40}$/.test(source.sourceCommit)
    || source.prefixTurnCount < 1
    || source.prefixTurnCount >= rawResponses.length
    || source.requestHashes.length !== rawResponses.length
    || source.rawResponseSha256s.length !== rawResponses.length) {
    fail('SOURCE_CARDINALITY_OR_COMMIT_INVALID');
  }
  rawResponses.forEach((body, index) => {
    requireEqual(
      hashCanonicalJsonV1(body),
      source.rawResponseSha256s[index],
      `RAW_RESPONSE_${index + 1}`,
    );
  });
}

function response(body: unknown): ProviderNativeInvokeResponseV2R {
  return { status: 200, body };
}
function requireCheckpoint(
  value: unknown,
  nextTurn: number,
): Readonly<ProviderNativeEpisodeResumeCheckpointV2R> {
  if (!value || typeof value !== 'object'
    || (value as { nextTurn?: unknown }).nextTurn !== nextTurn) {
    fail('CHECKPOINT_NOT_CAPTURED');
  }
  return value as Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
}
function requireEqual(actual: string, expected: string, code: string): void {
  if (actual !== expected) fail(`${code}_MISMATCH`);
}
function same(left: unknown, right: unknown): boolean {
  return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right);
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
function fail(code: string): never {
  throw new Error(`STAGE25_PROVIDER_DEPENDENCY_RESUME_REPLAY_${code}`);
}
