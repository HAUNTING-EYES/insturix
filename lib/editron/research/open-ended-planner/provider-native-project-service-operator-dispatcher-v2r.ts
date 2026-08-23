import { deepFreezeV1 } from './contracts-v1';
import {
  type ProjectServiceIsolatedOperatorOwnerV2R,
} from './provider-native-project-service-clone-owner-v2r';
import { createProviderNativeProjectServiceCutOwnerV2R }
  from './provider-native-project-service-cut-owner-v2r';
import { createProviderNativeProjectServiceKeyframeOwnerV2R }
  from './provider-native-project-service-keyframe-owner-v2r';
import type { ProviderNativeToolExecutionV2R }
  from './provider-native-tool-episode-v2r';

type IsolatedExecuteInputV2R = Parameters<
  ProjectServiceIsolatedOperatorOwnerV2R['execute']
>[0];
type IsolatedReplayInputV2R = Parameters<
  NonNullable<ProjectServiceIsolatedOperatorOwnerV2R['replayCommitted']>
>[0];

export const PROVIDER_NATIVE_PROJECT_SERVICE_OPERATOR_IDS_V2R = Object.freeze([
  'cut_section',
  'set_keyframes',
] as const);

/**
 * The sole bounded dispatcher for currently implemented ProjectService-clone
 * writers. It delegates exact form and revision issuance to the existing
 * owners; an unknown operation never falls through to a different writer.
 */
export function createProviderNativeProjectServiceOperatorDispatcherV2R():
Readonly<ProjectServiceIsolatedOperatorOwnerV2R> {
  const cut = createProviderNativeProjectServiceCutOwnerV2R();
  const keyframes = createProviderNativeProjectServiceKeyframeOwnerV2R();

  return Object.freeze({
    execute: async (input: IsolatedExecuteInputV2R) => {
      const owner = ownerFor(input.call.operatorId, cut, keyframes);
      return owner
        ? owner.execute(input)
        : unsupportedExecution(input.call.operatorId);
    },
    replayCommitted: async (input: IsolatedReplayInputV2R) => {
      const owner = ownerFor(input.call.operatorId, cut, keyframes);
      if (!owner?.replayCommitted) {
        throw new Error('PROJECTSERVICE_ISOLATED_DISPATCH_REPLAY_UNSUPPORTED');
      }
      return owner.replayCommitted(input);
    },
  });
}

function ownerFor(
  operatorId: string,
  cut: Readonly<ProjectServiceIsolatedOperatorOwnerV2R>,
  keyframes: Readonly<ProjectServiceIsolatedOperatorOwnerV2R>,
): Readonly<ProjectServiceIsolatedOperatorOwnerV2R> | null {
  if (operatorId === 'cut_section') return cut;
  if (operatorId === 'set_keyframes') return keyframes;
  return null;
}

function unsupportedExecution(
  operatorId: string,
): Readonly<ProviderNativeToolExecutionV2R> {
  return deepFreezeV1({
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
    disposition: 'UNVERIFIABLE' as const,
    output: {
      code: 'PROJECTSERVICE_ISOLATED_DISPATCH_OPERATOR_UNSUPPORTED',
      message: 'No isolated ProjectService writer owns the requested operation.',
      requestedOperatorId: operatorId,
      supportedOperatorIds: PROVIDER_NATIVE_PROJECT_SERVICE_OPERATOR_IDS_V2R,
    },
    evidenceIds: [] as const,
  });
}
