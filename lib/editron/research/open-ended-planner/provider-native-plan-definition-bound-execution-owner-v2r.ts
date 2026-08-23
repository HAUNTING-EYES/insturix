import type { EditorialPlanDurableExecutionOwnerV1 }
  from '../../services/editorial-plan-durable-worker-v1';
import { createProviderNativeBoundEpisodeDefinitionOwnerV2R }
  from './provider-native-bound-episode-definition-v2r';
import type { ProviderNativeDurableArtifactOwnersV2R }
  from './provider-native-episode-owner-artifact-resolver-v2r';
import {
  assertProviderNativePlanExecutionDefinitionV2R,
  PROVIDER_NATIVE_PLAN_EXECUTION_OWNER_ID_V2R,
  type ProviderNativePlanExecutionEnvelopeV2R,
} from './provider-native-plan-execution-envelope-v2r';
import { createProviderNativePlanExecutionOwnerV2R }
  from './provider-native-plan-resumed-execution-owner-v2r';
import { PROVIDER_NATIVE_EPISODE_VERSION_V2R }
  from './provider-native-tool-episode-v2r';

export type ProviderNativePlanSharedArtifactOwnersV2R = Readonly<
  Omit<ProviderNativeDurableArtifactOwnersV2R, 'episodeDefinition'>
>;

export type ProviderNativePlanDefinitionBoundExecutionOwnerInputV2R = Readonly<
  | {
      artifactOwners: ProviderNativePlanSharedArtifactOwnersV2R;
      artifactOwnersForDefinition?: never;
    }
  | {
      artifactOwners?: never;
      artifactOwnersForDefinition: (
        envelope: Readonly<ProviderNativePlanExecutionEnvelopeV2R>,
      ) => ProviderNativePlanSharedArtifactOwnersV2R;
    }
>;

/**
 * Adapts immutable definitions already accepted by PlanService to the existing
 * provider-native execution owner. It owns no definition registry or episode
 * state: every call revalidates the Plan-bound artifact and derives only the
 * definition resolver needed by the existing artifact coordinator.
 */
export function createProviderNativePlanDefinitionBoundExecutionOwnerV2R(
  input: ProviderNativePlanDefinitionBoundExecutionOwnerInputV2R,
): Readonly<EditorialPlanDurableExecutionOwnerV1> {
  return {
    ownerId: PROVIDER_NATIVE_PLAN_EXECUTION_OWNER_ID_V2R,
    ownerVersion: PROVIDER_NATIVE_EPISODE_VERSION_V2R,
    assertDefinitionSupported: (resolved) => {
      executionOwnerFor(input, resolved.definition)
        .assertDefinitionSupported(resolved);
    },
    execute: (resolved) => (
      executionOwnerFor(input, resolved.definition)
        .execute(resolved)
    ),
  };
}

function executionOwnerFor(
  input: ProviderNativePlanDefinitionBoundExecutionOwnerInputV2R,
  definition: Parameters<
    EditorialPlanDurableExecutionOwnerV1['assertDefinitionSupported']
  >[0]['definition'],
): Readonly<EditorialPlanDurableExecutionOwnerV1> {
  const envelope = assertProviderNativePlanExecutionDefinitionV2R(definition);
  // Route-dependent owners are derived only after the immutable Plan envelope
  // passes validation. This prevents one static reference/policy owner from
  // accidentally authorizing media for a different provider route.
  const artifactOwners = input.artifactOwnersForDefinition
    ? input.artifactOwnersForDefinition(envelope)
    : input.artifactOwners;
  return createProviderNativePlanExecutionOwnerV2R({
    artifactOwners: {
      ...artifactOwners,
      episodeDefinition: createProviderNativeBoundEpisodeDefinitionOwnerV2R(
        envelope.boundEpisodeDefinition,
      ),
    },
  });
}
