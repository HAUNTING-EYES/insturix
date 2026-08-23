import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  createProviderNativeProposalRecoveryStateV2R,
  verifyProviderNativeProposalRecoveryStateV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-proposal-recovery-v2r';
import { PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-result-references-v2r';
import { createProviderNativeEpisodeResumeCheckpointV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';

const BASE_STATE = 'a'.repeat(64);
const AFTER_STATE = 'b'.repeat(64);

describe('provider-native proposal recovery contract V2R', () => {
  it('binds the exact committed writer turn to one state transition', () => {
    const checkpoint = writerCheckpoint();
    const state = createProviderNativeProposalRecoveryStateV2R({
      checkpoint,
      projectId: 'project-1',
      canonicalBaseProjectRevision: 'project-revision-v1:base-r7',
      canonicalBaseStateSha256: BASE_STATE,
      operations: [{ turn: 1, beforeStateSha256: BASE_STATE, afterStateSha256: AFTER_STATE }],
    });

    expect(state).toMatchObject({
      isolatedWorkingProjectRevision: 'local-writer-r8',
      isolatedWorkingStateSha256: AFTER_STATE,
      completedTurnsSha256: checkpoint.completedTurnsSha256,
      operations: [{ operatorId: 'set_keyframes', turn: 1 }],
    });
    expect(() => verifyProviderNativeProposalRecoveryStateV2R({
      checkpoint, projectId: 'project-1', state,
    })).not.toThrow();
  });

  it('rejects a broken state chain and a rehashed changed writer receipt', () => {
    const checkpoint = writerCheckpoint();
    expect(() => createProviderNativeProposalRecoveryStateV2R({
      checkpoint,
      projectId: 'project-1',
      canonicalBaseProjectRevision: 'project-revision-v1:base-r7',
      canonicalBaseStateSha256: BASE_STATE,
      operations: [{ turn: 1, beforeStateSha256: 'c'.repeat(64), afterStateSha256: AFTER_STATE }],
    })).toThrow('PROVIDER_NATIVE_PROPOSAL_RECOVERY_STATE_CHAIN_INVALID');

    const forged = structuredClone(checkpoint) as unknown as Record<string, unknown>;
    const turns = forged.completedTurns as Record<string, unknown>[];
    const execution = turns[0].execution as Record<string, unknown>;
    ((execution.output as Record<string, unknown>).receipt as Record<string, unknown>)
      .projectRevision = 'forged-writer';
    const alteredTurnsSha256 = hashCanonicalJsonV1(turns);
    forged.completedTurnsSha256 = alteredTurnsSha256;
    const material = checkpointMaterial(forged);
    forged.checkpointSha256 = hashCanonicalJsonV1(material);
    expect(() => createProviderNativeProposalRecoveryStateV2R({
      checkpoint: forged as unknown as typeof checkpoint,
      projectId: 'project-1',
      canonicalBaseProjectRevision: 'project-revision-v1:base-r7',
      canonicalBaseStateSha256: BASE_STATE,
      operations: [{ turn: 1, beforeStateSha256: BASE_STATE, afterStateSha256: AFTER_STATE }],
    })).toThrow('PROVIDER_NATIVE_PROPOSAL_RECOVERY_WRITER_REFERENCE_INVALID');
  });
});

function writerCheckpoint() {
  const execution = {
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION',
    disposition: 'OK',
    output: { receipt: { status: 'PASS', projectRevision: 'local-writer-r8' } },
    evidenceIds: [],
  };
  const completedTurns = [{
    turn: 1,
    modelCall: { callId: 'call-1', name: 'set_keyframes', arguments: {} },
    normalizedArguments: { projectId: 'project-1', overlayId: 'overlay-1' },
    execution,
    issuedResultReferences: [{
      version: PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R,
      resultReferenceId: 'result_t1_1',
      originTurn: 1,
      sourceOperatorId: 'set_keyframes',
      sourceOutputField: 'receipt.projectRevision',
      sourceOutputPath: ['receipt', 'projectRevision'],
      valueKind: 'STRING',
      valueSha256: hashCanonicalJsonV1('local-writer-r8'),
    }],
  }];
  return createProviderNativeEpisodeResumeCheckpointV2R({
    route: {
      routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
      claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
    },
    episodeId: 'proposal-recovery-1',
    contextSha256: 'c'.repeat(64),
    toolSetSha256: 'd'.repeat(64),
    completedTurns,
  });
}

function checkpointMaterial(checkpoint: Record<string, unknown>) {
  const { checkpointSha256: _ignored, ...material } = checkpoint;
  return material;
}
